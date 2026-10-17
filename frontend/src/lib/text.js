// Shared text utilities: LaTeX-to-text conversion, comment stripping, brace
// parsing, date parsing and tokenization. Ported from the original Python
// engine so the matching behaviour is preserved.

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function stripComments(text) {
  const out = [];
  for (const line of text.split("\n")) {
    let idx = 0;
    let cut = -1;
    while (true) {
      const pos = line.indexOf("%", idx);
      if (pos === -1) break;
      let backslashes = 0;
      let j = pos - 1;
      while (j >= 0 && line[j] === "\\") {
        backslashes += 1;
        j -= 1;
      }
      if (backslashes % 2 === 0) {
        cut = pos;
        break;
      }
      idx = pos + 1;
    }
    out.push(cut === -1 ? line : line.slice(0, cut));
  }
  return out.join("\n");
}

export function latexToText(value) {
  if (!value) return "";
  let text = value;
  text = text.replace(
    /\\(textbf|textit|emph|underline|textsc|texttt|mbox|text|mathrm|mathbf)\s*\{([^{}]*)\}/g,
    "$2"
  );
  text = text.replace(/\\href\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$2 ($1)");
  text = text.replace(/\\url\s*\{([^{}]*)\}/g, "$1");
  text = text.replace(/\\(small|large|Large|tiny|huge|Huge|vspace|vskip)\*?\s*\{[^{}]*\}/g, " ");
  text = text.replace(
    /\\(centering|noindent|bigskip|medskip|smallskip|hfill|hspace|vspace|vfill|newline|linebreak)\*?\b(\{[^{}]*\})?/g,
    " "
  );
  text = text.replace(/\\item\b\s*(\[[^\]]*\])?/g, " ");
  text = text.replace(/\\[a-zA-Z@]+\*?/g, " ");
  text = text
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\#/g, "#")
    .replace(/\\\$/g, "$")
    .replace(/\\\{/g, "{")
    .replace(/\\\}/g, "}");
  text = text.replace(/~/g, " ").replace(/\\\\/g, " ");
  text = text.replace(/[{}]/g, " ");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\s*\n\s*/g, "\n");
  return text.trim();
}

// Read a {...} group starting at the first brace at/after `start`.
// Returns [content, indexAfterGroup] or [null, start].
export function readBraced(text, start) {
  let i = start;
  while (i < text.length && " \t\r\n".includes(text[i])) i += 1;
  if (i >= text.length || text[i] !== "{") return [null, start];
  let depth = 0;
  const begin = i;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return [text.slice(begin + 1, i), i + 1];
    }
    i += 1;
  }
  return [null, start];
}

export function parseNArgs(text, braceIdx, count) {
  let pos = braceIdx;
  const args = [];
  for (let k = 0; k < count; k += 1) {
    const [arg, next] = readBraced(text, pos);
    if (arg === null) return [args.length ? args : null, pos];
    args.push(arg);
    pos = next;
  }
  return [args, pos];
}

function isoDate(year, month) {
  if (!year || year < 1900 || year > 2100) return null;
  const m = String(Math.min(12, Math.max(1, month || 1))).padStart(2, "0");
  return `${year}-${m}-01`;
}

// Returns { start: "YYYY-MM-01"|null, end: "YYYY-MM-01"|null }
export function parseDateRange(text) {
  if (!text) return { start: null, end: null };
  const lowered = text.toLowerCase();
  const hasPresent = lowered.includes("present") || lowered.includes("current");
  const re =
    /(?:(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)[\s.,]*)?((?:19|20)\d{2})/g;
  const dates = [];
  let match;
  while ((match = re.exec(lowered)) !== null) {
    const month = match[1] ? MONTHS[match[1]] || 1 : 1;
    const iso = isoDate(Number(match[2]), month);
    if (iso) dates.push(iso);
  }
  if (dates.length === 0) {
    const now = new Date();
    return { start: null, end: hasPresent ? isoDate(now.getFullYear(), now.getMonth() + 1) : null };
  }
  dates.sort();
  const start = dates[0];
  let end = null;
  if (hasPresent) {
    const now = new Date();
    end = isoDate(now.getFullYear(), now.getMonth() + 1);
  } else if (dates.length > 1) {
    end = dates[dates.length - 1];
  }
  return { start, end };
}

export function dateToLabel(iso) {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  const idx = Number(m) - 1;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[idx] || ""} ${y}`.trim();
}

export function splitTitleDates(text) {
  if (!text) return { title: "", dates: "" };
  const re =
    /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{4}\s*[-\u2013\u2014]\s*(?:present|\d{4})|(?:19|20)\d{2})/i;
  const m = text.match(re);
  if (!m) return { title: text.trim(), dates: "" };
  const title = text.slice(0, m.index).replace(/[\s\-|\u2013\u2014]+$/g, "").trim();
  const dates = text.slice(m.index).trim();
  return { title, dates };
}
