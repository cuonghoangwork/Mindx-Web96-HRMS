import { createContext, useContext } from "react";

// The provider component lives in providers/StoreProvider.jsx — see
// ThemeContext.jsx for why the two are split.
export const StoreContext = createContext(null);

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
