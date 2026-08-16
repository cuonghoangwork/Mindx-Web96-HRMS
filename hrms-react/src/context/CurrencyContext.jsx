import { createContext, useContext, useState } from 'react'

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
 */
const CurrencyContext = createContext(null)

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => {
    return localStorage.getItem('hrms-currency') || 'VND'
  })

  const setCurrencyValue = (value) => {
    setCurrency(value)
    localStorage.setItem('hrms-currency', value)
  }

  const toggleCurrency = () => {
    setCurrencyValue(currency === 'VND' ? 'USD' : 'VND')
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency: setCurrencyValue, toggleCurrency }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}
