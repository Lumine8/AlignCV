import { describe, expect, it } from "vitest";
import {
  createEducation,
  createEmptyResume,
  createExperience,
  createSkill,
  formatDatePoint,
  formatDateRange,
  makeDateRange,
  toEngineResume,
  validateResume,
} from "../src/lib/resume/model.js";

function sampleResume() {
  const doc = createEmptyResume();
  doc.contact.full_name = "Synthetic Candidate";
  doc.contact.email = "candidate@example.com";
  doc.contact.location = "Remote";
  doc.summary = "Synthetic test fixture, not a real person.";
  doc.skills = [{ ...createSkill(), name: "Python" }, { ...createSkill(), name: "SQL" }];

  doc.experience = [
    {
      ...createExperience(),
      employer: "Synthetic Labs",
      job_title: "Data Analyst",
      location: "Remote",
      responsibilities: ["Built dashboards for the operations team."],
      achievements: ["Reduced report turnaround by 20%."],
      technologies: ["SQL", "Python"],
      dates: makeDateRange({ startYear: 2022, startMonth: 10, present: true }),
    },
  ];

  doc.education = [
    {
      ...createEducation(),
      institution: "Synthetic University",
      degree: "BSc Computer Science",
      field_of_study: "Computer Science",
      grade: "8.5/10",
      coursework: ["Databases", "Statistics"],
      dates: makeDateRange({ startYear: 2018, startMonth: 8, endYear: 2022, endMonth: 6 }),
    },
  ];

  return doc;
}

describe("date formatting", () => {
  const point = { year: 2026, month: 10 };

  it("formats every supported style", () => {
    expect(formatDatePoint(point, "MMM YYYY")).toBe("Oct 2026");
    expect(formatDatePoint(point, "MMMM YYYY")).toBe("October 2026");
    expect(formatDatePoint(point, "MM/YYYY")).toBe("10/2026");
    expect(formatDatePoint(point, "YYYY-MM")).toBe("2026-10");
    expect(formatDatePoint(point, "YYYY")).toBe("2026");
  });

  it("falls back to the year when the month is unknown", () => {
    expect(formatDatePoint({ year: 2026, month: null }, "MMM YYYY")).toBe("2026");
  });

  it("formats present roles and closed ranges", () => {
    expect(
      formatDateRange({ start: { year: 2022, month: 10 }, end: null, present: true }, "MMM YYYY")
    ).toBe("Oct 2022 – Present");
    expect(
      formatDateRange(
        { start: { year: 2022, month: 10 }, end: { year: 2024, month: 5 }, present: false },
        "MM/YYYY"
      )
    ).toBe("10/2022 – 05/2024");
    expect(
      formatDateRange(
        { start: { year: 2024, month: 5 }, end: { year: 2024, month: 5 }, present: false },
        "MMM YYYY"
      )
    ).toBe("May 2024");
  });

  it("returns an empty string for missing dates", () => {
    expect(formatDateRange(null)).toBe("");
    expect(formatDatePoint(null)).toBe("");
  });
});

describe("resume validation", () => {
  it("requires a full name", () => {
    const issues = validateResume(createEmptyResume());
    expect(issues.some((issue) => issue.path === "contact.full_name")).toBe(true);
  });

  it("accepts a complete synthetic resume", () => {
    expect(validateResume(sampleResume())).toEqual([]);
  });

  it("rejects reversed date ranges", () => {
    const doc = sampleResume();
    doc.experience[0].dates = makeDateRange({ startYear: 2025, startMonth: 6, endYear: 2024, endMonth: 6 });
    const issues = validateResume(doc);
    expect(issues.some((issue) => issue.path === "experience.0.dates.end")).toBe(true);
  });

  it("rejects malformed URLs", () => {
    const doc = sampleResume();
    doc.contact.website = "example.com";
    expect(validateResume(doc).some((issue) => issue.path === "contact.website")).toBe(true);
  });
});

describe("engine adapter", () => {
  it("maps the structured document into the engine shape", () => {
    const engineResume = toEngineResume(sampleResume());
    expect(engineResume.contact.name).toBe("Synthetic Candidate");
    expect(engineResume.contact.email).toBe("candidate@example.com");
    expect(engineResume.skills).toEqual(["Python", "SQL"]);
    expect(engineResume.sections.experience).toHaveLength(1);
    expect(engineResume.sections.education).toHaveLength(1);
    expect(engineResume.sections.experience[0].title).toBe("Data Analyst");
    expect(engineResume.sections.experience[0].start_date).toBe("2022-10-01");
    expect(engineResume.sections.experience[0].end_date).toBeNull();
    expect(engineResume.sections.experience[0].date_text).toBe("Oct 2022 – Present");
  });

  it("folds education detail into description lines", () => {
    const engineResume = toEngineResume(sampleResume());
    const description = engineResume.sections.education[0].description.join(" | ");
    expect(description).toContain("Computer Science");
    expect(description).toContain("Grade: 8.5/10");
    expect(description).toContain("Coursework: Databases, Statistics");
  });

  it("includes skills and summary in the searchable text", () => {
    const engineResume = toEngineResume(sampleResume());
    expect(engineResume.original_text).toContain("Python");
    expect(engineResume.original_text).toContain("Synthetic test fixture");
  });
});
