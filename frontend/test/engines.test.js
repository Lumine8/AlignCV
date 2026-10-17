import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { latexToText, parseDateRange, splitTitleDates, stripComments } from "../src/lib/text.js";
import { canonicalSkill, isKnownSkill, tokenize } from "../src/lib/skills.js";
import { parseTex } from "../src/lib/texParser.js";
import { extractJobFromText, parseAtsUrl } from "../src/lib/jobExtractor.js";
import { runTraditional } from "../src/lib/matching/traditional.js";
import { runSemantic } from "../src/lib/matching/semantic.js";
import { reconcile, fingerprint } from "../src/lib/matching/reconciliation.js";
import { generateSuggestions } from "../src/lib/optimization/suggestions.js";
import { renderResume, applyApprovedChanges } from "../src/lib/latex/render.js";
import { validateTexSource } from "../src/lib/latex/validate.js";

const read = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

const tex = read("sample_resume.tex");
const jobText = read("sample_job.txt");
const resume = parseTex(tex, "sample_resume.tex");
const job = extractJobFromText(jobText);

describe("text utilities", () => {
  it("strips line comments but keeps escaped percent signs", () => {
    expect(stripComments("a % comment\nb 50\\% done")).toBe("a \nb 50\\% done");
  });

  it("converts latex to plain text", () => {
    expect(latexToText("\\textbf{Hello} \\href{https://x.io}{link}")).toBe("Hello link (https://x.io)");
  });

  it("parses date ranges including Present", () => {
    const { start, end } = parseDateRange("Jan 2020 -- Present");
    expect(start).toBe("2020-01-01");
    expect(Number(end.slice(0, 4))).toBeGreaterThanOrEqual(2020);
  });

  it("splits a title from its dates", () => {
    expect(splitTitleDates("Engineer 2019 -- 2021")).toEqual({ title: "Engineer", dates: "2019 -- 2021" });
  });
});

describe("skills", () => {
  it("resolves aliases to a canonical skill", () => {
    expect(canonicalSkill("js")).toBe("JavaScript");
    expect(canonicalSkill("cpp")).toBe("C++");
    expect(isKnownSkill("kubernetes")).toBe(true);
    expect(isKnownSkill("flibbertigibbet")).toBe(false);
  });

  it("tokenizes and drops stopwords", () => {
    const tokens = tokenize("Experience with Python and strong SQL");
    expect(tokens).toContain("python");
    expect(tokens).not.toContain("with");
  });
});

describe("tex resume parser", () => {
  it("extracts contact, sections and skills", () => {
    expect(resume.contact.name).toBe("Jordan Rivera");
    expect(resume.contact.email).toBe("jordan.rivera@example.com");
    expect(Object.keys(resume.sections)).toEqual(expect.arrayContaining(["experience", "education", "project"]));
    expect(resume.sections.experience).toHaveLength(2);
    expect(resume.skills.length).toBeGreaterThan(10);
  });
});

describe("job extraction", () => {
  it("structures requirements and marks must-haves", () => {
    expect(job.requirements.length).toBeGreaterThan(5);
    expect(job.requirements.some((r) => r.must_have)).toBe(true);
    expect(job.requirements.some((r) => /Python/i.test(r.text) && r.keywords.includes("Python"))).toBe(true);
  });

  it("resolves known ATS URLs to their public API endpoints", () => {
    expect(parseAtsUrl("https://boards.greenhouse.io/acme/jobs/12345")).toMatchObject({
      kind: "greenhouse",
      company: "acme",
      id: "12345",
      apiUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345?questions=false",
    });
    expect(parseAtsUrl("https://boards.greenhouse.io/embed/job_app?for=acme&token=99")).toMatchObject({
      kind: "greenhouse",
      company: "acme",
      id: "99",
    });
    expect(parseAtsUrl("https://jobs.lever.co/acme/abc-123/apply")).toMatchObject({
      kind: "lever",
      company: "acme",
      id: "abc-123",
    });
    expect(parseAtsUrl("https://jobs.ashbyhq.com/acme/xyz")).toMatchObject({ kind: "ashby", company: "acme", id: "xyz" });
    expect(parseAtsUrl("https://jobs.smartrecruiters.com/Acme/744000012345678-Senior-Engineer")).toMatchObject({
      kind: "smartrecruiters",
      company: "Acme",
      id: "744000012345678",
    });
  });

  it("returns null for non-ATS and invalid URLs", () => {
    expect(parseAtsUrl("https://careers.example.com/jobs/1")).toBeNull();
    expect(parseAtsUrl("not a url")).toBeNull();
  });
});

