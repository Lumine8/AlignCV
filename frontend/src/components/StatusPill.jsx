const LABELS = {
  matched: "Matched",
  partial: "Partial",
  missing: "Missing",
  uncertain: "Uncertain",
  conflict: "Conflict",
};

export default function StatusPill({ status, children }) {
  const key = status || "missing";
  return <span className={`pill pill--${key}`}>{children || LABELS[key] || key}</span>;
}
