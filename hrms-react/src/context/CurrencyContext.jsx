import { createContext, useContext } from 'react'

/**
 * CurrencyContext — shared VND/USD display-currency preference, driving
 * the topbar's currency toggle. Persisted the same way ThemeContext is.
 *
 * This only carries the *display preference* (which currency to show
 * amounts in) — it does not carry a global FX rate. Actual conversion
 * math stays wherever a real, period-scoped exchange rate already
 * exists (Payroll.jsx reads fxRate off the selected pay period from the
 * real ExchangeRate-backed API) rather than inventing a fake "live" app-
 * wide rate that isn't backed by anything real.
 *
 * The provider component lives in providers/CurrencyProvider.jsx — see
 * ThemeContext.jsx for why the two are split.
 */
export const CurrencyContext = createContext(null)

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}
