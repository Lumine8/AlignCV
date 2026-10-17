// Truthful, evidence-backed resume optimization suggestions.
// AlignCV only reorders / re-emphasizes / consolidates existing content. Missing
// information becomes a clarifying question, never a fabricated claim.

import { canonicalSkill, isKnownSkill } from "../skills.js";
import { newId } from "../text.js";

const NUMBER_PATTERN = /\b\d+(?:\.\d+)?%?\b/g;

export function detectUnsupportedAdditions(original, proposed, resumeText) {
  const risks = [];
  const originalLower = (original || "").toLowerCase();
  const resumeLower = (resumeText || "").toLowerCase();

  const proposedSkills = new Set();
  for (const token of proposed.match(/[a-zA-Z][a-zA-Z0-9+#.]+/g) || []) {
    if (isKnownSkill(token)) proposedSkills.add(canonicalSkill(token));
  }
  for (const skill of proposedSkills) {
    if (!originalLower.includes(skill.toLowerCase()) && !resumeLower.includes(skill.toLowerCase())) {
      risks.push(`Introduces skill '${skill}' that is not present in the original resume.`);
    }
  }

  const proposedNumbers = new Set(proposed.match(NUMBER_PATTERN) || []);
  const originalNumbers = new Set([...(original.match(NUMBER_PATTERN) || []), ...(resumeText.match(NUMBER_PATTERN) || [])]);
  for (const number of proposedNumbers) {
    if (!originalNumbers.has(number)) risks.push(`Introduces the figure '${number}' that is not supported by the resume.`);
  }
  return risks;
}

function matchedSkillSet(matches, skills) {
  const relevant = [];
  for (const skill of skills) {
    const canonical = canonicalSkill(skill);
    for (const match of matches) {
      if (["matched", "partial"].includes(match.status) && (match.matched_terms || []).some((term) => canonical.toLowerCase().includes(term.toLowerCase()) || term.toLowerCase().includes(canonical.toLowerCase()))) {
        if (!relevant.includes(canonical)) relevant.push(canonical);
        break;
      }
    }
  }
  return relevant;
}

function relevanceRatio(matches, itemIds) {
  let total = 0;
  let hit = 0;
  for (const match of matches) {
    if (!match.evidence || match.evidence.length === 0) continue;
    total += 1;
    if (match.evidence.some((ev) => itemIds.has(ev.item_id))) hit += 1;
  }
  return total ? hit / total : 0;
}

export function generateSuggestions(resume, job, matches, { maxGoal = 25 } = {}) {
  const suggestions = [];
  const questions = [];
  const resumeSkills = (resume.skills || []).filter((s) => s.trim());
  const relevantSkills = matchedSkillSet(matches, resumeSkills);

  // 1) Skills ordering.
  if (resumeSkills.length && relevantSkills.length) {
    const ordered = [...relevantSkills, ...resumeSkills.filter((s) => !relevantSkills.includes(canonicalSkill(s)))];
    if (JSON.stringify(ordered) !== JSON.stringify(resumeSkills)) {
      suggestions.push({
        id: newId(), target: "skills", item_id: "skills", section: "Skills",
        original_text: resumeSkills.join(", "), proposed_text: ordered.join(", "),
        reason: "Reorders existing skills so those referenced by the job appear first. No skills are added or removed.",
        requirement_id: "", requirement_text: "",
        evidence: [`Resume already lists: ${relevantSkills.slice(0, 8).join(", ")}`],
        introduces_unsupported_claim: false, risk_notes: [], confidence: 0.9,
      });
    }
  }

  // 2) Summary.
  const existingSummary = (resume.summary || "").trim();
  const topTitles = topTitlesFor(resume);
  if (existingSummary) {
    const aligned = reorderSummary(existingSummary, relevantSkills);
    if (aligned && aligned !== existingSummary) {
      suggestions.push({
        id: newId(), target: "summary", item_id: "summary", section: "Summary",
        original_text: existingSummary, proposed_text: aligned,
        reason: "Leads the existing summary with the experience most relevant to this role. Wording is preserved; no new claims are added.",
        requirement_id: "", requirement_text: "",
        evidence: relevantSkills.slice(0, 6),
        introduces_unsupported_claim: false, risk_notes: [], confidence: 0.7,
      });
    }
  } else if (topTitles.length || relevantSkills.length) {
    const composed = composeSummary(topTitles, relevantSkills);
    if (composed) {
      suggestions.push({
        id: newId(), target: "summary", item_id: "summary", section: "Summary",
        original_text: "", proposed_text: composed,
        reason: "Composes a summary using only information already present in the resume (titles, organizations and listed skills). Review for accuracy.",
        requirement_id: "", requirement_text: "",
        evidence: [...topTitles, ...relevantSkills].slice(0, 6),
        introduces_unsupported_claim: false, risk_notes: [], confidence: 0.55,
      });
    }
  }

  // 3) Bullet reordering within relevant experience/project items.
  const itemMatches = new Map();
  for (const match of matches) {
    if (!["matched", "partial"].includes(match.status)) continue;
    for (const ev of match.evidence || []) {
      if (!itemMatches.has(ev.item_id)) itemMatches.set(ev.item_id, []);
      itemMatches.get(ev.item_id).push(match);
    }
  }

  for (const [sectionName, items] of Object.entries(resume.sections || {})) {
    if (!["experience", "project"].includes(sectionName)) continue;
    for (const item of items) {
      if (!item.description || item.description.length < 2) continue;
      const related = itemMatches.get(item.id);
      if (!related) continue;
      const reordered = reorderBullets(item.description, related);
      if (reordered && JSON.stringify(reordered) !== JSON.stringify(item.description)) {
        suggestions.push({
          id: newId(),
          target: sectionName === "experience" ? "experience_bullet" : "project_bullet",
          item_id: item.id, section: sectionName.charAt(0).toUpperCase() + sectionName.slice(1),
          original_text: item.description.join("\n"), proposed_text: reordered.join("\n"),
          reason: "Moves the bullet most relevant to the target role to the top of this entry. Content is unchanged.",
          requirement_id: related[0].requirement_id, requirement_text: related[0].requirement,
          evidence: [`Matched requirement: ${related[0].requirement.slice(0, 120)}`],
          introduces_unsupported_claim: false, risk_notes: [], confidence: 0.75,
        });
      }
    }
  }

  // 4) Section order.
  const orderSuggestion = sectionOrderSuggestion(resume, matches);
  if (orderSuggestion) suggestions.push(orderSuggestion);

  // 5) Clarifying questions for missing hard requirements.
  for (const match of matches) {
    if (match.must_have && match.status === "missing") {
      const hints = (match.missing_terms || []).filter((t) => isKnownSkill(t)).slice(0, 3);
      if (hints.length) {
        questions.push(`The role requires ${hints.join(", ")} but it was not found on your resume. If you have this experience, add it with concrete evidence; otherwise leave it out.`);
      } else {
        questions.push(`This requirement is not clearly demonstrated on your resume and may need manual attention: "${match.requirement.slice(0, 140)}"`);
      }
    }
  }

  const resumeText = resume.original_text || "";
  for (const suggestion of suggestions) {
    const risks = detectUnsupportedAdditions(suggestion.original_text, suggestion.proposed_text, resumeText);
    if (risks.length) {
      suggestion.introduces_unsupported_claim = true;
      suggestion.risk_notes.push(...risks);
    }
  }

  return { suggestions: dedupe(suggestions).slice(0, maxGoal), questions: [...new Set(questions)].slice(0, 8) };
}

function topTitlesFor(resume) {
  const titles = [];
  for (const sectionName of ["experience", "project", "education"]) {
    for (const item of (resume.sections && resume.sections[sectionName]) || []) {
      if (item.title && !titles.includes(item.title)) titles.push(item.title);
    }
  }
  return titles.slice(0, 4);
}

function reorderSummary(summary, relevantSkills) {
  if (!relevantSkills.length) return summary;
  const sentences = summary.trim().split(/(?<=[.!?])\s+/);
  if (sentences.length < 2) return summary;
  const scored = sentences.map((sentence, idx) => [relevantSkills.filter((skill) => sentence.toLowerCase().includes(skill.toLowerCase())).length, -idx, sentence]);
  scored.sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]));
  const reordered = scored.map(([, , s]) => s);
  return JSON.stringify(reordered) === JSON.stringify(sentences) ? summary : reordered.join(" ");
}

