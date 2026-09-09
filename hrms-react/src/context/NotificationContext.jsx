import { createContext, useContext } from "react";

// First domain split out of StoreContext (Phase 2). The provider component
// lives in providers/NotificationProvider.jsx — see ThemeContext.jsx for why
// the context and its hook are kept apart from the provider.
export const NotificationContext = createContext(null);

/**
 * Live notifications, the unread badge count, and the app's toast.
 *
 * Prefer this over useStore() for anything notification-shaped. useStore()
 * still returns these fields, but only by merging this context back in — so a
 * component reading them through the facade re-renders on every unrelated
 * store change, which is the whole problem the split exists to remove.
 */
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
