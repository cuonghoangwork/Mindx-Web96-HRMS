import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { AuthAPI } from '../api'
import { setTokens, clearTokens, getTokens } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('hrms-user')
    return savedUser ? JSON.parse(savedUser) : null
  })
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getTokens().access))
  const [loading, setLoading] = useState(() => Boolean(getTokens().access))

  useEffect(() => {
    const { access } = getTokens()
    if (!access) {
      setLoading(false)
      return
    }
    AuthAPI.me()
      .then((res) => {
        setUser(res.data)
        localStorage.setItem('hrms-user', JSON.stringify(res.data))
        setIsAuthenticated(true)
      })
      .catch(() => {
        clearTokens()
        localStorage.removeItem('hrms-user')
        setUser(null)
        setIsAuthenticated(false)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    try {
      const res = await AuthAPI.login(email, password)
      setTokens(res.data)
      setUser(res.data.user)
      localStorage.setItem('hrms-user', JSON.stringify(res.data.user))
      setIsAuthenticated(true)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message || 'Invalid email or password' }
    }
  }

  // All registrations create EMPLOYEE accounts — no role selector needed.
  // Promotion to MANAGER is done by ADMIN only via the Settings page.
  const register = async ({ name, email, password }) => {
    try {
      const res = await AuthAPI.register({ name, email, password })
      return { success: true, data: res.data }
    } catch (err) {
      return { success: false, error: err.message || 'Registration failed' }
    }
  }

  const logout = useCallback(() => {
    AuthAPI.logout().catch(() => {})
    clearTokens()
    localStorage.removeItem('hrms-user')
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  // Helpers for role checks — used by ProtectedRoute and page-level guards
  const isAdmin = user?.role === 'ADMIN'
  const isHR = user?.role === 'MANAGER' || user?.role === 'ADMIN'
  const isEmployee = Boolean(user)

  const value = {
    user,
    isAuthenticated,
    loading,
    isAdmin,
    isHR,      // true for MANAGER + ADMIN
    isEmployee, // true for all authenticated users
    login,
    register,
    logout,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
