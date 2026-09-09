import { AuthProvider } from "./providers/AuthProvider";
import { ThemeProvider } from "./providers/ThemeProvider";
import { LanguageProvider } from "./providers/LanguageProvider";
import { CurrencyProvider } from "./providers/CurrencyProvider";
import { NotificationProvider } from "./providers/NotificationProvider";
import { StoreProvider } from "./providers/StoreProvider";

/**
 * The application's provider stack, in one place.
 *
 * The nesting order is load-bearing and must not be reshuffled casually:
 *
 *   Auth         — owns isAuthenticated/mustChangePassword
 *   Theme        — independent
 *   Language     — must sit above Notification, which reads useLanguage()
 *   Currency     — independent
 *   Notification — notifications, unread count, toast, SSE stream
 *   Store        — the remaining domains
 *
 * Notification and Store are siblings in dependency terms: neither reads the
 * other, which is what made notifications the safe first domain to split out
 * (Phase 2). Notification is nested outside Store only so that the useStore
 * facade in StoreContext.jsx, which merges the two, sits below both.
 *
 * Both providers gate their effects on the same auth flags, so they load and
 * clear together on sign-in and sign-out despite fetching separately.
 */
export function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <NotificationProvider>
              <StoreProvider>{children}</StoreProvider>
            </NotificationProvider>
          </CurrencyProvider>
        </LanguageProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
