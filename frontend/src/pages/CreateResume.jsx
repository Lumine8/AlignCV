import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import BulletList from "../components/create/BulletList.jsx";
import CommaListField from "../components/create/CommaListField.jsx";
import DateRangeEditor from "../components/create/DateRangeEditor.jsx";
import ErrorBanner from "../components/ErrorBanner.jsx";
import { backendConfigured, compileLatexRemote } from "../lib/backend.js";
import { downloadBase64, downloadText } from "../lib/download.js";
import { TEMPLATE_OPTIONS, renderResume } from "../lib/latex/render.js";
import {
  CUSTOM_SECTION_TYPES,
  DATE_FORMATS,
  SECTION_LABELS,
  createCertification,
  createCustomEntry,
  createCustomSection,
  createEducation,
  createEmptyResume,
  createExperience,
  createProject,
  createPublication,
  createSkill,
  formatDatePoint,
  formatDateRange,
  toEngineResume,
  validateResume,
} from "../lib/resume/model.js";
import {
  clearWorkingDraft,
  listCreatedResumes,
  loadCreatedResume,
  loadWorkingDraft,
  saveCreatedResume,
  saveWorkingDraft,
} from "../lib/resume/storage.js";
import { useSession } from "../state/session.jsx";

const STEPS = [
  { key: "personal", label: "Personal" },
  { key: "education", label: "Education" },
  { key: "experience", label: "Experience" },
  { key: "projects", label: "Projects" },
  { key: "skills", label: "Skills & sections" },
  { key: "settings", label: "Dates & order" },
  { key: "review", label: "Review" },
];

const SKILL_CATEGORIES = ["technical", "tool", "domain", "soft", "language"];

