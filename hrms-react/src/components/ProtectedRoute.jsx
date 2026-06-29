import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * ProtectedRoute — gates a route behind authentication (and optionally a role).
 *
 * Props:
 *   children     — the page component to render
 *   requireHR    — if true, only MANAGER + ADMIN can access; others see a 403 notice
 *   requireAdmin — if true, only ADMIN can access
 *
 * Usage:
 *   <ProtectedRoute>               — any authenticated user
 *   <ProtectedRoute requireHR>     — MANAGER or ADMIN only
 *   <ProtectedRoute requireAdmin>  — ADMIN only
 */
function ProtectedRoute({ children, requireHR = false, requireAdmin = false }) {
  const { isAuthenticated, isHR, isAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-page)' }}>
        <span style={{ color: 'var(--txt-secondary)', fontSize: 'var(--fs-md)' }}>Loading…</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireAdmin && !isAdmin) {
    return <AccessDenied />
  }

  if (requireHR && !isHR) {
    return <AccessDenied />
  }

  return children
}

function AccessDenied() {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-4)',
      color: 'var(--txt-secondary)',
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="15" y1="9" x2="9" y2="15" />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 'var(--fw-semibold)', color: 'var(--txt-primary)', marginBottom: 'var(--sp-2)' }}>
          Access Denied
        </div>
        <div style={{ fontSize: 'var(--fs-md)' }}>
          You don't have permission to view this page.
        </div>
        <div style={{ fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-1)' }}>
          Contact your Administrator if you need access.
        </div>
      </div>
    </div>
  )
}

export default ProtectedRoute
