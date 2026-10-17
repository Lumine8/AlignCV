// Builds a searchable index over a structured resume for the matching engines.

function normalize(text) {
  return (text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export class ResumeIndex {
  constructor(resume) {
    this.resume = resume;
    this.entries = [];
    this.skills = [...(resume.skills || [])];
    this._build();
  }

  _build() {
    const resume = this.resume;
    if (resume.summary) {
      this.entries.push({
        item_id: "summary",
        section: "Summary",
        kind: "summary",
        title: "Summary",
        text: resume.summary,
        search_text: normalize(resume.summary),
        technologies: [],
      });
    }
    for (const [sectionName, items] of Object.entries(resume.sections || {})) {
      for (const item of items) {
        const parts = [item.title, item.organization, item.location, item.date_text, ...(item.description || []), ...(item.achievements || []), ...(item.technologies || [])];
        const text = parts.filter(Boolean).join(" ").trim();
        this.entries.push({
          item_id: item.id,
          section: sectionName,
          kind: item.kind,
          title: item.title,
          text,
          search_text: normalize(text),
          technologies: item.technologies || [],
        });
      }
    }
  }

  get fullText() {
    const chunks = [this.resume.summary, this.skills.join(" ")];
    for (const e of this.entries) chunks.push(e.text);
    return normalize(chunks.filter(Boolean).join(" "));
  }

  findEntries(terms, limit = 3) {
    const scored = [];
    for (const entry of this.entries) {
      const hits = terms.filter((t) => t && entry.search_text.includes(t)).length;
      if (hits) scored.push([hits, entry]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, limit).map(([, e]) => e);
  }

  experienceDurationYears() {
    const intervals = [];
    for (const items of Object.values(this.resume.sections || {})) {
      for (const item of items) {
        if (item.kind !== "experience" || !item.start_date) continue;
        const start = new Date(item.start_date);
        const end = item.end_date ? new Date(item.end_date) : new Date();
        if (end >= start) intervals.push([start, end]);
      }
    }
    if (intervals.length === 0) return null;
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [start, end] of intervals) {
      if (merged.length && start <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = new Date(Math.max(merged[merged.length - 1][1], end));
      } else {
        merged.push([start, new Date(end)]);
      }
    }
    const totalDays = merged.reduce((sum, [s, e]) => sum + (e - s) / 86400000, 0);
    return Math.round((totalDays / 365.25) * 10) / 10;
  }
}
