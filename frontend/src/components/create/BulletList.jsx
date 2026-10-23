export default function BulletList({
  label,
  items,
  onChange,
  placeholder = "Add a bullet",
  addLabel = "Add bullet",
}) {
  const update = (index, value) => onChange(items.map((item, i) => (i === index ? value : item)));
  const remove = (index) => onChange(items.filter((_, i) => i !== index));
  const move = (index, direction) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="field">
      <div className="row">
        <label>{label}</label>
        <span className="spacer" />
        <span className="tiny dim">{items.length} item{items.length === 1 ? "" : "s"}</span>
      </div>

      {items.map((item, index) => (
        <div className="bullet" key={index}>
          <textarea
            className="textarea bullet-input"
            value={item}
            placeholder={placeholder}
            rows={2}
            onChange={(event) => update(index, event.target.value)}
          />
          <div className="bullet__actions">
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => move(index, 1)}
              disabled={index === items.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => remove(index)}
              aria-label="Remove"
            >
              ✕
            </button>
          </div>
        </div>
      ))}

      <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange([...items, ""])}>
        {addLabel}
      </button>
    </div>
  );
}
