import StatusPill from "./StatusPill.jsx";

export default function RequirementCard({ match, defaultOpen = false }) {
  const hasEvidence = match.evidence && match.evidence.length > 0;
  return (
    <details className="req" open={defaultOpen}>
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        <div className="req__meta">
          <StatusPill status={match.status} />
          {match.must_have && <span className="pill pill--must">Required</span>}
          <span className="pill pill--soft">{match.category}</span>
          {match.method && match.method !== "none" && (
            <span className="pill pill--soft">method: {match.method}</span>
          )}
        </div>
        <div className="req__text">{match.requirement}</div>
      </summary>

      <div className="req__scores">
        <span>Traditional: {fmt(match.traditional_score)}%</span>
        <span>Semantic: {fmt(match.semantic_score)}%</span>
        <span>Combined: {fmt(match.combined_score)}%</span>
        <span>Confidence: {fmt(match.confidence)}</span>
      </div>

      {match.matched_terms && match.matched_terms.length > 0 && (
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Matched terms: <strong>{match.matched_terms.slice(0, 12).join(", ")}</strong>
        </div>
      )}
      {match.missing_terms && match.missing_terms.length > 0 && (
        <div className="tiny dim" style={{ marginTop: 4 }}>
          Missing terms: {match.missing_terms.slice(0, 12).join(", ")}
        </div>
      )}

      {match.explanation && (
        <p className="tiny muted" style={{ marginTop: 8 }}>
          {match.explanation}
        </p>
      )}

      {match.notes && match.notes.length > 0 && (
        <ul className="req__notes">
          {match.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {hasEvidence && (
        <div className="req__evidence">
          <div className="tiny dim" style={{ marginBottom: 6 }}>
            Evidence from your resume
          </div>
          {match.evidence.map((ev, i) => (
            <blockquote key={i}>
              <span className="pill pill--soft">{ev.section || ev.kind}</span>{" "}
              {ev.passage}
            </blockquote>
          ))}
        </div>
      )}
    </details>
  );
}

function fmt(value) {
  if (value === null || value === undefined) return "—";
  return Math.round(value * 100) / 1;
}
