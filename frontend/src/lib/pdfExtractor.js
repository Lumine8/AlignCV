// Browser PDF ingestion using PDF.js.
// Extracts text and links, detects scanned/low-text documents and layout risks,
// then reconstructs a structured resume. PDFs never preserve the original LaTeX,
// so reconstruction is a clean editable representation, not source recovery.

import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { newId, parseDateRange } from "./text.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;

const SECTION_HEADINGS = {
  experience: ["experience", "work experience", "professional experience", "employment", "employment history", "work history"],
  education: ["education", "academic background", "academics"],
  project: ["projects", "personal projects", "selected projects", "key projects"],
  publication: ["publications", "research", "papers", "conference papers"],
  patent: ["patents"],
  certification: ["certifications", "certificates", "licenses"],
  award: ["awards", "honors", "honours", "achievements", "awards & honors"],
  skill: ["skills", "technical skills", "skills & interests", "technologies", "competencies", "technical proficiencies"],
  summary: ["summary", "professional summary", "objective", "profile", "about me", "about"],
  contact: ["contact", "contact information"],
};

const BULLET_PREFIX = /^\s*[\u2022\u2023\u25E6\u2043\u2219\-*\u00b7]\s+/;
const DATE_LINE =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4}\s*[-\u2013\u2014]\s*(?:present|\d{4})|\d{1,2}\/\d{4}\s*[-\u2013\u2014]\s*(?:\d{1,2}\/\d{4}|present))/i;

export async function extractPdfText(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const links = [];
  let fullText = "";
  let scrambled = false;
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let pageText = "";
    for (const item of content.items) {
      pageText += item.str || "";
      pageText += item.hasEOL ? "\n" : " ";
    }
    fullText += pageText + "\n";
    try {
      const annotations = await page.getAnnotations();
      for (const a of annotations) {
        if (a.url) links.push(a.url);
      }
    } catch (_) {
      /* annotations optional */
    }
    const lines = pageText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length) {
      const avg = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
      if (avg < 24) scrambled = true;
    }
  }
  return { text: fullText, links, pageCount: pdf.numPages, scrambled };
}

function classifyHeading(line) {
  const candidate = (line || "").trim().replace(/:$/, "").toLowerCase();
  if (!candidate || candidate.length > 40) return null;
  for (const [kind, keys] of Object.entries(SECTION_HEADINGS)) {
    for (const key of keys) {
      if (candidate === key || candidate === `${key}s`) return kind;
    }
  }
  if (line.trim() === line.trim().toUpperCase() && line.trim().length >= 3 && line.trim().length <= 40) {
    for (const [kind, keys] of Object.entries(SECTION_HEADINGS)) {
      for (const key of keys) if (candidate.includes(key)) return kind;
    }
  }
  return null;
}

function skillTokens(text) {
  const chunks = text.split(/[,;:\n\u2022]|\s{2,}/);
  const result = [];
  for (let chunk of chunks) {
    chunk = chunk.replace(/^[ .\t]+|[ .\t]+$/g, "");
    const wc = chunk.split(/\s+/).filter(Boolean).length;
    if (wc >= 1 && wc <= 6 && chunk.length <= 60) result.push(chunk);
  }
  return [...new Set(result)];
}

function looksLikeHeading(line) {
  if (line.length > 100) return false;
  const wc = line.split(/\s+/).filter(Boolean).length;
  return wc >= 1 && wc <= 12 && (/[A-Z]/.test(line) || line.includes("\u2013") || line.includes("|"));
}

function splitHeadingDates(line) {
  const m = line.match(DATE_LINE);
  if (!m) return { title: line.trim(), dates: "" };
  const title = line.slice(0, m.index).replace(/[\s\-|\u2013\u2014]+$/g, "").trim();
  return { title: title || line.trim(), dates: line.slice(m.index).trim() };
}

