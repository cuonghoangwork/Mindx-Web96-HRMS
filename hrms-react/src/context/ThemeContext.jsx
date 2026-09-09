import { createContext, useContext } from 'react'

// The context object and its hook live here; the provider component lives in
// providers/ThemeProvider.jsx. Splitting them is what lets `npm run lint` gate
// CI: react-refresh/only-export-components warns on any file exporting both a
// component and a non-component. Consumers keep importing useTheme from here.
export const ThemeContext = createContext(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
