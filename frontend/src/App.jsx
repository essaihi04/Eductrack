import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { YearProvider } from './contexts/YearContext';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import YearSelectionPage from './pages/YearSelectionPage';
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
import PedagogicalDirectorsPage from './pages/admin/PedagogicalDirectorsPage';
import PedagogicalManagersPage from './pages/admin/PedagogicalManagersPage';
import ReceptionistsPage from './pages/admin/ReceptionistsPage';
import FinanceShell from './pages/finance/FinanceShell';
import FinanceDashboard from './pages/finance/FinanceDashboard';
import FeeTemplatesPage from './pages/finance/FeeTemplatesPage';
import InvoicesPage from './pages/finance/InvoicesPage';
import PaymentsPage from './pages/finance/PaymentsPage';
import OverduePage from './pages/finance/OverduePage';
import FinanceStudentsPage from './pages/finance/FinanceStudentsPage';
import ExpensesPage from './pages/finance/ExpensesPage';
import CashRegisterPage from './pages/finance/CashRegisterPage';
import ReportsPage from './pages/finance/ReportsPage';
import ChartOfAccountsPage from './pages/finance/ChartOfAccountsPage';
import BudgetPage from './pages/finance/BudgetPage';
import PrevisionnelMatrixPage from './pages/finance/PrevisionnelMatrixPage';
import PayrollPage from './pages/finance/PayrollPage';
import LoansPage from './pages/finance/LoansPage';
import TaxesPage from './pages/finance/TaxesPage';
import BankImportPage from './pages/finance/BankImportPage';
import InscriptionsDashboardPage from './pages/finance/inscriptions/InscriptionsDashboardPage';
import InscriptionsStudentsPage from './pages/finance/inscriptions/InscriptionsStudentsPage';
import InscriptionsReinscriptionPage from './pages/finance/inscriptions/InscriptionsReinscriptionPage';
import TransportDashboard from './pages/transport/TransportDashboard';
import BusesPage from './pages/transport/BusesPage';
import BusDetailPage from './pages/transport/BusDetailPage';
import LiveMapPage from './pages/transport/LiveMapPage';
import TransportManagersPage from './pages/transport/TransportManagersPage';
import TransportStatsPage from './pages/transport/TransportStatsPage';
import DriversPage from './pages/transport/DriversPage';
import ParentTransportPage from './pages/parent/TransportPage';
import ParentDashboard from './pages/parent/ParentDashboard';
import ParentChildPage from './pages/parent/ParentChildPage';
import ParentNotificationsPage from './pages/parent/ParentNotificationsPage';
import DriverDashboard from './pages/driver/DriverDashboard';
import ActiveTripPage from './pages/driver/ActiveTripPage';
import SchoolYearConfigPage from './pages/admin/SchoolYearConfigPage';
import ReinscriptionPage from './pages/admin/ReinscriptionPage';
import TeacherTrackingDashboard from './pages/admin/TeacherTrackingDashboard';
import CoefficientsPage from './pages/admin/CoefficientsPage';
import BulletinsPage from './pages/admin/BulletinsPage';
import ExamNotesPage from './pages/admin/ExamNotesPage';
import ClassNotesPage from './pages/admin/ClassNotesPage';
import AppreciationsPage from './pages/teacher/AppreciationsPage';
import ParentBulletinsPage from './pages/parent/ParentBulletinsPage';
import ParentFinancePage from './pages/parent/ParentFinancePage';
import ParentSignalementsPage from './pages/parent/ParentSignalementsPage';
import ApprovalsPage from './pages/ApprovalsPage';
import StudentBulletins from './pages/student/StudentBulletins';
import ParascolairePage from './pages/school-life/ParascolairePage';
import CahierDeViePage from './pages/school-life/CahierDeViePage';
import ObjetsPerdusPage from './pages/school-life/ObjetsPerdusPage';
import SondagesPage from './pages/school-life/SondagesPage';
import SignalementsPage from './pages/school-life/SignalementsPage';

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
      <YearProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* Choix de l'année scolaire après connexion (plein écran, façon Koolskools) */}
          <Route path="/select-year" element={<ProtectedRoute><YearSelectionPage /></ProtectedRoute>} />
          {/* Routes chauffeur — interface mobile dédiée, hors layout standard */}
          <Route path="/driver" element={<ProtectedRoute><DriverDashboard /></ProtectedRoute>} />
          <Route path="/driver/trip/:id" element={<ProtectedRoute><ActiveTripPage /></ProtectedRoute>} />
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
            <Route path="teacher-tracking" element={<TeacherTrackingDashboard />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="cahier-de-texte" element={<CahierDeTexte />} />
            <Route path="whatsapp" element={<WhatsAppPage />} />
            <Route path="finance" element={<FinanceShell />}>
              <Route index element={<FinanceDashboard />} />
              <Route path="fee-templates" element={<FeeTemplatesPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="overdue" element={<OverduePage />} />
              <Route path="students" element={<FinanceStudentsPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="cash-register" element={<CashRegisterPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="chart" element={<ChartOfAccountsPage />} />
              <Route path="budget" element={<BudgetPage />} />
              <Route path="previsionnel" element={<PrevisionnelMatrixPage />} />
              <Route path="payroll" element={<PayrollPage />} />
              <Route path="loans" element={<LoansPage />} />
              <Route path="taxes" element={<TaxesPage />} />
              <Route path="bank" element={<BankImportPage />} />
              <Route path="inscriptions" element={<InscriptionsDashboardPage />} />
              <Route path="inscriptions/eleves" element={<InscriptionsStudentsPage />} />
              <Route path="inscriptions/reinscription" element={<InscriptionsReinscriptionPage />} />
            </Route>
            <Route path="admin/finance-managers" element={<FinanceManagersPage />} />
            <Route path="admin/pedagogical-managers" element={<PedagogicalManagersPage />} />
            <Route path="admin/pedagogical-directors" element={<PedagogicalDirectorsPage />} />
            <Route path="admin/receptionists" element={<ReceptionistsPage />} />
            <Route path="admin/school-year-config" element={<SchoolYearConfigPage />} />
            <Route path="admin/reinscription" element={<ReinscriptionPage />} />
            <Route path="admin/coefficients" element={<CoefficientsPage />} />
            <Route path="admin/bulletins" element={<BulletinsPage />} />
            <Route path="admin/exam-notes" element={<ExamNotesPage />} />
            <Route path="admin/class-notes" element={<ClassNotesPage />} />
            <Route path="transport" element={<TransportDashboard />} />
            <Route path="transport/buses" element={<BusesPage />} />
            <Route path="transport/buses/:id" element={<BusDetailPage />} />
            <Route path="transport/live" element={<LiveMapPage />} />
            <Route path="transport/managers" element={<TransportManagersPage />} />
            <Route path="transport/drivers" element={<DriversPage />} />
            <Route path="transport/stats" element={<TransportStatsPage />} />
            <Route path="transport/history" element={<TransportStatsPage />} />
            <Route path="school-life/parascolaire" element={<ParascolairePage />} />
            <Route path="school-life/cahier-de-vie" element={<CahierDeViePage />} />
            <Route path="school-life/objets-perdus" element={<ObjetsPerdusPage />} />
            <Route path="school-life/sondages" element={<SondagesPage />} />
            <Route path="school-life/signalements" element={<SignalementsPage />} />
            <Route path="parent" element={<ParentDashboard />} />
            <Route path="parent/children/:childId" element={<ParentChildPage />} />
            <Route path="parent/notifications" element={<ParentNotificationsPage />} />
            <Route path="parent/transport" element={<ParentTransportPage />} />
            <Route path="parent/bulletins" element={<ParentBulletinsPage />} />
            <Route path="parent/finance" element={<ParentFinancePage />} />
            <Route path="parent/signalements" element={<ParentSignalementsPage />} />
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
            <Route path="teacher/appreciations" element={<AppreciationsPage />} />
            <Route path="teacher/cahier-de-texte" element={<CahierDeTexte />} />
            <Route path="student/timetable" element={<StudentTimetable />} />
            <Route path="student/documents" element={<StudentDocuments />} />
            <Route path="my-assignments" element={<StudentHomework />} />
            <Route path="my-grades" element={<StudentGrades />} />
            <Route path="student/level" element={<StudentLevel />} />
            <Route path="student/badges" element={<StudentBadges />} />
            <Route path="student/bulletins" element={<StudentBulletins />} />
            <Route path="profile" element={<StudentProfilePage />} />
            <Route path="superadmin/schools" element={<SchoolsListPage />} />
            <Route path="superadmin/schools/:schoolId" element={<SchoolDetailPage />} />
            <Route path="superadmin/compare" element={<SchoolComparisonPage />} />
            <Route path="superadmin/audit" element={<AuditLogPage />} />
            <Route path="" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </Router>
      </YearProvider>
    </AuthProvider>
  );
}

export default App;
