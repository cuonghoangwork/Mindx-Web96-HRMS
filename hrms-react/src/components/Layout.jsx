import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import SideMenu from "./SideMenu";
import Header from "./Header";
import { useStore } from "../context/StoreContext";
import Button from "./Button";

function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loadingStore, storeError, refreshAll, toast, dismissToast } = useStore();

  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(dismissToast, 4000);
    return () => clearTimeout(id);
  }, [toast, dismissToast]);

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={closeSidebar}
        />
      )}
      <SideMenu isOpen={sidebarOpen} onNavigate={closeSidebar} />
      <main className="main-content">
        <Header onMenuToggle={() => setSidebarOpen((open) => !open)} />

        {storeError ? (
          <div
            className="form-error"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--sp-4)",
              marginBottom: "var(--sp-5)",
            }}
          >
            <span>Couldn't load data: {storeError}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={refreshAll}
            >
              Retry
            </Button>
          </div>
        ) : loadingStore ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-3)",
              padding: "var(--sp-6) 0",
            }}
            aria-busy="true"
            aria-live="polite"
          >
            <div className="skeleton skeleton-text" style={{ width: "40%" }} />
            <div className="skeleton skeleton-text" style={{ width: "70%" }} />
            <div className="skeleton skeleton-text" style={{ width: "55%" }} />
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {toast && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : "toast-success"}`} role="alert">
          <span className="toast-icon" aria-hidden="true">{toast.type === "error" ? "⚠" : "✓"}</span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss"
            style={{
              marginLeft: "var(--sp-3)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--txt-secondary)",
              fontSize: "16px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default Layout;
