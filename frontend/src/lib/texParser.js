// LaTeX (.tex) resume parser, ported from the Python engine.
// Reconstructs a structured representation while preserving the original source.

import {
  latexToText,
  newId,
  parseDateRange,
  parseNArgs,
  splitTitleDates,
  stripComments,
} from "./text.js";

const SECTION_KIND_MAP = [
  [["experience", "employment", "work history", "professional experience", "relevant experience"], "experience"],
  [["education", "academic"], "education"],
  [["project", "projects", "personal projects", "selected projects"], "project"],
  [["publication", "publications", "research", "papers"], "publication"],
  [["patent", "patents"], "patent"],
  [["certification", "certifications", "certificates", "licenses"], "certification"],
  [["award", "awards", "honors", "honours", "achievements"], "award"],
  [["skill", "skills", "technical skills", "technologies", "competencies"], "skill"],
  [["summary", "objective", "profile", "about"], "summary"],
];
const CONTACT_HINTS = ["contact", "personal", "profile"];

function classifySection(title) {
  const lowered = (title || "").trim().toLowerCase();
  if (!lowered) return "other";
  for (const [keys, kind] of SECTION_KIND_MAP) {
    for (const key of keys) if (lowered.includes(key)) return kind;
  }
  if (CONTACT_HINTS.some((h) => lowered.includes(h))) return "contact";
  return "other";
}

function findSections(text) {
  const candidates = [];
  let m;
  const re1 = /\\(?:section|subsection)\*?\s*\{([^{}]*)\}/g;
  while ((m = re1.exec(text)) !== null) candidates.push([m.index, m.index + m[0].length, m[1]]);
  const re2 = /\\cvsection\s*\{([^{}]*)\}/g;
  while ((m = re2.exec(text)) !== null) candidates.push([m.index, m.index + m[0].length, m[1]]);
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => a[0] - b[0]);
  const sections = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const [start, end, rawTitle] = candidates[i];
    const title = latexToText(rawTitle);
    const nextStart = i + 1 < candidates.length ? candidates[i + 1][0] : text.length;
    sections.push({
      title,
      kind: classifySection(title),
      content: text.slice(end, nextStart),
      line_start: text.slice(0, start).split("\n").length,
    });
  }
  return sections;
}

function makeItem(kind, fields) {
  return {
    id: newId(),
    kind,
    title: "",
    organization: "",
    location: "",
    start_date: null,
    end_date: null,
    date_text: "",
    description: [],
    technologies: [],
    achievements: [],
    links: [],
    confidence: 1,
    provenance: { section: "", source_type: "tex", line_start: null, line_end: null, raw: "" },
    ...fields,
  };
}

function extractCventryItems(content, kind) {
  const items = [];
  const re = /\\cventry\s*\{/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const [args] = parseNArgs(content, m.index + m[0].length - 1, 6);
    if (!args || args.length < 6) continue;
    const startText = latexToText(args[0]);
    const title = latexToText(args[1]);
    const org = latexToText(args[2]);
    const loc = latexToText(args[3]);
    const descText = latexToText(args[5]);
    const bullets = descText.split(/\.\s+(?=[A-Z])/).map((b) => b.trim()).filter(Boolean);
    const { start, end } = parseDateRange(startText);
    items.push(makeItem(kind, {
      title, organization: org, location: loc, date_text: startText,
      start_date: start, end_date: end, description: bullets,
    }));
  }
  return items;
}

