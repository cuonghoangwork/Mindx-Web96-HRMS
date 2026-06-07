import { useStore } from "../context/StoreContext";
import Badge from "../components/Badge";

const attendanceVariant = (s) =>
  ({ Present: "success", Late: "warning", "On Leave": "info" })[s] ?? "danger";

function formatTime(value) {
  if (!value) return "—";
  const [hours, minutes] = value.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${h}:${String(minutes).padStart(2, "0")} ${period}`;
}

function Attendance() {
  const { attendance, employees } = useStore();

  const rows = attendance.map((record) => {
    const employee = employees.find((e) => e.id === record.employeeId);

    // Determine if employee is late (check-in after 9:00 AM)
    let status = record.status;
    if (record.checkIn && status === "Present") {
      const [hours] = record.checkIn.split(":").map(Number);
      if (hours >= 9) {
        status = "Late";
      }
    }

    return {
      ...record,
      name: employee?.name ?? `Employee #${record.employeeId}`,
      status,
    };
  });

  const presentCount = rows.filter((r) => r.status === "Present").length;
  const lateCount = rows.filter((r) => r.status === "Late").length;
  const leaveCount = rows.filter((r) => r.status === "On Leave").length;
  const absentCount = rows.length - presentCount - lateCount - leaveCount;

  return (
    <div className="content-card">
      <div className="page-intro">
        <div>
          <h2>Attendance</h2>
          <p className="text-muted">
            Track check-in, check-out, and status for today&apos;s roster.
          </p>
        </div>
        <div className="attendance-summary">
          <Badge variant="success" dot>
            {presentCount} present
          </Badge>
          {lateCount > 0 && (
            <Badge variant="warning" dot>
              {lateCount} late
            </Badge>
          )}
          {leaveCount > 0 && (
            <Badge variant="info" dot>
              {leaveCount} on leave
            </Badge>
          )}
          {absentCount > 0 && (
            <Badge variant="danger" dot>
              {absentCount} absent
            </Badge>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3 className="empty-state-title">No attendance records</h3>
          <p className="empty-state-description">
            Attendance records will appear here as employees check in and out.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.employeeId}-${row.date}`}>
                  <td>{row.name}</td>
                  <td>{row.date}</td>
                  <td>{formatTime(row.checkIn)}</td>
                  <td>{formatTime(row.checkOut)}</td>
                  <td>
                    <Badge variant={attendanceVariant(row.status)}>
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Attendance;
