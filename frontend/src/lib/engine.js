// Local engine facade. This mirrors the old backend API surface so the React
// pages need almost no changes, but every step now runs in the browser.

import { newId } from "./text.js";
import { parseTex } from "./texParser.js";
import { parsePdfFile } from "./pdfExtractor.js";
import { extractJobFromText, fetchJobFromUrl } from "./jobExtractor.js";
import { runTraditional } from "./matching/traditional.js";
import { runSemantic } from "./matching/semantic.js";
import { reconcile, fingerprint } from "./matching/reconciliation.js";
import { generateSuggestions, detectUnsupportedAdditions } from "./optimization/suggestions.js";
import { renderResume, applyApprovedChanges } from "./latex/render.js";
import { validateTexSource, validatePdfBytes } from "./latex/validate.js";
import { compileToPdf, latexEngineAvailable } from "./latex/compile.js";
import { getEmbeddingClient } from "./embeddings.js";
import { getClientId, put, get, clearAll, exportProject, importProject } from "./storage/db.js";
import { backendConfigured, extractJobRemote, parseResumeRemote } from "./backend.js";
import { jobFromBackend, resumeFromBackend } from "./backendAdapters.js";

let semanticMode = "lexical";
const artifacts = new Map();

function nowIso() {
  return new Date().toISOString();
}

export function setSemanticMode(mode) {
  semanticMode = mode === "local-ai" ? "local-ai" : "lexical";
  return semanticMode;
}

export async function warmupSemantic(onProgress) {
  const client = getEmbeddingClient();
  const off = onProgress ? client.onProgress(onProgress) : () => {};
  try {
    await client.warmup();
  } finally {
    off();
  }
}

function artifactFor(blob, filename) {
  const id = newId();
  artifacts.set(id, { blob, filename });
  return id;
}