describe("matching engines", () => {
  it("produces a bounded traditional score and separate hard requirements", () => {
    const { engine, matches, extra } = runTraditional(resume, job, {});
    expect(engine.score).toBeGreaterThanOrEqual(0);
    expect(engine.score).toBeLessThanOrEqual(100);
    expect(matches.length).toBeGreaterThan(0);
    expect(extra.hard_requirements.every((m) => m.must_have)).toBe(true);
  });

  it("runs the lexical semantic fallback", async () => {
    const { engine, extra } = await runSemantic(resume, job, null, {});
    expect(extra.backend).toBe("lexical-embedding");
    expect(engine.score).toBeGreaterThanOrEqual(0);
  });

  it("runs an injected numeric-vector embedder", async () => {
    const fake = {
      kind: "transformer-embedding",
      async encode(texts) {
        return texts.map((t) => {
          const v = [0, 0, 0, 0];
          for (const ch of t.toLowerCase()) v[ch.charCodeAt(0) % 4] += 1;
          const n = Math.hypot(...v) || 1;
          return v.map((x) => x / n);
        });
      },
      similarity: (a, b) => a.reduce((s, x, i) => s + x * b[i], 0),
    };
    const { engine, extra } = await runSemantic(resume, job, fake, {});
    expect(extra.backend).toBe("transformer-embedding");
    expect(engine.score).toBeGreaterThan(0);
  });

  it("reconciles metrics and keeps every scale independent", async () => {
    const trad = runTraditional(resume, job, {});
    const sem = await runSemantic(resume, job, null, {});
    const { metrics, matches, hard_requirements } = reconcile(resume, job, trad.engine, trad.matches, sem.engine, sem.matches, trad.extra, {});
    expect(Object.keys(metrics)).toEqual(
      expect.arrayContaining(["traditional_score", "semantic_score", "hybrid_score", "parseability_score", "evidence_confidence"])
    );
    const expectedHybrid = Math.round((0.4 * metrics.traditional_score + 0.6 * metrics.semantic_score) * 10) / 10;
    expect(metrics.hybrid_score).toBeCloseTo(expectedHybrid, 1);
    expect(matches.length).toBeGreaterThan(0);
    expect(hard_requirements.every((m) => m.must_have)).toBe(true);
    expect(fingerprint(resume, job, {})).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("optimization and LaTeX output", () => {
  it("never flags its own suggestions as unsupported and never mutates the original", async () => {
    const trad = runTraditional(resume, job, {});
    const sem = await runSemantic(resume, job, null, {});
    const { matches } = reconcile(resume, job, trad.engine, trad.matches, sem.engine, sem.matches, trad.extra, {});
    const { suggestions } = generateSuggestions(resume, job, matches);
    expect(suggestions.every((s) => s.introduces_unsupported_claim === false)).toBe(true);

    const before = JSON.stringify(resume.sections);
    if (suggestions.length) {
      const decisions = [{ suggestion_id: suggestions[0].id, decision: "accepted", edited_text: null }];
      const { resume: updated, applied } = applyApprovedChanges(resume, suggestions, decisions);
      expect(applied).toBe(1);
      expect(JSON.stringify(resume.sections)).toBe(before);
      expect(updated).not.toBe(resume);
    }
  });

  it("renders valid, self-checking LaTeX", () => {
    const out = renderResume(resume);
    expect(out).toContain("\\documentclass");
    expect(out.endsWith("\\end{document}\n")).toBe(true);
    const validation = validateTexSource(out, resume);
    expect(validation.ran).toBe(true);
    expect(validation.passed).toBe(true);
  });
});
