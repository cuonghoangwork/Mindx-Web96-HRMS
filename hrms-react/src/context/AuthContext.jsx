import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthAPI } from '../api'
import { setTokens, clearTokens, getTokens } from '../api/client'
import { translateApiError } from '../utils/apiError'

const AuthContext = createContext(null)

function readStoredUser() {
  try {
    const savedUser = localStorage.getItem('hrms-user')
    return savedUser ? JSON.parse(savedUser) : null
  } catch {
    localStorage.removeItem('hrms-user')
    return null
  }
}

export function AuthProvider({ children }) {
  const { t } = useTranslation()
  const [user, setUser] = useState(readStoredUser)
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getTokens().access))
  const [loading, setLoading] = useState(() => Boolean(getTokens().access))

  const [publicRegistration, setPublicRegistration] = useState(false)
  const [accountEmailDomain, setAccountEmailDomain] = useState('hrms.com')
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState('')

  useEffect(() => {
    let cancelled = false
    AuthAPI.config()
      .then((res) => {
        if (cancelled) return
        setPublicRegistration(Boolean(res.data?.publicRegistration))
        if (res.data?.accountEmailDomain) setAccountEmailDomain(res.data.accountEmailDomain)
      })
      .catch((err) => {
        if (cancelled) return
        setPublicRegistration(false)
        setConfigError(translateApiError(err, t) || 'Could not load server configuration')
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      return { success: true, mustChangePassword: Boolean(res.data.user?.mustChangePassword) }
    } catch (err) {
      return { success: false, error: translateApiError(err, t) || 'Invalid email or password' }
    }
  }

  // All registrations create EMPLOYEE accounts — no role selector needed.
  // Promotion to MANAGER is done by ADMIN only via the Settings page.
  const register = async ({ name, email, password }) => {
    try {
      const res = await AuthAPI.register({ name, email, password })
      return { success: true, data: res.data }
    } catch (err) {
      return { success: false, error: translateApiError(err, t) || 'Registration failed' }
    }
  }

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const res = await AuthAPI.changePassword(currentPassword, newPassword)
      setTokens(res.data)
      setUser(res.data.user)
      localStorage.setItem('hrms-user', JSON.stringify(res.data.user))
      setIsAuthenticated(true)
      return { success: true }
    } catch (err) {
      return { success: false, error: translateApiError(err, t) || 'Could not update password' }
    }
  }

  const logout = useCallback(() => {
    AuthAPI.logout().catch(() => {})
    clearTokens()
    localStorage.removeItem('hrms-user')
    setUser(null)
    setIsAuthenticated(false)
  }, [])

  // Helpers for role checks — used by ProtectedRoute and page-level guards.
  // Four roles: ADMIN (full control), HR (company-wide, unscoped), MANAGER
  // (department-scoped line manager — see hrms-backend/utils/managerScope.js),
  // EMPLOYEE (self-service only). isHRTier/isManagerTier are the two
  // "at least this tier" checks most UI actually wants — most call sites
  // should use one of those two, not the bare role flags.
  const isAdmin = user?.role === 'ADMIN'
  const isHR = user?.role === 'HR'
  const isManager = user?.role === 'MANAGER'
  const isHRTier = isHR || isAdmin            // company-wide HR-or-above (payroll, departments, holidays, jobs, candidates, audit log, broadcasts)
  const isManagerTier = isManager || isHR || isAdmin // department-manager-or-above (employee/attendance/leave actions — MANAGER stays scoped server-side)
  const isEmployee = Boolean(user)
  const mustChangePassword = Boolean(user?.mustChangePassword)

  const value = {
    user,
    isAuthenticated,
    loading,
    isAdmin,
    isHR,        // true for HR only
    isManager,   // true for MANAGER only — drives the scoped self-service nav/dashboard (8.0e)
    isHRTier,    // true for HR + ADMIN
    isManagerTier, // true for MANAGER + HR + ADMIN
    isEmployee, // true for all authenticated users
    mustChangePassword,
    publicRegistration,
    accountEmailDomain,
    configLoading,
    configError,
    login,
    register,
    changePassword,
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
