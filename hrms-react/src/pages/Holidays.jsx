import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";
import Badge from "../components/Badge";
import AddHolidayModal from "../components/AddHolidayModal";

const HOLIDAY_TYPE_VARIANT = {
  Public: "success",
  Company: "primary",
  Optional: "info",
};


function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Holidays() {
  const { getAppNow, holidays, addHoliday, updateHoliday, removeHoliday } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [editingDateId, setEditingDateId] = useState(null);
  const [draftDate, setDraftDate] = useState("");
  const [actionError, setActionError] = useState("");

  const today = useMemo(() => {
    const d = getAppNow();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [getAppNow]);

  const sortedHolidays = useMemo(
    () => [...holidays].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [holidays],
  );

  const stats = useMemo(() => {
    const upcoming = holidays.filter((h) => new Date(h.date) >= today);
    const next = upcoming.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const publicCount = holidays.filter((h) => h.type === "Public").length;
    return {
      total: holidays.length,
      upcomingCount: upcoming.length,
      publicCount,
      next,
    };
  }, [holidays, today]);

  const handleSaveHoliday = async (holiday) => {
    setActionError("");
    try {
      if (holiday.id) {
        await updateHoliday(holiday.id, holiday);
      } else {
        await addHoliday(holiday);
      }
      setEditingHoliday(null);
    } catch (err) {
      setActionError(err.message || "Failed to save holiday.");
    }
  };

  const handleDelete = async (id) => {
    setActionError("");
    try {
      await removeHoliday(id);
    } catch (err) {
      setActionError(err.message || "Failed to delete holiday.");
    }
  };

  const startEditDate = (holiday) => {
    setEditingDateId(holiday.id);
    setDraftDate(holiday.date);
  };

  const confirmEditDate = async (id) => {
    if (!draftDate) {
      setEditingDateId(null);
      return;
    }
    setActionError("");
    try {
      await updateHoliday(id, { date: draftDate });
    } catch (err) {
      setActionError(err.message || "Failed to update date.");
    }
    setEditingDateId(null);
  };

  const cancelEditDate = () => {
    setEditingDateId(null);
    setDraftDate("");
  };

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "var(--sp-5)" }}>
        <h2 style={{ flex: 1 }}>Holidays</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingHoliday(null);
            setModalOpen(true);
          }}
        >
          + Add Holiday
        </button>
      </div>

      {actionError && (
        <div className="form-error" style={{ marginBottom: "var(--sp-5)" }}>
          {actionError}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--sp-4)",
          marginBottom: "var(--sp-5)",
        }}
      >
        <div className="stat-card">
          <div className="stat-card-label">Total Holidays</div>
          <div className="stat-card-value">{stats.total}</div>
          <div className="stat-card-hint">Scheduled for 2026</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Upcoming</div>
          <div className="stat-card-value">{stats.upcomingCount}</div>
          <div className="stat-card-hint">From today onward</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Public Holidays</div>
          <div className="stat-card-value">{stats.publicCount}</div>
          <div className="stat-card-hint">Company-wide off days</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Next Holiday</div>
          <div
            className="stat-card-value"
            style={{ fontSize: "var(--fs-2xl)" }}
          >
            {stats.next ? stats.next.name : "—"}
          </div>
          <div className="stat-card-hint">
            {stats.next ? formatDate(stats.next.date) : "No upcoming holidays"}
          </div>
        </div>
      </div>

      <div className="content-card">
        {sortedHolidays.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
              </svg>
            </div>
            <div className="empty-state-title">No holidays yet</div>
            <div className="empty-state-description">
              Add a holiday to start building the 2026 calendar.
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setModalOpen(true)}
            >
              + Add Holiday
            </button>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Holiday Name</th>
                <th>Date</th>
                <th>Type</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedHolidays.map((holiday) => {
                const isPast = new Date(holiday.date) < today;
                const isEditingDate = editingDateId === holiday.id;
                return (
                  <tr
                    key={holiday.id}
                    style={isPast ? { opacity: 0.55 } : undefined}
                  >
                    <td style={{ fontWeight: "var(--fw-medium)" }}>
                      {holiday.name}
                    </td>
                    <td>
                      {isEditingDate ? (
                        <div
                          style={{
                            display: "flex",
                            gap: "var(--sp-2)",
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="date"
                            value={draftDate}
                            onChange={(e) => setDraftDate(e.target.value)}
                            autoFocus
                            style={{
                              padding: "4px 8px",
                              fontSize: "var(--fs-sm)",
                              border: "1px solid var(--bdr-default)",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--bg-surface)",
                              color: "var(--txt-primary)",
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: "4px 10px", fontSize: "var(--fs-xs)" }}
                            onClick={() => confirmEditDate(holiday.id)}
                            aria-label="Confirm date"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "4px 10px", fontSize: "var(--fs-xs)" }}
                            onClick={cancelEditDate}
                            aria-label="Cancel"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditDate(holiday)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            font: "inherit",
                            color: "var(--txt-primary)",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          title="Click to edit date"
                        >
                          {formatDate(holiday.date)}
                        </button>
                      )}
                    </td>
                    <td>
                      <Badge variant={HOLIDAY_TYPE_VARIANT[holiday.type] ?? "neutral"}>
                        {holiday.type}
                      </Badge>
                    </td>
                    <td>
                      {isPast ? (
                        <Badge variant="neutral" size="sm">Past</Badge>
                      ) : (
                        <Badge variant="success" size="sm" dot>Upcoming</Badge>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "8px 16px", fontSize: "var(--fs-xs)" }}
                          onClick={() => {
                            setEditingHoliday(holiday);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{
                            padding: "8px 16px",
                            fontSize: "var(--fs-xs)",
                            color: "var(--txt-danger)",
                          }}
                          onClick={() => handleDelete(holiday.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <AddHolidayModal
          onClose={() => {
            setModalOpen(false);
            setEditingHoliday(null);
          }}
          onSave={handleSaveHoliday}
          holiday={editingHoliday}
          existing={holidays}
        />
      )}
    </div>
  );
}

export default Holidays;
