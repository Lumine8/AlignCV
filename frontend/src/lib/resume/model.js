// Shared structured resume model for the "Create" workflow. Field names mirror
// backend/app/schemas/resume.py so a document can be validated or rendered by
// either side. Dates are stored as {year, month} points, never pre-formatted.

import { newId } from "../text.js";

export const DATE_FORMATS = [
  "MMM YYYY",
  "MMMM YYYY",
  "MM/YYYY",
  "YYYY-MM",
  "YYYY",
];

export const DEFAULT_SECTION_ORDER = [
  "summary",
  "education",
  "experience",
  "projects",
  "skills",
  "publications",
  "certifications",
  "custom",
];

export const SECTION_LABELS = {
  summary: "Summary",
  education: "Education",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  publications: "Publications",
  certifications: "Certifications",
  custom: "Additional",
};

export const CUSTOM_SECTION_TYPES = [
  { value: "awards", label: "Awards" },
  { value: "leadership", label: "Leadership" },
  { value: "volunteer", label: "Volunteer work" },
  { value: "research", label: "Research" },
  { value: "languages", label: "Languages" },
  { value: "patents", label: "Patents" },
  { value: "interests", label: "Interests" },
  { value: "custom", label: "Custom" },
];

const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTH_OPTIONS = MONTHS_FULL.map((label, index) => ({ value: index + 1, label }));

export function createEmptyResume() {
  return {
    schema_version: 1,
    id: newId(),
    source_type: "created",
    contact: {
      full_name: "",
      professional_title: "",
      email: "",
      phone: "",
      location: "",
      website: "",
      linkedin: "",
      github: "",
      links: [],
    },
    summary: "",
    education: [],
    experience: [],
    projects: [],
    skills: [],
    publications: [],
    certifications: [],
    custom_sections: [],
    metadata: {
      template: "ats",
      date_format: "MMM YYYY",
      section_order: [...DEFAULT_SECTION_ORDER],
      authoring_mode: "structured",
      notes: "",
    },
    original_source: null,
    warnings: [],
  };
}

export function createEducation() {
  return {
    id: newId(),
    institution: "",
    degree: "",
    field_of_study: "",
    location: "",
    dates: null,
    grade: "",
    coursework: [],
    description: "",
  };
}

export function createExperience() {
  return {
    id: newId(),
    employer: "",
    job_title: "",
    location: "",
    employment_type: "",
    dates: null,
    responsibilities: [],
    achievements: [],
    technologies: [],
  };
}

export function createProject() {
  return {
    id: newId(),
    name: "",
    summary: "",
    problem: "",
    description: "",
    technologies: [],
    contributions: [],
    achievements: [],
    repository_url: "",
    live_url: "",
    dates: null,
  };
}

export function createSkill() {
  return { id: newId(), name: "", category: "technical", level: "" };
}

export function createPublication() {
  return { id: newId(), title: "", authors: [], venue: "", year: null, url: "", description: "" };
}

export function createCertification() {
  return { id: newId(), name: "", issuer: "", issue_date: null, expiry_date: null, credential_url: "" };
}

export function createCustomSection() {
  return { id: newId(), title: "Awards", section_type: "awards", items: [] };
}

export function createCustomEntry() {
  return { id: newId(), title: "", subtitle: "", dates: null, bullets: [], url: "", description: "" };
}

// ------------------------------------------------------------------ Dates

export function makeDatePoint(year, month) {
  const parsedYear = Number(year);
  const parsedMonth = month === "" || month == null ? null : Number(month);
  return {
    year: Number.isFinite(parsedYear) ? parsedYear : 0,
    month: parsedMonth && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : null,
  };
}

export function makeDateRange({ startYear, startMonth, endYear, endMonth, present = false }) {
  return {
    start: makeDatePoint(startYear, startMonth),
    end: present ? null : makeDatePoint(endYear, endMonth),
    present: Boolean(present),
  };
}

export function formatDatePoint(point, format = "MMM YYYY") {
  if (!point || !point.year) return "";
  const { year, month } = point;
  switch (format) {
    case "MMMM YYYY":
      return month ? `${MONTHS_FULL[month - 1]} ${year}` : String(year);
    case "MM/YYYY":
      return month ? `${String(month).padStart(2, "0")}/${year}` : String(year);
    case "YYYY-MM":
      return month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
    case "YYYY":
      return String(year);
    case "MMM YYYY":
    default:
      return month ? `${MONTHS_ABBR[month - 1]} ${year}` : String(year);
  }
}