export const engine = {
  getClientId,
  setSemanticMode,
  warmupSemantic,

  async health() {
    const available = latexEngineAvailable();
    return {
      status: "ok",
      version: "web",
      environment: "browser",
      capabilities: {
        semantic_backend: semanticMode === "local-ai" ? "transformers.js (local)" : "lexical-embedding",
        transformers_enabled: semanticMode === "local-ai",
        latex_compiler: available ? "browser-wasm" : "unavailable",
        latex_compilation_available: available,
        llm_provider: "none",
        ocr_available: false,
      },
      truthfulness:
        "Scores are AlignCV's own estimates. They are not any employer's ATS score and not a probability of receiving an interview.",
    };
  },

  async parseResume(file) {
    const name = (file && file.name) || "resume.tex";
    const lower = name.toLowerCase();
    let resume = null;
    let backendError = null;

    if (backendConfigured && (lower.endsWith(".tex") || lower.endsWith(".pdf"))) {
      try {
        resume = resumeFromBackend(await parseResumeRemote(file));
      } catch (err) {
        backendError = err;
      }
    }

    if (!resume) {
      if (lower.endsWith(".tex")) {
        const text = await file.text();
        resume = parseTex(text, name);
      } else if (lower.endsWith(".pdf")) {
        resume = await parsePdfFile(file);
      } else {
        throw new Error("Unsupported file type. Upload a .tex or .pdf resume.");
      }
      if (backendError) {
        resume.warnings = [
          ...(resume.warnings || []),
          `The optional backend could not parse this file (${backendError.message}). The local parser was used instead.`,
        ];
      }
    }

    const id = newId();
    resume.id = id;
    await put("resumes", {
      id,
      owner_id: getClientId(),
      filename: resume.filename,
      source_type: resume.source_type,
      baseline: resume,
      original_text: resume.original_text,
      raw_tex: resume.raw_tex || "",
      warnings: resume.warnings,
      created_at: nowIso(),
    });
    return { resume, id };
  },

  async getResume(id) {
    const record = await get("resumes", id);
    if (!record) throw notFound("Resume not found.");
    return { id: record.id, resume: { ...record.baseline, id: record.id }, warnings: record.warnings || [] };
  },

  async extractJobUrl(url) {
    let backendError = null;
    if (backendConfigured) {
      try {
        const payload = await extractJobRemote({ url });
        if (payload && payload.job) {
          const job = jobFromBackend(payload.job, { source: "url", url });
          const id = await saveJob(job, "url", url);
          return { job, id };
        }
      } catch (err) {
        backendError = err;
      }
    }

    const job = await fetchJobFromUrl(url);
    if (backendError) {
      job.warnings = [
        ...(job.warnings || []),
        `The optional backend could not import this URL (${backendError.message}). Your browser fetched it instead.`,
      ];
    }
    const id = await saveJob(job, "url", url);
    return { job, id };
  },

  async extractJobText(text, title = "", company = "") {
    if (!text || text.trim().length < 40) {
      throw new Error("Please paste a longer job description (at least 40 characters).");
    }

    let backendError = null;
    if (backendConfigured) {
      try {
        const payload = await extractJobRemote({ text, title, company });
        if (payload && payload.job) {
          const job = jobFromBackend(payload.job, { source: "text" });
          const id = await saveJob(job, "text", "");
          return { job, id };
        }
      } catch (err) {
        backendError = err;
      }
    }

    const job = extractJobFromText(text, title, company);
    if (backendError) {
      job.warnings = [
        ...(job.warnings || []),
        `The optional backend could not structure this description (${backendError.message}). The local extractor was used instead.`,
      ];
    }
    const id = await saveJob(job, "text", "");
    return { job, id };
  },

  async createAnalysis(resumeId, jobId, weights) {
    const resumeRecord = await get("resumes", resumeId);
    if (!resumeRecord) throw notFound("Resume not found.");
    const jobRecord = await get("jobs", jobId);
    if (!jobRecord) throw notFound("Job posting not found.");

    const resume = { ...resumeRecord.baseline, id: resumeRecord.id, original_text: resumeRecord.original_text };
    const job = jobRecord.payload;

    const config = {};
    if (weights) config.weights = weights;

    const traditional = runTraditional(resume, job, config);

    let embedder = null;
    if (semanticMode === "local-ai") embedder = getEmbeddingClient();
    const semantic = await runSemantic(resume, job, embedder, config);

    const combined = reconcile(
      resume,
      job,
      traditional.engine,
      traditional.matches,
      semantic.engine,
      semantic.matches,
      traditional.extra,
      config
    );

    const { suggestions, questions } = generateSuggestions(resume, job, combined.matches);

    const warnings = [
      ...(traditional.engine.warnings || []),
      ...(semantic.engine.warnings || []),
      ...combined.warnings,
    ];

    const result = {
      metrics: combined.metrics,
      matches: combined.matches,
      hard_requirements: combined.hard_requirements,
      traditional: traditional.engine,
      semantic: semantic.engine,
      reconciliation: {
        weights: combined.weights,
        disagreement_count: combined.disagreements.length,
        semantic_backend: semantic.extra.backend,
        note: "Scores are AlignCV estimates, not an employer's ATS score and not a probability of an interview.",
      },
      suggestions,
      clarification_questions: questions,
      engine_disagreements: combined.disagreements,
      warnings,
      scoring_config: { weights: combined.weights, ...config },
      input_fingerprint: fingerprint(resume, job, config),
    };

    const id = newId();
    const record = {
      id,
      owner_id: getClientId(),
      resume_id: resumeId,
      job_id: jobId,
      config,
      result,
      decisions: {},
      created_at: nowIso(),
    };
    await put("analyses", record);
    return { id, resume_id: resumeId, job_id: jobId, created_at: record.created_at, config, result };
  },

  async getAnalysis(id) {
    const record = await get("analyses", id);
    if (!record) throw notFound("Analysis not found.");
    return {
      id: record.id,
      resume_id: record.resume_id,
      job_id: record.job_id,
      created_at: record.created_at,
      config: record.config,
      result: record.result,
    };
  },

  async applyChanges(id, decisions, label = "Optimized") {
    const record = await get("analyses", id);
    if (!record) throw notFound("Analysis not found.");
    const resumeRecord = await get("resumes", record.resume_id);
    if (!resumeRecord) throw notFound("Resume not found.");

    const resume = { ...resumeRecord.baseline, original_text: resumeRecord.original_text };
    const suggestions = record.result.suggestions || [];
    const byId = new Map(suggestions.map((s) => [s.id, s]));

    for (const decision of decisions) {
      if (decision.decision !== "accepted" || !decision.edited_text) continue;
      const suggestion = byId.get(decision.suggestion_id);
      if (!suggestion) continue;
      const risks = detectUnsupportedAdditions(suggestion.original_text, decision.edited_text, resume.original_text);
      if (risks.length) {
        const error = new Error("The edited text introduces unsupported claims and was not applied.");
        error.status = 422;
        error.risks = risks;
        throw error;
      }
    }

    const { resume: newResume, applied } = applyApprovedChanges(resume, suggestions, decisions);
    const texSource = renderResume(newResume, newResume.template);
    const versionId = newId();
    await put("versions", {
      id: versionId,
      owner_id: getClientId(),
      resume_id: record.resume_id,
      label,
      structured: newResume,
      tex_source: texSource,
      created_at: nowIso(),
    });
    record.decisions = Object.fromEntries(decisions.map((d) => [d.suggestion_id, d]));
    record.result.last_version_id = versionId;
    await put("analyses", record);

    return { version_id: versionId, resume_id: record.resume_id, label, accepted_count: applied, tex_source: texSource };
  },

  async compileResume({ resume_id, version_id, tex_source }) {
    const resumeRecord = await get("resumes", resume_id);
    if (!resumeRecord) throw notFound("Resume not found.");

    let structured = resumeRecord.baseline;
    let source = tex_source || "";

    if (!source && version_id) {
      const version = await get("versions", version_id);
      if (!version) throw notFound("Resume version not found.");
      source = version.tex_source;
      structured = version.structured;
    }
    if (!source) {
      structured = { ...resumeRecord.baseline };
      source = renderResume(structured, structured.template);
    }

    const texArtifactId = artifactFor(new Blob([source], { type: "application/x-tex" }), `${resume_id}_resume.tex`);

    const compile = await compileToPdf(source);
    let pdfArtifactId = "";
    let validation = {};

    if (compile.ok) {
      pdfArtifactId = artifactFor(new Blob([compile.pdfBytes], { type: "application/pdf" }), `${resume_id}_resume.pdf`);
      validation = await validatePdfBytes(compile.pdfBytes, { ...structured, original_text: resumeRecord.original_text });
    } else {
      validation = validateTexSource(source, structured);
    }

    return {
      artifact_id: pdfArtifactId || texArtifactId,
      resume_id,
      version_id: version_id || "",
      compiled: compile.ok,
      tex_artifact_id: texArtifactId,
      pdf_artifact_id: pdfArtifactId,
      validation,
      compiler_available: compile.available,
      message: compile.ok ? "Compiled successfully." : compile.error,
      log: compile.logs || "",
    };
  },

  async downloadArtifact(artifactId, fallbackName) {
    const entry = artifacts.get(artifactId);
    if (!entry) throw notFound("This artifact is no longer available. Compile again to regenerate it.");
    const url = URL.createObjectURL(entry.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = entry.filename || fallbackName || "aligncv-download";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  exportProject,
  importProject,
  async clearAllData() {
    await clearAll();
    artifacts.clear();
  },
};

async function saveJob(job, source, url) {
  const id = newId();
  job.id = id;
  await put("jobs", {
    id,
    owner_id: getClientId(),
    source,
    url,
    payload: job,
    created_at: nowIso(),
  });
  return id;
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}