function composeSummary(titles, skills) {
  const parts = [];
  if (titles.length) parts.push(titles[0]);
  if (titles.length > 1) parts.push(`with experience across ${titles.slice(1, 3).join(", ")}`);
  let text = parts.join(" ").trim();
  if (text && !text.endsWith(".")) text += ".";
  if (skills.length) text += ` Skilled with ${skills.slice(0, 8).join(", ")}.`;
  return text.trim();
}

function reorderBullets(bullets, relatedMatches) {
  const terms = new Set(relatedMatches.flatMap((m) => m.matched_terms || []).map((t) => t.toLowerCase()));
  if (!terms.size) return bullets;
  const score = (bullet) => [...terms].filter((term) => bullet.toLowerCase().includes(term)).length;
  const indexed = bullets.map((b, i) => [score(b), -i, b]);
  indexed.sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]));
  const reordered = indexed.map(([, , b]) => b);
  return JSON.stringify(reordered) === JSON.stringify(bullets) ? [] : reordered;
}

function sectionOrderSuggestion(resume, matches) {
  const experienceIds = new Set(((resume.sections && resume.sections.experience) || []).map((i) => i.id));
  const projectIds = new Set(((resume.sections && resume.sections.project) || []).map((i) => i.id));
  if (!experienceIds.size || !projectIds.size) return null;
  const exp = relevanceRatio(matches, experienceIds);
  const proj = relevanceRatio(matches, projectIds);
  if (proj - exp >= 0.25 && proj >= 0.5) {
    return {
      id: newId(), target: "section_order", item_id: "section_order", section: "Layout",
      original_text: "Experience, then Projects", proposed_text: "Projects, then Experience",
      reason: "Projects appear substantially more relevant to this role than the experience section. Consider moving Projects above Experience.",
      requirement_id: "", requirement_text: "",
      evidence: [`Project relevance ${Math.round(proj * 100)}% vs experience relevance ${Math.round(exp * 100)}%.`],
      introduces_unsupported_claim: false, risk_notes: [], confidence: 0.6,
    };
  }
  return null;
}

function dedupe(suggestions) {
  const seen = new Set();
  const result = [];
  for (const s of suggestions) {
    const key = `${s.target}:${s.item_id}:${s.proposed_text.slice(0, 60)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(s);
    }
  }
  return result;
}
