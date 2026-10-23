import { describe, expect, it } from "vitest";
import { jobFromBackend, resumeFromBackend } from "../src/lib/backendAdapters.js";

const DOCUMENT = {
  id: "resume_backend",
  source_type: "tex",
  contact: {
    full_name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "",
    location: "London, UK",
    website: "",
    linkedin: "",
    github: "",
    links: [],
  },
  summary: "Mathematician.",
  education: [],
  experience: [
    {
      id: "exp_1",
      employer: "Acme Corp",
      job_title: "Software Engineer",
      location: "Remote",
      dates: { start: { year: 2022, month: 1 }, end: null, present: true },
      responsibilities: ["Built APIs."],
      achievements: [],
      technologies: ["Python"],
    },
  ],
  projects: [],
  skills: [{ id: "skill_1", name: "Python", category: "technical", level: "" }],
  publications: [],
  certifications: [],
  custom_sections: [],
  metadata: { template: "classic", date_format: "MMM YYYY", section_order: ["summary"], authoring_mode: "latex", notes: "" },
  original_source: "\\documentclass{article}",
  warnings: ["Extracted from source."],
};

const PAYLOAD = {
  document: DOCUMENT,
  source_type: "tex",
  filename: "ada.tex",
  original_text: "Ada Lovelace\nBuilt APIs.",
  raw_tex: "\\documentclass{article}",
  parse_confidence: 0.9,
  warnings: ["One note."],
};

describe("resumeFromBackend", () => {
  it("maps a backend document to the engine resume shape", () => {
    const resume = resumeFromBackend(PAYLOAD);
    expect(resume.source_type).toBe("tex");
    expect(resume.filename).toBe("ada.tex");
    expect(resume.contact.name).toBe("Ada Lovelace");
    expect(resume.original_text).toBe(PAYLOAD.original_text);
    expect(resume.raw_tex).toBe(PAYLOAD.raw_tex);
    expect(resume.parse_confidence).toBe(0.9);
    expect(resume.template).toBe("classic");
    expect(resume.sections.experience[0].title).toBe("Software Engineer");
    expect(resume.sections.experience[0].start_date).toBe("2022-01-01");
    expect(resume.sections.experience[0].end_date).toBeNull();
    expect(resume.skills).toEqual(["Python"]);
    expect(resume.warnings).toContain("One note.");
    expect(resume.warnings).toContain("Extracted from source.");
  });
});

describe("jobFromBackend", () => {
  it("maps requirements without inventing fields", () => {
    const job = jobFromBackend(
      {
        id: "job_1",
        title: "Engineer",
        company: "Acme",
        canonical_url: "https://example.com/jobs/1",
        description: "A role.",
        requirements: [
          {
            id: "req_1",
            text: "Must have 5+ years of Python.",
            category: "experience",
            must_have: true,
            critical: true,
            min_years: 5,
            keywords: ["Python"],
          },
        ],
        required_skills: ["Python"],
        preferred_skills: [],
        warnings: ["Short description."],
        extraction: { confidence: 0.85, notes: ["ATS API."], method: "ats_api" },
      },
      { source: "url", url: "https://example.com/jobs/1" }
    );

    expect(job.source).toBe("url");
    expect(job.url).toBe("https://example.com/jobs/1");
    expect(job.requirements[0]).toMatchObject({
      text: "Must have 5+ years of Python.",
      category: "experience",
      must_have: true,
      critical: true,
      min_years: 5,
      keywords: ["Python"],
    });
    expect(job.extraction_confidence).toBe(0.85);
    expect(job.warnings).toEqual(["Short description.", "ATS API."]);
  });

  it("falls back to the requested URL", () => {
    const job = jobFromBackend({ title: "Engineer" }, { source: "url", url: "https://example.com/j" });
    expect(job.url).toBe("https://example.com/j");
    expect(job.requirements).toEqual([]);
    expect(job.extraction_confidence).toBe(0.5);
  });
});
