// LaTeX generation and application of approved changes. Produces clean,
// editable source and escapes special characters safely.

import { dateToLabel } from "../text.js";

const LATEX_SPECIALS = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

export function escapeLatex(text) {
  if (!text) return "";
  return String(text)
    .split("")
    .map((ch) => LATEX_SPECIALS[ch] || ch)
    .join("");
}

const SECTION_TITLES = {
  experience: "Experience",
  project: "Projects",
  education: "Education",
  publication: "Publications",
  patent: "Patents",
  certification: "Certifications",
  award: "Awards",
  skill: "Skills",
  other: "Additional",
};

function safeUrl(url) {
  const cleaned = (url || "").replace(/[\\{}]/g, "");
  if (/^(https?:\/\/|mailto:)/.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
}

function displayLink(url) {
  return (url || "").replace("https://", "").replace("http://", "").replace("mailto:", "").replace(/\/$/, "");
}

function fmtRange(item) {
  if (item.date_text) return escapeLatex(item.date_text);
  if (item.start_date) {
    const start = dateToLabel(item.start_date);
    const end = item.end_date ? dateToLabel(item.end_date) : "Present";
    return escapeLatex(`${start} -- ${end}`);
  }
  return "";
}

function renderItem(item) {
  const lines = [];
  const headingParts = [];
  if (item.title) headingParts.push(`\\textbf{${escapeLatex(item.title)}}`);
  if (item.organization) headingParts.push(escapeLatex(item.organization));
  const dates = fmtRange(item);
  if (headingParts.length) {
    let line = headingParts.join(" --- ");
    if (item.location) line += `, ${escapeLatex(item.location)}`;
    if (dates) line += ` \\hfill ${dates}`;
    lines.push(line);
  } else if (dates) {
    lines.push(`\\hfill ${dates}`);
  }
  if (item.technologies && item.technologies.length) {
    lines.push(`\\textit{${escapeLatex(item.technologies.join(", "))}}`);
  }
  if (item.description && item.description.length) {
    lines.push("\\begin{itemize}");
    for (const bullet of item.description) lines.push(`  \\item ${escapeLatex(bullet)}`);
    lines.push("\\end{itemize}");
  }
  if (item.achievements && item.achievements.length) {
    lines.push("\\begin{itemize}");
    for (const a of item.achievements) lines.push(`  \\item ${escapeLatex(a)}`);
    lines.push("\\end{itemize}");
  }
  return lines;
}

export function renderResume(resume) {
  const contact = resume.contact || {};
  const headerLines = [];
  if (contact.name) headerLines.push(`{\\LARGE \\bfseries ${escapeLatex(contact.name)}}\\\\`);
  const contactBits = [contact.location, contact.phone, contact.email].filter(Boolean);
  if (contactBits.length) headerLines.push(escapeLatex(contactBits.join(" | ")));
  if (contact.links && contact.links.length) {
    const links = contact.links
      .slice(0, 6)
      .map((u) => `\\href{${safeUrl(u)}}{${escapeLatex(displayLink(u))}}`)
      .join(" | ");
    headerLines.push(links);
  }

  const body = [];
  body.push("\\begin{center}");
  body.push(headerLines.join(" \\\\\n"));
  body.push("\\end{center}");

  if (resume.summary) {
    body.push("\\section*{Summary}");
    body.push(escapeLatex(resume.summary));
  }

  for (const [key, items] of Object.entries(resume.sections || {})) {
    if (!items || !items.length) continue;
    body.push(`\\section*{${escapeLatex(SECTION_TITLES[key] || key)}}`);
    for (const item of items) body.push(...renderItem(item));
  }

  if (resume.skills && resume.skills.length) {
    body.push("\\section*{Skills}");
    body.push(escapeLatex(resume.skills.join(", ")));
  }

  return [
    "\\documentclass[11pt,a4paper]{article}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[margin=0.75in]{geometry}",
    "\\usepackage[hidelinks]{hyperref}",
    "\\usepackage{enumitem}",
    "\\usepackage{titlesec}",
    "\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\vspace{-4pt}\\hrule\\vspace{4pt}]",
    "\\setlist[itemize]{leftmargin=1.2em,itemsep=1pt,topsep=2pt}",
    "\\pagestyle{empty}",
    "\\begin{document}",
    ...body,
    "\\end{document}",
    "",
  ].join("\n");
}

function findItem(resume, itemId) {
  for (const items of Object.values(resume.sections || {})) {
    for (const item of items) if (item.id === itemId) return item;
  }
  return null;
}

function reorderSections(resume, order) {
  const remaining = Object.keys(resume.sections || {}).filter((k) => !order.includes(k));
  const newOrder = [...order.filter((k) => resume.sections[k]), ...remaining];
  const reordered = {};
  for (const k of newOrder) reordered[k] = resume.sections[k];
  resume.sections = reordered;
  return resume;
}

export function applyApprovedChanges(resume, suggestions, decisions) {
  const newResume = JSON.parse(JSON.stringify(resume));
  const byId = new Map(suggestions.map((s) => [s.id, s]));
  let applied = 0;

  for (const decision of decisions) {
    if (decision.decision !== "accepted") continue;
    const suggestion = byId.get(decision.suggestion_id);
    if (!suggestion) continue;
    const proposed = decision.edited_text || suggestion.proposed_text;

    if (suggestion.target === "summary") {
      newResume.summary = proposed;
    } else if (suggestion.target === "skills") {
      newResume.skills = proposed.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (["experience_bullet", "project_bullet", "achievement"].includes(suggestion.target)) {
      const item = findItem(newResume, suggestion.item_id);
      if (!item) continue;
      item.description = proposed.split("\n").map((b) => b.trim()).filter(Boolean);
    } else if (suggestion.target === "section_order") {
      reorderSections(newResume, ["project", "experience"]);
    } else {
      continue;
    }
    applied += 1;
  }
  return { resume: newResume, applied };
}
