import { AuthProvider } from "./providers/AuthProvider";
import { ThemeProvider } from "./providers/ThemeProvider";
import { LanguageProvider } from "./providers/LanguageProvider";
import { CurrencyProvider } from "./providers/CurrencyProvider";
import { NotificationProvider } from "./providers/NotificationProvider";
import { StoreProvider } from "./providers/StoreProvider";

/**
 * The provider stack. Order is load-bearing: Language must sit above
 * Notification (which reads useLanguage()); Notification and Store are
 * independent siblings that gate on the same auth flags, so they load and
 * clear together.
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