function splitProjectTitle(proj) {
  const parts = proj.split(/\s*[\u2013\u2014|]\s*|\s{2,}|\$\\cdot\$/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { title: proj, tech: "" };
  return { title: parts[0], tech: parts.slice(1).join(", ") };
}

function extractSubheadingItems(content, kind) {
  const items = [];
  const headingCmds = {
    resumeSubheading: 4,
    resumeSubSubheading: 2,
    resumeProjectHeading: 2,
    resumeProjectHeadingCustom: 2,
  };
  const positions = [];
  for (const [cmd, nargs] of Object.entries(headingCmds)) {
    const re = new RegExp(`\\\\${cmd}\\b`, "g");
    let m;
    while ((m = re.exec(content)) !== null) positions.push([m.index, m.index + m[0].length, cmd, nargs]);
  }
  positions.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < positions.length; i += 1) {
    const [pos, argStart, cmd, nargs] = positions[i];
    const [args] = parseNArgs(content, argStart, nargs);
    if (!args) continue;
    const end = i + 1 < positions.length ? positions[i + 1][0] : content.length;
    const body = content.slice(pos, end);
    const bullets = [];
    const itemRe = /\\resumeItem\s*\{([^{}]*)\}/g;
    let im;
    while ((im = itemRe.exec(body)) !== null) {
      const t = latexToText(im[1]);
      if (t) bullets.push(t);
    }
    if (cmd === "resumeSubheading" || cmd === "resumeSubSubheading") {
      let org = "";
      let loc = "";
      let title = "";
      let dates = "";
      if (nargs === 4) {
        org = latexToText(args[0]);
        loc = latexToText(args[1]);
        title = latexToText(args[2]);
        dates = latexToText(args[3]);
      } else {
        title = latexToText(args[0]);
        dates = latexToText(args[1]);
      }
      const { start, end: endD } = parseDateRange(dates);
      items.push(makeItem(kind, {
        title, organization: org, location: loc, date_text: dates,
        start_date: start, end_date: endD, description: bullets,
      }));
    } else {
      const proj = latexToText(args[0]);
      const dates = args.length > 1 ? latexToText(args[1]) : "";
      const { title, tech } = splitProjectTitle(proj);
      const { start, end: endD } = parseDateRange(dates);
      items.push(makeItem(kind, {
        title, technologies: tech ? [tech] : [], date_text: dates,
        start_date: start, end_date: endD, description: bullets,
      }));
    }
  }
  return items;
}

function finalizeGeneric(current, kind) {
  const { start, end } = parseDateRange(current.date_text || "");
  return makeItem(kind, {
    title: current.title || "",
    date_text: current.date_text || "",
    start_date: start,
    end_date: end,
    description: (current.description || []).filter(Boolean),
  });
}

function extractItems(content, kind) {
  const items = [];
  let current = null;
  const lines = content.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const bold = line.match(/^\\(?:textbf|large|Large|textsc)\s*\{([^{}]*)\}/);
    const item = line.match(/^\\item\s*(?:\[[^\]]*\])?\s*(.*)$/);
    const macroItem = line.match(/^\\(?:resumeItem|cvitem|cvlistitem|award|honor)\s*\{([^{}]*)\}/);
    if (macroItem && !item) {
      const text = latexToText(macroItem[1]);
      if (!current) current = { title: "", date_text: "", description: [] };
      if (text) current.description.push(text);
    } else if (bold && !item) {
      if (current) items.push(finalizeGeneric(current, kind));
      const heading = latexToText(bold[1]);
      const rest = latexToText(line.slice(bold[0].length));
      const { title, dates } = splitTitleDates(heading || rest);
      current = { title, date_text: dates, description: [] };
    } else if (item) {
      const text = latexToText(item[1]);
      if (!current) current = { title: "", date_text: "", description: [] };
      if (text) current.description.push(text);
    } else if (current && !line.startsWith("\\")) {
      const text = latexToText(line);
      if (text) current.description.push(text);
    }
  }
  if (current) items.push(finalizeGeneric(current, kind));
  return items;
}

function extractSkills(content) {
  const text = latexToText(content);
  const candidates = [];
  const chunks = text.split(/[,;:\n]|\s*&\s*|\s*\\(?:quad|hspace)\s*/);
  for (let chunk of chunks) {
    chunk = chunk.replace(/^[ .\t]+|[ .\t]+$/g, "");
    if (!chunk || chunk.length > 60) continue;
    chunk = chunk.replace(/^[A-Za-z][A-Za-z /&]+:\s*/, "");
    const wc = chunk.split(/\s+/).filter(Boolean).length;
    if (wc >= 1 && wc <= 6) candidates.push(chunk);
  }
  const seen = new Set();
  const result = [];
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }
  return result;
}

