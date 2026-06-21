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
  // Avoids redirecting to /login before we've had a chance to verify an existing token.
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

  // role: "Employee" | "HR" | "Administrator" (frontend labels) — mapped to the
  // backend's self-registerable roles (EMPLOYEE / MANAGER). ADMIN can't be
  // self-assigned; see hrms-backend/controller/authController.js.
  const ROLE_MAP = { Employee: 'EMPLOYEE', HR: 'MANAGER', Administrator: 'MANAGER' }

  const register = async ({ name, email, password, role }) => {
    try {
      const res = await AuthAPI.register({
        name,
        email,
        password,
        role: ROLE_MAP[role] || 'EMPLOYEE',
      })
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

  const value = {
    user,
    isAuthenticated,
    loading,
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
