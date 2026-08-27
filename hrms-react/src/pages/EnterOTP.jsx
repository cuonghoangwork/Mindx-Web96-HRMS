import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import Button from "../components/Button";
import AuthBrandPanel from "../components/AuthBrandPanel";
import AuthThemeToggle from "../components/AuthThemeToggle";

function EnterOTP() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [otp, setOtp] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    // Demo - redirect to success page
    alert(t('auth.enterOtp.demoAlert', { defaultValue: 'OTP verified! (Demo)' }))
    navigate('/login-successful')
  }

  return (
    <div className="login-page">
      <AuthBrandPanel />

      <div className="login-form-panel">
        <AuthThemeToggle />

        <div className="login-card">
          <div className="login-header">
            <h1>{t('auth.enterOtp.heading', { defaultValue: 'Enter OTP' })}</h1>
          </div>
          <p className="login-subtitle">{t('auth.enterOtp.subtitle', { defaultValue: 'Enter the 6-digit code sent to your email' })}</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="otp">{t('auth.enterOtp.codeLabel', { defaultValue: 'Verification Code' })}</label>
              <input
                type="text"
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                maxLength="6"
                required
                style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px' }}
              />
            </div>

            <Button variant="primary" type="submit" style={{ width: '100%' }}>
              {t('auth.enterOtp.submitButton', { defaultValue: 'Verify' })}
            </Button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--txt-secondary)' }}>
            {t('auth.enterOtp.noCodePrefix', { defaultValue: "Didn't receive the code?" })}{' '}
            <button type="button" className="link-primary" style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontFamily: 'inherit',
            }}>
              {t('auth.enterOtp.resendButton', { defaultValue: 'Resend' })}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default EnterOTP
