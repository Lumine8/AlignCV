export default function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message || "Something went wrong.";
  const risks = error && error.risks ? error.risks : null;
  return (
    <div className="banner banner--error" role="alert">
      <span aria-hidden="true">⚠</span>
      <div style={{ flex: 1 }}>
        <div>{message}</div>
        {risks && (
          <ul>
            {risks.map((risk, i) => (
              <li key={i}>{risk}</li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button className="btn btn--ghost btn--sm" onClick={onDismiss} type="button" aria-label="Dismiss">
          Dismiss
        </button>
      )}
    </div>
  );
}
