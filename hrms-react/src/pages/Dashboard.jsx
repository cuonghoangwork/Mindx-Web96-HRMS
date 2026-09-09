import { useAuth } from "../context/AuthContext";
import { AdminDashboard } from './dashboard/AdminDashboard'
import { SelfServiceDashboard } from './dashboard/SelfServiceDashboard'

/* ═══════════════════════════════════════════
   DASHBOARD — role-aware entry point (8.0e)
   HR + Admin (isHRTier — both are company-wide, see AuthContext) get the
   full org-wide dashboard below. Manager + Employee get the compact
   self-service variant (My Leave, upcoming holidays, and for Manager a
   client-side department-scoped team strip).
═══════════════════════════════════════════ */
function Dashboard() {
  const { isHRTier } = useAuth();
  return isHRTier ? <AdminDashboard /> : <SelfServiceDashboard />;
}

export default Dashboard;
