import { describe, expect, it } from "vitest";
import { applyApprovedChanges, escapeLatex, renderResume } from "../src/lib/latex/render.js";

function engineResume() {
  return {
    contact: {
      name: "Synthetic & Co",
      email: "candidate@example.com",
      phone: "+1 555 0100",
      location: "Remote",
      links: ["https://example.com/profile"],
    },
    summary: "Synthetic fixture with 100% test data and an underscore_.",
    sections: {
      experience: [
        {
          title: "Data Analyst",
          organization: "Synthetic Labs",
          location: "Remote",
          date_text: "Oct 2022 – Present",
          description: ["Built dashboards."],
          achievements: [],
          technologies: ["SQL"],
          links: [],
        },
      ],
    },
    skills: ["Python", "SQL"],
  };
}

describe("escapeLatex", () => {
  it("escapes structural characters", () => {
    expect(escapeLatex("A & B 100% #1 a_b {x} ~ ^ \\")).toBe(
      "A \\& B 100\\% \\#1 a\\_b \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}"
    );
  });

  it("returns an empty string for missing text", () => {
    expect(escapeLatex("")).toBe("");
    expect(escapeLatex(null)).toBe("");
  });
});

describe("renderResume templates", () => {
  it("defaults to the ATS template", () => {
    const source = renderResume(engineResume());
    expect(source).toContain("\\documentclass[11pt,a4paper]{article}");
    expect(source).toContain("\\usepackage[margin=0.75in]{geometry}");
  });

  it("renders the classic template with different typography", () => {
    const source = renderResume(engineResume(), "classic");
    expect(source).toContain("\\documentclass[10pt,a4paper]{article}");
    expect(source).toContain("\\usepackage[margin=0.9in]{geometry}");
    expect(source).toContain("\\scshape");
  });

  it("falls back to ATS for an unknown template", () => {
    const source = renderResume(engineResume(), "does-not-exist");
    expect(source).toContain("\\documentclass[11pt,a4paper]{article}");
  });
});

describe("renderResume content", () => {
  it("escapes content and includes all populated sections", () => {
    const source = renderResume(engineResume());
    expect(source).toContain("Synthetic \\& Co");
    expect(source).toContain("100\\% test data and an underscore\\_.");
    expect(source).toContain("\\section*{Summary}");
    expect(source).toContain("\\section*{Experience}");
    expect(source).toContain("\\section*{Skills}");
    expect(source).toContain("\\href{https://example.com/profile}");
    expect(source.trimEnd().endsWith("\\end{document}")).toBe(true);
  });

  it("omits sections that have no content", () => {
    const source = renderResume({ contact: { name: "Synthetic" }, sections: {}, skills: [] });
    expect(source).toContain("Synthetic");
    expect(source).not.toContain("\\section*{Experience}");
    expect(source).not.toContain("\\section*{Skills}");
  });

  it("honors an explicit section order from parsed metadata", () => {
    const resume = { ...engineResume(), section_order: ["summary", "skills", "experience"] };
    const source = renderResume(resume);
    expect(source.indexOf("\\section*{Summary}")).toBeLessThan(source.indexOf("\\section*{Skills}"));
    expect(source.indexOf("\\section*{Skills}")).toBeLessThan(source.indexOf("\\section*{Experience}"));
  });
});

describe("applyApprovedChanges", () => {
  it("moves projects above experience in both content and metadata", () => {
    const resume = {
      contact: { name: "Synthetic" },
      summary: "",
      skills: [],
      sections: {
        experience: [{ id: "exp", kind: "experience", title: "Engineer", description: [], achievements: [], technologies: [] }],
        project: [{ id: "proj", kind: "project", title: "Project", description: [], achievements: [], technologies: [] }],
      },
      section_order: ["summary", "experience", "projects", "skills"],
    };
    const suggestions = [{ id: "layout", target: "section_order", proposed_text: "Projects, then Experience" }];
    const { resume: updated } = applyApprovedChanges(resume, suggestions, [{ suggestion_id: "layout", decision: "accepted" }]);

    expect(updated.section_order.indexOf("projects")).toBeLessThan(updated.section_order.indexOf("experience"));
    const source = renderResume(updated);
    expect(source.indexOf("\\section*{Projects}")).toBeLessThan(source.indexOf("\\section*{Experience}"));
  });

  it("derives section order when parsed metadata has none", () => {
    const resume = {
      contact: { name: "Synthetic" },
      summary: "",
      skills: [],
      sections: {
        experience: [{ id: "exp", kind: "experience", title: "Engineer", description: [], achievements: [], technologies: [] }],
        project: [{ id: "proj", kind: "project", title: "Project", description: [], achievements: [], technologies: [] }],
      },
    };
    const suggestions = [{ id: "layout", target: "section_order", proposed_text: "Projects, then Experience" }];
    const { resume: updated } = applyApprovedChanges(resume, suggestions, [{ suggestion_id: "layout", decision: "accepted" }]);

    expect(updated.section_order.indexOf("projects")).toBeLessThan(updated.section_order.indexOf("experience"));
    expect(renderResume(updated).indexOf("\\section*{Projects}")).toBeLessThan(renderResume(updated).indexOf("\\section*{Experience}"));
  });
});
