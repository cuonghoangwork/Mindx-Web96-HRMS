import { useState } from 'react'
import { CurrencyContext } from '../CurrencyContext'

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

