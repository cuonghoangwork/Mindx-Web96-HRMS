import { createContext, useContext } from 'react'

// The provider component lives in providers/AuthProvider.jsx — see
// ThemeContext.jsx for why the two are split.
export const AuthContext = createContext(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
