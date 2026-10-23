import { describe, expect, it } from "vitest";
import { jobFromBackend, resumeFromBackend } from "../src/lib/backendAdapters.js";
import { runTraditional } from "../src/lib/matching/traditional.js";
import { runSemantic } from "../src/lib/matching/semantic.js";
import { reconcile } from "../src/lib/matching/reconciliation.js";
import { generateSuggestions } from "../src/lib/optimization/suggestions.js";
import { applyApprovedChanges, renderResume } from "../src/lib/latex/render.js";
import { validateTexSource } from "../src/lib/latex/validate.js";

const RESUME_PAYLOAD = {
  document: {
    id: "resume_backend_flow",
    source_type: "pdf",
    contact: {
      full_name: "Grace Hopper",
      email: "grace@example.com",
      phone: "",
      location: "",
      website: "",
      linkedin: "",
      github: "",
      links: [],
    },
    summary: "",
    education: [
      {
        id: "edu_1",
        institution: "Yale University",
        degree: "PhD Mathematics",
        field_of_study: "",
        location: "",
        dates: { start: { year: 1930, month: null }, end: { year: 1934, month: null }, present: false },
        grade: "",
        coursework: [],
        description: "",
      },
    ],
    experience: [
      {
        id: "exp_1",
        employer: "US Navy",
        job_title: "Rear Admiral",
        location: "",
        dates: { start: { year: 1943, month: 1 }, end: null, present: true },
        responsibilities: ["Built early compilers and standards."],
        achievements: [],
        technologies: ["Python"],
        links: [],
      },
    ],
    projects: [],
    skills: [
      { id: "skill_1", name: "SQL", category: "technical", level: "" },
      { id: "skill_2", name: "Python", category: "technical", level: "" },
      { id: "skill_3", name: "React", category: "technical", level: "" },
    ],
    publications: [],
    certifications: [],
    custom_sections: [],
    metadata: {
      template: "ats",
      date_format: "YYYY",
      section_order: ["skills", "experience", "education", "summary", "projects", "publications", "certifications", "custom"],
      authoring_mode: "pdf",
      notes: "",
    },
    warnings: [],
  },
  source_type: "pdf",
  filename: "grace.pdf",
  original_text: "Grace Hopper\nBuilt early compilers and standards.\nPython React SQL",
  raw_tex: "",
  parse_confidence: 0.8,
  warnings: [],
};

const JOB = {
  id: "job_backend_flow",
  title: "Platform Engineer",
  company: "Acme",
  canonical_url: "https://example.com/jobs/1",
  description: "Build platforms.",
  requirements: [
    { id: "req_python", text: "3+ years of Python experience.", category: "experience", must_have: true, critical: true, min_years: 3, keywords: ["Python"] },
    { id: "req_react", text: "React front-end development.", category: "skill", must_have: true, critical: false, min_years: null, keywords: ["React"] },
    { id: "req_k8s", text: "Kubernetes deployment experience.", category: "skill", must_have: true, critical: true, min_years: null, keywords: ["Kubernetes"] },
    { id: "req_auth", text: "Work authorization in the United States.", category: "constraint", must_have: true, critical: false, min_years: null, keywords: [] },
  ],
  required_skills: ["Python", "React"],
  preferred_skills: [],
  warnings: [],
  extraction: { confidence: 0.9, notes: [], method: "ats_api" },
};

async function analyze() {
  const resume = resumeFromBackend(RESUME_PAYLOAD);
  const job = jobFromBackend(JOB, { source: "url", url: JOB.canonical_url });
  const traditional = runTraditional(resume, job, {});
  const semantic = await runSemantic(resume, job, null, {});
  const { metrics, matches } = reconcile(
    resume,
    job,
    traditional.engine,
    traditional.matches,
    semantic.engine,
    semantic.matches,
    traditional.extra,
    {}
  );
  return { resume, job, traditional, semantic, metrics, matches };
}

describe("backend-parsed resume end-to-end flow", () => {
  it("matches, suggests, applies and exports without losing parse metadata", async () => {
    const { resume, job, traditional, metrics, matches } = await analyze();

    expect(resume.sections.experience[0].date_text).toBe("1943 \u2013 Present");
    expect(resume.section_order[0]).toBe("skills");
    expect(job.requirements.find((r) => r.id === "req_auth").category).toBe("constraint");
    expect(metrics.hybrid_score).toBeGreaterThan(0);

    const python = matches.find((m) => m.requirement_id === "req_python");
    const react = matches.find((m) => m.requirement_id === "req_react");
    const kubernetes = matches.find((m) => m.requirement_id === "req_k8s");
    const authorization = matches.find((m) => m.requirement_id === "req_auth");
    expect(python.status).toBe("matched");
    expect(react.status).toBe("matched");
    expect(kubernetes.status).toBe("missing");
    expect(authorization.status).toBe("uncertain");
    expect(traditional.extra.experience_years).toBeGreaterThan(3);

    const { suggestions, questions } = generateSuggestions(resume, job, matches);
    expect(questions.join(" ")).toContain("Kubernetes");
    expect(suggestions.every((s) => s.introduces_unsupported_claim === false)).toBe(true);

    const skillsSuggestion = suggestions.find((s) => s.target === "skills");
    const summarySuggestion = suggestions.find((s) => s.target === "summary");
    expect(skillsSuggestion.proposed_text).toBe("Python, React, SQL");
    expect(summarySuggestion.proposed_text).toContain("Rear Admiral");

    const decisions = [
      { suggestion_id: skillsSuggestion.id, decision: "accepted", edited_text: null },
      { suggestion_id: summarySuggestion.id, decision: "accepted", edited_text: null },
    ];
    const { resume: updated, applied } = applyApprovedChanges(resume, suggestions, decisions);
    expect(applied).toBe(2);
    expect(resume.summary).toBe("");
    expect(updated.skills).toEqual(["Python", "React", "SQL"]);
    expect(updated.summary).toContain("Skilled with Python, React");

    const source = renderResume(updated, updated.template);
    expect(source.indexOf("\\section*{Skills}")).toBeLessThan(source.indexOf("\\section*{Experience}"));
    expect(source.indexOf("\\section*{Experience}")).toBeLessThan(source.indexOf("\\section*{Education}"));
    expect(source).toContain("1943 \u2013 Present");
    expect(source).toContain("Skilled with Python, React");

    const validation = validateTexSource(source, updated);
    expect(validation.ran).toBe(true);
    expect(validation.passed).toBe(true);
  });
});
