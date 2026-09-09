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
 * Everything notification-shaped, moved out of StoreProvider in Phase 2.
 *
 * WHY THIS IS THE FIRST SPLIT. Notifications were the noisiest state in the
 * store and the least shared: of the 25 components reading useStore(), only
 * four touch this domain (Header, Layout, Dashboard, Notifications). Every
 * arriving SSE event rebuilt the 74-field store value, so a single incoming
 * notification re-rendered all 25 — including AddJobModal, which wanted one
 * unrelated field. Splitting it costs the least and buys the most.
 *
 * Toast came with it rather than staying behind: showToast had exactly four
 * call sites in the old StoreProvider, and all four were notification actions.
 *
 * ONE DELIBERATE BEHAVIOUR CHANGE. The initial notification fetch used to be
 * the seventh entry in refreshAll's eight-way Promise.all, which meant a
 * failing notifications endpoint rejected the whole batch and put the app
 * behind a "Couldn't load data" banner. It is now an independent fetch through
 * refreshNotifications, whose catch is deliberately silent (the stream retries
 * on its own). So a notification outage now costs the bell and nothing else,
 * where it previously took down the dashboard with it. This is the one place
 * the split could not be a pure move, because the old code entangled this
 * request with seven unrelated ones.
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

  // Email and Telegram are rendered on the server, which has no way to read
  // the UI toggle — it reads User.language instead. Mirroring the choice here
  // is what keeps an email from arriving in a different language than the app
  // the reader just set, and avoids a second language picker in Settings that
  // could disagree with the first.
  useEffect(() => {
    if (!isAuthenticated || mustChangePassword || !language) return;
    NotificationsAPI.updatePreferences({ language }).catch(() => {
      // Nothing to recover: the app language is already applied locally, and
      // this only affects copy the server renders later.
    });
  }, [isAuthenticated, mustChangePassword, language]);

  /* ── Live notifications (SSE) ── */

  // Notifications only, unlike refreshAll: used to catch up after the stream
  // has been down, where refetching the whole store would flash every list.
  const refreshNotifications = useCallback(async () => {
    try {
      const notif = await NotificationsAPI.list();
      setNotifications(notif.items || []);
    } catch {
      // The stream is already retrying on its own; a failed catch-up is not
      // worth a toast, and the next reconnect will try again.
    }
  }, []);

  // Held in a ref, not closed over by the effect below, so that switching
  // language or navigating does not tear down and re-open the SSE
  // connection — which would cost a fresh ticket and a catch-up refetch
  // every time someone flips EN/VI.
  const desktopToastRef = useRef(null);
  desktopToastRef.current = (incoming) => {
    if (!shouldNotify(incoming)) return;
    // Translated, so the OS toast respects the EN/VI toggle exactly as the
    // in-app list does — the stored title/message are English literals.
    const { title, message } = translateNotification(incoming, t, language);
    showDesktopNotification({
      title,
      body: message,
      // Two open tabs both receive the same SSE event, and a notification
      // written in the narrow window between a reconnect's catch-up fetch
      // and the stream registering can arrive twice. A shared tag makes the
      // OS collapse either case into a single toast.
      tag: String(incoming.id),
      onActivate: () => incoming.link && navigate(incoming.link),
    });
  };

  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return undefined;

    const connection = connectNotificationStream({
      onNotification: (incoming) => {
        setNotifications((prev) =>
          // A reconnect refetch races the stream: the catch-up GET and a live
          // event can both carry the same notification. Dedupe on id.
          prev.some((n) => idsMatch(n.id, incoming.id)) ? prev : [incoming, ...prev],
        );
        desktopToastRef.current?.(incoming);
      },
      onReconnect: refreshNotifications,
    });

    return () => connection.close();
  }, [isAuthenticated, mustChangePassword, refreshNotifications]);

  /* ── Service worker bridge (Web Push) ── */

  // public/sw.js hands a push to the page instead of showing an OS
  // notification whenever a tab is visible — that is the double-toast fix.
  // The push payload is deliberately tiny (id/title/body/url), not a whole
  // notification, so refetch rather than trying to insert a partial row.
  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) return undefined;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return undefined;

    const onMessage = (event) => {
      const { type, url } = event.data ?? {};
      if (type === "notification") refreshNotifications();
      // Sent when the user clicks an OS notification and an HRMS tab already
      // exists: focus it and route in place rather than opening another tab.
      if (type === "navigate" && url) navigate(url);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [isAuthenticated, mustChangePassword, refreshNotifications, navigate]);

  /* ── Initial load, once signed in ── */

  // Mirrors the auth gate StoreProvider uses for its own eight lists, so the
  // two clear at the same moment on sign-out. See the header note about why
  // this is a separate request rather than part of that Promise.all.
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

  // HR/Admin: compose and send a custom notice. Doesn't optimistically add to local
  // state for targeted sends (the recipient isn't necessarily "me"), but does for
  // broadcasts the sender themself would also see.
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
    // Computed by react-hooks/exhaustive-deps, not by hand — same reasoning as
    // StoreProvider's value.
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
