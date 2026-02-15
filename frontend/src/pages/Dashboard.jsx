import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AdminDashboard from './dashboards/AdminDashboard';
import StudentDashboard from './dashboards/StudentDashboard';

const Dashboard = () => {
  const { profile } = useAuth();

  if (!profile) {
    return <div>Chargement...</div>;
  }

  switch (profile.role) {
    case 'super_admin':
      return <Navigate to="/superadmin/schools" replace />;
    case 'admin':
    case 'school_admin':
      return <AdminDashboard />;
    case 'teacher':
      return <Navigate to="/teacher/dashboard" replace />;
    case 'student':
      return <StudentDashboard />;
    default:
      return <div>Rôle non reconnu</div>;
  }
};

export default Dashboard;
