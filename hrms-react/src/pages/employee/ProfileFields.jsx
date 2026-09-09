
export function InfoItem({ label, value }) {
  return (
    <div>
      <div className="detail-label">{label}</div>
      <div className="detail-value">{value}</div>
    </div>
  );
}

export function EditableSelect({ label, id, value, options, onChange, optionLabel = (o) => o }) {
  return (
    <div className="employee-detail-field">
      <label htmlFor={id} className="detail-label">
        {label}
      </label>
      <select
        id={id}
        className="employee-detail-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
