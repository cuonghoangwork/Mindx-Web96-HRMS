import { createContext, useContext } from "react";

// The provider component lives in providers/StoreProvider.jsx — see
// ThemeContext.jsx for why the two are split.
export const StoreContext = createContext(null);

/**
 * The remaining store domains: employees, departments, jobs, candidates,
 * holidays, attendance, overtime and the demo clock.
 *
 * NOTIFICATIONS ARE NOT HERE any more — they live in NotificationContext, and
 * this hook deliberately does NOT merge them back in.
 *
 * A merging facade was the obvious way to keep the 25 existing consumers
 * compiling through the split, and it is the wrong tool here. Subscribing to a
 * context is all-or-nothing: any component that reads NotificationContext
 * re-renders when it changes, whatever fields it actually uses. So a useStore()
 * that merged the two would have re-rendered all 25 consumers on every
 * arriving notification — a faithful reproduction of the exact problem the
 * split exists to remove. The compatibility shim would have cost the entire
 * benefit while looking like progress.
 *
 * It was unnecessary anyway: only four components read notification fields
 * (Header, Layout, Dashboard, Notifications), and all four now call
 * useNotifications() directly. If you add a domain split later and a merging
 * facade is genuinely needed for a larger migration, treat it as load-bearing
 * debt and delete it as soon as the last consumer moves — not later.
 */
export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
