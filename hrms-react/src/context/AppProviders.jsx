import { AuthProvider } from "./providers/AuthProvider";
import { ThemeProvider } from "./providers/ThemeProvider";
import { LanguageProvider } from "./providers/LanguageProvider";
import { CurrencyProvider } from "./providers/CurrencyProvider";
import { StoreProvider } from "./providers/StoreProvider";

/**
 * The application's provider stack, in one place.
 *
 * The nesting order is load-bearing and must not be reshuffled casually:
 *
 *   Auth      — owns isAuthenticated/mustChangePassword
 *   Theme     — independent
 *   Language  — must sit above Store, which reads useLanguage()
 *   Currency  — independent
 *   Store     — reads useAuth() and useLanguage(), so it sits innermost
 *
 * StoreProvider's effects assume this order: the auth gate fires before the
 * initial load, which fires before the SSE connect. Splitting StoreContext
 * into narrower contexts later means adding providers *here*, keeping that
 * order intact, rather than re-nesting at the call site in main.jsx.
 */
export function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <StoreProvider>{children}</StoreProvider>
          </CurrencyProvider>
        </LanguageProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
