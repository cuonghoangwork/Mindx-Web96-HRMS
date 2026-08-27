import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import SideMenu from "./SideMenu";
import Header from "./Header";
import { useStore } from "../context/StoreContext";
import Button from "./Button";
import ChatWidget from "./ChatWidget";

function Layout() {
  const { t } = useTranslation();
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
          aria-label={t("layout.closeMenuAriaLabel", { defaultValue: "Close menu" })}
          onClick={closeSidebar}
        />
      )}
      <SideMenu isOpen={sidebarOpen} onNavigate={closeSidebar} />
      <main className="main-content">
        <Header onMenuToggle={() => setSidebarOpen((open) => !open)} />

        <div className="content-scroll">
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
              <span>{t("layout.loadError", { error: storeError, defaultValue: "Couldn't load data: {{error}}" })}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={refreshAll}
              >
                {t("settings.retry", { defaultValue: "Retry" })}
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
        </div>
      </main>

      {toast && (
        <div className={`toast ${toast.type === "error" ? "toast-error" : "toast-success"}`} role="alert">
          <span
            className="toast-icon"
            aria-hidden="true"
            style={{ display: "inline-flex", color: toast.type === "error" ? "var(--txt-danger)" : "var(--txt-success)" }}
          >
            {toast.type === "error" ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            onClick={dismissToast}
            aria-label={t("notifications.item.dismiss", { defaultValue: "Dismiss" })}
            style={{
              marginLeft: "var(--sp-3)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--txt-secondary)",
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <ChatWidget />
    </div>
  );
}

export default Layout;
