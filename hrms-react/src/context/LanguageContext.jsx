import { createContext, useContext } from 'react'

// The provider component lives in providers/LanguageProvider.jsx — see
// ThemeContext.jsx for why the two are split.
export const LanguageContext = createContext(null)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
