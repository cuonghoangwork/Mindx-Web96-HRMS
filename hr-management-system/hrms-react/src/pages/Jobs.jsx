function Jobs() {
  const jobs = [
    { id: 1, title: 'Senior Software Engineer', department: 'Engineering', location: 'Remote', status: 'Open', applicants: 12 },
    { id: 2, title: 'UI/UX Designer', department: 'Design', location: 'New York', status: 'Open', applicants: 8 },
    { id: 3, title: 'Product Manager', department: 'Product', location: 'San Francisco', status: 'Filled', applicants: 24 },
  ]

  return (
    <div className="content-card">
      <div className="toolbar">
        <h2 style={{ flex: 1 }}>Job Openings</h2>
        <button className="btn btn-primary">+ Post New Job</button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {jobs.map(job => (
          <div key={job.id} style={{
            padding: '20px',
            background: 'var(--surface-alt)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{job.title}</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {job.department} • {job.location}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className={`tag tag-${job.status === 'Open' ? 'green' : 'purple'}`}>
                {job.status}
              </span>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px' }}>
                {job.applicants} applicants
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Jobs
