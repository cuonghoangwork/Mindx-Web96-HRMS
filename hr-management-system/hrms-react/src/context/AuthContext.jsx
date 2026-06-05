import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

// Demo admin credentials (in production, use proper backend authentication)
const ADMIN_CREDENTIALS = {
  email: 'admin@hrms.com',
  password: 'admin123'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('hrms-user')
    return savedUser ? JSON.parse(savedUser) : null
  })
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('hrms-authenticated') === 'true'
  })

  // Demo login function
  const login = async (email, password) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
      const userData = {
        email,
        name: 'Admin User',
        role: 'Administrator',
        avatar: 'AU'
      }
      setUser(userData)
      setIsAuthenticated(true)
      localStorage.setItem('hrms-user', JSON.stringify(userData))
      localStorage.setItem('hrms-authenticated', 'true')
      return { success: true }
    }
    
    return { success: false, error: 'Invalid email or password' }
  }

  const logout = () => {
    setUser(null)
    setIsAuthenticated(false)
    localStorage.removeItem('hrms-user')
    localStorage.removeItem('hrms-authenticated')
  }

  const value = {
    user,
    isAuthenticated,
    login,
    logout
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