export function formatDateRange(range, format = "MMM YYYY", presentLabel = "Present") {
  if (!range) return "";
  const start = formatDatePoint(range.start, format);
  const end = range.present ? presentLabel : formatDatePoint(range.end, format);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end) return start;
  if (!range.present && end === start) return start;
  return `${start} – ${end}`;
}

// ------------------------------------------------------------------ Validation

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(value);
}

function validateDates(range, path, add) {
  if (!range) return;
  if (!range.start || !range.start.year) add(`${path}.start`, "Start year is required.");
  if (!range.present && (!range.end || !range.end.year)) add(`${path}.end`, "Choose Present or an end year.");
  if (range.present && range.end) add(`${path}.end`, "An end date must be empty when Present is selected.");
  if (range.start?.year && range.end?.year && !range.present) {
    const start = range.start.year * 100 + (range.start.month || 0);
    const end = range.end.year * 100 + (range.end.month || 0);
    if (end < start) add(`${path}.end`, "End date cannot be before the start date.");
  }
}

export function validateResume(doc) {
  const issues = [];
  const add = (path, message) => issues.push({ path, message });

  if (!doc.contact.full_name.trim()) add("contact.full_name", "Full name is required.");
  if (doc.contact.email && !EMAIL_RE.test(doc.contact.email)) {
    add("contact.email", "Enter a valid email address or leave it blank.");
  }
  for (const key of ["website", "linkedin", "github"]) {
    if (doc.contact[key] && !isHttpUrl(doc.contact[key])) {
      add(`contact.${key}`, "Links must start with http:// or https://.");
    }
  }
  doc.contact.links.forEach((link, index) => {
    if (link && !isHttpUrl(link)) add(`contact.links.${index}`, "Links must start with http:// or https://.");
  });

  doc.education.forEach((entry, index) => {
    if (!entry.institution.trim() && !entry.degree.trim()) {
      add(`education.${index}`, "Add an institution or a degree.");
    }
    validateDates(entry.dates, `education.${index}.dates`, add);
  });

  doc.experience.forEach((entry, index) => {
    if (!entry.employer.trim() && !entry.job_title.trim()) {
      add(`experience.${index}`, "Add an employer or a job title.");
    }
    validateDates(entry.dates, `experience.${index}.dates`, add);
  });

  doc.projects.forEach((entry, index) => {
    if (!entry.name.trim()) add(`projects.${index}`, "Add a project name.");
    for (const key of ["repository_url", "live_url"]) {
      if (entry[key] && !isHttpUrl(entry[key])) {
        add(`projects.${index}.${key}`, "Links must start with http:// or https://.");
      }
    }
    validateDates(entry.dates, `projects.${index}.dates`, add);
  });

  doc.skills.forEach((skill, index) => {
    if (!skill.name.trim()) add(`skills.${index}`, "Skill name cannot be empty.");
  });

  for (const section of doc.custom_sections) {
    if (!section.title.trim()) add(`custom_sections.${section.id}`, "Section title is required.");
    section.items.forEach((item, index) => {
      if (!item.title.trim() && !item.description.trim() && item.bullets.length === 0) {
        add(`custom_sections.${section.id}.items.${index}`, "Add a title, description or bullet.");
      }
      validateDates(item.dates, `custom_sections.${section.id}.items.${index}.dates`, add);
    });
  }

  return issues;
}

// --------------------------------------------------- Adapter: engine shape
// The matching/rendering engine expects the parser's shape: a `contact` object
// plus a `sections` map of item arrays and a flat `skills` string list.

function isoDate(point) {
  if (!point || !point.year) return null;
  return `${point.year}-${String(point.month || 1).padStart(2, "0")}-01`;
}

function dateFields(dates, dateFormat = "MMM YYYY") {
  if (!dates) return { start_date: null, end_date: null, date_text: "" };
  return {
    start_date: isoDate(dates.start),
    end_date: dates.present ? null : isoDate(dates.end),
    date_text: formatDateRange(dates, dateFormat),
  };
}

function engineItem({ id, kind, title, organization, location, dates, description, achievements, technologies, links }, dateFormat) {
  return {
    id: id || newId(),
    kind,
    title: (title || "").trim(),
    organization: (organization || "").trim(),
    location: (location || "").trim(),
    ...dateFields(dates, dateFormat),
    description: (description || []).filter(Boolean),
    achievements: (achievements || []).filter(Boolean),
    technologies: (technologies || []).filter(Boolean),
    links: (links || []).filter(Boolean),
    confidence: 1,
    provenance: { section: kind, source_type: "created", line_start: null, line_end: null, raw: "" },
  };
}

