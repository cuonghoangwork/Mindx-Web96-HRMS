import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    // Demo - redirect to OTP page
    alert('OTP sent to your email! (Demo)')
    navigate('/enter-otp')
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      background: 'var(--surface)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '40px',
        background: 'var(--surface)',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '8px' }}>Forgot Password</h1>
        <p style={{ 
          textAlign: 'center', 
          color: 'var(--text-muted)', 
          marginBottom: '32px' 
        }}>
          Enter your email and we'll send you a reset link
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@hrms.com"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            Send Reset Link
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px' }}>
          Remember your password?{' '}
          <Link to="/login" style={{ color: 'var(--primary)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ForgotPassword
