import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function EnterOTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    // Demo - redirect to success page
    alert('OTP verified! (Demo)')
    navigate('/login-successful')
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
        <h1 style={{ textAlign: 'center', marginBottom: '8px' }}>Enter OTP</h1>
        <p style={{ 
          textAlign: 'center', 
          color: 'var(--text-muted)', 
          marginBottom: '32px' 
        }}>
          Enter the 6-digit code sent to your email
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="otp">Verification Code</label>
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

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            Verify
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--text-muted)' }}>
          Didn't receive the code?{' '}
          <button style={{ 
            color: 'var(--primary)', 
            background: 'none', 
            border: 'none', 
            cursor: 'pointer',
            fontSize: '14px'
          }}>
            Resend
          </button>
        </p>
      </div>
    </div>
  )
}

export default EnterOTP
