// Semantic matching engine.
// Uses browser AI embeddings (Transformers.js via a Web Worker) when available,
// otherwise a deterministic lexical-embedding fallback. Similarity estimates
// relatedness, never factual proof.

import { ResumeIndex } from "./index.js";
import { canonicalSkill, isKnownSkill, tokenize } from "../skills.js";

const MATCH_SIM = 0.62;
const PARTIAL_SIM = 0.38;

function trigrams(text) {
  const grams = new Map();
  const cleaned = text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  for (const token of cleaned.split(" ")) {
    const padded = ` ${token} `;
    for (let i = 0; i < padded.length - 2; i += 1) {
      const g = padded.slice(i, i + 3);
      grams.set(g, (grams.get(g) || 0) + 1);
    }
  }
  return grams;
}

function cosineMap(a, b) {
  if (!a.size || !b.size) return 0;
  let num = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (const v of a.values()) aNorm += v * v;
  for (const v of b.values()) bNorm += v * v;
  for (const [k, v] of a) if (b.has(k)) num += v * b.get(k);
  const denom = Math.sqrt(aNorm) * Math.sqrt(bNorm);
  return denom ? num / denom : 0;
}

export class LexicalEmbedder {
  constructor() {
    this.kind = "lexical-embedding";
  }

  async encode(texts) {
    return texts.map((t) => this._vector(t));
  }

  _vector(text) {
    const tokens = tokenize(text);
    const canonical = tokens.map((t) => (isKnownSkill(t) ? canonicalSkill(t) : t));
    const tokenCounts = new Map();
    for (const t of canonical) tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
    return { tokens: tokenCounts, grams: trigrams(canonical.join(" ")) };
  }

  similarity(a, b) {
    const tokenSim = cosineMap(a.tokens, b.tokens);
    const gramSim = cosineMap(a.grams, b.grams);
    return Math.max(0, Math.min(1, 0.55 * tokenSim + 0.45 * gramSim));
  }
}

function statusFor(similarity) {
  if (similarity >= MATCH_SIM) return "matched";
  if (similarity >= PARTIAL_SIM) return "partial";
  return "missing";
}

export async function runSemantic(resume, job, embedder = null, config = {}) {
  let active = embedder || new LexicalEmbedder();
  let kind = active.kind || "lexical-embedding";
  const index = new ResumeIndex(resume);
  const entries = index.entries;
  const entryTexts = entries.map((e) => e.text || e.title || e.section);
  const reqTexts = job.requirements.map((r) => r.text);

  const warnings = [];
  if (kind === "lexical-embedding") {
    warnings.push(
      "Semantic matching is running in deterministic lexical-embedding mode. Enable local AI embeddings in the workspace for embedding-based matching."
    );
  }

  let entryVectors = [];
  let reqVectors = [];
  try {
    entryVectors = entryTexts.length ? await active.encode(entryTexts) : [];
    reqVectors = reqTexts.length ? await active.encode(reqTexts) : [];
  } catch (err) {
    warnings.push(`The embedding backend failed (${err && err.message ? err.message : "unknown error"}); falling back to lexical matching.`);
    const fallback = new LexicalEmbedder();
    active = fallback;
    kind = fallback.kind;
    entryVectors = entryTexts.length ? await fallback.encode(entryTexts) : [];
    reqVectors = reqTexts.length ? await fallback.encode(reqTexts) : [];
  }

  const matches = [];
  let weightedSum = 0;
  let weightTotal = 0;

  job.requirements.forEach((requirement, ri) => {
    const reqVec = reqVectors[ri];
    let bestSim = 0;
    let bestIdx = -1;
    entries.forEach((entry, i) => {
      const sim = active.similarity(reqVec, entryVectors[i]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    });

    const status = statusFor(bestSim);
    const evidence = [];
    if (bestIdx >= 0 && bestSim >= PARTIAL_SIM) {
      const entry = entries[bestIdx];
      evidence.push({ item_id: entry.item_id, section: entry.section, kind: entry.kind, passage: entry.text.slice(0, 400), strength: Math.round(bestSim * 1000) / 1000 });
    }

    const notes = [];
    if (status === "matched") notes.push("Semantically related wording found. Semantic similarity indicates relevance, not verified experience.");
    if (requirement.must_have && status !== "matched") notes.push("Required qualification has no strong semantic match.");

    matches.push({
      requirement_id: requirement.id,
      requirement: requirement.text,
      category: requirement.category,
      must_have: requirement.must_have,
      status,
      method: "semantic",
      traditional_score: 0,
      semantic_score: Math.round(bestSim * 10000) / 10000,
      combined_score: 0,
      confidence: Math.round(bestSim * 1000) / 1000,
      evidence,
      matched_terms: [],
      missing_terms: [],
      explanation: entryVectors.length
        ? `Best related resume passage scored ${bestSim.toFixed(2)} similarity (threshold ${MATCH_SIM} for a match).`
        : "No comparable resume content was available.",
      notes,
    });

    const weight = requirement.must_have ? 2 : 1;
    weightedSum += bestSim * weight;
    weightTotal += weight;
  });

  const score = weightTotal ? Math.round((weightedSum / weightTotal) * 1000) / 10 : 0;
  const details = {
    backend: kind,
    entry_count: entries.length,
    requirement_count: matches.length,
    matched: matches.filter((m) => m.status === "matched").length,
    partial: matches.filter((m) => m.status === "partial").length,
    missing: matches.filter((m) => m.status === "missing").length,
  };
  return {
    engine: { engine: "semantic", score, available: true, details, warnings },
    matches,
    extra: { backend: kind },
  };
}
