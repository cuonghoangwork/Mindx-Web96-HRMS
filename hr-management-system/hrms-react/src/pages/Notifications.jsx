import { useMemo, useState } from "react";
import { useStore } from "../context/StoreContext";

const CATEGORY_CONFIG = {
  leave: { label: "Leave", icon: "🏖️", color: "var(--clr-warning-500)", bg: "var(--bg-warning-subtle)" },
  interview: { label: "Hiring", icon: "🧑‍💼", color: "var(--clr-info-500)", bg: "var(--bg-info-subtle)" },
  payroll: { label: "Payroll", icon: "💰", color: "var(--clr-success-500)", bg: "var(--bg-success-subtle)" },
  employee: { label: "Employee", icon: "👋", color: "var(--clr-primary-400)", bg: "var(--bg-primary-subtle)" },
  holiday: { label: "Holiday", icon: "📅", color: "var(--clr-info-500)", bg: "var(--bg-info-subtle)" },
  system: { label: "System", icon: "⚙️", color: "var(--txt-secondary)", bg: "var(--bg-surface-sub)" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  ...Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label })),
];

function timeAgo(timestamp) {
  const now = new Date("2026-06-12T12:00:00");
  const then = new Date(timestamp);
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function isToday(timestamp) {
  const today = new Date("2026-06-12T12:00:00").toDateString();
  return new Date(timestamp).toDateString() === today;
}

function Notifications() {
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    clearReadNotifications,
  } = useStore();

  const [filter, setFilter] = useState("all");

  const stats = useMemo(() => {
    const unread = notifications.filter((n) => !n.read).length;
    const today = notifications.filter((n) => isToday(n.timestamp)).length;
    return {
      total: notifications.length,
      unread,
      today,
    };
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    const sorted = [...notifications].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );
    if (filter === "all") return sorted;
    if (filter === "unread") return sorted.filter((n) => !n.read);
    return sorted.filter((n) => n.category === filter);
  }, [notifications, filter]);

  const hasUnread = stats.unread > 0;
  const hasRead = notifications.some((n) => n.read);

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "var(--sp-5)" }}>
        <h2 style={{ flex: 1 }}>Notifications</h2>
        <button
          className="btn btn-secondary"
          onClick={markAllNotificationsRead}
          disabled={!hasUnread}
        >
          Mark all as read
        </button>
        <button
          className="btn btn-secondary"
          onClick={clearReadNotifications}
          disabled={!hasRead}
        >
          Clear read
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--sp-4)",
          marginBottom: "var(--sp-5)",
        }}
      >
        <div className="stat-card">
          <div className="stat-card-label">Total</div>
          <div className="stat-card-value">{stats.total}</div>
          <div className="stat-card-hint">All notifications</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Unread</div>
          <div className="stat-card-value" style={{ color: "var(--clr-danger-500)" }}>{stats.unread}</div>
          <div className="stat-card-hint">Needs your attention</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">Today</div>
          <div className="stat-card-value">{stats.today}</div>
          <div className="stat-card-hint">Received today</div>
        </div>
      </div>

      <div className="content-card">
        <div className="toolbar" style={{ marginBottom: "var(--sp-4)" }}>
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                className="btn btn-secondary"
                onClick={() => setFilter(f.key)}
                style={
                  isActive
                    ? {
                        borderColor: "var(--bdr-brand)",
                        color: "var(--txt-primary-brand)",
                        background: "var(--bg-primary-subtle)",
                      }
                    : undefined
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {filteredNotifications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔔</div>
            <div className="empty-state-title">No notifications</div>
            <div className="empty-state-description">
              {filter === "all"
                ? "You're all caught up. New notifications will appear here."
                : "Nothing here for this filter."}
            </div>
            {filter !== "all" && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setFilter("all")}
              >
                View all notifications
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            {filteredNotifications.map((notification) => {
              const cfg = CATEGORY_CONFIG[notification.category] ?? CATEGORY_CONFIG.system;
              return (
                <div
                  key={notification.id}
                  style={{
                    padding: "var(--sp-4) var(--sp-5)",
                    background: notification.read ? "transparent" : "var(--bg-surface-alt)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--bdr-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "var(--sp-4)",
                  }}
                >
                  <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start", minWidth: 0 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "var(--radius-md)",
                        background: cfg.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "var(--fs-lg)",
                        flexShrink: 0,
                      }}
                    >
                      {cfg.icon}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                          {notification.title}
                        </h3>
                        {!notification.read && (
                          <span
                            aria-label="Unread"
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: "var(--bg-primary)",
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>
                      <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)", marginTop: "var(--sp-1)" }}>
                        {notification.message}
                      </p>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-disabled)", marginTop: "var(--sp-2)" }}>
                        {cfg.label} • {timeAgo(notification.timestamp)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "var(--sp-2)", flexShrink: 0 }}>
                    {!notification.read && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: "8px 12px", fontSize: "var(--fs-xs)" }}
                        onClick={() => markNotificationRead(notification.id)}
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ padding: "8px 12px", fontSize: "var(--fs-xs)", color: "var(--txt-danger)" }}
                      onClick={() => removeNotification(notification.id)}
                      aria-label="Dismiss notification"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Notifications;
