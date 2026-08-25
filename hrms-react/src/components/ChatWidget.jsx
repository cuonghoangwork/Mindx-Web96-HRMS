import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AiAPI } from "../api";
import Button from "./Button";

// Solo Gaps Milestone 2 — scoped product-help chat widget. Mounted once in
// Layout.jsx so it persists across route changes. No existing floating-
// bubble component to copy in this codebase — built fresh, following
// GlobalSearch.jsx's local open/close useState idiom and
// CandidateSidePanel.jsx's position:fixed + inline-CSS-variable styling.
// No portal (nothing in this app uses one) and no persistence (resets on
// refresh, per the source plan's explicit v1 scope).

const MAX_HISTORY_TURNS = 6;

// Outline icons matching the app's convention (Layout.jsx's toast icons,
// Header.jsx's bell/menu icons): viewBox 0 0 24 24, fill none, stroke
// currentColor, strokeWidth 2, round caps/joins. No emoji anywhere else in
// this app uses one as a UI icon — ChatWidget shouldn't be the exception.
function ChatIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

// Same path as Layout.jsx's toast-dismiss icon (Layout.jsx:111-113).
function CloseIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function ChatWidget() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending, open]);

  const handleSend = async (e) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || sending) return;

    const history = messages.slice(-MAX_HISTORY_TURNS).map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: message }]);
    setInput("");
    setSending(true);
    try {
      const res = await AiAPI.chat(message, history);
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
    } catch {
      // Never surface the raw server error — it can leak backend config
      // details (e.g. "GEMINI_API_KEY is unset"), same rule
      // PerformanceReviewDialog.jsx's handleAskAI already follows.
      setMessages((m) => [...m, { role: "assistant", content: t("chat.unavailable") }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        variant="primary"
        iconOnly
        leftIcon={open ? <CloseIcon size={22} /> : <ChatIcon size={24} />}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: "var(--z-modal)",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        {open ? t("chat.closeLabel") : t("chat.openLabel")}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label={t("chat.title")}
          style={{
            position: "fixed",
            bottom: "88px",
            right: "24px",
            width: "340px",
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "480px",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
            border: "1px solid var(--bdr-subtle)",
            boxShadow: "var(--shadow-xl)",
            zIndex: "var(--z-modal)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--sp-3) var(--sp-4)",
              borderBottom: "1px solid var(--bdr-subtle)",
            }}
          >
            <span style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-sm)" }}>{t("chat.title")}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("chat.closeLabel")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--txt-secondary)", display: "inline-flex", alignItems: "center" }}
            >
              <CloseIcon />
            </button>
          </div>

          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "var(--sp-3) var(--sp-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-3)",
            }}
          >
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("chat.greeting")}</div>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  background: m.role === "user" ? "var(--bg-primary-subtle)" : "var(--bg-surface-alt)",
                  color: "var(--txt-primary)",
                  padding: "var(--sp-2) var(--sp-3)",
                  fontSize: "var(--fs-sm)",
                  maxWidth: "85%",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>{t("chat.thinking")}</div>
            )}
          </div>

          <form
            onSubmit={handleSend}
            className="form-group"
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "var(--sp-2)",
              padding: "var(--sp-3)",
              marginBottom: 0,
              borderTop: "1px solid var(--bdr-subtle)",
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("chat.placeholder")}
              disabled={sending}
              style={{ flex: 1 }}
            />
            <Button variant="primary" size="sm" type="submit" disabled={sending || !input.trim()}>
              {t("chat.send")}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}

export default ChatWidget;
