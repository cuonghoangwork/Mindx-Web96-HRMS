function Candidates() {
  const candidates = [
    { id: 1, name: 'Mike Wilson', role: 'Software Engineer', stage: 'Interview', rating: 4.5 },
    { id: 2, name: 'Sarah Lee', role: 'Product Designer', stage: 'Screening', rating: 4.0 },
    { id: 3, name: 'Tom Brown', role: 'DevOps Engineer', stage: 'Offer', rating: 4.8 },
  ]

  return (
    <div className="content-card">
      <h2>Candidates</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: '12px' }}>
        Manage job applicants and hiring pipeline.
      </p>
      
      <div style={{ marginTop: '24px' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Stage</th>
              <th>Rating</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map(candidate => (
              <tr key={candidate.id}>
                <td>{candidate.name}</td>
                <td>{candidate.role}</td>
                <td>
                  <span className="tag tag-purple">{candidate.stage}</span>
                </td>
                <td>{'★'.repeat(Math.floor(candidate.rating))} {candidate.rating}</td>
                <td>
                  <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '12px' }}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Candidates
