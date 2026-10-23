// Adapters between the optional backend's Pydantic models and the in-browser
// engine's resume/job shapes. No information is added during conversion.

import { toEngineResume } from "./resume/model.js";

export function resumeFromBackend(payload) {
  const document = payload.document;
  const base = toEngineResume(document);
  return {
    ...base,
    source_type: payload.source_type || document.source_type || "tex",
    filename: payload.filename || base.filename,
    original_text: payload.original_text || base.original_text,
    raw_tex: payload.raw_tex || "",
    parse_confidence: payload.parse_confidence ?? 1,
    warnings: [...new Set([...(payload.warnings || []), ...(document.warnings || [])])],
    template: document.metadata?.template || "auto",
  };
}

export function jobFromBackend(job, { source = "url", url = "" } = {}) {
  const requirements = (job.requirements || []).map((requirement) => ({
    id: requirement.id,
    text: requirement.text,
    category: requirement.category,
    must_have: Boolean(requirement.must_have),
    keywords: requirement.keywords || [],
    min_years: requirement.min_years ?? null,
    critical: Boolean(requirement.critical),
  }));
  return {
    id: job.id,
    source,
    url: job.canonical_url || url,
    title: job.title || "",
    company: job.company || "",
    location: job.location || "",
    description: job.description || "",
    requirements,
    required_skills: job.required_skills || [],
    preferred_skills: job.preferred_skills || [],
    education_requirements: job.education_requirements || [],
    experience_requirements: job.experience_requirements || [],
    certifications: job.certifications || [],
    constraints: job.constraints || [],
    responsibilities: job.responsibilities || [],
    extraction_confidence: job.extraction?.confidence ?? 0.5,
    extraction: job.extraction || null,
    warnings: [...(job.warnings || []), ...(job.extraction?.notes || [])],
  };
}
