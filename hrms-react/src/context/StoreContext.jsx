import { createContext, useContext } from "react";

export const StoreContext = createContext(null);

/**
 * Employees, departments, jobs, candidates, holidays, attendance, overtime
 * and the demo clock. Notifications live in NotificationContext and are
 * deliberately NOT merged in here: context subscription is all-or-nothing,
 * so a merging facade would re-render every store consumer on every
 * arriving notification — the exact problem the split removes.
 */
export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
