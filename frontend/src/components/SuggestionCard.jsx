import { useState } from "react";

const TARGET_LABELS = {
  summary: "Professional summary",
  skills: "Skills ordering",
  experience_bullet: "Experience bullets",
  project_bullet: "Project bullets",
  section_order: "Section order",
  achievement: "Achievement",
};

export default function SuggestionCard({ suggestion, decision, editedText, onDecide, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editedText ?? suggestion.proposed_text);

  const status = decision?.decision || "pending";

  return (
    <div className="card card--tight" style={{ marginBottom: 16 }}>
      <div className="card__title">
        <div className="row">
          <span className="pill pill--soft">{TARGET_LABELS[suggestion.target] || suggestion.target}</span>
          {suggestion.requirement_id && <span className="pill pill--soft">requirement-linked</span>}
          {suggestion.introduces_unsupported_claim && (
            <span className="pill pill--missing">unsupported claim risk</span>
          )}
        </div>
        <span className={`pill ${status === "accepted" ? "pill--matched" : status === "rejected" ? "pill--missing" : ""}`}>
          {status}
        </span>
      </div>

      <div className="diff">
        <div className="diff__row">
          <div className="diff__cell diff__cell--before">
            <div className="diff__label">Original</div>
            {suggestion.original_text || <span className="dim">(none - new content)</span>}
          </div>
          <div className="diff__cell diff__cell--after">
            <div className="diff__label">Proposed</div>
            {editing ? (
              <textarea
                className="textarea"
                style={{ minHeight: 120 }}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            ) : (
              editedText || suggestion.proposed_text
            )}
          </div>
        </div>
      </div>

      <p className="tiny muted" style={{ marginTop: 12 }}>
        <strong>Why:</strong> {suggestion.reason}
      </p>
      {suggestion.requirement_text && (
        <p className="tiny dim">
          <strong>Job requirement:</strong> {suggestion.requirement_text}
        </p>
      )}
      {suggestion.evidence && suggestion.evidence.length > 0 && (
        <ul className="req__notes">
          {suggestion.evidence.map((ev, i) => (
            <li key={i}>{ev}</li>
          ))}
        </ul>
      )}
      {suggestion.risk_notes && suggestion.risk_notes.length > 0 && (
        <div className="banner banner--warning">
          <div>
            Potential truthfulness risks detected:
            <ul>
              {suggestion.risk_notes.map((risk, i) => (
                <li key={i}>{risk}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn btn--success btn--sm"
          onClick={() => onDecide({ decision: "accepted" })}
        >
          Accept
        </button>
        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={() => onDecide({ decision: "rejected" })}
        >
          Reject
        </button>
        {editing ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              onEdit(draft);
              onDecide({ decision: "accepted", edited_text: draft });
              setEditing(false);
            }}
          >
            Save & accept
          </button>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <span className="spacer" />
        <span className="tiny dim">confidence {Math.round(suggestion.confidence * 100)}%</span>
      </div>
    </div>
  );
}
