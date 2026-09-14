import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { idsMatch } from "../../utils/id";
import { translateNotification } from "../../utils/notifications";
import { shouldNotify, showDesktopNotification } from "../../utils/desktopNotify";
import { translateApiError } from "../../utils/apiError";
import { useAuth } from "../AuthContext";
import { NotificationsAPI } from "../../api";
import { connectNotificationStream } from "../../api/notificationStream";
import { useLanguage } from "../LanguageContext";
import { NotificationContext } from "../NotificationContext";

/**
 * Notifications, unread count, toast and the SSE stream — kept out of
 * StoreProvider because an arriving SSE event would otherwise re-render every
 * store consumer. The initial fetch is independent of refreshAll's
 * Promise.all on purpose: a notification outage costs the bell, not the
 * dashboard.
 */
export function NotificationProvider({ children }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { isAuthenticated, mustChangePassword } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null); // { type: "error"|"success", message } | null

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  /* ── Out-of-app language ── */

  // Server-rendered channels (email, Telegram) read User.language, so mirror the UI toggle there.
  useEffect(() => {
    if (!isAuthenticated || mustChangePassword || !language) return;
    NotificationsAPI.updatePreferences({ language }).catch(() => {
      // nothing to recover — the app language is already applied locally
    });
  }, [isAuthenticated, mustChangePassword, language]);

  /* ── Live notifications (SSE) ── */

  // Catch-up after the stream has been down; refetching the whole store would flash every list.
  const refreshNotifications = useCallback(async () => {
    try {
      const notif = await NotificationsAPI.list();
      setNotifications(notif.items || []);
    } catch {
      // the stream is already retrying; the next reconnect tries again
    }
  }, []);

  // A ref, not an effect dependency: flipping EN/VI must not tear down the SSE connection.
  const desktopToastRef = useRef(null);
  desktopToastRef.current = (incoming) => {
    if (!shouldNotify(incoming)) return;
    // Translated — the stored title/message are English literals.
    const { title, message } = translateNotification(incoming, t, language);
    showDesktopNotification({
      title,
      body: message,
      // A shared tag collapses two tabs (or a catch-up/stream race) into one toast.
      tag: String(incoming.id),
      onActivate: () => incoming.link && navigate(incoming.link),
    });
  };

  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return undefined;

    const connection = connectNotificationStream({
      onNotification: (incoming) => {
        setNotifications((prev) =>
          // The catch-up GET and a live event can carry the same notification.
          prev.some((n) => idsMatch(n.id, incoming.id)) ? prev : [incoming, ...prev],
        );
        desktopToastRef.current?.(incoming);
      },
      onReconnect: refreshNotifications,
    });

    return () => connection.close();
  }, [isAuthenticated, mustChangePassword, refreshNotifications]);

  /* ── Service worker bridge (Web Push) ── */

  // public/sw.js hands a push to the page when a tab is visible (the
  // double-toast fix). The payload is tiny, so refetch rather than insert it.
  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return undefined;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;

    const onMessage = (event) => {
      const { type, url } = event.data ?? {};
      if (type === "notification") refreshNotifications();
      // OS notification clicked while a tab exists: route in place.
      if (type === "navigate" && url) navigate(url);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [isAuthenticated, mustChangePassword, refreshNotifications, navigate]);

  /* ── Initial load, once signed in ── */

  // Same auth gate as StoreProvider, so both clear at the same moment on sign-out.
  useEffect(() => {
    if (isAuthenticated && !mustChangePassword) {
      refreshNotifications();
    } else {
      setNotifications([]);
    }
  }, [isAuthenticated, mustChangePassword, refreshNotifications]);

  /* ── Notification actions (optimistic, backed by the API) ── */
  const markNotificationRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (idsMatch(n.id, id) ? { ...n, read: true } : n)),
    );
    try {
      await NotificationsAPI.markRead(id);
    } catch (err) {
      showToast("error", translateApiError(err, t) || "Failed to mark notification as read.");
    }
  }, [showToast, t]);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await NotificationsAPI.markAllRead();
    } catch (err) {
      showToast("error", translateApiError(err, t) || "Failed to mark all notifications as read.");
    }
  }, [showToast, t]);

  const removeNotification = useCallback(async (id) => {
    setNotifications((prev) => prev.filter((n) => !idsMatch(n.id, id)));
    try {
      await NotificationsAPI.remove(id);
    } catch (err) {
      showToast("error", translateApiError(err, t) || "Failed to dismiss notification.");
    }
  }, [showToast, t]);

  const clearReadNotifications = useCallback(async () => {
    setNotifications((prev) => prev.filter((n) => !n.read));
    try {
      await NotificationsAPI.clearRead();
    } catch (err) {
      showToast("error", translateApiError(err, t) || "Failed to clear read notifications.");
    }
  }, [showToast, t]);

  // HR/Admin compose. Optimistic only for broadcasts the sender would also see.
  const sendNotification = useCallback(async (payload) => {
    const res = await NotificationsAPI.create(payload);
    const isBroadcastToSelf =
      !payload.recipientId && (!payload.recipientIds || payload.recipientIds.length === 0);
    if (isBroadcastToSelf && res.data) {
      setNotifications((prev) => [res.data, ...prev]);
    }
    return res.data;
  }, []);

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const value = useMemo(
    () => ({
      notifications,
      unreadNotificationCount,
      toast,
      dismissToast,
      refreshNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      removeNotification,
      clearReadNotifications,
      sendNotification,
    }),
    // Dependency list computed by react-hooks/exhaustive-deps.
    [
      notifications,
      unreadNotificationCount,
      toast,
      dismissToast,
      refreshNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      removeNotification,
      clearReadNotifications,
      sendNotification,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}
