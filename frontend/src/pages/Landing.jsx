import { Link } from "react-router-dom";

const FEATURES = [
  {
    icon: "🧭",
    title: "Traditional ATS-style matching",
    text: "Deterministic keyword, alias and rule matching with hard requirements surfaced separately from the aggregate score.",
  },
  {
    icon: "🧠",
    title: "AI semantic matching",
    text: "Embedding-based relevance that recognizes the same experience described in different words - without equating distinct skills.",
  },
  {
    icon: "🧾",
    title: "Evidence for every match",
    text: "Each result cites the resume passage it came from, with confidence, method and contradictions called out explicitly.",
  },
  {
    icon: "⚖️",
    title: "Hybrid reconciliation",
    text: "Independent traditional, semantic, hybrid, parseability and evidence metrics - never conflated into one number.",
  },
  {
    icon: "🛡️",
    title: "Truthfulness first",
    text: "Suggestions only reorder or re-emphasize what you already have. No invented skills, dates, or metrics - ever.",
  },
  {
    icon: "📄",
    title: "LaTeX-native output",
    text: "Generate editable .tex, compile to PDF when a TeX distribution is available, and validate the compiled output.",
  },
];

export default function Landing() {
  return (
    <>
      <section className="hero">
        <div className="hero__eyebrow">Understand the job. Prove your fit. Optimize.</div>
        <h1 className="hero__title">
          Align your resume to a real job listing - with evidence, not fabrication.
        </h1>
        <p className="hero__lead">
          AlignCV reads a public job posting and your resume, runs traditional and semantic
          matching side by side, shows you exactly where you align and where you don't, and
          produces a truthful, tailored LaTeX resume you can compile and download.
        </p>
        <div className="row" style={{ marginTop: 24 }}>
          <Link to="/create" className="btn btn--primary">
            Create a resume →
          </Link>
          <Link to="/workspace" className="btn btn--ghost">
            Check against a job
          </Link>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
          >
            How it works
          </button>
        </div>
      </section>

      <section className="section-gap">
        <h2>Three ways to use AlignCV</h2>
        <div className="grid grid--3">
          <div className="card feature">
            <div className="feature__icon" aria-hidden="true">✍️</div>
            <div className="feature__title">Create a resume</div>
            <div className="feature__text">
              A structured, step-by-step builder with normalized dates and consistent formatting.
            </div>
            <Link to="/create" className="btn btn--sm" style={{ marginTop: 12 }}>
              Start building
            </Link>
          </div>
          <div className="card feature">
            <div className="feature__icon" aria-hidden="true">🎯</div>
            <div className="feature__title">Check against a job</div>
            <div className="feature__text">
              Upload a resume, add a job posting, and see traditional and semantic evidence side by side.
            </div>
            <Link to="/workspace" className="btn btn--sm" style={{ marginTop: 12 }}>
              Run a match
            </Link>
          </div>
          <div className="card feature">
            <div className="feature__icon" aria-hidden="true">🛠️</div>
            <div className="feature__title">Edit an existing resume</div>
            <div className="feature__text">
              Upload a .tex or PDF, review the parsed content, and correct uncertain fields.
            </div>
            <Link to="/workspace" className="btn btn--sm" style={{ marginTop: 12 }}>
              Upload a resume
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid--3 section-gap">
        {FEATURES.map((f) => (
          <div className="card feature" key={f.title}>
            <div className="feature__icon" aria-hidden="true">
              {f.icon}
            </div>
            <div className="feature__title">{f.title}</div>
            <div className="feature__text">{f.text}</div>
          </div>
        ))}
      </section>

      <section id="how" className="section-gap grid grid--2">
        <div className="card">
          <h2>Two engines, kept honest</h2>
          <p className="muted">
            The <strong>traditional engine</strong> does exact and alias matching, applies
            must-have versus preferred rules, and derives experience duration from your dates.
            The <strong>semantic engine</strong> estimates how related your wording is to each
            requirement.
          </p>
          <p className="muted">
            A third <strong>reconciliation engine</strong> combines them, reports disagreements,
            and refuses to let a strong average hide a critical gap. Scores are AlignCV's own
            estimates - not any employer's ATS score.
          </p>
        </div>
        <div className="card">
          <h2>Your data, your call</h2>
          <ul className="muted">
            <li>Runs locally in your browser by default; an optional backend adds server-side job extraction and PDF compilation.</li>
            <li>Works offline with a deterministic fallback - no paid AI keys required.</li>
            <li>Your resumes and results are stored only on your device (IndexedDB).</li>
            <li>Resume contents are processed locally; only a job URL you choose to import is sent to the optional backend.</li>
            <li>Your original resume is preserved as an immutable baseline.</li>
            <li>You can export or delete all your local data at any time from the workspace.</li>
          </ul>
          <Link to="/workspace" className="btn btn--primary" style={{ marginTop: 12 }}>
            Get started
          </Link>
        </div>
      </section>
    </>
  );
}
