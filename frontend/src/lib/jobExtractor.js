// Job description extraction: direct text structuring and best-effort URL
// import. Browser CORS policies block many job sites; when that happens we
// surface a clear message asking the user to paste the description instead.
// There is intentionally no backend proxy.

import { canonicalSkill, isKnownSkill } from "./skills.js";
import { newId } from "./text.js";

const SECTION_HEADINGS = [
  [["responsibilities", "what you'll do", "what you will do", "the role", "duties"], "responsibility"],
  [["requirements", "qualifications", "required", "minimum qualifications", "what we're looking for", "basic qualifications"], "qualification"],
  [["preferred", "nice to have", "bonus", "desired", "plus"], "preferred"],
  [["education"], "education"],
  [["benefits", "perks", "about us", "equal opportunity"], "ignore"],
];

const PREFERRED_HINT = /\b(preferred|nice to have|bonus|a plus|desired|plus\b)/i;
const REQUIRED_HINT = /\b(required|must|minimum|at least|strong|proficien|expert|demonstrated|experience with|solid)\b/i;
const RESPONSIBILITY_HINT = /^(design|build|develop|lead|collaborate|own|drive|implement|maintain|create|manage|partner|contribute|write|research|deliver|work)\b/i;
const EDUCATION_HINT = /\b(bachelor|master|phd|ph\.d|degree|b\.s|m\.s|mba|gpa|university|major)\b/i;
const CERT_HINT = /\b(certified|certification|certificate|aws certified|pmp|security\+)\b/i;
const YEARS_HINT = /(\d+(?:\.\d+)?)\s*\+?\s*(?:or more\s*)?years?/i;
const LOCATION_HINT = /\b(remote|hybrid|on-?site|relocat|authorized to work|work authorization|visa)\b/i;
const BULLET_SPLIT = /(?:\r?\n)+|\u2022|\u2023|\u25E6|\u00b7/;

function looksLikeBullet(line) {
  const t = line.trim();
  if (t.length < 3 || t.length > 400) return false;
  if (t.endsWith(":")) return false;
  return true;
}

function classifyLine(line, currentSection) {
  if (EDUCATION_HINT.test(line)) return ["education", false];
  if (CERT_HINT.test(line)) return ["certification", false];
  if (LOCATION_HINT.test(line)) return ["location", false];
  if (YEARS_HINT.test(line) && /\b(experience|years)\b/i.test(line)) {
    const must = REQUIRED_HINT.test(line) && !PREFERRED_HINT.test(line);
    return ["experience", must];
  }
  if (PREFERRED_HINT.test(line)) return ["preferred", false];
  if (["responsibility", "qualification", "preferred", "education"].includes(currentSection)) {
    const must = currentSection === "qualification" && REQUIRED_HINT.test(line);
    return [currentSection, must];
  }
  if (RESPONSIBILITY_HINT.test(line.trim())) return ["responsibility", false];
  if (REQUIRED_HINT.test(line)) return ["qualification", true];
  return ["skill", false];
}

