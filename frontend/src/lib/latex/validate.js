// Validation. Browser LaTeX compilation is optional, so the primary check is a
// LaTeX source pre-flight (verifying key content survived generation). When a
// PDF is produced, we re-extract its text with PDF.js and verify it.

import { escapeLatex } from "./render.js";

const HEADINGS = {
  experience: "Experience",
  project: "Projects",
  education: "Education",
  publication: "Publications",
  certification: "Certifications",
  award: "Awards",
};

function normalize(text) {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function validateTexSource(tex, resume) {
  const checks = [];
  const warnings = [];
  const norm = normalize(tex);
  const add = (name, passed, detail = "") => checks.push({ name, passed, detail });

  if (resume.contact && resume.contact.name) {
    add("name", norm.includes(normalize(resume.contact.name)), resume.contact.name);
  }
  if (resume.contact && resume.contact.email) {
    add("email", norm.includes(resume.contact.email.toLowerCase()), resume.contact.email);
  }

  const missingSkills = (resume.skills || []).filter((s) => s && !norm.includes(normalize(escapeLatex(s))));
  add("skills", missingSkills.length === 0, missingSkills.length ? `Missing: ${missingSkills.slice(0, 5).join(", ")}` : "All skills present");

  for (const [key, title] of Object.entries(HEADINGS)) {
    if (resume.sections && resume.sections[key] && resume.sections[key].length) {
      add(`heading:${key}`, norm.includes(title.toLowerCase()), title);
    }
  }

  const bullets = [];
  for (const items of Object.values(resume.sections || {})) {
    for (const item of items) bullets.push(...(item.description || []));
  }
  if (bullets.length) {
    const probe = normalize(bullets[0]).slice(0, 40);
    const escapedProbe = normalize(escapeLatex(bullets[0])).slice(0, 60);
    add("content_sample", norm.includes(escapedProbe) || norm.includes(probe), bullets[0].slice(0, 40));
  }

  const passed = checks.length ? checks.every((c) => c.passed) : null;
  return { ran: true, kind: "tex-source", passed, page_count: null, checks, warnings };
}

export async function validatePdfBytes(bytes, resume) {
  const { extractPdfText } = await import("../pdfExtractor.js");
  const { text, pageCount } = await extractPdfText(bytes instanceof ArrayBuffer ? bytes : bytes.buffer ? bytes : bytes);
  const checks = [];
  const warnings = [];
  const norm = normalize(text);

  if (!norm) {
    return { ran: true, kind: "pdf", passed: false, page_count: pageCount, checks: [{ name: "extractable_text", passed: false }], warnings: ["The compiled PDF contains no extractable text."] };
  }

  const add = (name, passed, detail = "") => checks.push({ name, passed, detail });

  if (resume.contact && resume.contact.name) add("name", norm.includes(normalize(resume.contact.name)), resume.contact.name);
  if (resume.contact && resume.contact.email) add("email", norm.includes(resume.contact.email.toLowerCase()), resume.contact.email);

  const missingSkills = (resume.skills || []).filter((s) => s && !norm.includes(normalize(s)));
  add("skills", missingSkills.length === 0, missingSkills.length ? `Missing: ${missingSkills.slice(0, 5).join(", ")}` : "All skills present");

  for (const [key, title] of Object.entries(HEADINGS)) {
    if (resume.sections && resume.sections[key] && resume.sections[key].length) add(`heading:${key}`, norm.includes(title.toLowerCase()), title);
  }

  const bullets = [];
  for (const items of Object.values(resume.sections || {})) for (const item of items) bullets.push(...(item.description || []));
  let duplicates = false;
  if (bullets.length) {
    const probe = normalize(bullets[0]).slice(0, 40);
    add("content_sample", norm.includes(probe), probe);
    if (probe && text.toLowerCase().split(probe).length - 1 > 1) {
      duplicates = true;
      warnings.push("A bullet appears more than once in the PDF; check for duplicated content.");
    }
  }
  add("no_duplicate_content", !duplicates);

  if (pageCount && pageCount > 3) warnings.push(`The PDF is ${pageCount} pages. Long resumes are often truncated by ATS filters.`);

  return { ran: true, kind: "pdf", passed: checks.every((c) => c.passed), page_count: pageCount, checks, warnings };
}
