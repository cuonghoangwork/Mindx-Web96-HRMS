function Holidays() {
  const holidays = [
    { id: 1, name: 'New Year\'s Day', date: '2024-01-01', type: 'Public' },
    { id: 2, name: 'Martin Luther King Jr. Day', date: '2024-01-15', type: 'Public' },
    { id: 3, name: 'Presidents\' Day', date: '2024-02-19', type: 'Public' },
    { id: 4, name: 'Memorial Day', date: '2024-05-27', type: 'Public' },
    { id: 5, name: 'Independence Day', date: '2024-07-04', type: 'Public' },
  ]

  return (
    <div className="content-card">
      <div className="toolbar">
        <h2 style={{ flex: 1 }}>Holidays 2024</h2>
        <button className="btn btn-primary">+ Add Holiday</button>
      </div>
      
      <table className="data-table">
        <thead>
          <tr>
            <th>Holiday Name</th>
            <th>Date</th>
            <th>Type</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {holidays.map(holiday => (
            <tr key={holiday.id}>
              <td>{holiday.name}</td>
              <td>{holiday.date}</td>
              <td>
                <span className="tag tag-green">{holiday.type}</span>
              </td>
              <td>
                <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '12px' }}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Holidays
