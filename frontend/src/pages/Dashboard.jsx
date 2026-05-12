import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AdminDashboard from './dashboards/AdminDashboard';
import StudentDashboard from './dashboards/StudentDashboard';

const Dashboard = () => {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  switch (profile.role) {
    case 'super_admin':
      return <Navigate to="/superadmin/schools" replace />;
    case 'admin':
    case 'school_admin':
      return <AdminDashboard />;
    case 'teacher':
      return <Navigate to="/teacher/dashboard" replace />;
    case 'finance_manager':
      return <Navigate to="/finance" replace />;
    case 'student':
      return <StudentDashboard />;
    default:
      return <div>Rôle non reconnu</div>;
  }
};

export default Dashboard;
