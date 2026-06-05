function Notifications() {
  const notifications = [
    { id: 1, title: 'New leave request', message: 'John Doe requested 3 days off', time: '2 hours ago', unread: true },
    { id: 2, title: 'Interview scheduled', message: 'Candidate interview for Design role', time: '5 hours ago', unread: true },
    { id: 3, title: 'Payroll processed', message: 'January payroll has been processed', time: '1 day ago', unread: false },
    { id: 4, title: 'New employee added', message: 'Sarah Smith has joined the team', time: '2 days ago', unread: false },
  ]

  return (
    <div className="content-card">
      <div className="toolbar">
        <h2 style={{ flex: 1 }}>Notifications</h2>
        <button className="btn btn-secondary">Mark all as read</button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {notifications.map(notification => (
          <div key={notification.id} style={{
            padding: '16px 20px',
            background: notification.unread ? 'var(--surface-alt)' : 'transparent',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              {notification.unread && (
                <span style={{
                  width: '8px',
                  height: '8px',
                  background: 'var(--primary)',
                  borderRadius: '50%',
                  marginTop: '6px',
                  flexShrink: 0
                }}></span>
              )}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '500' }}>{notification.title}</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {notification.message}
                </p>
              </div>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
              {notification.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Notifications
