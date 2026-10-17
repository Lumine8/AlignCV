import { useState } from "react";
import { Link } from "react-router-dom";
import { api, downloadArtifact } from "../api/client.js";
import ErrorBanner from "../components/ErrorBanner.jsx";
import Stepper from "../components/Stepper.jsx";
import { useSession } from "../state/session.jsx";

export default function Export() {
  const { session, update } = useSession();
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [tex, setTex] = useState(session.texSource || "");

  async function handleCompile() {
    setError(null);
    setCompiling(true);
    try {
      const response = await api.compileResume({
        resume_id: session.resumeId,
        version_id: session.versionId || null,
        tex_source: session.versionId ? null : tex || null,
      });
      setResult(response);
    } catch (err) {
      setError(err);
    } finally {
      setCompiling(false);
    }
  }

  async function download(kind) {
    try {
      if (kind === "tex") {
        const id = result?.tex_artifact_id;
        await downloadArtifact(id, "aligncv-resume.tex");
      } else {
        await downloadArtifact(result.pdf_artifact_id, "aligncv-resume.pdf");
      }
    } catch (err) {
      setError(err);
    }
  }

  return (
    <>
      <Stepper completed={["workspace", "report", "editor"]} />
      <h1>Compile & export</h1>
      <p className="muted">
        The LaTeX output is the primary artifact and is generated entirely in your browser. If a
        browser LaTeX engine is available, AlignCV compiles it and validates the resulting PDF;
        otherwise you can still download valid <code>.tex</code> source to compile in Overleaf. The
        source is always pre-flight checked before you export it.
      </p>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {!session.versionId && (
        <div className="banner banner--info">
          You haven't applied reviewed changes yet. You can still compile the original resume
          below, or <Link to="/editor">review suggestions</Link> first.
        </div>
      )}

      <div className="grid grid--2 section-gap">
        <div className="card">
          <h2>LaTeX source</h2>
          <textarea
            className="textarea"
            value={tex}
            onChange={(e) => {
              setTex(e.target.value);
              update({ texSource: e.target.value });
            }}
            spellCheck={false}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--primary" onClick={handleCompile} disabled={compiling}>
              {compiling ? <span className="spinner" /> : null}
              Compile to PDF
            </button>
            {result?.tex_artifact_id && (
              <button type="button" className="btn" onClick={() => download("tex")}>
                Download .tex
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Compilation & validation</h2>
          {!result && <p className="muted">Run a compile to see status and validation checks.</p>}
          {result && (
            <>
              <div className={`banner ${result.compiled ? "banner--success" : "banner--warning"}`}>
                {result.compiled ? "Compiled successfully." : result.message}
              </div>

              {result.validation?.ran && (
                <div style={{ marginTop: 12 }}>
                  <div className="row">
                    <strong>{result.validation.kind === "pdf" ? "PDF validation" : "LaTeX source check"}</strong>
                    <span
                      className={`pill ${
                        result.validation.passed ? "pill--matched" : "pill--missing"
                      }`}
                    >
                      {result.validation.passed ? "passed" : "issues found"}
                    </span>
                    {result.validation.page_count != null && (
                      <span className="pill pill--soft">{result.validation.page_count} page(s)</span>
                    )}
                  </div>
                  <table className="table" style={{ marginTop: 10 }}>
                    <tbody>
                      {result.validation.checks.map((check, i) => (
                        <tr key={i}>
                          <td>{check.name}</td>
                          <td>{check.passed ? "✓" : "✗"}</td>
                          <td className="tiny dim">{check.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.validation?.warnings?.length > 0 && (
                <div className="banner banner--warning">
                  <ul style={{ margin: 0 }}>
                    {result.validation.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!result.validation?.ran && result.compiled && (
                <p className="tiny dim">Validation checks could not run in this environment.</p>
              )}

              {result.compiled && result.pdf_artifact_id && (
                <button type="button" className="btn btn--primary" onClick={() => download("pdf")}>
                  Download PDF
                </button>
              )}

              {result.log && (
                <details style={{ marginTop: 12 }}>
                  <summary className="tiny muted" style={{ cursor: "pointer" }}>
                    Compilation log
                  </summary>
                  <pre className="code-view" style={{ maxHeight: 220, marginTop: 8 }}>
                    {result.log}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      </div>

      <div className="row section-gap">
        <Link to="/editor" className="btn btn--ghost">
          ← Back to review
        </Link>
        <Link to="/workspace" className="btn btn--ghost">
          Start a new analysis
        </Link>
      </div>
    </>
  );
}
