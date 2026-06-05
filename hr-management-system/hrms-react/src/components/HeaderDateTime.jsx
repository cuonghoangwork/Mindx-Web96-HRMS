import { useEffect, useState } from "react";
import { useStore } from "../context/StoreContext";

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toTimeInputValue(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDisplayTime(date) {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function HeaderDateTime() {
  const { getAppNow, setAppDateTime, resetAppDateTime, isClockAdjusted } =
    useStore();
  const [now, setNow] = useState(() => getAppNow());
  const [open, setOpen] = useState(false);
  const [dateValue, setDateValue] = useState(() => toDateInputValue(getAppNow()));
  const [timeValue, setTimeValue] = useState(() => toTimeInputValue(getAppNow()));

  useEffect(() => {
    const tick = () => setNow(getAppNow());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [getAppNow]);

  useEffect(() => {
    if (open) {
      const current = getAppNow();
      setDateValue(toDateInputValue(current));
      setTimeValue(toTimeInputValue(current));
    }
  }, [open, getAppNow]);

  const handleApply = (e) => {
    e.preventDefault();
    const [year, month, day] = dateValue.split("-").map(Number);
    const [hours, minutes] = timeValue.split(":").map(Number);
    setAppDateTime(new Date(year, month - 1, day, hours, minutes, 0));
    setOpen(false);
  };

  const handleReset = () => {
    resetAppDateTime();
    setOpen(false);
  };

  return (
    <div className="header-datetime">
      <button
        type="button"
        className="header-datetime-display"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Adjust date and time"
      >
        <span className="header-datetime-date">{formatDisplayDate(now)}</span>
        <span className="header-datetime-time">{formatDisplayTime(now)}</span>
        {isClockAdjusted && (
          <span className="header-datetime-badge">Adjusted</span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="header-datetime-backdrop"
            aria-label="Close date and time panel"
            onClick={() => setOpen(false)}
          />
          <form className="header-datetime-panel" onSubmit={handleApply}>
            <p className="header-datetime-panel-title">Set date &amp; time</p>
            <div className="form-group">
              <label htmlFor="header-date">Date</label>
              <input
                id="header-date"
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="header-time">Time</label>
              <input
                id="header-time"
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                required
              />
            </div>
            <div className="header-datetime-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleReset}
              >
                Reset to now
              </button>
              <button type="submit" className="btn btn-primary">
                Apply
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export default HeaderDateTime;
