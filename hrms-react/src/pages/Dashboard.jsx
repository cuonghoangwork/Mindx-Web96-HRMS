import { useAuth } from "../context/AuthContext";
import { AdminDashboard } from './dashboard/AdminDashboard'
import { SelfServiceDashboard } from './dashboard/SelfServiceDashboard'

/* HR + Admin get the org-wide dashboard; MANAGER + EMPLOYEE the self-service one. */
function Dashboard() {
  const { isHRTier } = useAuth();
  return isHRTier ? <AdminDashboard /> : <SelfServiceDashboard />;
}

export default Dashboard;
