import { useNavigate } from 'react-router-dom'
import Button from "../components/Button";
import AuthBrandPanel from "../components/AuthBrandPanel";
import AuthThemeToggle from "../components/AuthThemeToggle";

function LoginSuccessful() {
  const navigate = useNavigate()

  return (
    <div className="login-page">
      <AuthBrandPanel />

      <div className="login-form-panel">
        <AuthThemeToggle />

        <div className="login-card" style={{ textAlign: 'center' }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'var(--bg-success-subtle)',
            border: '2px solid var(--bdr-success)',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 24px',
            color: 'var(--txt-success)',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>

          <div className="login-header">
            <h1>Success!</h1>
          </div>
          <p className="login-subtitle" style={{ marginBottom: 'var(--sp-6)' }}>
            You have successfully signed in to your account.
          </p>

          <Button
            variant="primary"
            style={{ width: '100%' }}
            onClick={() => navigate('/dashboard')}
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}

export default LoginSuccessful
