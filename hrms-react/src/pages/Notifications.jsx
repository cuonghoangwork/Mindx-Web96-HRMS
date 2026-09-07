import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { translateNotification } from "../utils/notifications";
import AddNotificationModal from "../components/AddNotificationModal";
import Button from "../components/Button";
import { CATEGORY_CONFIG, FILTERS } from "../utils/notificationCategories";


function timeAgo(timestamp, now, t) {
  const then = new Date(timestamp);
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return t("notifications.timeAgo.justNow");
  if (minutes < 60) return t("notifications.timeAgo.minutesAgo", { count: minutes });
  if (hours < 24) return t("notifications.timeAgo.hoursAgo", { count: hours });
  if (days === 1) return t("notifications.timeAgo.yesterday");
  return t("notifications.timeAgo.daysAgo", { count: days });
}

function isToday(timestamp, now) {
  const today = now.toDateString();
  return new Date(timestamp).toDateString() === today;
}

function Notifications() {
  const { t } = useTranslation();
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    removeNotification,
    clearReadNotifications,
    sendNotification,
    getAppNow,
  } = useStore();
  const { isHRTier } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const now = getAppNow();

  const [filter, setFilter] = useState("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const stats = useMemo(() => {
    const unread = notifications.filter((n) => !n.read).length;
    const today = notifications.filter((n) => isToday(n.timestamp, now)).length;
    return {
      total: notifications.length,
      unread,
      today,
    };
  }, [notifications, now]);

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

  const handleOpen = (notification) => {
    if (!notification.read) markNotificationRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
    } else {
      setExpandedId((prev) => (prev === notification.id ? null : notification.id));
    }
  };

  const handleSend = async (payload) => {
    await sendNotification(payload);
  };

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "var(--sp-5)" }}>
        <h2 style={{ flex: 1 }}>{t("notifications.title")}</h2>
        {isHRTier && (
          <Button
            variant="primary"
            onClick={() => setComposeOpen(true)}
          >
            {t("notifications.sendNotice")}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={markAllNotificationsRead}
          disabled={!hasUnread}
        >
          {t("notifications.markAllRead")}
        </Button>
        <Button
          variant="secondary"
          onClick={clearReadNotifications}
          disabled={!hasRead}
        >
          {t("notifications.clearRead")}
        </Button>
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
          <div className="stat-card-label">{t("notifications.stats.total.label")}</div>
          <div className="stat-card-value">{stats.total}</div>
          <div className="stat-card-hint">{t("notifications.stats.total.hint")}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">{t("notifications.stats.unread.label")}</div>
          <div className="stat-card-value" style={{ color: "var(--clr-danger-500)" }}>{stats.unread}</div>
          <div className="stat-card-hint">{t("notifications.stats.unread.hint")}</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-label">{t("notifications.stats.today.label")}</div>
          <div className="stat-card-value">{stats.today}</div>
          <div className="stat-card-hint">{t("notifications.stats.today.hint")}</div>
        </div>
      </div>

      <div className="content-card">
        <div className="toolbar" style={{ marginBottom: "var(--sp-4)" }}>
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            return (
              <Button
                variant="secondary"
                key={f.key}
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
                {t(f.labelKey)}
              </Button>
            );
          })}
        </div>

        {filteredNotifications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--txt-disabled)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div className="empty-state-title">{t("notifications.empty.title")}</div>
            <div className="empty-state-description">
              {filter === "all"
                ? t("notifications.empty.allCaughtUp")
                : t("notifications.empty.noneForFilter")}
            </div>
            {filter !== "all" && (
              <Button
                variant="secondary"
                onClick={() => setFilter("all")}
              >
                {t("notifications.empty.viewAll")}
              </Button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            {filteredNotifications.map((notification) => {
              const cfg = CATEGORY_CONFIG[notification.category] ?? CATEGORY_CONFIG.system;
              const isExpanded = expandedId === notification.id;
              const isOpenable = Boolean(notification.link) || Boolean(notification.message);
              const { title, message } = translateNotification(notification, t, language);
              return (
                <div
                  key={notification.id}
                  onClick={isOpenable ? () => handleOpen(notification) : undefined}
                  role={isOpenable ? "button" : undefined}
                  tabIndex={isOpenable ? 0 : undefined}
                  onKeyDown={
                    isOpenable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleOpen(notification);
                          }
                        }
                      : undefined
                  }
                  style={{
                    padding: "var(--sp-4) var(--sp-5)",
                    background: notification.read ? "transparent" : "var(--bg-surface-alt)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--bdr-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "var(--sp-4)",
                    cursor: isOpenable ? "pointer" : "default",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "flex-start", minWidth: 0, flex: 1 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "var(--radius-md)",
                        background: cfg.bg,
                        color: cfg.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {cfg.icon}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
                        <h3 style={{ fontSize: "var(--fs-md)", fontWeight: "var(--fw-medium)", color: "var(--txt-primary)" }}>
                          {title}
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
                      <p
                        style={{
                          fontSize: "var(--fs-sm)",
                          color: "var(--txt-secondary)",
                          marginTop: "var(--sp-1)",
                          display: !isExpanded && !notification.link ? "-webkit-box" : "block",
                          WebkitLineClamp: !isExpanded && !notification.link ? 2 : undefined,
                          WebkitBoxOrient: !isExpanded && !notification.link ? "vertical" : undefined,
                          overflow: !isExpanded && !notification.link ? "hidden" : undefined,
                        }}
                      >
                        {message}
                      </p>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-disabled)", marginTop: "var(--sp-2)", display: "flex", alignItems: "center", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                        <span>{t(cfg.labelKey)} • {timeAgo(notification.timestamp, now, t)}</span>
                        {notification.senderName && <span>· {t("notifications.item.from", { name: notification.senderName })}</span>}
                        {notification.link && (
                          <span style={{ color: "var(--txt-primary-brand)", fontWeight: "var(--fw-medium)" }}>
                            {notification.linkLabel || t("notifications.item.open")} →
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "var(--sp-1)", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {!notification.read && (
                      <Button
                        variant="link"
                        onClick={() => markNotificationRead(notification.id)}
                      >
                        {t("notifications.item.markRead")}
                      </Button>
                    )}
                    <Button
                      variant="link"
                      className="btn-link-muted"
                      onClick={() => removeNotification(notification.id)}
                      aria-label={t("notifications.item.dismissAria")}
                    >
                      {t("notifications.item.dismiss")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {composeOpen && (
        <AddNotificationModal
          onClose={() => setComposeOpen(false)}
          onSend={handleSend}
        />
      )}
    </div>
  );
}

export default Notifications;
