import { useState, useEffect } from 'react'
import { ThemeContext } from '../ThemeContext'

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('hrms-theme') || 'light'
  })

  useEffect(() => {
    localStorage.setItem('hrms-theme', theme)
    document.body.setAttribute('data-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const setThemeValue = (newTheme) => {
    setTheme(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: setThemeValue }}>
      {children}
    </ThemeContext.Provider>
  )
}

