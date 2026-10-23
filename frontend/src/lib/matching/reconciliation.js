// Hybrid reconciliation engine. Combines traditional and semantic results into
// transparent, reproducible metrics while keeping each engine independently
// visible and enforcing the truthfulness safeguards.

const DEFAULT_WEIGHTS = { traditional: 0.4, semantic: 0.6 };
const MATCH_THRESHOLD = 0.6;
const PARTIAL_THRESHOLD = 0.2;
const CONTRADICTION_SIM = 0.2;

function mergeEvidence(...groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const ev of group || []) {
      const key = `${ev.item_id}:${(ev.passage || "").slice(0, 80)}`;
      const existing = merged.get(key);
      if (!existing || ev.strength > existing.strength) merged.set(key, ev);
    }
  }
  return [...merged.values()].sort((a, b) => b.strength - a.strength).slice(0, 4);
}

function combinedStatus(trad, sem) {
  const notes = [];
  const t = trad.traditional_score;
  const s = sem.semantic_score;
  let status;
  if (t >= MATCH_THRESHOLD || s >= 0.62) status = "matched";
  else if (t <= PARTIAL_THRESHOLD && s < 0.38) status = ["uncertain", "missing"].includes(trad.status) ? trad.status : "missing";
  else status = "partial";

  if (trad.status === "matched" && sem.status === "missing" && s < CONTRADICTION_SIM) {
    status = "conflict";
    notes.push("Traditional matching found keyword evidence but the semantic engine did not find related context. Confirm the claim is accurate and well described.");
  } else if (trad.status === "missing" && sem.status === "matched") {
    status = "conflict";
    notes.push("The semantic engine found related content but no exact keywords. Consider naming the specific technologies/tools explicitly.");
  }
  return [status, notes];
}

export function reconcile(resume, job, traditional, traditionalMatches, semantic, semanticMatches, tradExtra, config = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(config.weights || {}) };
  const semById = new Map(semanticMatches.map((m) => [m.requirement_id, m]));
  const merged = [];
  const disagreements = [];

  for (const tm of traditionalMatches) {
    const sm = semById.get(tm.requirement_id);
    if (!sm) {
      merged.push(tm);
      continue;
    }
    const [status, notes] = combinedStatus(tm, sm);
    const combined = Math.round((weights.traditional * tm.traditional_score + weights.semantic * sm.semantic_score) * 10000) / 10000;
    const evidence = mergeEvidence(tm.evidence, sm.evidence);

    let method = "semantic";
    if (tm.method === "exact" || tm.method === "alias") {
      method = ["matched", "partial"].includes(sm.status) ? "exact+semantic" : "exact";
    } else if (["matched", "partial"].includes(sm.status)) {
      method = "semantic";
    }

    const explanationParts = [];
    if (tm.explanation) explanationParts.push(`Traditional: ${tm.explanation}`);
    if (sm.explanation) explanationParts.push(`Semantic: ${sm.explanation}`);

    const confidence = Math.round((0.5 * tm.confidence + 0.5 * (sm.confidence || 0.3)) * 1000) / 1000;
    const allNotes = [...new Set([...(tm.notes || []), ...(sm.notes || []), ...notes])];

    merged.push({
      requirement_id: tm.requirement_id,
      requirement: tm.requirement,
      category: tm.category,
      must_have: tm.must_have,
      status,
      method,
      traditional_score: tm.traditional_score,
      semantic_score: sm.semantic_score,
      combined_score: combined,
      confidence,
      evidence,
      matched_terms: tm.matched_terms,
      missing_terms: tm.missing_terms,
      explanation: explanationParts.join(" "),
      notes: allNotes,
    });

    if (status === "conflict") {
      disagreements.push({
        requirement_id: tm.requirement_id,
        requirement: tm.requirement,
        traditional_status: tm.status,
        semantic_status: sm.status,
        traditional_score: tm.traditional_score,
        semantic_score: sm.semantic_score,
        resolution: notes[0] || "",
      });
    }
  }

  const hardRequirements = merged.filter((m) => m.must_have);
  const missingHard = hardRequirements.filter((m) => m.status !== "matched");

  const scored = merged.filter((m) => ["matched", "partial"].includes(m.status));
  const evidenceConfidence = scored.length ? Math.round((scored.reduce((sum, m) => sum + m.confidence, 0) / scored.length) * 1000) / 1000 : 0;

  const parseability = parseabilityScore(resume);

  const warnings = [];
  if (traditional.score != null && semantic.score != null) {
    const gap = Math.abs(traditional.score - semantic.score);
    if (gap >= 25) {
      warnings.push(`The traditional and semantic engines disagree by ${gap.toFixed(0)} points. This often means the resume has related experience that is not named with the job's exact terminology.`);
    }
  }
  if (missingHard.length) {
    warnings.push(`${missingHard.length} hard requirement(s) are not clearly matched. A strong aggregate score does not override these gaps.`);
  }

  const metrics = {
    traditional_score: traditional.score,
    semantic_score: semantic.score,
    hybrid_score: hybrid(traditional.score, semantic.score, weights),
    parseability_score: parseability,
    evidence_confidence: evidenceConfidence,
  };

  return { metrics, matches: merged, hard_requirements: hardRequirements, disagreements, warnings, weights };
}

function hybrid(trad, sem, weights) {
  if (trad == null || sem == null) return trad == null ? sem : trad;
  return Math.round((weights.traditional * trad + weights.semantic * sem) * 10) / 10;
}

function parseabilityScore(resume) {
  const base = resume.parse_confidence != null ? resume.parse_confidence : 1;
  let structural = 0;
  const keys = ["experience", "education", "project", "skill"];
  for (const key of keys) {
    if ((resume.sections && resume.sections[key]) || (key === "skill" && resume.skills && resume.skills.length)) structural += 1;
  }
  const structuralRatio = structural / keys.length;
  const contact = resume.contact && resume.contact.name && (resume.contact.email || resume.contact.phone) ? 1 : 0.5;
  return Math.round(Math.min(100, Math.max(0, 100 * (0.5 * base + 0.3 * structuralRatio + 0.2 * contact))) * 10) / 10;
}

export function fingerprint(resume, job, config) {
  const payload = JSON.stringify({ resume, job, config });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
