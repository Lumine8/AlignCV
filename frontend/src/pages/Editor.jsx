import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import ErrorBanner from "../components/ErrorBanner.jsx";
import Stepper from "../components/Stepper.jsx";
import SuggestionCard from "../components/SuggestionCard.jsx";
import { useSession } from "../state/session.jsx";

export default function Editor() {
  const navigate = useNavigate();
  const { session, update, setDecision } = useSession();
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);

  const suggestions = session.analysis?.suggestions || [];
  const decisions = session.decisions || {};

  const counts = useMemo(() => {
    let accepted = 0;
    let rejected = 0;
    for (const s of suggestions) {
      const d = decisions[s.id]?.decision;
      if (d === "accepted") accepted += 1;
      else if (d === "rejected") rejected += 1;
    }
    return { accepted, rejected, pending: suggestions.length - accepted - rejected };
  }, [suggestions, decisions]);

  function acceptAllSafe() {
    for (const s of suggestions) {
      if (!s.introduces_unsupported_claim && decisions[s.id]?.decision !== "rejected") {
        setDecision(s.id, { decision: "accepted" });
      }
    }
  }

  function handleEdit(suggestion, text) {
    setDecision(suggestion.id, { edited_text: text });
  }

  async function applyChanges() {
    setError(null);
    setApplying(true);
    try {
      const payload = suggestions
        .filter((s) => decisions[s.id]?.decision === "accepted")
        .map((s) => ({
          suggestion_id: s.id,
          decision: "accepted",
          edited_text: decisions[s.id]?.edited_text || null,
        }));
      if (payload.length === 0) throw new Error("Accept at least one change before applying.");

      const result = await api.applyChanges(session.analysisId, payload, "Tailored");
      update({ versionId: result.version_id, texSource: result.tex_source });
      navigate("/export");
    } catch (err) {
      setError(err);
    } finally {
      setApplying(false);
    }
  }

  if (!session.analysis) return <ErrorBanner error="No analysis loaded." />;

  return (
    <>
      <Stepper completed={["workspace", "report"]} />
      <h1>Review changes</h1>
      <p className="muted">
        Every suggestion shows its original text, the proposed change, the reason and the
        supporting evidence. Nothing is applied until you accept it - and your original resume is
        never overwritten.
      </p>

      <div className="row section-gap">
        <span className="pill pill--matched">{counts.accepted} accepted</span>
        <span className="pill pill--missing">{counts.rejected} rejected</span>
        <span className="pill pill--soft">{counts.pending} pending</span>
        <span className="spacer" />
        <button type="button" className="btn btn--ghost btn--sm" onClick={acceptAllSafe}>
          Accept all safe changes
        </button>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {suggestions.length === 0 && (
        <div className="banner banner--info">
          No structural suggestions were generated. This usually means the resume already aligns
          well, or there was not enough comparable content to reorder.
        </div>
      )}

      <div className="section-gap">
        {suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            decision={decisions[s.id]}
            editedText={decisions[s.id]?.edited_text}
            onDecide={(d) => setDecision(s.id, { ...decisions[s.id], ...d })}
            onEdit={(text) => handleEdit(s, text)}
          />
        ))}
      </div>

      <div className="row section-gap">
        <button
          type="button"
          className="btn btn--primary"
          onClick={applyChanges}
          disabled={applying || counts.accepted === 0}
        >
          {applying ? <span className="spinner" /> : null}
          Apply {counts.accepted} change(s) & generate LaTeX
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => navigate("/report")}>
          Back to report
        </button>
      </div>
    </>
  );
}
