import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import DashboardLayout from './components/Layout/DashboardLayout';
import StudentsPage from './pages/admin/StudentsPage';
import TeachersPage from './pages/admin/TeachersPage';
import ClassesPage from './pages/admin/ClassesPage';
import SubjectsPage from './pages/admin/SubjectsPage';
import ParentsPage from './pages/admin/ParentsPage';
import StatsPage from './pages/admin/StatsPage';
import BehaviorDashboard from './pages/dashboards/BehaviorDashboard';
import TeacherHome from './pages/teacher/TeacherHome';
import SuiviRapide from './pages/teacher/SuiviRapide';
import SuiviSeance from './pages/teacher/SuiviSeance';
import SessionTracking from './pages/teacher/SessionTracking';
import ControlTracking from './pages/teacher/ControlTracking';
import MiniAssessments from './pages/teacher/MiniAssessments';
import LessonPlan from './pages/teacher/LessonPlan';
import StudentProfile from './pages/teacher/StudentProfile';
import ClassMetricsDashboard from './pages/teacher/ClassMetricsDashboard';
import StudentDashboard from './pages/teacher/StudentDashboard';
import StudentProfilePage from './pages/student/StudentProfile';
import Devoirs from './pages/teacher/Devoirs';
import StudentHomework from './pages/student/StudentHomework';
import StudentDocuments from './pages/student/StudentDocuments';
import Planificateur from './pages/teacher/Planificateur';
import ControlsPage from './pages/teacher/ControlsPage';
import CalendrierClasse from './pages/teacher/CalendrierClasse';
import CahierDeTexte from './pages/teacher/CahierDeTexte';
import DocumentsPage from './pages/teacher/DocumentsPage';
import StudentBadges from './pages/student/StudentBadges';
import StudentLevel from './pages/student/StudentLevel';
import StudentGrades from './pages/student/StudentGrades';
import TimetablePage from './pages/admin/TimetablePage';
import StudentTimetable from './pages/student/StudentTimetable';
import SchoolsListPage from './pages/superadmin/SchoolsListPage';
import SchoolDetailPage from './pages/superadmin/SchoolDetailPage';
import SchoolComparisonPage from './pages/superadmin/SchoolComparisonPage';
import AuditLogPage from './pages/superadmin/AuditLogPage';
import WhatsAppPage from './pages/admin/WhatsAppPage';
import FinanceManagersPage from './pages/admin/FinanceManagersPage';
import FinanceDashboard from './pages/finance/FinanceDashboard';
import FeeTemplatesPage from './pages/finance/FeeTemplatesPage';
import InvoicesPage from './pages/finance/InvoicesPage';
import PaymentsPage from './pages/finance/PaymentsPage';
import OverduePage from './pages/finance/OverduePage';
import FinanceStudentsPage from './pages/finance/FinanceStudentsPage';
import ExpensesPage from './pages/finance/ExpensesPage';

const ProtectedRoute = ({ children }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Rediriger vers login si pas d'utilisateur OU pas de profil
  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="behavior" element={<BehaviorDashboard />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="teachers" element={<TeachersPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="classes/:classId/timetable" element={<TimetablePage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="parents" element={<ParentsPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="cahier-de-texte" element={<CahierDeTexte />} />
            <Route path="whatsapp" element={<WhatsAppPage />} />
            <Route path="finance" element={<FinanceDashboard />} />
            <Route path="finance/fee-templates" element={<FeeTemplatesPage />} />
            <Route path="finance/invoices" element={<InvoicesPage />} />
            <Route path="finance/payments" element={<PaymentsPage />} />
            <Route path="finance/overdue" element={<OverduePage />} />
            <Route path="finance/students" element={<FinanceStudentsPage />} />
            <Route path="finance/expenses" element={<ExpensesPage />} />
            <Route path="admin/finance-managers" element={<FinanceManagersPage />} />
            <Route path="admin/pedagogical-directors" element={<PedagogicalDirectorsPage />} />
            <Route path="messages/send" element={<Navigate to="/whatsapp" replace />} />
            <Route path="messages/inbox" element={<Navigate to="/whatsapp" replace />} />
            <Route path="messages/connect" element={<Navigate to="/whatsapp" replace />} />
            <Route path="teacher/home" element={<TeacherHome />} />
            <Route path="teacher/rapide" element={<SuiviRapide />} />
            <Route path="teacher/suivi" element={<SuiviSeance />} />
            <Route path="teacher/session/:classId/:sessionId" element={<SessionTracking />} />
            <Route path="teacher/control/:classId/:sessionId" element={<ControlTracking />} />
            <Route path="teacher/assessments/:classId/:sessionId" element={<MiniAssessments />} />
            <Route path="teacher/calendar/:classId" element={<LessonPlan />} />
            <Route path="teacher/student/:studentId" element={<StudentProfile />} />
            <Route path="teacher/dashboard" element={<ClassMetricsDashboard />} />
            <Route path="teacher/student/:studentId/dashboard" element={<StudentDashboard />} />
            <Route path="teacher/devoirs" element={<Devoirs />} />
            <Route path="teacher/planificateur" element={<Planificateur />} />
            <Route path="teacher/controls" element={<ControlsPage />} />
            <Route path="teacher/calendrier-classe" element={<CalendrierClasse />} />
            <Route path="teacher/documents" element={<DocumentsPage />} />
            <Route path="teacher/cahier-de-texte" element={<CahierDeTexte />} />
            <Route path="student/timetable" element={<StudentTimetable />} />
            <Route path="student/documents" element={<StudentDocuments />} />
            <Route path="my-assignments" element={<StudentHomework />} />
            <Route path="my-grades" element={<StudentGrades />} />
            <Route path="student/level" element={<StudentLevel />} />
            <Route path="student/badges" element={<StudentBadges />} />
            <Route path="profile" element={<StudentProfilePage />} />
            <Route path="superadmin/schools" element={<SchoolsListPage />} />
            <Route path="superadmin/schools/:schoolId" element={<SchoolDetailPage />} />
            <Route path="superadmin/compare" element={<SchoolComparisonPage />} />
            <Route path="superadmin/audit" element={<AuditLogPage />} />
            <Route path="" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
