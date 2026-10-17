import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import Dropzone from "../components/Dropzone.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import Loading from "../components/Loading.jsx";
import Stepper from "../components/Stepper.jsx";
import { useSession } from "../state/session.jsx";

const SEMANTIC_MODE_KEY = "aligncv.semanticMode";

export default function Workspace() {
  const navigate = useNavigate();
  const { session, update } = useSession();

  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  const [semanticMode, setSemanticMode] = useState(
    () => localStorage.getItem(SEMANTIC_MODE_KEY) || "lexical"
  );
  const [modelProgress, setModelProgress] = useState(null);
  const [toolsMessage, setToolsMessage] = useState(null);
  const importInputRef = useRef(null);

  const [resumeLoading, setResumeLoading] = useState(false);
  const [resume, setResume] = useState(session.resume);
  const [resumeId, setResumeId] = useState(session.resumeId);

  const [jobMode, setJobMode] = useState("url");
  const [jobUrl, setJobUrl] = useState("");
  const [jobText, setJobText] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [jobLoading, setJobLoading] = useState(false);
  const [job, setJob] = useState(session.job);
  const [jobId, setJobId] = useState(session.jobId);

  const [analysisLoading, setAnalysisLoading] = useState(false);

  useEffect(() => {
    api.setSemanticMode(semanticMode);
    api.health().then(setHealth).catch(() => setHealth(null));
  }, [semanticMode]);

  async function handleSemanticMode(mode) {
    setError(null);
    setSemanticMode(mode);
    localStorage.setItem(SEMANTIC_MODE_KEY, mode);
    api.setSemanticMode(mode);
    if (mode === "local-ai") {
      setModelProgress(0);
      try {
        await api.warmupSemantic((p) => {
          if (p && typeof p.progress === "number") setModelProgress(Math.round(p.progress * 100));
        });
        setModelProgress(100);
      } catch {
        setError(new Error("Local AI embeddings could not be loaded. Falling back to lexical matching."));
        setSemanticMode("lexical");
        localStorage.setItem(SEMANTIC_MODE_KEY, "lexical");
        api.setSemanticMode("lexical");
      } finally {
        setTimeout(() => setModelProgress(null), 1500);
      }
    } else {
      setModelProgress(null);
    }
  }

  async function handleExportProject() {
    setError(null);
    try {
      const payload = await api.exportProject();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `aligncv-project-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToolsMessage("Project exported as JSON.");
    } catch (err) {
      setError(err);
    }
  }

  async function handleImportProject(file) {
    setError(null);
    try {
      const text = await file.text();
      const count = await api.importProject(JSON.parse(text));
      setToolsMessage(`Imported ${count} record(s) into this browser.`);
    } catch (err) {
      setError(err);
    }
  }

  async function handleClearData() {
    if (!window.confirm("Delete all locally stored resumes, jobs, analyses and versions from this browser? This cannot be undone.")) {
      return;
    }
    setError(null);
    try {
      await api.clearAllData();
      update({
        resumeId: null,
        resume: null,
        jobId: null,
        job: null,
        analysisId: null,
        analysis: null,
        versionId: null,
        texSource: "",
        decisions: {},
      });
      setToolsMessage("All local data was cleared.");
    } catch (err) {
      setError(err);
    }
  }

  const canAnalyze = Boolean(resumeId && jobId) && !analysisLoading;

  async function handleResumeFile(file) {
    setError(null);
    setResumeLoading(true);
    try {
      const result = await api.parseResume(file);
      setResume(result.resume);
      setResumeId(result.id);
      update({ resume: result.resume, resumeId: result.id });
    } catch (err) {
      setError(err);
    } finally {
      setResumeLoading(false);
    }
  }

  async function handleExtractJob() {
    setError(null);
    setJobLoading(true);
    try {
      let result;
      if (jobMode === "url") {
        if (!jobUrl.trim()) throw new Error("Enter a job posting URL.");
        result = await api.extractJobUrl(jobUrl.trim());
      } else {
        if (jobText.trim().length < 40) throw new Error("Paste at least a few lines of the job description.");
        result = await api.extractJobText(jobText, jobTitle, jobCompany);
      }
      setJob(result.job);
      setJobId(result.id);
      update({ job: result.job, jobId: result.id });
    } catch (err) {
      setError(err);
    } finally {
      setJobLoading(false);
    }
  }

  async function handleAnalyze() {
    setError(null);
    setAnalysisLoading(true);
    try {
      const analysis = await api.createAnalysis(resumeId, jobId);
      update({
        analysisId: analysis.id,
        analysis: analysis.result,
        decisions: {},
        versionId: null,
        texSource: "",
      });
      navigate("/report");
    } catch (err) {
      setError(err);
    } finally {
      setAnalysisLoading(false);
    }
  }

  const resumeSummary = useMemo(() => {
    if (!resume) return null;
    const sectionCounts = Object.entries(resume.sections || {}).map(([k, v]) => `${v.length} ${k}`);
    return sectionCounts.join(" · ") || "No structured sections";
  }, [resume]);

  return (
    <>
      <Stepper completed={[resumeId && "workspace"]} />
      <h1>Workspace</h1>
      <p className="muted">
        Upload your resume, then point AlignCV at a job posting. You can paste the description
        directly if the URL is behind a login wall.
      </p>

      {health && (
        <div className="banner banner--info">
          <span aria-hidden="true">⚙</span>
          <div>
            Everything runs locally in your browser - there is no server. Semantic engine:{" "}
            <strong>{health.capabilities.semantic_backend}</strong> · LaTeX PDF compilation:{" "}
            <strong>
              {health.capabilities.latex_compilation_available
                ? health.capabilities.latex_compiler
                : "unavailable (.tex source still exportable)"}
            </strong>
          </div>
        </div>
      )}

      <div className="card section-gap">
        <div className="card__title">
          <h2 style={{ margin: 0 }}>Matching engine</h2>
        </div>
        <p className="tiny muted" style={{ marginTop: 0 }}>
          The traditional engine always runs offline. Choose how semantic matching is computed.
        </p>
        <div className="row">
          <button
            type="button"
            className={`btn btn--sm ${semanticMode === "lexical" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => handleSemanticMode("lexical")}
          >
            Lexical (offline)
          </button>
          <button
            type="button"
            className={`btn btn--sm ${semanticMode === "local-ai" ? "btn--primary" : "btn--ghost"}`}
            onClick={() => handleSemanticMode("local-ai")}
          >
            Local AI embeddings
          </button>
          {modelProgress != null && (
            <span className="tiny muted">
              <span className="spinner" /> preparing model… {modelProgress}%
            </span>
          )}
        </div>
        <p className="tiny dim" style={{ marginBottom: 0, marginTop: 8 }}>
          Local AI downloads a small embedding model once (about 25 MB) and runs it on your device.
          Its first use can take a moment; until then matching uses the deterministic lexical
          fallback.
        </p>
      </div>

      <div className="card section-gap">
        <div className="card__title">
          <h2 style={{ margin: 0 }}>Your local data</h2>
        </div>
        <p className="tiny muted" style={{ marginTop: 0 }}>
          Resumes, jobs and analyses are stored only in this browser (IndexedDB). Export a project
          to move it to another device, import one to restore it, or clear everything.
        </p>
        <div className="row">
          <button type="button" className="btn btn--sm" onClick={handleExportProject}>
            Export project
          </button>
          <button type="button" className="btn btn--sm" onClick={() => importInputRef.current?.click()}>
            Import project
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportProject(file);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn btn--sm btn--ghost" onClick={handleClearData}>
            Clear local data
          </button>
        </div>
        {toolsMessage && <p className="tiny muted" style={{ marginBottom: 0 }}>{toolsMessage}</p>}
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div className="grid grid--2 section-gap">
        {/* Resume */}
        <div className="card">
          <div className="card__title">
            <h2 style={{ margin: 0 }}>1. Your resume</h2>
            {resumeId && <span className="pill pill--matched">parsed</span>}
          </div>
          <Dropzone onFile={handleResumeFile} disabled={resumeLoading} />
          {resumeLoading && <div style={{ marginTop: 12 }}><Loading label="Parsing resume…" /></div>}

          {resume && (
            <div style={{ marginTop: 16 }}>
              <div className="row">
                <strong>{resume.contact?.name || resume.filename}</strong>
                <span className="pill pill--soft">{resume.source_type.toUpperCase()}</span>
                <span className="pill pill--soft">
                  parse confidence {Math.round((resume.parse_confidence ?? 0) * 100)}%
                </span>
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>
                {resumeSummary}
                {resume.skills?.length ? ` · ${resume.skills.length} skills` : ""}
              </p>
              {resume.warnings?.length > 0 && (
                <div className="banner banner--warning">
                  <div>
                    <strong>Review these parsing notes:</strong>
                    <ul>
                      {resume.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Job */}
        <div className="card">
          <div className="card__title">
            <h2 style={{ margin: 0 }}>2. The job</h2>
            {jobId && <span className="pill pill--matched">extracted</span>}
          </div>

          <div className="row" style={{ marginBottom: 14 }}>
            <button
              type="button"
              className={`btn btn--sm ${jobMode === "url" ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setJobMode("url")}
            >
              Job URL
            </button>
            <button
              type="button"
              className={`btn btn--sm ${jobMode === "text" ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setJobMode("text")}
            >
              Paste text
            </button>
          </div>

          {jobMode === "url" ? (
            <div className="field">
              <label htmlFor="job-url">Public job posting URL</label>
              <input
                id="job-url"
                className="input"
                placeholder="https://company.com/careers/job/123"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
              />
              <span className="hint">
                Postings hosted on Greenhouse, Lever, Ashby or SmartRecruiters load automatically.
                Login-gated or JavaScript-heavy pages may still fail; use the text option then.
              </span>
            </div>
          ) : (
            <>
              <div className="grid grid--2" style={{ gap: 10 }}>
                <div className="field">
                  <label htmlFor="job-title">Job title (optional)</label>
                  <input
                    id="job-title"
                    className="input"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="job-company">Company (optional)</label>
                  <input
                    id="job-company"
                    className="input"
                    value={jobCompany}
                    onChange={(e) => setJobCompany(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="job-text">Job description</label>
                <textarea
                  id="job-text"
                  className="textarea"
                  value={jobText}
                  onChange={(e) => setJobText(e.target.value)}
                  placeholder="Paste the full job description here…"
                />
              </div>
            </>
          )}

          <button
            type="button"
            className="btn"
            onClick={handleExtractJob}
            disabled={jobLoading}
          >
            {jobLoading ? <span className="spinner" /> : null}
            Extract job
          </button>

          {job && (
            <div style={{ marginTop: 16 }}>
              <div className="row">
                <strong>{job.title || "Untitled role"}</strong>
                {job.company && <span className="pill pill--soft">{job.company}</span>}
                <span className="pill pill--soft">{job.requirements.length} requirements</span>
              </div>
              {job.warnings?.length > 0 && (
                <div className="banner banner--warning">
                  <ul style={{ margin: 0 }}>
                    {job.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <details style={{ marginTop: 8 }}>
                <summary className="tiny muted" style={{ cursor: "pointer" }}>
                  Preview extracted requirements
                </summary>
                <ul className="tiny muted" style={{ marginTop: 8 }}>
                  {job.requirements.slice(0, 12).map((r) => (
                    <li key={r.id}>
                      <span className="pill pill--soft">{r.category}</span>{" "}
                      {r.must_have ? <strong>{r.text}</strong> : r.text}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </div>
      </div>

      <div className="card section-gap">
        <div className="row">
          <div>
            <h2 style={{ marginBottom: 4 }}>3. Run the analysis</h2>
            <p className="tiny muted" style={{ marginBottom: 0 }}>
              Traditional matching, semantic matching and reconciliation run together. Suggestions
              are generated separately and are never auto-applied.
            </p>
          </div>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canAnalyze}
            onClick={handleAnalyze}
          >
            {analysisLoading ? <span className="spinner" /> : null}
            Analyze alignment
          </button>
        </div>
        {analysisLoading && (
          <div className="progress-steps" style={{ marginTop: 14 }}>
            <div className="progress-step active">
              <span className="spinner" /> Running traditional and semantic engines…
            </div>
          </div>
        )}
        {!canAnalyze && !analysisLoading && (
          <p className="tiny dim" style={{ marginTop: 8 }}>
            Provide both a parsed resume and an extracted job to continue.
          </p>
        )}
      </div>
    </>
  );
}