function pushSection(sections, kind, item) {
  if (!sections[kind]) sections[kind] = [];
  sections[kind].push(item);
}

export function toEngineResume(doc) {
  const sections = {};
  const dateFormat = doc.metadata?.date_format || "MMM YYYY";

  for (const entry of doc.education) {
    const description = [
      entry.field_of_study,
      entry.grade ? `Grade: ${entry.grade}` : "",
      entry.coursework.length ? `Coursework: ${entry.coursework.join(", ")}` : "",
      entry.description,
    ].filter(Boolean);
    pushSection(
      sections,
      "education",
      engineItem({
        id: entry.id,
        kind: "education",
        title: entry.degree,
        organization: entry.institution,
        location: entry.location,
        dates: entry.dates,
        description,
      }, dateFormat)
    );
  }

  for (const entry of doc.experience) {
    pushSection(
      sections,
      "experience",
      engineItem({
        id: entry.id,
        kind: "experience",
        title: entry.job_title,
        organization: entry.employer,
        location: entry.location,
        dates: entry.dates,
        description: entry.responsibilities,
        achievements: entry.achievements,
        technologies: entry.technologies,
      }, dateFormat)
    );
  }

  for (const entry of doc.projects) {
    pushSection(
      sections,
      "project",
      engineItem({
        id: entry.id,
        kind: "project",
        title: entry.name,
        organization: "",
        location: "",
        dates: entry.dates,
        description: [entry.summary, entry.problem, entry.description, ...entry.contributions],
        achievements: entry.achievements,
        technologies: entry.technologies,
        links: [entry.repository_url, entry.live_url],
      }, dateFormat)
    );
  }

  for (const entry of doc.publications) {
    pushSection(
      sections,
      "publication",
      engineItem({
        id: entry.id,
        kind: "publication",
        title: entry.title,
        organization: entry.venue,
        location: "",
        dates: entry.year ? { start: { year: entry.year, month: null }, end: null, present: false } : null,
        description: [entry.authors.join(", "), entry.description],
        links: [entry.url],
      }, dateFormat)
    );
  }

  for (const entry of doc.certifications) {
    const dates = entry.issue_date
      ? { start: entry.issue_date, end: entry.expiry_date || entry.issue_date, present: !entry.expiry_date }
      : null;
    pushSection(
      sections,
      "certification",
      engineItem({
        id: entry.id,
        kind: "certification",
        title: entry.name,
        organization: entry.issuer,
        location: "",
        dates,
        links: [entry.credential_url],
      }, dateFormat)
    );
  }

  const customKind = {
    awards: "award",
    leadership: "leadership",
    volunteer: "volunteer",
    research: "research",
    languages: "language",
    patents: "patent",
    interests: "other",
    custom: "other",
  };
  for (const section of doc.custom_sections) {
    for (const item of section.items) {
      pushSection(
        sections,
        customKind[section.section_type] || "other",
        engineItem({
          id: item.id,
          kind: customKind[section.section_type] || "other",
          title: item.title,
          organization: item.subtitle,
          location: "",
          dates: item.dates,
          description: [item.description, ...item.bullets],
          links: [item.url],
        }, dateFormat)
      );
    }
  }

  const contactLinks = [
    doc.contact.website,
    doc.contact.linkedin,
    doc.contact.github,
    ...doc.contact.links,
  ].filter(Boolean);

  const skills = doc.skills.map((skill) => skill.name.trim()).filter(Boolean);

  const textParts = [doc.contact.full_name, doc.summary, skills.join(" ")];
  for (const items of Object.values(sections)) {
    for (const item of items) {
      textParts.push(item.title, item.organization, item.date_text, ...item.description, ...item.achievements, ...item.technologies);
    }
  }

  return {
    id: doc.id,
    source_type: "created",
    filename: `${doc.contact.full_name || "resume"}.json`,
    contact: {
      name: doc.contact.full_name,
      email: doc.contact.email,
      phone: doc.contact.phone,
      location: doc.contact.location,
      links: contactLinks,
    },
    summary: doc.summary,
    sections,
    skills,
    raw_tex: "",
    original_text: textParts.filter(Boolean).join("\n"),
    parse_confidence: 1,
    warnings: [],
    template: doc.metadata.template,
    section_order: [...(doc.metadata?.section_order || [])],
  };
}
