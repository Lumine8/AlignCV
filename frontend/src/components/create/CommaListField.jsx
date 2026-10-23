export default function CommaListField({
  label,
  value,
  onChange,
  placeholder = "Comma-separated values",
  hint,
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        value={value.join(", ")}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          )
        }
      />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