function EntryShell({ index, total, title, onMove, onRemove, children }) {
  return (
    <div className="entry-card">
      <div className="entry-card__head">
        <strong>{title || `Entry ${index + 1}`}</strong>
        <div className="row">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move entry up"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move entry down"
          >
            ↓
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function IssueList({ issues }) {
  if (!issues.length) return null;
  return (
    <div className="banner banner--warning">
      <div>
        <strong>Review these fields</strong>
        <ul>
          {issues.map((issue, index) => (
            <li key={`${issue.path}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function CreateResume() {
  const navigate = useNavigate();
  const { update } = useSession();

  const [doc, setDoc] = useState(() => loadWorkingDraft() || createEmptyResume());
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);
  const [showIssues, setShowIssues] = useState(false);
  const [showTex, setShowTex] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState(null);

  const issues = useMemo(() => validateResume(doc), [doc]);
  const latexSource = useMemo(() => renderResume(toEngineResume(doc), doc.metadata.template), [doc]);
  const issuesById = useMemo(() => {
    const map = new Map();
    for (const issue of issues) {
      map.set(issue.path, [...(map.get(issue.path) || []), issue.message]);
    }
    return map;
  }, [issues]);

  const refreshSaved = () => {
    listCreatedResumes()
      .then(setSaved)
      .catch(() => setSaved([]));
  };

  useEffect(() => {
    refreshSaved();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => saveWorkingDraft(doc), 400);
    return () => clearTimeout(timer);
  }, [doc]);

  useEffect(() => {
    setCompileResult(null);
  }, [doc]);

  const patchContact = (patch) => setDoc((prev) => ({ ...prev, contact: { ...prev.contact, ...patch } }));
  const patchMeta = (patch) => setDoc((prev) => ({ ...prev, metadata: { ...prev.metadata, ...patch } }));

  const updateEntry = (key, id, patch) =>
    setDoc((prev) => ({
      ...prev,
      [key]: prev[key].map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));

  const addEntry = (key, factory) => setDoc((prev) => ({ ...prev, [key]: [...prev[key], factory()] }));

  const removeEntry = (key, id) =>
    setDoc((prev) => ({ ...prev, [key]: prev[key].filter((entry) => entry.id !== id) }));

  const moveEntry = (key, index, direction) =>
    setDoc((prev) => {
      const list = [...prev[key]];
      const target = index + direction;
      if (target < 0 || target >= list.length) return prev;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...prev, [key]: list };
    });

  const moveSection = (index, direction) => {
    const order = [...doc.metadata.section_order];
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    patchMeta({ section_order: order });
  };

  async function persist() {
    if (issues.length) {
      setShowIssues(true);
      throw new Error("Fix the highlighted fields before saving.");
    }
    return saveCreatedResume(doc);
  }

  async function handleSave() {
    setError(null);
    setMessage("");
    try {
      const record = await persist();
      setMessage(`Saved to this browser (${record.id.slice(0, 8)}…).`);
      refreshSaved();
    } catch (err) {
      setError(err);
    }
  }

  async function handleAnalyze() {
    setError(null);
    setMessage("");
    try {
      const record = await persist();
      update({ resumeId: record.id, resume: record.baseline });
      navigate("/workspace");
    } catch (err) {
      setError(err);
    }
  }

  function handleDownloadJson() {
    downloadText(
      JSON.stringify(doc, null, 2),
      `aligncv-resume-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json"
    );
    setMessage("Resume document downloaded as JSON.");
  }

  function handleDownloadTex() {
    downloadText(
      latexSource,
      `aligncv-resume-${new Date().toISOString().slice(0, 10)}.tex`,
      "application/x-tex;charset=utf-8"
    );
    setMessage("LaTeX source downloaded.");
  }

  function handleDownloadPdf() {
    if (!compileResult?.pdf_base64) return;
    downloadBase64(
      compileResult.pdf_base64,
      `aligncv-resume-${new Date().toISOString().slice(0, 10)}.pdf`
    );
    setMessage("Compiled PDF downloaded.");
  }

  async function handleCompile() {
    setError(null);
    setMessage("");
    setCompileResult(null);

    if (!backendConfigured) {
      setError(
        new Error(
          "PDF compilation needs the optional backend. Download the .tex source and compile it on Overleaf, or set VITE_API_BASE_URL and start the backend."
        )
      );
      return;
    }

    setCompiling(true);
    try {
      const result = await compileLatexRemote({ document: doc, template: doc.metadata.template });
      setCompileResult(result);
      if (result.status === "success") {
        setMessage(`Compiled with ${result.engine || "LaTeX"}.`);
      } else if (result.status === "unavailable") {
        setMessage("The server has no LaTeX engine. The .tex source can be compiled elsewhere.");
      } else {
        setError(new Error((result.errors && result.errors[0]) || "LaTeX compilation failed."));
      }
    } catch (err) {
      setError(err);
    } finally {
      setCompiling(false);
    }
  }

  function handleStartOver() {
    if (!window.confirm("Clear this draft and start a new resume? Saved copies in this browser are kept.")) return;
    const fresh = createEmptyResume();
    setDoc(fresh);
    setStep(0);
    setShowIssues(false);
    setMessage("Started a new resume.");
    setError(null);
    clearWorkingDraft();
  }

  async function handleLoad(id) {
    try {
      const loaded = await loadCreatedResume(id);
      if (!loaded) throw new Error("That saved resume could not be loaded.");
      setDoc(loaded);
      setStep(0);
      setShowIssues(false);
      setError(null);
      setMessage("Loaded a saved resume.");
    } catch (err) {
      setError(err);
    }
  }

  const format = doc.metadata.date_format;
  const current = STEPS[step];

  function renderPersonal() {
    return (
      <div className="stack">
        <div className="grid grid--2">
          <div className="field">
            <label htmlFor="full-name">Full name *</label>
            <input
              id="full-name"
              className="input"
              value={doc.contact.full_name}
              onChange={(event) => patchContact({ full_name: event.target.value })}
            />
            {issuesById.has("contact.full_name") && <span className="hint hint--error">Full name is required.</span>}
          </div>
          <div className="field">
            <label htmlFor="professional-title">Professional title</label>
            <input
              id="professional-title"
              className="input"
              value={doc.contact.professional_title}
              onChange={(event) => patchContact({ professional_title: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={doc.contact.email}
              onChange={(event) => patchContact({ email: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              className="input"
              value={doc.contact.phone}
              onChange={(event) => patchContact({ phone: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              className="input"
              value={doc.contact.location}
              onChange={(event) => patchContact({ location: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="website">Website</label>
            <input
              id="website"
              className="input"
              value={doc.contact.website}
              onChange={(event) => patchContact({ website: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="linkedin">LinkedIn URL</label>
            <input
              id="linkedin"
              className="input"
              value={doc.contact.linkedin}
              onChange={(event) => patchContact({ linkedin: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="github">GitHub URL</label>
            <input
              id="github"
              className="input"
              value={doc.contact.github}
              onChange={(event) => patchContact({ github: event.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label>Other links</label>
          {doc.contact.links.map((link, index) => (
            <div className="bullet" key={index}>
              <input
                className="input"
                value={link}
                placeholder="https://…"
                onChange={(event) =>
                  patchContact({
                    links: doc.contact.links.map((value, i) => (i === index ? event.target.value : value)),
                  })
                }
              />
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => patchContact({ links: doc.contact.links.filter((_, i) => i !== index) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => patchContact({ links: [...doc.contact.links, ""] })}
          >
            Add link
          </button>
        </div>

        <div className="field">
          <label htmlFor="summary">Professional summary</label>
          <textarea
            id="summary"
            className="textarea"
            value={doc.summary}
            onChange={(event) => setDoc((prev) => ({ ...prev, summary: event.target.value }))}
            placeholder="A short, factual summary of your background."
          />
        </div>
      </div>
    );
  }

  function renderEducation() {
    return (
      <div className="stack">
        {doc.education.map((entry, index) => (
          <EntryShell
            key={entry.id}
            index={index}
            total={doc.education.length}
            title={entry.institution || entry.degree}
            onMove={(direction) => moveEntry("education", index, direction)}
            onRemove={() => removeEntry("education", entry.id)}
          >
            <div className="grid grid--2">
              <div className="field">
                <label>Institution</label>
                <input
                  className="input"
                  value={entry.institution}
                  onChange={(event) => updateEntry("education", entry.id, { institution: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Degree</label>
                <input
                  className="input"
                  value={entry.degree}
                  onChange={(event) => updateEntry("education", entry.id, { degree: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Field of study</label>
                <input
                  className="input"
                  value={entry.field_of_study}
                  onChange={(event) => updateEntry("education", entry.id, { field_of_study: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Location</label>
                <input
                  className="input"
                  value={entry.location}
                  onChange={(event) => updateEntry("education", entry.id, { location: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Grade / CGPA / percentage</label>
                <input
                  className="input"
                  value={entry.grade}
                  onChange={(event) => updateEntry("education", entry.id, { grade: event.target.value })}
                />
              </div>
            </div>

            <DateRangeEditor
              value={entry.dates}
              onChange={(dates) => updateEntry("education", entry.id, { dates })}
              label="Dates attended"
            />

            <CommaListField
              label="Relevant coursework"
              value={entry.coursework}
              onChange={(coursework) => updateEntry("education", entry.id, { coursework })}
              hint="Comma-separated. Only list courses you actually took."
            />

            <div className="field">
              <label>Additional description</label>
              <textarea
                className="textarea"
                value={entry.description}
                onChange={(event) => updateEntry("education", entry.id, { description: event.target.value })}
              />
            </div>
          </EntryShell>
        ))}

        <button type="button" className="btn btn--sm" onClick={() => addEntry("education", createEducation)}>
          Add education
        </button>
      </div>
    );
  }

  function renderExperience() {
    return (
      <div className="stack">
        <p className="tiny muted">
          Describe what you actually did. Do not invent metrics, impact, dates, or responsibilities.
        </p>
        {doc.experience.map((entry, index) => (
          <EntryShell
            key={entry.id}
            index={index}
            total={doc.experience.length}
            title={entry.job_title || entry.employer}
            onMove={(direction) => moveEntry("experience", index, direction)}
            onRemove={() => removeEntry("experience", entry.id)}
          >
            <div className="grid grid--2">
              <div className="field">
                <label>Employer</label>
                <input
                  className="input"
                  value={entry.employer}
                  onChange={(event) => updateEntry("experience", entry.id, { employer: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Job title</label>
                <input
                  className="input"
                  value={entry.job_title}
                  onChange={(event) => updateEntry("experience", entry.id, { job_title: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Location</label>
                <input
                  className="input"
                  value={entry.location}
                  onChange={(event) => updateEntry("experience", entry.id, { location: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Employment type</label>
                <input
                  className="input"
                  value={entry.employment_type}
                  placeholder="Full-time, internship, contract…"
                  onChange={(event) => updateEntry("experience", entry.id, { employment_type: event.target.value })}
                />
              </div>
            </div>

            <DateRangeEditor
              value={entry.dates}
              onChange={(dates) => updateEntry("experience", entry.id, { dates })}
            />

            <BulletList
              label="Responsibilities"
              items={entry.responsibilities}
              onChange={(responsibilities) => updateEntry("experience", entry.id, { responsibilities })}
              placeholder="What were you responsible for?"
            />

            <BulletList
              label="Achievements"
              items={entry.achievements}
              onChange={(achievements) => updateEntry("experience", entry.id, { achievements })}
              placeholder="A concrete result you can substantiate."
              addLabel="Add achievement"
            />

            <CommaListField
              label="Technologies and skills"
              value={entry.technologies}
              onChange={(technologies) => updateEntry("experience", entry.id, { technologies })}
            />
          </EntryShell>
        ))}

        <button type="button" className="btn btn--sm" onClick={() => addEntry("experience", createExperience)}>
          Add experience
        </button>
      </div>
    );
  }

  function renderProjects() {
    return (
      <div className="stack">
        {doc.projects.map((entry, index) => (
          <EntryShell
            key={entry.id}
            index={index}
            total={doc.projects.length}
            title={entry.name}
            onMove={(direction) => moveEntry("projects", index, direction)}
            onRemove={() => removeEntry("projects", entry.id)}
          >
            <div className="grid grid--2">
              <div className="field">
                <label>Project name</label>
                <input
                  className="input"
                  value={entry.name}
                  onChange={(event) => updateEntry("projects", entry.id, { name: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Short summary</label>
                <input
                  className="input"
                  value={entry.summary}
                  onChange={(event) => updateEntry("projects", entry.id, { summary: event.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label>Problem being solved</label>
              <textarea
                className="textarea"
                value={entry.problem}
                onChange={(event) => updateEntry("projects", entry.id, { problem: event.target.value })}
              />
            </div>

            <div className="field">
              <label>Description</label>
              <textarea
                className="textarea"
                value={entry.description}
                onChange={(event) => updateEntry("projects", entry.id, { description: event.target.value })}
              />
            </div>

            <CommaListField
              label="Technologies"
              value={entry.technologies}
              onChange={(technologies) => updateEntry("projects", entry.id, { technologies })}
            />

            <BulletList
              label="Your contributions"
              items={entry.contributions}
              onChange={(contributions) => updateEntry("projects", entry.id, { contributions })}
              placeholder="What did you personally build or decide?"
            />

            <BulletList
              label="Achievements"
              items={entry.achievements}
              onChange={(achievements) => updateEntry("projects", entry.id, { achievements })}
              addLabel="Add achievement"
            />

            <DateRangeEditor value={entry.dates} onChange={(dates) => updateEntry("projects", entry.id, { dates })} />

            <div className="grid grid--2">
              <div className="field">
                <label>Repository URL</label>
                <input
                  className="input"
                  value={entry.repository_url}
                  onChange={(event) => updateEntry("projects", entry.id, { repository_url: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Live demo URL</label>
                <input
                  className="input"
                  value={entry.live_url}
                  onChange={(event) => updateEntry("projects", entry.id, { live_url: event.target.value })}
                />
              </div>
            </div>
          </EntryShell>
        ))}

        <button type="button" className="btn btn--sm" onClick={() => addEntry("projects", createProject)}>
          Add project
        </button>
      </div>
    );
  }

  function renderSkills() {
    return (
      <div className="stack">
        <div className="card card--tight">
          <div className="card__title">
            <h3 style={{ margin: 0 }}>Skills</h3>
          </div>
          {doc.skills.map((skill, index) => (
            <div className="skill-row" key={skill.id}>
              <input
                className="input"
                value={skill.name}
                placeholder="Skill"
                onChange={(event) => updateEntry("skills", skill.id, { name: event.target.value })}
              />
              <select
                className="input"
                value={skill.category}
                onChange={(event) => updateEntry("skills", skill.id, { category: event.target.value })}
              >
                {SKILL_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <input
                className="input"
                value={skill.level}
                placeholder="Level (optional)"
                onChange={(event) => updateEntry("skills", skill.id, { level: event.target.value })}
              />
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => removeEntry("skills", skill.id)}
                aria-label="Remove skill"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => addEntry("skills", createSkill)}>
            Add skill
          </button>
        </div>

        <div className="card card--tight">
          <div className="card__title">
            <h3 style={{ margin: 0 }}>Publications</h3>
          </div>
          {doc.publications.map((entry, index) => (
            <EntryShell
              key={entry.id}
              index={index}
              total={doc.publications.length}
              title={entry.title}
              onMove={(direction) => moveEntry("publications", index, direction)}
              onRemove={() => removeEntry("publications", entry.id)}
            >
              <div className="grid grid--2">
                <div className="field">
                  <label>Title</label>
                  <input
                    className="input"
                    value={entry.title}
                    onChange={(event) => updateEntry("publications", entry.id, { title: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Venue</label>
                  <input
                    className="input"
                    value={entry.venue}
                    onChange={(event) => updateEntry("publications", entry.id, { venue: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Year</label>
                  <input
                    className="input"
                    type="number"
                    min="1950"
                    max="2100"
                    value={entry.year ?? ""}
                    onChange={(event) =>
                      updateEntry("publications", entry.id, { year: Number(event.target.value) || null })
                    }
                  />
                </div>
                <div className="field">
                  <label>URL</label>
                  <input
                    className="input"
                    value={entry.url}
                    onChange={(event) => updateEntry("publications", entry.id, { url: event.target.value })}
                  />
                </div>
              </div>
              <CommaListField
                label="Authors"
                value={entry.authors}
                onChange={(authors) => updateEntry("publications", entry.id, { authors })}
              />
              <div className="field">
                <label>Description</label>
                <textarea
                  className="textarea"
                  value={entry.description}
                  onChange={(event) => updateEntry("publications", entry.id, { description: event.target.value })}
                />
              </div>
            </EntryShell>
          ))}
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => addEntry("publications", createPublication)}
          >
            Add publication
          </button>
        </div>

        <div className="card card--tight">
          <div className="card__title">
            <h3 style={{ margin: 0 }}>Certifications</h3>
          </div>
          {doc.certifications.map((entry, index) => (
            <EntryShell
              key={entry.id}
              index={index}
              total={doc.certifications.length}
              title={entry.name}
              onMove={(direction) => moveEntry("certifications", index, direction)}
              onRemove={() => removeEntry("certifications", entry.id)}
            >
              <div className="grid grid--2">
                <div className="field">
                  <label>Name</label>
                  <input
                    className="input"
                    value={entry.name}
                    onChange={(event) => updateEntry("certifications", entry.id, { name: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Issuer</label>
                  <input
                    className="input"
                    value={entry.issuer}
                    onChange={(event) => updateEntry("certifications", entry.id, { issuer: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Issue year</label>
                  <input
                    className="input"
                    type="number"
                    min="1950"
                    max="2100"
                    value={entry.issue_date?.year ?? ""}
                    onChange={(event) =>
                      updateEntry("certifications", entry.id, {
                        issue_date: Number(event.target.value)
                          ? { year: Number(event.target.value), month: null }
                          : null,
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Credential URL</label>
                  <input
                    className="input"
                    value={entry.credential_url}
                    onChange={(event) =>
                      updateEntry("certifications", entry.id, { credential_url: event.target.value })
                    }
                  />
                </div>
              </div>
            </EntryShell>
          ))}
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => addEntry("certifications", createCertification)}
          >
            Add certification
          </button>
        </div>

        <div className="card card--tight">
          <div className="card__title">
            <h3 style={{ margin: 0 }}>Additional sections</h3>
          </div>
          {doc.custom_sections.map((section, sectionIndex) => (
            <EntryShell
              key={section.id}
              index={sectionIndex}
              total={doc.custom_sections.length}
              title={section.title}
              onMove={(direction) => moveEntry("custom_sections", sectionIndex, direction)}
              onRemove={() => removeEntry("custom_sections", section.id)}
            >
              <div className="grid grid--2">
                <div className="field">
                  <label>Section title</label>
                  <input
                    className="input"
                    value={section.title}
                    onChange={(event) =>
                      updateEntry("custom_sections", section.id, { title: event.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label>Section type</label>
                  <select
                    className="input"
                    value={section.section_type}
                    onChange={(event) =>
                      updateEntry("custom_sections", section.id, { section_type: event.target.value })
                    }
                  >
                    {CUSTOM_SECTION_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {section.items.map((item, itemIndex) => (
                <EntryShell
                  key={item.id}
                  index={itemIndex}
                  total={section.items.length}
                  title={item.title || `Item ${itemIndex + 1}`}
                  onMove={(direction) =>
                    setDoc((prev) => ({
                      ...prev,
                      custom_sections: prev.custom_sections.map((candidate) => {
                        if (candidate.id !== section.id) return candidate;
                        const items = [...candidate.items];
                        const target = itemIndex + direction;
                        if (target < 0 || target >= items.length) return candidate;
                        [items[itemIndex], items[target]] = [items[target], items[itemIndex]];
                        return { ...candidate, items };
                      }),
                    }))
                  }
                  onRemove={() =>
                    setDoc((prev) => ({
                      ...prev,
                      custom_sections: prev.custom_sections.map((candidate) =>
                        candidate.id === section.id
                          ? { ...candidate, items: candidate.items.filter((entry) => entry.id !== item.id) }
                          : candidate
                      ),
                    }))
                  }
                >
                  <div className="grid grid--2">
                    <div className="field">
                      <label>Title</label>
                      <input
                        className="input"
                        value={item.title}
                        onChange={(event) =>
                          updateEntry("custom_sections", section.id, {
                            items: section.items.map((candidate) =>
                              candidate.id === item.id ? { ...candidate, title: event.target.value } : candidate
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Subtitle</label>
                      <input
                        className="input"
                        value={item.subtitle}
                        onChange={(event) =>
                          updateEntry("custom_sections", section.id, {
                            items: section.items.map((candidate) =>
                              candidate.id === item.id ? { ...candidate, subtitle: event.target.value } : candidate
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                  <DateRangeEditor
                    value={item.dates}
                    onChange={(dates) =>
                      updateEntry("custom_sections", section.id, {
                        items: section.items.map((candidate) =>
                          candidate.id === item.id ? { ...candidate, dates } : candidate
                        ),
                      })
                    }
                  />
                  <BulletList
                    label="Bullets"
                    items={item.bullets}
                    onChange={(bullets) =>
                      updateEntry("custom_sections", section.id, {
                        items: section.items.map((candidate) =>
                          candidate.id === item.id ? { ...candidate, bullets } : candidate
                        ),
                      })
                    }
                  />
                  <div className="field">
                    <label>Description</label>
                    <textarea
                      className="textarea"
                      value={item.description}
                      onChange={(event) =>
                        updateEntry("custom_sections", section.id, {
                          items: section.items.map((candidate) =>
                            candidate.id === item.id ? { ...candidate, description: event.target.value } : candidate
                          ),
                        })
                      }
                    />
                  </div>
                </EntryShell>
              ))}

              <button
                type="button"
                className="btn btn--sm btn--ghost section-gap"
                onClick={() =>
                  updateEntry("custom_sections", section.id, { items: [...section.items, createCustomEntry()] })
                }
              >
                Add item
              </button>
            </EntryShell>
          ))}
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => addEntry("custom_sections", createCustomSection)}
          >
            Add section
          </button>
        </div>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="stack">
        <div className="card card--tight">
          <div className="field">
            <label htmlFor="template">Template</label>
            <select
              id="template"
              className="input"
              value={doc.metadata.template}
              onChange={(event) => patchMeta({ template: event.target.value })}
            >
              {TEMPLATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="hint">
              Both templates are single-column and ATS-safe; they differ only in typography and margins.
            </span>
          </div>
          <div className="field">
            <label htmlFor="date-format">Date format</label>
            <select
              id="date-format"
              className="input"
              value={doc.metadata.date_format}
              onChange={(event) => patchMeta({ date_format: event.target.value })}
            >
              {DATE_FORMATS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <span className="hint">
              Applied consistently to education, experience, projects and additional dated sections.
            </span>
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>
            Example: {formatDateRange({ start: { year: 2022, month: 10 }, end: null, present: true }, format)}
          </p>
        </div>

        <div className="card card--tight">
          <div className="card__title">
            <h3 style={{ margin: 0 }}>Section order</h3>
          </div>
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Empty sections are omitted from the export. The selected template is applied by the LaTeX renderer.
          </p>
          {doc.metadata.section_order.map((key, index) => (
            <div className="section-order__row" key={key}>
              <span>{SECTION_LABELS[key] || key}</span>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => moveSection(index, -1)}
                disabled={index === 0}
                aria-label="Move section up"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => moveSection(index, 1)}
                disabled={index === doc.metadata.section_order.length - 1}
                aria-label="Move section down"
              >
                ↓
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderReview() {
    const order = doc.metadata.section_order;
    return (
      <div className="stack">
        <IssueList issues={showIssues ? issues : []} />

        <div className="card">
          <h2 style={{ marginBottom: 4 }}>{doc.contact.full_name || "Untitled resume"}</h2>
          {doc.contact.professional_title && <p className="muted" style={{ marginBottom: 4 }}>{doc.contact.professional_title}</p>}
          <p className="tiny dim">
            {[doc.contact.email, doc.contact.phone, doc.contact.location]
              .filter(Boolean)
              .join(" · ") || "No contact details yet"}
          </p>
          {(doc.contact.website || doc.contact.linkedin || doc.contact.github || doc.contact.links.length > 0) && (
            <p className="tiny dim">
              {[doc.contact.website, doc.contact.linkedin, doc.contact.github, ...doc.contact.links]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>

        {order.map((key) => {
          if (key === "summary" && doc.summary) {
            return (
              <div className="card card--tight" key={key}>
                <h3>{SECTION_LABELS[key]}</h3>
                <p className="tiny muted" style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{doc.summary}</p>
              </div>
            );
          }
          if (key === "education" && doc.education.length) {
            return (
              <div className="card card--tight" key={key}>
                <h3>{SECTION_LABELS[key]}</h3>
                {doc.education.map((entry) => (
                  <div className="review-entry" key={entry.id}>
                    <strong>{entry.institution}</strong>
                    {entry.degree && <span className="muted"> — {entry.degree}</span>}
                    <div className="tiny dim">
                      {[entry.field_of_study, entry.location, formatDateRange(entry.dates, format)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            );
          }
          if (key === "experience" && doc.experience.length) {
            return (
              <div className="card card--tight" key={key}>
                <h3>{SECTION_LABELS[key]}</h3>
                {doc.experience.map((entry) => (
                  <div className="review-entry" key={entry.id}>
                    <strong>{entry.job_title}</strong>
                    {entry.employer && <span className="muted"> — {entry.employer}</span>}
                    <div className="tiny dim">
                      {[entry.location, formatDateRange(entry.dates, format)].filter(Boolean).join(" · ")}
                    </div>
                    {[...entry.responsibilities, ...entry.achievements].filter(Boolean).length > 0 && (
                      <ul className="tiny muted">
                        {[...entry.responsibilities, ...entry.achievements].filter(Boolean).slice(0, 4).map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            );
          }
          if (key === "projects" && doc.projects.length) {
            return (
              <div className="card card--tight" key={key}>
                <h3>{SECTION_LABELS[key]}</h3>
                {doc.projects.map((entry) => (
                  <div className="review-entry" key={entry.id}>
                    <strong>{entry.name}</strong>
                    <span className="tiny dim"> {formatDateRange(entry.dates, format)}</span>
                    {entry.summary && <div className="tiny muted">{entry.summary}</div>}
                  </div>
                ))}
              </div>
            );
          }
          if (key === "skills" && doc.skills.length) {
            return (
              <div className="card card--tight" key={key}>
                <h3>{SECTION_LABELS[key]}</h3>
                <p className="tiny muted" style={{ marginBottom: 0 }}>
                  {doc.skills.map((skill) => skill.name).filter(Boolean).join(", ")}
                </p>
              </div>
            );
          }
          if (key === "publications" && doc.publications.length) {
            return (
              <div className="card card--tight" key={key}>
                <h3>{SECTION_LABELS[key]}</h3>
                {doc.publications.map((entry) => (
                  <div className="review-entry" key={entry.id}>
                    <strong>{entry.title}</strong>
                    <span className="tiny dim"> {[entry.venue, entry.year].filter(Boolean).join(", ")}</span>
                  </div>
                ))}
              </div>
            );
          }
          if (key === "certifications" && doc.certifications.length) {
            return (
              <div className="card card--tight" key={key}>
                <h3>{SECTION_LABELS[key]}</h3>
                {doc.certifications.map((entry) => (
                  <div className="review-entry" key={entry.id}>
                    <strong>{entry.name}</strong>
                    <span className="tiny dim">
                      {" "}
                      {[entry.issuer, formatDatePoint(entry.issue_date, format)].filter(Boolean).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            );
          }
          if (key === "custom" && doc.custom_sections.length) {
            return (
              <div className="card card--tight" key={key}>
                <h3>{SECTION_LABELS[key]}</h3>
                {doc.custom_sections.map((section) => (
                  <div className="review-entry" key={section.id}>
                    <strong>{section.title}</strong>
                    <span className="tiny dim"> {section.items.length} item(s)</span>
                  </div>
                ))}
              </div>
            );
          }
          return null;
        })}

        <div className="card card--tight">
          <div className="card__title">
            <h3 style={{ margin: 0 }}>LaTeX &amp; PDF</h3>
            <span className="pill pill--soft">{doc.metadata.template}</span>
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={handleDownloadTex}>
              Download .tex
            </button>
            <button type="button" className="btn" onClick={handleCompile} disabled={compiling}>
              {compiling ? <span className="spinner" /> : null}
              Compile PDF
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setShowTex((value) => !value)}>
              {showTex ? "Hide" : "Preview"} source
            </button>
          </div>
          <p className="tiny dim" style={{ marginTop: 10, marginBottom: 0 }}>
            The .tex download works offline. PDF compilation requires the optional backend with Tectonic
            or TeX Live installed.
          </p>
          {!backendConfigured && (
            <p className="tiny dim" style={{ marginBottom: 0 }}>
              Backend not configured - set <code>VITE_API_BASE_URL</code> to enable PDF compilation.
            </p>
          )}

          {compileResult && (
            <div
              className={`banner ${
                compileResult.status === "success" ? "banner--success" : "banner--warning"
              }`}
            >
              <div>
                <strong>
                  {compileResult.status === "success"
                    ? `Compiled with ${compileResult.engine || "LaTeX"}.`
                    : compileResult.status === "unavailable"
                      ? "PDF compilation is unavailable on the server."
                      : "Compilation failed."}
                </strong>
                {compileResult.errors?.length > 0 && (
                  <ul>
                    {compileResult.errors.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                )}
                {compileResult.validation?.missing_fields?.length > 0 && (
                  <div className="tiny">Missing in PDF: {compileResult.validation.missing_fields.join(", ")}</div>
                )}
                {compileResult.validation?.duplicated_fields?.length > 0 && (
                  <div className="tiny">
                    Duplicated in PDF: {compileResult.validation.duplicated_fields.join(", ")}
                  </div>
                )}
                {compileResult.validation?.warnings?.length > 0 && (
                  <ul>
                    {compileResult.validation.warnings.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                )}
                {compileResult.status === "success" && compileResult.pdf_base64 && (
                  <button type="button" className="btn btn--sm" style={{ marginTop: 8 }} onClick={handleDownloadPdf}>
                    Download PDF
                  </button>
                )}
              </div>
            </div>
          )}

          {showTex && (
            <pre className="code-view" style={{ maxHeight: 360, marginTop: 12 }}>
              {latexSource}
            </pre>
          )}
        </div>

        <div className="card card--tight">
          <div className="row">
            <button type="button" className="btn btn--primary" onClick={handleAnalyze}>
              Save &amp; analyze against a job →
            </button>
            <button type="button" className="btn" onClick={handleSave}>
              Save to this browser
            </button>
            <button type="button" className="btn btn--ghost" onClick={handleDownloadJson}>
              Download JSON
            </button>
            <span className="spacer" />
            <button type="button" className="btn btn--ghost" onClick={handleStartOver}>
              Start over
            </button>
          </div>
          <p className="tiny dim" style={{ marginTop: 10, marginBottom: 0 }}>
            Saved resumes stay in this browser. LaTeX export works offline; PDF compilation uses the
            optional backend.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1>Create a resume</h1>
      <p className="muted">
        Build a structured, LaTeX-ready resume from scratch. Dates are stored in a normalized form and
        formatted consistently. Nothing is fabricated for you.
      </p>
      <p className="tiny dim">
        <Link to="/">← Back to home</Link>
      </p>

      <div className="wizard-steps" role="tablist" aria-label="Resume creation steps">
        {STEPS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={index === step}
            className={`wizard-steps__item ${index === step ? "active" : ""} ${index < step ? "done" : ""}`}
            onClick={() => setStep(index)}
          >
            <span className="wizard-steps__num">{index < step ? "✓" : index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="wizard-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      {message && <div className="banner banner--success">{message}</div>}

      {saved.length > 0 && (
        <div className="card card--tight section-gap">
          <div className="row">
            <strong className="tiny">Saved in this browser</strong>
            <span className="spacer" />
            <span className="tiny dim">{saved.length} resume(s)</span>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {saved.slice(0, 6).map((record) => (
              <button
                key={record.id}
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => handleLoad(record.id)}
              >
                {record.baseline?.contact?.name || "Untitled"} · {String(record.created_at).slice(0, 10)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card section-gap">
        <div className="card__title">
          <h2 style={{ margin: 0 }}>
            {step + 1}. {current.label}
          </h2>
          {issues.length > 0 && <span className="pill pill--partial">{issues.length} to review</span>}
        </div>

        <div className="step-panel" key={step}>
          {step === 0 && renderPersonal()}
          {step === 1 && renderEducation()}
          {step === 2 && renderExperience()}
          {step === 3 && renderProjects()}
          {step === 4 && renderSkills()}
          {step === 5 && renderSettings()}
          {step === 6 && renderReview()}
        </div>
      </div>

      <div className="row section-gap">
        <button type="button" className="btn btn--ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
          Back
        </button>
        <span className="spacer" />
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn--primary" onClick={() => setStep((value) => value + 1)}>
            Next: {STEPS[step + 1].label}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setShowIssues(true);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Check fields
          </button>
        )}
      </div>
    </>
  );
}
