import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import Button from "../components/Button";
import AuthBrandPanel from "../components/AuthBrandPanel";
import AuthThemeToggle from "../components/AuthThemeToggle";

function ForgotPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    // Demo - redirect to OTP page
    alert(t('auth.forgotPassword.demoAlert', { defaultValue: 'OTP sent to your email! (Demo)' }))
    navigate('/enter-otp')
  }

  return (
    <div className="login-page">
      <AuthBrandPanel />

      <div className="login-form-panel">
        <AuthThemeToggle />

        <div className="login-card">
          <div className="login-header">
            <h1>{t('auth.forgotPassword.heading', { defaultValue: 'Forgot Password' })}</h1>
          </div>
          <p className="login-subtitle">{t('auth.forgotPassword.subtitle', { defaultValue: "Enter your email and we'll send you a reset link" })}</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">{t('auth.common.emailAddressLabel', { defaultValue: 'Email Address' })}</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.common.emailPlaceholderDemo', { defaultValue: 'admin@hrms.com' })}
                required
              />
            </div>

            <Button variant="primary" type="submit" style={{ width: '100%' }}>
              {t('auth.forgotPassword.submitButton', { defaultValue: 'Send Reset Link' })}
            </Button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px' }}>
            {t('auth.forgotPassword.rememberPasswordPrefix', { defaultValue: 'Remember your password?' })}{' '}
            <Link to="/login" className="link-primary">
              {t('auth.common.signIn', { defaultValue: 'Sign in' })}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
