// Deterministic traditional (ATS-style) matching engine.
// Exact + alias matching, must-have vs preferred rules, experience duration,
// missing-information vs confirmed-mismatch distinction, and per-requirement
// explanations with evidence.

import { ResumeIndex } from "./index.js";
import { isKnownSkill, surfaceForms, tokenize } from "../skills.js";

const EDUCATION_HINT = /\b(bachelor|master|phd|ph\.d|degree|b\.s|m\.s|mba|gpa)\b/i;
const LOCATION_HINT = /\b(remote|hybrid|on-?site|relocat|work authorization|visa)\b/i;
const CERT_HINT = /\b(certif|pmp|security\+|aws certified|azure certified)\b/i;
const MATCH_THRESHOLD = 0.6;

function wordBoundaryFind(text, term) {
  if (!term) return false;
  const pattern = `(?<![a-zA-Z0-9])${term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-zA-Z0-9])`;
  return new RegExp(pattern).test(text);
}

function termInResume(index, term) {
  const forms = isKnownSkill(term) ? surfaceForms(term) : [term.trim().toLowerCase()];
  const full = index.fullText;
  return forms.some((form) => wordBoundaryFind(full, form));
}

function requirementTerms(requirement) {
  const terms = [...(requirement.keywords || [])];
  for (const token of requirement.text.match(/[a-zA-Z][a-zA-Z0-9+#.]+/g) || []) {
    if (isKnownSkill(token)) terms.push(token);
  }
  const seen = new Set();
  const result = [];
  for (const t of terms) {
    const key = t.toLowerCase();
    if (!seen.has(key) && t.length > 1) {
      seen.add(key);
      result.push(t);
    }
  }
  return result;
}

function tokenOverlap(requirementText, resumeText) {
  const reqTokens = tokenize(requirementText).filter((t) => t.length > 2);
  if (reqTokens.length === 0) return [0, [], []];
  const resumeTokens = new Set(tokenize(resumeText));
  const matched = reqTokens.filter((t) => resumeTokens.has(t));
  const missing = reqTokens.filter((t) => !resumeTokens.has(t));
  return [matched.length / reqTokens.length, matched, missing];
}

function explain(status, matched, missing) {
  if (status === "matched") return matched.length ? `Matched on ${matched.slice(0, 6).join(", ")}.` : "The requirement is reflected in the resume content.";
  if (status === "partial") {
    const parts = [];
    if (matched.length) parts.push(`found ${matched.slice(0, 5).join(", ")}`);
    if (missing.length) parts.push(`no clear evidence for ${missing.slice(0, 5).join(", ")}`);
    return `Partially matched: ${parts.join("; ")}.`;
  }
  if (status === "uncertain") return "Not enough information on the resume to confirm or rule out this requirement.";
  if (missing.length) return `No evidence found for ${missing.slice(0, 6).join(", ")}.`;
  return "No clear match found for this requirement.";
}

function matchRequirement(requirement, index, ctx) {
  const terms = requirementTerms(requirement);
  const notes = [];
  const evidence = [];
  const matchedTerms = [];
  const missingTerms = [];

  for (const term of terms) {
    if (termInResume(index, term)) matchedTerms.push(term);
    else missingTerms.push(term);
  }

  let score;
  let method;
  if (terms.length) {
    score = matchedTerms.length / terms.length;
    method = matchedTerms.some((t) => isKnownSkill(t)) ? "alias" : "exact";
  } else {
    const [overlap, matched, missing] = tokenOverlap(requirement.text, index.fullText);
    score = overlap;
    matchedTerms.push(...matched);
    missingTerms.push(...missing);
    method = "exact";
  }

  if (requirement.min_years != null) {
    if (ctx.experienceYears == null) {
      notes.push("Could not determine total experience duration from the resume (missing or unparseable employment dates).");
    } else if (ctx.experienceYears + 0.05 < requirement.min_years) {
      score = Math.min(score, 0.4);
      notes.push(`Resume shows about ${ctx.experienceYears} year(s) of experience, below the stated ${requirement.min_years} year(s) requirement.`);
    } else {
      notes.push(`Resume shows about ${ctx.experienceYears} year(s), meeting the ${requirement.min_years} year(s) requirement.`);
    }
  }

  if (matchedTerms.length) {
    for (const entry of index.findEntries(matchedTerms.map((t) => t.toLowerCase()), 2)) {
      const hitCount = matchedTerms.filter((t) => entry.search_text.includes(t.toLowerCase())).length;
      evidence.push({ item_id: entry.item_id, section: entry.section, kind: entry.kind, passage: entry.text.slice(0, 400), strength: Math.min(1, hitCount / Math.max(1, matchedTerms.length)) });
    }
  }

  let status = "missing";
  if (score >= MATCH_THRESHOLD) status = "matched";
  else if (score > 0) status = "partial";

  if (status !== "matched") {
    if (requirement.category === "education" && !ctx.hasEducation) {
      status = "uncertain";
      notes.push("The resume does not include a clear education section.");
    } else if ((requirement.category === "location" || requirement.category === "constraint") && !ctx.hasLocation) {
      status = "uncertain";
      notes.push("The resume does not state a location or work authorization.");
    } else if (requirement.category === "certification" && !ctx.hasCertification) {
      status = "uncertain";
      notes.push("No certifications were found on the resume.");
    }
  }

  if (requirement.must_have && status !== "matched") notes.push("Required qualification not clearly demonstrated; review manually.");
  if (requirement.critical && status === "missing") notes.push("Marked as a critical/required criterion.");

  let confidence = terms.length ? 0.9 : 0.5;
  if (status === "uncertain") confidence = Math.min(confidence, 0.4);

  return {
    requirement_id: requirement.id,
    requirement: requirement.text,
    category: requirement.category,
    must_have: requirement.must_have,
    status,
    method,
    traditional_score: Math.round(score * 10000) / 10000,
    semantic_score: 0,
    combined_score: 0,
    confidence: Math.round(confidence * 1000) / 1000,
    evidence,
    matched_terms: matchedTerms,
    missing_terms: missingTerms,
    explanation: explain(status, matchedTerms, missingTerms),
    notes,
  };
}

export function runTraditional(resume, job, config = {}) {
  const index = new ResumeIndex(resume);
  const hasEducation = Boolean(resume.sections && resume.sections.education);
  const hasLocation = Boolean(resume.contact && resume.contact.location) || /\b(remote|relocat|authorization)\b/i.test(index.fullText);
  const hasCertification = Boolean(resume.sections && resume.sections.certification);
  const experienceYears = index.experienceDurationYears();

  const matches = [];
  let weightedSum = 0;
  let weightTotal = 0;
  for (const requirement of job.requirements) {
    if (requirement.category === "other") continue;
    const match = matchRequirement(requirement, index, { hasEducation, hasLocation, hasCertification, experienceYears });
    matches.push(match);
    const weight = requirement.must_have ? 2 : 1;
    weightedSum += match.traditional_score * weight;
    weightTotal += weight;
  }

  const score = weightTotal ? Math.round((weightedSum / weightTotal) * 1000) / 10 : 0;
  const hardRequirements = matches.filter((m) => m.must_have);
  const details = {
    experience_years: experienceYears,
    has_education: hasEducation,
    has_location: hasLocation,
    has_certification: hasCertification,
    requirement_count: matches.length,
    matched: matches.filter((m) => m.status === "matched").length,
    partial: matches.filter((m) => m.status === "partial").length,
    missing: matches.filter((m) => m.status === "missing").length,
    uncertain: matches.filter((m) => m.status === "uncertain").length,
  };
  const warnings = [];
  if (experienceYears == null && job.requirements.some((r) => r.min_years)) {
    warnings.push("Experience duration could not be derived from the resume dates.");
  }

  return {
    engine: { engine: "traditional", score, available: true, details, warnings },
    matches,
    extra: { hard_requirements: hardRequirements, experience_years: experienceYears },
  };
}
