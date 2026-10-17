export default function Loading({ label = "Working…", inline = false }) {
  return (
    <div className={inline ? "row" : "row"} role="status" aria-live="polite">
      <span className="spinner" />
      <span className="muted">{label}</span>
    </div>
  );
}