function extractKeywords(line) {
  const keywords = [];
  const lowered = line.toLowerCase();
  for (const token of lowered.match(/[a-zA-Z][a-zA-Z0-9+#.]+/g) || []) {
    if (isKnownSkill(token)) keywords.push(canonicalSkill(token));
  }
  for (const phrase of lowered.match(/[a-z][a-z0-9+#. ]{2,40}/g) || []) {
    if (isKnownSkill(phrase.trim())) keywords.push(canonicalSkill(phrase.trim()));
  }
  for (const cap of line.match(/\b[A-Z][A-Za-z0-9+#.]{1,20}\b/g) || []) {
    if (["The", "And", "You", "We", "Our", "This", "That", "With", "For"].includes(cap)) continue;
    if (isKnownSkill(cap)) keywords.push(canonicalSkill(cap));
  }
  return [...new Set(keywords)];
}

export function structureJob(text, { url = "", source = "text", title = "", company = "", location = "" } = {}) {
  text = (text || "").trim().slice(0, 60000);
  const warnings = [];
  if (text.length < 60) warnings.push("The job description is very short; scoring may be unreliable.");

  if (!title) {
    const firstLine = text.split("\n")[0] || "";
    const m = firstLine.match(/^(.{3,80}?)\s+(?:at|@)\s+(.{2,60})$/i);
    if (m) {
      title = m[1].trim();
      company = company || m[2].trim();
    } else if (firstLine && firstLine.length <= 120) {
      title = firstLine.replace(/\s*[|\u2013\u2014]\s*.*$/, "").trim();
    }
  }

  const requirements = [];
  const seen = new Set();
  let currentSection = "";
  for (const raw of text.split(BULLET_SPLIT)) {
    const line = raw.trim();
    if (!line) continue;
    let headingKind = null;
    const lowered = line.toLowerCase().replace(/[:\s]+$/, "");
    for (const [keys, kind] of SECTION_HEADINGS) {
      if (keys.some((k) => lowered === k || lowered.startsWith(k)) && lowered.length < 60) {
        headingKind = kind;
        break;
      }
    }
    if (headingKind) {
      currentSection = headingKind;
      continue;
    }
    if (currentSection === "ignore") continue;
    if (!looksLikeBullet(line)) continue;
    const [category, must] = classifyLine(line, currentSection);
    const key = line.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    const keywords = extractKeywords(line);
    let minYears = null;
    const ym = line.match(YEARS_HINT);
    if (ym && (category === "experience" || category === "qualification")) {
      const parsed = parseFloat(ym[1]);
      if (!Number.isNaN(parsed)) minYears = parsed;
    }
    const critical = must && REQUIRED_HINT.test(line);
    requirements.push({ id: newId(), text: line, category, must_have: must, keywords, min_years: minYears, critical });
  }

  if (requirements.length > 80) {
    requirements.length = 80;
    warnings.push("Only the first 80 requirements were structured.");
  }

  let confidence = requirements.length >= 5 ? 0.85 : 0.5;
  if (requirements.length === 0) {
    confidence = 0.2;
    warnings.push("No distinct requirements could be extracted from the text.");
  }

  return {
    id: newId(),
    source,
    url,
    title: title.trim(),
    company: company.trim(),
    location,
    description: text,
    requirements,
    extraction_confidence: confidence,
    warnings,
  };
}

export function extractJobFromText(text, title = "", company = "") {
  return structureJob(text, { source: "text", title, company });
}

// ------------------------------------------------------------------ URL fetch

const BLOCK_TAGS = new Set(["P", "DIV", "LI", "BR", "H1", "H2", "H3", "H4", "H5", "UL", "OL", "SECTION", "ARTICLE", "TR", "TD", "TABLE", "MAIN", "HEADER", "FOOTER"]);

function collectText(node, out) {
  if (node.nodeType === 3) {
    out.push(node.textContent);
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.tagName;
  if (tag === "BR") {
    out.push("\n");
    return;
  }
  if (BLOCK_TAGS.has(tag)) out.push("\n");
  for (const child of node.childNodes) collectText(child, out);
  if (BLOCK_TAGS.has(tag)) out.push("\n");
}

function elementText(el) {
  const out = [];
  collectText(el, out);
  return out
    .join("")
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let ldTitle = "";
  let ldCompany = "";
  let ldLocation = "";
  for (const tag of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      let data = JSON.parse(tag.textContent || "{}");
      const blocks = Array.isArray(data) ? data : [data];
      for (const block of blocks) {
        if (!block || block["@type"] !== "JobPosting") continue;
        ldTitle = block.title || ldTitle;
        if (block.hiringOrganization && block.hiringOrganization.name) ldCompany = block.hiringOrganization.name;
        let loc = block.jobLocation;
        if (Array.isArray(loc)) loc = loc[0];
        if (loc && loc.address) {
          const city = loc.address.addressLocality || "";
          const region = loc.address.addressRegion || "";
          ldLocation = [city, region].filter(Boolean).join(", ") || ldLocation;
        }
      }
    } catch (_) {
      /* ignore malformed JSON-LD */
    }
  }

  for (const bad of doc.querySelectorAll("script,style,noscript,svg,nav,footer,header,form")) bad.remove();

  let container = null;
  for (const selector of ["[class*=job-description]", "[class*=jobDescription]", "[id*=job-description]", "[class*=description]", "article", "main"]) {
    const el = doc.querySelector(selector);
    if (el && elementText(el).length > 300) {
      container = el;
      break;
    }
  }
  const target = container || doc.body || doc.documentElement;
  const text = elementText(target).replace(/\n{3,}/g, "\n\n");

  let title = ldTitle || (doc.title ? doc.title.textContent.trim() : "");
  if (!title) {
    const h1 = doc.querySelector("h1");
    if (h1) title = h1.textContent.trim();
  }
  let company = ldCompany;
  if (!company) {
    const og = doc.querySelector('meta[property="og:site_name"]');
    if (og) company = og.getAttribute("content") || "";
  }
  return { text, title, company, location: ldLocation };
}

// ---------------------------------------------------------------- ATS APIs
// Many companies host postings on an ATS whose public JSON API allows browser
// (CORS) requests. Using it is more reliable than scraping HTML and needs no
// proxy. We only ever call the site's own API.

export function parseAtsUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (_) {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  const greenhouse = (company, id) => ({
    kind: "greenhouse",
    company,
    id,
    apiUrl: `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${id}?questions=false`,
  });

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    if (u.pathname.startsWith("/embed/job_app")) {
      const company = u.searchParams.get("for");
      const id = u.searchParams.get("token");
      return company && id ? greenhouse(company, id) : null;
    }
    const m = u.pathname.match(/\/([^/]+)\/jobs\/(\d+)/);
    return m ? greenhouse(m[1], m[2]) : null;
  }
  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    const [company, id] = parts;
    return company && id
      ? { kind: "lever", company, id, apiUrl: `https://api.lever.co/v0/postings/${company}/${id}?mode=json` }
      : null;
  }
  if (host === "jobs.ashbyhq.com") {
    const [org, id] = parts;
    return org && id
      ? { kind: "ashby", company: org, id, apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true` }
      : null;
  }
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") {
    const [company, slug] = parts;
    if (!company || !slug) return null;
    const id = slug.split("-")[0];
    return { kind: "smartrecruiters", company, id, apiUrl: `https://api.smartrecruiters.com/v1/companies/${company}/postings/${id}` };
  }
  return null;
}

function decodeHtml(html) {
  return new DOMParser().parseFromString(html || "", "text/html").documentElement.textContent || "";
}

function htmlToText(html) {
  return html ? elementText(new DOMParser().parseFromString(html, "text/html").body) : "";
}

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const ATS_MAPPERS = {
  greenhouse(data, ats) {
    return {
      title: data.title || "",
      company: (data.company && data.company.name) || ats.company,
      location: (data.location && data.location.name) || "",
      text: [data.title, htmlToText(decodeHtml(data.content))].filter(Boolean).join("\n\n"),
    };
  },
  lever(data, ats) {
    const lists = (data.lists || []).map((l) => [l.text, htmlToText(l.content)].filter(Boolean).join("\n")).join("\n\n");
    return {
      title: data.text || "",
      company: ats.company,
      location: (data.categories && data.categories.location) || "",
      text: [data.text, data.descriptionPlain, lists, data.additional ? htmlToText(data.additional) : ""].filter(Boolean).join("\n\n"),
    };
  },
  ashby(data, ats) {
    const jobs = data.jobs || [];
    const job = jobs.find((j) => String(j.id).toLowerCase() === ats.id.toLowerCase());
    if (!job) return null;
    return {
      title: job.title || "",
      company: ats.company,
      location: job.location || "",
      text: [job.title, job.descriptionPlain || htmlToText(job.descriptionHtml)].filter(Boolean).join("\n\n"),
    };
  },
  smartrecruiters(data, ats) {
    const s = (data.jobAd && data.jobAd.sections) || {};
    const sections = [s.jobDescription, s.qualifications, s.additionalInformation].filter(Boolean).map((x) => htmlToText(x.text));
    const loc = data.location || {};
    return {
      title: data.name || "",
      company: (data.company && data.company.name) || ats.company,
      location: [loc.city, loc.region, loc.country].filter(Boolean).join(", "),
      text: [data.name, ...sections].filter(Boolean).join("\n\n"),
    };
  },
};

async function resolveFromAts(url) {
  const ats = parseAtsUrl(url);
  if (!ats) return null;
  const data = await fetchJson(ats.apiUrl);
  const job = ATS_MAPPERS[ats.kind](data, ats);
  return job && job.text && job.text.length >= 80 ? job : null;
}

export async function fetchJobFromUrl(url) {
  const trimmed = (url || "").trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Enter a public http(s) job posting URL.");
  }

  // Prefer the posting's own public API when the URL belongs to a known ATS.
  try {
    const resolved = await resolveFromAts(trimmed);
    if (resolved) {
      return structureJob(resolved.text, {
        url: trimmed,
        source: "url",
        title: resolved.title,
        company: resolved.company,
        location: resolved.location,
      });
    }
  } catch (_) {
    // Fall through to a direct HTML fetch.
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(trimmed, { signal: controller.signal, redirect: "follow" });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(
      "The job page could not be fetched from the browser. This is usually a CORS restriction " +
        "(the site does not allow direct browser access) or a network/offline issue. Please paste " +
        "the job description text instead."
    );
  }
  clearTimeout(timer);
  if (response.status === 401 || response.status === 403) {
    throw new Error("The site denied access (it may require login). Paste the job description text instead.");
  }
  if (!response.ok) {
    throw new Error(`The site returned HTTP ${response.status}. Paste the job description text instead.`);
  }
  const html = await response.text();
  const { text, title, company, location } = cleanHtml(html);
  if (text.length < 100) {
    throw new Error(
      "The page did not contain enough readable job-description text (it may require JavaScript or login). Paste the description instead."
    );
  }
  return structureJob(text, { url, source: "url", title, company, location });
}
