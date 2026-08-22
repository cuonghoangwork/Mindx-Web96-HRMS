import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from "../components/Button";
import AuthBrandPanel from "../components/AuthBrandPanel";
import AuthThemeToggle from "../components/AuthThemeToggle";

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
    <div className="login-page">
      <AuthBrandPanel />

      <div className="login-form-panel">
        <AuthThemeToggle />

        <div className="login-card">
          <div className="login-header">
            <h1>Forgot Password</h1>
          </div>
          <p className="login-subtitle">Enter your email and we&apos;ll send you a reset link</p>

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

            <Button variant="primary" type="submit" style={{ width: '100%' }}>
              Send Reset Link
            </Button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px' }}>
            Remember your password?{' '}
            <Link to="/login" className="link-primary">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
