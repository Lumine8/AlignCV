import { MONTH_OPTIONS, makeDateRange } from "../../lib/resume/model.js";

export default function DateRangeEditor({ value, onChange, label = "Dates" }) {
  if (!value) {
    return (
      <div className="field">
        <label>{label}</label>
        <div className="row">
          <span className="tiny dim">No dates</span>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => onChange(makeDateRange({ startYear: new Date().getFullYear(), startMonth: 1 }))}
          >
            Add dates
          </button>
        </div>
      </div>
    );
  }

  const setStart = (patch) => onChange({ ...value, start: { ...value.start, ...patch } });
  const setEnd = (patch) =>
    onChange({ ...value, end: value.end ? { ...value.end, ...patch } : { year: 0, month: null, ...patch } });

  return (
    <div className="field">
      <label>{label}</label>
      <div className="date-range">
        <div className="date-range__group">
          <span className="tiny dim">Start</span>
          <select
            className="input"
            aria-label="Start month"
            value={value.start?.month ?? ""}
            onChange={(event) => setStart({ month: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">Month</option>
            {MONTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            aria-label="Start year"
            min="1950"
            max="2100"
            placeholder="Year"
            value={value.start?.year || ""}
            onChange={(event) => setStart({ year: Number(event.target.value) || 0 })}
          />
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={value.present}
            onChange={(event) =>
              onChange({
                ...value,
                present: event.target.checked,
                end: event.target.checked ? null : value.end || { year: 0, month: null },
              })
            }
          />
          Present
        </label>

        {!value.present && (
          <div className="date-range__group">
            <span className="tiny dim">End</span>
            <select
              className="input"
              aria-label="End month"
              value={value.end?.month ?? ""}
              onChange={(event) => setEnd({ month: event.target.value ? Number(event.target.value) : null })}
            >
              <option value="">Month</option>
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="number"
              aria-label="End year"
              min="1950"
              max="2100"
              placeholder="Year"
              value={value.end?.year || ""}
              onChange={(event) => setEnd({ year: Number(event.target.value) || 0 })}
            />
          </div>
        )}

        <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange(null)}>
          Remove dates
        </button>
      </div>
    </div>
  );
}
