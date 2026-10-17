export default function MetricCard({ label, value, suffix = "", sub, accent = false, bar }) {
  const display = value === null || value === undefined ? "—" : value;
  return (
    <div className={`metric ${accent ? "metric--accent" : ""}`}>
      <span className="metric__label">{label}</span>
      <span className="metric__value">
        {display}
        {suffix && <small> {suffix}</small>}
      </span>
      {typeof bar === "number" && (
        <div className="metric__bar" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
      {sub && <span className="metric__sub">{sub}</span>}
    </div>
  );
}