function headerRegion(text) {
  const marker = "\\begin{document}";
  const idx = text.indexOf(marker);
  const start = idx !== -1 ? idx + marker.length : 0;
  const section = text.slice(start).match(/\\(?:section|subsection)\*?\s*\{/);
  const end = section ? start + section.index : start + 1500;
  return latexToText(text.slice(start, end));
}

function extractContact(text) {
  const contact = { name: "", email: "", phone: "", location: "", links: [] };
  const nameMatch = text.match(/\\name\s*\{([^{}]*)\}/);
  if (nameMatch) contact.name = latexToText(nameMatch[1]);
  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) contact.email = emailMatch[0];
  const phoneMatch = text.match(/(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}|\+\d[\d\s().\-]{7,})/);
  if (phoneMatch) contact.phone = phoneMatch[0].trim();

  if (!contact.name || !contact.location) {
    const header = headerRegion(text);
    for (const line of header.split("\n")) {
      const candidate = line.trim();
      if (!candidate) continue;
      if (candidate.includes("@") || candidate.includes("http") || /\d{3}[\s.\-]?\d{4}/.test(candidate)) continue;
      const ws = candidate.split(/\s+/);
      if (!contact.name && ws.length >= 2 && ws.length <= 4 && ws.every((w) => /^[A-Za-z.'\-]+$/.test(w))) {
        contact.name = candidate;
      } else if (!contact.location && /[A-Za-z]/.test(candidate) && candidate.length < 60) {
        contact.location = candidate;
      }
      if (contact.name && contact.location) break;
    }
  }

  const linkRe = /\\href\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    if (m[1].startsWith("http") || m[1].startsWith("mailto")) contact.links.push(m[1]);
  }
  const urlRe = /\\url\s*\{([^{}]*)\}/g;
  while ((m = urlRe.exec(text)) !== null) contact.links.push(m[1]);
  contact.links = [...new Set(contact.links)];

  const addr = text.match(/\\address\s*\{([^{}]*)\}/);
  if (addr) contact.location = latexToText(addr[1]);
  else if (!contact.location) {
    const loc = text.match(/\\location\s*\{([^{}]*)\}/);
    if (loc) contact.location = latexToText(loc[1]);
  }
  return contact;
}

export function detectTemplate(text) {
  for (const cls of ["moderncv", "altacv", "awesome-cv", "resume", "deedy", "fontawesome"]) {
    if (new RegExp(`\\\\documentclass(\\[[^\\]]*\\])?\\{${cls}`).test(text)) return cls;
  }
  if (text.includes("\\resumeSubheading") || text.includes("\\resumeItem")) return "jakes-resume";
  return "auto";
}

export function parseTex(text, filename = "resume.tex") {
  const cleaned = stripComments(text);
  const template = detectTemplate(cleaned);
  const contact = extractContact(cleaned);
  const sections = findSections(cleaned);

  const warnings = [];
  const structured = {};
  const summaryParts = [];
  let skills = [];
  let confidence = 1;

  if (sections.length === 0) {
    warnings.push(
      "No standard \\section headings were detected. Falling back to a text-based parse of the document body."
    );
  }

  for (const section of sections) {
    const { kind, content } = section;
    if (kind === "skill") {
      skills = skills.concat(extractSkills(content));
      continue;
    }
    if (kind === "summary") {
      summaryParts.push(latexToText(content));
      continue;
    }
    if (kind === "contact" || kind === "other") continue;

    let items = [];
    if (content.includes("\\cventry")) items = extractCventryItems(content, kind);
    if (items.length === 0 && (content.includes("\\resumeSubheading") || content.includes("\\resumeProjectHeading"))) {
      items = extractSubheadingItems(content, kind);
    }
    if (items.length === 0) items = extractItems(content, kind);

    items = items.filter((it) => it.title || it.description.length || it.organization);
    for (const it of items) {
      it.provenance = { section: section.title, source_type: "tex", line_start: section.line_start, line_end: null, raw: "" };
    }
    if (items.length) {
      if (!structured[kind]) structured[kind] = [];
      structured[kind].push(...items);
    }
  }

  skills = [...new Set(skills.filter(Boolean))];
  const summary = summaryParts.filter(Boolean).join("\n").trim();

  if (Object.keys(structured).length === 0 && sections.length > 0) {
    warnings.push("Sections were detected but no entries could be structured.");
    confidence = Math.min(confidence, 0.5);
  }
  if (skills.length === 0) {
    const skillMatch = latexToText(cleaned).match(/Skills?[:\s]*([^\n]{0,300})/i);
    if (skillMatch) skills = skillMatch[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }

  return {
    id: null,
    source_type: "tex",
    filename,
    contact,
    summary,
    sections: structured,
    skills,
    raw_tex: text,
    original_text: latexToText(cleaned),
    parse_confidence: confidence,
    warnings,
    template,
  };
}
