import { createContext, useContext, useState, useEffect } from 'react'
import i18n, { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '../i18n'

// Task 6.1 — mirrors ThemeContext.jsx's shape/pattern (localStorage-backed
// state + an effect that pushes it out to the actual mechanism, here
// i18next.changeLanguage instead of a body data-attribute) so this reads
// like a sibling of the existing theme switch rather than a new pattern.
const LanguageContext = createContext(null)

function isSupported(lang) {
  return SUPPORTED_LANGUAGES.includes(lang)
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const stored = localStorage.getItem('hrms-language')
    return isSupported(stored) ? stored : DEFAULT_LANGUAGE
  })

  useEffect(() => {
    localStorage.setItem('hrms-language', language)
    i18n.changeLanguage(language)
  }, [language])

  const setLanguage = (newLanguage) => {
    if (!isSupported(newLanguage)) return
    setLanguageState(newLanguage)
  }

  const toggleLanguage = () => {
    setLanguageState(prev => (prev === 'en' ? 'vi' : 'en'))
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, supportedLanguages: SUPPORTED_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
