import { useState, useEffect } from 'react'
import i18n, { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, loadLanguage } from '../../i18n'
import { LanguageContext } from '../LanguageContext'

// Task 6.1 — mirrors ThemeContext.jsx's shape/pattern (localStorage-backed
// state + an effect that pushes it out to the actual mechanism, here
// i18next.changeLanguage instead of a body data-attribute) so this reads
// like a sibling of the existing theme switch rather than a new pattern.
function isSupported(lang) {
  return SUPPORTED_LANGUAGES.includes(lang)
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const stored = localStorage.getItem('hrms-language')
    return isSupported(stored) ? stored : DEFAULT_LANGUAGE
  })

  // Only the default locale ships in the initial chunk (see i18n/index.js), so
  // a returning Vietnamese user would otherwise paint an English UI and then
  // swap it a moment later. Gate the first paint until their dictionary is in.
  //
  // This starts true for the default language, which is the common case and
  // means English users get no extra wait and no behaviour change. It also
  // never returns to false, so switching language later is non-blocking: the
  // UI stays up in the old language until the new dictionary resolves, exactly
  // as it did when both were bundled.
  const [ready, setReady] = useState(() => language === DEFAULT_LANGUAGE)

  useEffect(() => {
    localStorage.setItem('hrms-language', language)
    let cancelled = false
    loadLanguage(language)
      .then(() => {
        if (cancelled) return
        i18n.changeLanguage(language)
        setReady(true)
      })
      .catch(() => {
        // loadLanguage resolves for unknown languages, so reaching here means
        // the chunk request itself failed. Unblock anyway: fallbackLng renders
        // English, which beats holding a blank screen forever.
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
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
      {ready ? children : null}
    </LanguageContext.Provider>
  )
}