function itemsFromBlock(block, kind, baseLine) {
  const items = [];
  let current = null;
  for (const raw of block) {
    const line = raw.trim();
    if (!line) continue;
    const isBullet = BULLET_PREFIX.test(raw);
    const hasDate = DATE_LINE.test(line);
    const titleCase = line === line.replace(/\b\w/g, (c) => c.toUpperCase());
    if (!isBullet && (hasDate || (looksLikeHeading(line) && titleCase))) {
      if (current && (current.description.length || current.title)) items.push(finalizeItem(current, kind, baseLine));
      const { title, dates } = splitHeadingDates(line);
      current = { title, date_text: dates, description: [], tech: [] };
    } else {
      const text = line.replace(BULLET_PREFIX, "").trim();
      if (!current) current = { title: "", date_text: "", description: [], tech: [] };
      if (text) current.description.push(text);
    }
  }
  if (current && (current.description.length || current.title)) items.push(finalizeItem(current, kind, baseLine));
  return items;
}

function finalizeItem(current, kind, baseLine) {
  const { start, end } = parseDateRange(current.date_text || "");
  return {
    id: newId(),
    kind,
    title: current.title || "",
    organization: "",
    location: "",
    start_date: start,
    end_date: end,
    date_text: current.date_text || "",
    description: current.description.filter(Boolean),
    technologies: current.tech || [],
    achievements: [],
    links: [],
    confidence: 0.75,
    provenance: { section: kind, source_type: "pdf", line_start: baseLine, line_end: null, raw: "" },
  };
}

export function parsePdfText(text, links = [], pageCount = 0, scrambled = false, filename = "resume.pdf") {
  const warnings = [];
  const contact = { name: "", email: "", phone: "", location: "", links: [...links] };

  const email = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (email) contact.email = email[0];
  const phone = text.match(/(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}|\+\d[\d\s().\-]{7,})/);
  if (phone) contact.phone = phone[0].trim();

  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars < 120) {
    warnings.push(
      "This PDF has little or no extractable text. It may be scanned or image-only. Browser OCR is limited; upload the LaTeX/PDF source or a text-based PDF instead."
    );
    return {
      id: null, source_type: "pdf", filename, contact, summary: "", sections: {}, skills: [],
      original_text: text, parse_confidence: 0.05, warnings, template: "auto",
    };
  }

  const lines = text.split("\n");
  for (const ln of lines) {
    const stripped = ln.trim();
    if (stripped && !/\d/.test(stripped) && !stripped.includes("@") && stripped.length < 60) {
      contact.name = stripped;
      break;
    }
  }

  const headingIndices = [];
  lines.forEach((ln, i) => {
    const kind = classifyHeading(ln.trim());
    if (kind) headingIndices.push([i, kind]);
  });

  const structured = {};
  let skills = [];
  const summaryParts = [];
  let confidence = 1;

  if (headingIndices.length === 0) {
    warnings.push(
      "No clear section headings were detected in the PDF. Content was placed under a generic section; review before optimizing."
    );
    confidence = 0.4;
  }

  const effective = headingIndices.length ? headingIndices : [];
  for (let idx = 0; idx < effective.length; idx += 1) {
    const [lineNo, kind] = effective[idx];
    const start = lineNo + 1;
    const end = idx + 1 < effective.length ? effective[idx + 1][0] : lines.length;
    const block = lines.slice(start, end);
    if (kind === "skill") {
      skills = skills.concat(skillTokens(block.join(" ")));
      continue;
    }
    if (kind === "summary" || kind === "contact") {
      summaryParts.push(block.map((l) => l.trim()).filter(Boolean).join(" "));
      continue;
    }
    const items = itemsFromBlock(block, kind, lineNo + 1);
    if (items.length) {
      if (!structured[kind]) structured[kind] = [];
      structured[kind].push(...items);
    }
  }

  if (scrambled) {
    warnings.push("Some pages appear to use columns or unusual layouts; reading order may be imperfect. Review the reconstructed sections.");
    confidence = Math.min(confidence, 0.6);
  }
  if (pageCount > 0) warnings.push(`Extracted ${pageCount} page(s) of text.`);
  if (Object.keys(structured).length === 0) confidence = Math.min(confidence, 0.4);

  return {
    id: null,
    source_type: "pdf",
    filename,
    contact,
    summary: summaryParts.filter(Boolean).join("\n").trim(),
    sections: structured,
    skills: [...new Set(skills)],
    original_text: text,
    parse_confidence: confidence,
    warnings,
    template: "auto",
  };
}

export async function parsePdfFile(file) {
  const buffer = await file.arrayBuffer();
  const { text, links, pageCount, scrambled } = await extractPdfText(buffer);
  return parsePdfText(text, links, pageCount, scrambled, file.name || "resume.pdf");
}
