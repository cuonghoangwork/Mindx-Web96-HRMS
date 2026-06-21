import { useNavigate } from 'react-router-dom'

function LoginSuccessful() {
  const navigate = useNavigate()

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
        boxShadow: 'var(--shadow)',
        textAlign: 'center'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(34, 197, 94, 0.1)',
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto 24px',
          fontSize: '40px'
        }}>
          ✓
        </div>
        
        <h1 style={{ marginBottom: '8px' }}>Success!</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
          You have successfully signed in to your account.
        </p>

        <button 
          className="btn btn-primary" 
          style={{ width: '100%' }}
          onClick={() => navigate('/dashboard')}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}

export default LoginSuccessful
