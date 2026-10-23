// LaTeX generation and application of approved changes. Produces clean,
// editable source and escapes special characters safely.

import { dateToLabel } from "../text.js";

export const DEFAULT_TEMPLATE = "ats";

// Templates mirror backend/app/services/latex/render.py. They only change
// typography and margins; the information in the document never changes.
export const TEMPLATES = {
  ats: {
    documentClass: "\\documentclass[11pt,a4paper]{article}",
    margin: "0.75in",
    sectionFormat:
      "\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\vspace{-4pt}\\hrule\\vspace{4pt}]",
  },
  classic: {
    documentClass: "\\documentclass[10pt,a4paper]{article}",
    margin: "0.9in",
    sectionFormat:
      "\\titleformat{\\section}{\\large\\scshape\\bfseries}{}{0em}{}[\\vspace{-4pt}\\hrule\\vspace{4pt}]",
  },
};

export const TEMPLATE_OPTIONS = [
  { value: "ats", label: "ATS-safe (default)" },
  { value: "classic", label: "Classic (small caps)" },
];

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

const DEFAULT_SECTION_ORDER = ["summary", "education", "experience", "projects", "skills", "publications", "certifications", "custom"];
const STANDARD_SECTION_KEYS = ["education", "experience", "project", "publication", "certification", "skill"];
const ORDER_TARGETS = {
  education: ["education"],
  experience: ["experience"],
  projects: ["project"],
  publications: ["publication"],
  certifications: ["certification"],
};

function renderSections(resume) {
  const body = [];
  const sections = resume.sections || {};
  const used = new Set();
  let summaryDone = false;
  let skillsDone = false;

  const appendSummary = () => {
    if (summaryDone || !resume.summary) return;
    summaryDone = true;
    body.push("\\section*{Summary}");
    body.push(escapeLatex(resume.summary));
  };

  const appendSkills = () => {
    if (skillsDone || !resume.skills || !resume.skills.length) return;
    skillsDone = true;
    body.push("\\section*{Skills}");
    body.push(escapeLatex(resume.skills.join(", ")));
  };

  const appendSection = (key) => {
    const items = sections[key];
    if (used.has(key) || !items || !items.length) return;
    used.add(key);
    body.push(`\\section*{${escapeLatex(SECTION_TITLES[key] || key)}}`);
    for (const item of items) body.push(...renderItem(item));
  };

  const order = Array.isArray(resume.section_order) && resume.section_order.length
    ? resume.section_order
    : ["summary", ...Object.keys(sections), "skills"];
  for (const key of order) {
    if (key === "summary") {
      appendSummary();
    } else if (key === "skills") {
      appendSkills();
    } else if (key === "custom") {
      for (const sectionKey of Object.keys(sections)) {
        if (!STANDARD_SECTION_KEYS.includes(sectionKey)) appendSection(sectionKey);
      }
    } else {
      for (const sectionKey of ORDER_TARGETS[key] || [key]) appendSection(sectionKey);
    }
  }

  for (const sectionKey of Object.keys(sections)) appendSection(sectionKey);
  appendSummary();
  appendSkills();
  return body;
}

export function renderResume(resume, template = DEFAULT_TEMPLATE) {
  const chosen = TEMPLATES[template] || TEMPLATES[DEFAULT_TEMPLATE];
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

  body.push(...renderSections(resume));

  return [
    chosen.documentClass,
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[utf8]{inputenc}",
    `\\usepackage[margin=${chosen.margin}]{geometry}`,
    "\\usepackage[hidelinks]{hyperref}",
    "\\usepackage{enumitem}",
    "\\usepackage{titlesec}",
    chosen.sectionFormat,
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
  const targetOrder = Array.isArray(resume.section_order) && resume.section_order.length
    ? [...resume.section_order]
    : [...DEFAULT_SECTION_ORDER];
  const projectIndex = targetOrder.indexOf("projects");
  const experienceIndex = targetOrder.indexOf("experience");
  if (projectIndex > -1 && experienceIndex > -1 && projectIndex > experienceIndex) {
    [targetOrder[projectIndex], targetOrder[experienceIndex]] = [targetOrder[experienceIndex], targetOrder[projectIndex]];
  }
  resume.section_order = targetOrder;
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
