import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, GraduationCap, BookOpen, TrendingUp, AlertCircle, CheckCircle, 
  X, FileText, UserCheck, AlertTriangle,
  Eye, Calendar, ChevronRight, Activity,
  Phone, Moon, RefreshCw, UserPlus,
  School, ClipboardList, TrendingDown, Zap
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import FinanceSummaryCard from '../../components/dashboard/FinanceSummaryCard';

const getStatusColor = (value, thresholds) => {
  if (value >= thresholds.good) return 'green';
  if (value >= thresholds.warning) return 'orange';
  return 'red';
};

const StatusBadge = ({ status, size = 'sm' }) => {
  const colors = {
    green: 'bg-green-100 text-green-800 border-green-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    gray: 'bg-gray-100 text-gray-800 border-gray-200'
  };
  const labels = { green: 'OK', orange: 'Attention', red: 'Critique', gray: 'N/A' };
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  
  return (
    <span className={`${colors[status]} ${sizeClass} rounded-full border font-medium`}>
      {labels[status]}
    </span>
  );
};

const KPICard = ({ icon: Icon, title, value, subtitle, status, onClick, trend }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.02, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}
    transition={{ duration: 0.2 }}
    onClick={onClick}
    className="cursor-pointer"
  >
    <Card className={`relative overflow-hidden border-l-4 ${
      status === 'green' ? 'border-l-green-500' : 
      status === 'orange' ? 'border-l-orange-500' : 
      status === 'red' ? 'border-l-red-500' : 'border-l-gray-300'
    }`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-5 h-5 ${
                status === 'green' ? 'text-green-600' : 
                status === 'orange' ? 'text-orange-600' : 
                status === 'red' ? 'text-red-600' : 'text-gray-500'
              }`} />
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
            </div>
            <h3 className="text-3xl font-bold mt-2">{value}</h3>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-muted-foreground">{subtitle}</p>
              {trend && (
                <span className={`text-xs flex items-center gap-1 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {Math.abs(trend)}%
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={status} />
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

const SidePanel = ({ isOpen, onClose, title, children }) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black z-40"
          onClick={onClose}
        />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed right-0 top-0 h-full w-full max-w-lg bg-background border-l shadow-2xl z-50 overflow-y-auto"
        >
          <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between z-10">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

const ActionButton = ({ icon: Icon, label, onClick, variant = 'default', size = 'sm' }) => {
  const variants = {
    default: 'bg-primary/10 text-primary hover:bg-primary/20',
    success: 'bg-green-100 text-green-700 hover:bg-green-200',
    warning: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
    danger: 'bg-red-100 text-red-700 hover:bg-red-200',
    info: 'bg-blue-100 text-blue-700 hover:bg-blue-200'
  };
  
  return (
    <button
      onClick={onClick}
      className={`${variants[variant]} ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} rounded-lg font-medium flex items-center gap-2 transition-colors`}
    >
      <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      {label}
    </button>
  );
};

const PriorityAlert = ({ alert, onAction }) => {
  const levelColors = {
    critical: 'border-l-red-500 bg-red-50',
    warning: 'border-l-orange-500 bg-orange-50',
    info: 'border-l-blue-500 bg-blue-50'
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`p-4 rounded-lg border-l-4 ${levelColors[alert.level] || levelColors.info} mb-3`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={`w-4 h-4 ${
              alert.level === 'critical' ? 'text-red-600' : 
              alert.level === 'warning' ? 'text-orange-600' : 'text-blue-600'
            }`} />
            <span className="font-medium text-sm">{alert.title}</span>
          </div>
          <p className="text-xs text-muted-foreground">{alert.description}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {alert.actions?.map((action, idx) => (
            <ActionButton
              key={idx}
              icon={action.icon}
              label={action.label}
              variant={action.variant}
              onClick={() => onAction(action)}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

const AdminDashboard = () => {
  const { user, profile } = useAuth();
  const { year } = useYear();
  const yearQS = year ? `?academic_year=${encodeURIComponent(year)}` : '';
  const isPedagogical = profile?.role === 'pedagogical_director' || profile?.role === 'pedagogical_manager';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [dashboardData, setDashboardData] = useState({
    kpis: {
      studentAttendance: { value: 0, total: 0, absentCount: 0, absentStudents: [], absent: [] },
      teacherAttendance: { value: null, total: 0, scheduledCount: 0, presentCount: 0, absentCount: 0, hoursTaught: 0, expectedSlots: 0, realizedSlots: 0, absentTeachers: [], absent: [] },
      uncorrectedHomework: { value: 0, teacherCount: 0, teachers: [] },
      behaviorAlerts: { value: 0, studentCount: 0, details: {}, students: [] },
      classesWithoutCourse: { value: 0, classes: [] },
      cahierAbsent: { value: 0, students: [] },
      homeworkMissing: { value: 0, students: [] }
    },
    priorities: [],
    classes: [],
    teachers: [],
    trends: {
      attendance: [],
      homework: [],
      incidents: [],
      averages: []
    }
  });
  
  const [activePanel, setActivePanel] = useState(null);
  const [panelData, setPanelData] = useState(null);
  const [dashboardTab, setDashboardTab] = useState('overview');
  const [timetableData, setTimetableData] = useState(null);
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [rankingData, setRankingData] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const navigate = useNavigate();

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getToken = useCallback(async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  }, []);

  const getActionsForPriority = (type) => {
    const actionMap = {
      attendance: [
        { icon: Eye, label: 'Voir détails', variant: 'info', action: 'view-absent-students' }
      ],
      homework: [
        { icon: Eye, label: 'Voir détails', variant: 'info', action: 'view-uncorrected' }
      ],
      'homework-student': [
        { icon: Eye, label: 'Voir élèves', variant: 'info', action: 'view-homework-missing' }
      ],
      behavior: [
        { icon: Eye, label: 'Voir élèves', variant: 'info', action: 'view-behavior' }
      ],
      cahier: [
        { icon: Eye, label: 'Voir élèves', variant: 'info', action: 'view-cahier-missing' }
      ],
      schedule: [
        { icon: Eye, label: 'Voir créneaux', variant: 'info', action: 'view-schedule' }
      ]
    };
    return actionMap[type] || [];
  };

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const token = await getToken();
      if (!token) throw new Error('No token');

      const headers = { 'Authorization': `Bearer ${token}` };

      // Try the optimized dashboard endpoint first
      let data = null;
      try {
        const dashboardRes = await fetch(`${apiUrl}/api/admin/dashboard${yearQS}`, { headers });
        if (dashboardRes.ok) {
          data = await dashboardRes.json();
        }
      } catch (e) {
        console.log('Dashboard endpoint not available, falling back to individual calls');
      }

      if (data) {
        // Use data from optimized endpoint
        const priorities = (data.priorities || []).map(p => ({
          ...p,
          actions: getActionsForPriority(p.type)
        }));

        setDashboardData({
          kpis: {
            studentAttendance: { 
              value: data.kpis?.studentAttendance?.value ?? null, 
              total: data.kpis?.studentAttendance?.total || 0, 
              absentCount: data.kpis?.studentAttendance?.absentCount || 0,
              absentStudents: data.kpis?.studentAttendance?.absentStudents || [],
              absent: [] 
            },
            teacherAttendance: {
              value: data.kpis?.teacherAttendance?.value ?? null,
              total: data.kpis?.teacherAttendance?.total || 0,
              scheduledCount: data.kpis?.teacherAttendance?.scheduledCount || 0,
              presentCount: data.kpis?.teacherAttendance?.presentCount || 0,
              absentCount: data.kpis?.teacherAttendance?.absentCount || 0,
              hoursTaught: data.kpis?.teacherAttendance?.hoursTaught || 0,
              expectedSlots: data.kpis?.teacherAttendance?.expectedSlots || 0,
              realizedSlots: data.kpis?.teacherAttendance?.realizedSlots || 0,
              absentTeachers: data.kpis?.teacherAttendance?.absentTeachers || [],
              absent: []
            },
            uncorrectedHomework: { 
              value: data.kpis?.uncorrectedHomework?.value || 0, 
              teacherCount: data.kpis?.uncorrectedHomework?.teacherCount || 0,
              teachers: data.kpis?.uncorrectedHomework?.teachers || []
            },
            behaviorAlerts: { 
              value: data.kpis?.behaviorAlerts?.value || 0, 
              studentCount: data.kpis?.behaviorAlerts?.studentCount || 0,
              details: data.kpis?.behaviorAlerts?.details || {},
              students: data.kpis?.behaviorAlerts?.students || []
            },
            classesWithoutCourse: { 
              value: data.kpis?.classesWithoutCourse?.value || 0, 
              classes: data.kpis?.classesWithoutCourse?.classes || [] 
            },
            cahierAbsent: {
              value: data.kpis?.cahierAbsent?.value || 0,
              students: data.kpis?.cahierAbsent?.students || []
            },
            homeworkMissing: {
              value: data.kpis?.homeworkMissing?.value || 0,
              students: data.kpis?.homeworkMissing?.students || []
            }
          },
          priorities,
          classes: data.classes || [],
          teachers: data.teachers || [],
          trends: {
            attendance: (data.trends?.labels || []).map((label, i) => ({ 
              label, 
              value: data.trends?.attendance?.[i] ?? 0 
            })),
            homework: (data.trends?.labels || []).map((label, i) => ({ 
              label, 
              value: data.trends?.homework?.[i] ?? 0 
            })),
            incidents: (data.trends?.labels || []).map((label, i) => ({ 
              label, 
              value: data.trends?.incidents?.[i] ?? 0 
            })),
            averages: (data.trends?.labels || []).map((label, i) => ({ 
              label, 
              value: data.trends?.averages?.[i] ?? 0 
            }))
          }
        });
      } else {
        // Fallback to individual API calls
        const [statsRes, studentsRes, teachersRes, classesRes] = await Promise.all([
          fetch(`${apiUrl}/api/admin/stats${yearQS}`, { headers }),
          fetch(`${apiUrl}/api/admin/students`, { headers }),
          fetch(`${apiUrl}/api/admin/teachers`, { headers }),
          fetch(`${apiUrl}/api/admin/classes`, { headers })
        ]);

        const stats = await statsRes.json().catch(() => ({ totalStudents: 0, totalTeachers: 0, totalClasses: 0, attendanceRate: 0 }));
        const students = await studentsRes.json().catch(() => []);
        const teachers = await teachersRes.json().catch(() => []);
        const classes = await classesRes.json().catch(() => []);

        const rawAttendance = parseFloat(stats.attendanceRate);
        const studentAttendanceRate = isNaN(rawAttendance) ? null : rawAttendance;
        const hasStudents = (stats.totalStudents || 0) > 0;

        const classesData = (Array.isArray(classes) ? classes : []).map(cls => {
          const classStudents = (Array.isArray(students) ? students : []).filter(s => s.class_id === cls.id);
          return {
            ...cls,
            studentCount: classStudents.length,
            attendanceRate: null,
            homeworkPending: 0,
            status: 'gray'
          };
        });

        const teachersData = (Array.isArray(teachers) ? teachers : []).map(teacher => ({
          ...teacher,
          classCount: (Array.isArray(classes) ? classes : []).filter(c => c.teacher_id === teacher.id).length,
          homeworkLate: 0,
          status: 'green'
        }));

        setDashboardData({
          kpis: {
            studentAttendance: { value: studentAttendanceRate, total: stats.totalStudents || 0, absentCount: 0, absentStudents: [], absent: [] },
            teacherAttendance: { value: null, total: stats.totalTeachers || 0, scheduledCount: 0, presentCount: 0, absentCount: 0, hoursTaught: 0, expectedSlots: 0, realizedSlots: 0, absentTeachers: [], absent: [] },
            uncorrectedHomework: { value: 0, teacherCount: 0, teachers: [] },
            behaviorAlerts: { value: 0, studentCount: 0, details: {}, students: [] },
            classesWithoutCourse: { value: 0, classes: [] },
            cahierAbsent: { value: 0, students: [] },
            homeworkMissing: { value: 0, students: [] }
          },
          priorities: [],
          classes: classesData,
          teachers: teachersData,
          trends: {
            attendance: [],
            homework: [],
            incidents: [],
            averages: []
          }
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiUrl, getToken, yearQS]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => fetchDashboardData(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const fetchTimetableData = useCallback(async () => {
    setTimetableLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${apiUrl}/api/admin/dashboard/timetable-today`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTimetableData(data);
      }
    } catch (error) {
      console.error('Error fetching timetable:', error);
    } finally {
      setTimetableLoading(false);
    }
  }, [apiUrl, getToken]);

  useEffect(() => {
    if (dashboardTab === 'timetable' && !timetableData) {
      fetchTimetableData();
    }
  }, [dashboardTab, timetableData, fetchTimetableData]);

  const fetchRankingData = useCallback(async () => {
    setRankingLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${apiUrl}/api/admin/dashboard/class-ranking`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRankingData(data);
      }
    } catch (error) {
      console.error('Error fetching ranking:', error);
    } finally {
      setRankingLoading(false);
    }
  }, [apiUrl, getToken]);

  useEffect(() => {
    if (dashboardTab === 'ranking' && !rankingData) {
      fetchRankingData();
    }
  }, [dashboardTab, rankingData, fetchRankingData]);

  const openPanel = (panelType, data) => {
    setActivePanel(panelType);
    setPanelData(data);
  };

  const closePanel = () => {
    setActivePanel(null);
    setPanelData(null);
  };

  const handleAction = async (action) => {
    const actionType = action.action || action.label;
    
    switch (actionType) {
      case 'view-absent-students':
        openPanel('student-attendance', dashboardData.kpis.studentAttendance);
        break;
      case 'view-uncorrected':
        openPanel('uncorrected-homework', dashboardData.kpis.uncorrectedHomework);
        break;
      case 'view-behavior':
        openPanel('behavior-alerts', dashboardData.kpis.behaviorAlerts);
        break;
      case 'view-schedule':
        openPanel('classes-without-course', dashboardData.kpis.classesWithoutCourse);
        break;
      case 'view-homework-missing':
        openPanel('homework-missing', dashboardData.kpis.homeworkMissing);
        break;
      case 'view-cahier-missing':
        openPanel('cahier-absent', dashboardData.kpis.cahierAbsent);
        break;
      default:
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  const { kpis, priorities, classes, teachers, trends } = dashboardData;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <School className="w-7 h-7 text-primary" />
            Tour de Contrôle
          </h1>
          <p className="text-muted-foreground mt-1">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Button
          onClick={() => dashboardTab === 'timetable' ? fetchTimetableData() : dashboardTab === 'ranking' ? fetchRankingData() : fetchDashboardData(true)}
          variant="outline"
          className="flex items-center gap-2"
          disabled={refreshing || timetableLoading || rankingLoading}
        >
          <RefreshCw className={`w-4 h-4 ${(refreshing || timetableLoading || rankingLoading) ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setDashboardTab('overview')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${dashboardTab === 'overview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Activity className="w-4 h-4 inline mr-2" />Vue d'ensemble
        </button>
        <button
          onClick={() => setDashboardTab('timetable')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${dashboardTab === 'timetable' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Calendar className="w-4 h-4 inline mr-2" />Emploi du temps
        </button>
        <button
          onClick={() => setDashboardTab('ranking')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${dashboardTab === 'ranking' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <TrendingUp className="w-4 h-4 inline mr-2" />Classement
        </button>
      </div>

      {/* ==================== TIMETABLE TAB ==================== */}
      {dashboardTab === 'timetable' && (
        <div className="space-y-5">
          {timetableLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !timetableData || timetableData.classes?.length === 0 ? (
            <div className="text-center py-20">
              <Calendar className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Aucun emploi du temps configuré pour aujourd'hui</p>
              <p className="text-sm text-muted-foreground mt-1">Configurez l'emploi du temps des classes dans la section Classes</p>
            </div>
          ) : (() => {
            const tt = timetableData;
            const gs = tt.globalStats;
            const healthColor = (h) => h >= 80 ? 'text-emerald-600' : h >= 60 ? 'text-amber-500' : 'text-red-500';
            const healthBg = (h) => h >= 80 ? 'bg-emerald-50 border-emerald-200' : h >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
            const healthBar = (h) => h >= 80 ? 'bg-emerald-500' : h >= 60 ? 'bg-amber-500' : 'bg-red-500';
            const progressPct = gs.totalSlots > 0 ? Math.round((gs.trackedSlots / gs.totalSlots) * 100) : 0;

            return (
              <>
                {/* Global Stats Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
                    <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Jour</p>
                    <p className="text-xl font-bold text-blue-900 mt-1">{tt.dayLabel}</p>
                    <p className="text-xs text-blue-600 mt-0.5">{new Date(tt.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</p>
                  </div>
                  <div className="rounded-xl border bg-gradient-to-br from-purple-50 to-fuchsia-50 p-4">
                    <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">Créneaux suivis</p>
                    <p className="text-xl font-bold text-purple-900 mt-1">{gs.trackedSlots}/{gs.totalSlots}</p>
                    <div className="w-full bg-purple-200 rounded-full h-1.5 mt-2">
                      <div className="bg-purple-600 h-1.5 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                  <div className={`rounded-xl border p-4 ${gs.globalHealth != null ? healthBg(gs.globalHealth) : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Santé globale</p>
                    <p className={`text-3xl font-black mt-1 ${gs.globalHealth != null ? healthColor(gs.globalHealth) : 'text-gray-400'}`}>
                      {gs.globalHealth != null ? `${gs.globalHealth}%` : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
                    <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Classes complètes</p>
                    <p className="text-xl font-bold text-emerald-900 mt-1">{gs.classesFullyTracked}/{gs.classesWithTimetable}</p>
                    <p className="text-xs text-emerald-600 mt-0.5">{gs.untrackedSlots > 0 ? `${gs.untrackedSlots} créneaux restants` : 'Tout est suivi ✓'}</p>
                  </div>
                </div>

                {/* Timetable Grid */}
                <div className="rounded-xl border bg-background shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-3 font-semibold text-muted-foreground sticky left-0 bg-muted/50 z-10 min-w-[140px]">Classe</th>
                          <th className="text-center px-1 py-3 font-medium text-muted-foreground min-w-[40px]">Santé</th>
                          {tt.timeSlots.map((ts, i) => (
                            <th key={i} className="text-center px-2 py-3 min-w-[120px]">
                              <p className="font-semibold text-foreground text-xs">{ts.start?.substring(0, 5)}</p>
                              <p className="text-[10px] text-muted-foreground">{ts.end?.substring(0, 5)}</p>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {tt.classes.map((cls) => (
                          <tr key={cls.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2.5 sticky left-0 bg-background z-10 border-r">
                              <p className="font-semibold text-foreground text-xs">{cls.name}</p>
                              <p className="text-[10px] text-muted-foreground">{cls.trackedCount}/{cls.totalSlots} suivis</p>
                            </td>
                            <td className="text-center px-1 py-2.5">
                              {cls.avgHealth != null ? (
                                <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-xs font-black ${healthBg(cls.avgHealth)} ${healthColor(cls.avgHealth)}`}>
                                  {cls.avgHealth}
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            {tt.timeSlots.map((ts, i) => {
                              const slot = cls.slots.find(s => s.start_time === ts.start && s.end_time === ts.end);
                              if (!slot) return <td key={i} className="px-2 py-2.5"><div className="h-16 rounded-lg bg-muted/30 border border-dashed border-muted-foreground/20" /></td>;

                              const isTracked = slot.tracked;
                              const h = slot.health;

                              return (
                                <td key={i} className="px-1.5 py-1.5">
                                  <div className={`rounded-lg p-2 h-full min-h-[64px] border transition-all relative overflow-hidden ${
                                    isTracked
                                      ? h?.health >= 80 ? 'bg-emerald-50 border-emerald-300 shadow-sm shadow-emerald-100'
                                        : h?.health >= 60 ? 'bg-amber-50 border-amber-300 shadow-sm shadow-amber-100'
                                        : 'bg-red-50 border-red-300 shadow-sm shadow-red-100'
                                      : 'bg-gray-50 border-gray-200 opacity-50'
                                  }`}>
                                    {isTracked && h && (
                                      <div className={`absolute top-0 left-0 h-1 ${healthBar(h.health)}`} style={{ width: `${h.health}%` }} />
                                    )}
                                    <p className={`text-[11px] font-semibold truncate ${isTracked ? 'text-foreground' : 'text-muted-foreground'}`}>
                                      {slot.subject?.name || slot.subject?.code || '—'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      {slot.teacher ? `${slot.teacher.first_name} ${slot.teacher.last_name?.charAt(0)}.` : '—'}
                                    </p>
                                    {isTracked && h ? (
                                      <div className="flex items-center gap-1 mt-1">
                                        <span className={`text-[10px] font-bold ${healthColor(h.health)}`}>{h.health}%</span>
                                        <span className="text-[9px] text-muted-foreground">· {h.presentCount}/{h.studentCount}</span>
                                        {h.phoneCount > 0 && <Phone className="w-2.5 h-2.5 text-orange-400" />}
                                        {h.sleepingCount > 0 && <Moon className="w-2.5 h-2.5 text-indigo-400" />}
                                      </div>
                                    ) : (
                                      <p className="text-[9px] text-muted-foreground/60 mt-1 italic">Non suivi</p>
                                    )}
                                    {slot.room && <p className="text-[9px] text-muted-foreground mt-0.5">📍 {slot.room}</p>}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> ≥80% Excellent</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500" /> 60-79% Moyen</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" /> &lt;60% Critique</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-200 opacity-50" /> Non suivi</span>
                  <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-orange-400" /> Téléphone</span>
                  <span className="flex items-center gap-1.5"><Moon className="w-3 h-3 text-indigo-400" /> Endormi</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ==================== RANKING TAB ==================== */}
      {dashboardTab === 'ranking' && (
        <div className="space-y-5">
          {rankingLoading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !rankingData || rankingData.ranking?.length === 0 ? (
            <div className="text-center py-20">
              <TrendingUp className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Aucune donnée de classement disponible</p>
              <p className="text-sm text-muted-foreground mt-1">Les classes seront classées une fois les séances suivies</p>
            </div>
          ) : (() => {
            const { ranking, period, totalClasses, rankedClasses } = rankingData;
            const getRankBadge = (rank) => {
              if (rank === 1) return { emoji: '🥇', bg: 'bg-yellow-100 border-yellow-400', text: 'text-yellow-800' };
              if (rank === 2) return { emoji: '🥈', bg: 'bg-gray-100 border-gray-400', text: 'text-gray-700' };
              if (rank === 3) return { emoji: '🥉', bg: 'bg-orange-100 border-orange-400', text: 'text-orange-800' };
              return { emoji: `#${rank}`, bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600' };
            };
            const getScoreColor = (score) => {
              if (score >= 80) return 'text-green-600';
              if (score >= 60) return 'text-blue-600';
              if (score >= 40) return 'text-yellow-600';
              return 'text-red-600';
            };
            const getBarColor = (value) => {
              if (value >= 80) return 'bg-green-500';
              if (value >= 60) return 'bg-blue-500';
              if (value >= 40) return 'bg-yellow-500';
              return 'bg-red-500';
            };

            return (
              <>
                {/* Header stats */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className="text-center p-4">
                    <p className="text-3xl font-bold text-primary">{totalClasses}</p>
                    <p className="text-xs text-muted-foreground">Classes totales</p>
                  </Card>
                  <Card className="text-center p-4">
                    <p className="text-3xl font-bold text-green-600">{rankedClasses}</p>
                    <p className="text-xs text-muted-foreground">Classes classées</p>
                  </Card>
                  <Card className="text-center p-4">
                    <p className="text-xs text-muted-foreground mb-1">Période</p>
                    <p className="text-sm font-semibold">{new Date(period.since).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} — {new Date(period.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</p>
                    <p className="text-xs text-muted-foreground">30 derniers jours</p>
                  </Card>
                </div>

                {/* Podium - Top 3 */}
                {ranking.filter(r => r.rank && r.rank <= 3).length > 0 && (
                  <div className="flex items-end justify-center gap-4 py-4">
                    {[2, 1, 3].map(targetRank => {
                      const cls = ranking.find(r => r.rank === targetRank);
                      if (!cls) return <div key={targetRank} className="w-36" />;
                      const badge = getRankBadge(targetRank);
                      const height = targetRank === 1 ? 'h-36' : targetRank === 2 ? 'h-28' : 'h-24';
                      return (
                        <div key={targetRank} className="flex flex-col items-center">
                          <span className="text-2xl mb-1">{badge.emoji}</span>
                          <p className="text-sm font-bold text-center truncate max-w-[140px]">{cls.name}</p>
                          <p className={`text-xl font-black ${getScoreColor(cls.compositeScore)}`}>{cls.compositeScore}</p>
                          <div className={`${height} w-28 rounded-t-lg ${badge.bg} border-2 flex items-center justify-center mt-1`}>
                            <p className={`text-xs font-semibold ${badge.text}`}>{cls.studentCount} élèves</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Full ranking table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Classement complet des classes</CardTitle>
                    <CardDescription>Score composite basé sur : présence (35%), discipline (25%), participation (15%), devoirs (15%), cahier (10%)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2 px-2 w-12">#</th>
                            <th className="py-2 px-2">Classe</th>
                            <th className="py-2 px-2 text-center">Score</th>
                            <th className="py-2 px-2 text-center">Présence</th>
                            <th className="py-2 px-2 text-center">Discipline</th>
                            <th className="py-2 px-2 text-center">Participation</th>
                            <th className="py-2 px-2 text-center">Devoirs</th>
                            <th className="py-2 px-2 text-center">Cahier</th>
                            <th className="py-2 px-2 text-center">Séances</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranking.map((cls, idx) => {
                            const badge = cls.rank ? getRankBadge(cls.rank) : null;
                            return (
                              <tr key={cls.classId} className={`border-b last:border-0 hover:bg-muted/50 transition-colors ${idx < 3 ? 'bg-muted/20' : ''}`}>
                                <td className="py-2.5 px-2">
                                  {cls.rank ? (
                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${badge.bg} ${badge.text} border`}>
                                      {cls.rank <= 3 ? badge.emoji : cls.rank}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2">
                                  <p className="font-semibold">{cls.name}</p>
                                  <p className="text-xs text-muted-foreground">{cls.level} • {cls.studentCount} élèves{cls.teacher ? ` • ${cls.teacher}` : ''}</p>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  {cls.compositeScore !== null ? (
                                    <span className={`text-lg font-black ${getScoreColor(cls.compositeScore)}`}>{cls.compositeScore}</span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">N/A</span>
                                  )}
                                </td>
                                {['attendanceRate', 'incidentRate', 'participationRate', 'homeworkRate', 'cahierRate'].map(metric => (
                                  <td key={metric} className="py-2.5 px-2 text-center">
                                    {cls.metrics[metric] !== null ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-xs font-semibold">{cls.metrics[metric]}%</span>
                                        <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                          <div className={`h-full rounded-full ${getBarColor(cls.metrics[metric])}`} style={{ width: `${Math.min(cls.metrics[metric], 100)}%` }} />
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">—</span>
                                    )}
                                  </td>
                                ))}
                                <td className="py-2.5 px-2 text-center text-xs font-medium text-muted-foreground">{cls.sessionCount}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </div>
      )}

      {/* ==================== OVERVIEW TAB ==================== */}
      {dashboardTab === 'overview' && <>
      {/* FINANCE SUMMARY — masqué pour le directeur pédagogique */}
      {!isPedagogical && <FinanceSummaryCard />}

      {/* BLOC 1 - KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          icon={UserCheck}
          title="Présence Élèves"
          value={kpis.studentAttendance.value !== null ? `${kpis.studentAttendance.value}%` : '—'}
          subtitle={kpis.studentAttendance.total > 0 ? `${kpis.studentAttendance.total} élèves au total` : 'Aucun élève'}
          status={kpis.studentAttendance.value !== null ? getStatusColor(kpis.studentAttendance.value, { good: 90, warning: 75 }) : 'gray'}
          onClick={() => openPanel('student-attendance', kpis.studentAttendance)}
        />
        <KPICard
          icon={GraduationCap}
          title="Présence Profs"
          value={kpis.teacherAttendance.value !== null ? `${kpis.teacherAttendance.value}%` : '—'}
          subtitle={
            kpis.teacherAttendance.value !== null
              ? `${kpis.teacherAttendance.presentCount}/${kpis.teacherAttendance.scheduledCount} profs • ${kpis.teacherAttendance.hoursTaught}h enseignées`
              : (kpis.teacherAttendance.total > 0 ? 'Aucun cours prévu aujourd\'hui' : 'Aucun professeur')
          }
          status={kpis.teacherAttendance.value !== null ? getStatusColor(kpis.teacherAttendance.value, { good: 95, warning: 85 }) : 'gray'}
          onClick={() => openPanel('teacher-attendance', kpis.teacherAttendance)}
        />
        <KPICard
          icon={ClipboardList}
          title="Devoirs Non Corrigés"
          value={kpis.uncorrectedHomework.value}
          subtitle={`${kpis.uncorrectedHomework.teachers.length} profs concernés`}
          status={kpis.uncorrectedHomework.value === 0 ? 'green' : kpis.uncorrectedHomework.value < 10 ? 'orange' : 'red'}
          onClick={() => openPanel('uncorrected-homework', kpis.uncorrectedHomework)}
        />
        <KPICard
          icon={AlertTriangle}
          title="Alertes Comportement"
          value={kpis.behaviorAlerts.value}
          subtitle="Incidents actifs"
          status={kpis.behaviorAlerts.value === 0 ? 'green' : kpis.behaviorAlerts.value < 5 ? 'orange' : 'red'}
          onClick={() => openPanel('behavior-alerts', kpis.behaviorAlerts)}
        />
        <KPICard
          icon={Calendar}
          title="Classes Sans Cours"
          value={kpis.classesWithoutCourse.value}
          subtitle="Aujourd'hui"
          status={kpis.classesWithoutCourse.value === 0 ? 'green' : 'red'}
          onClick={() => openPanel('classes-without-course', kpis.classesWithoutCourse)}
        />
      </div>

      {/* BLOC 2 - Priorities */}
      {priorities.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              <CardTitle className="text-lg">À traiter aujourd'hui</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {priorities.map((alert) => (
              <PriorityAlert key={alert.id} alert={alert} onAction={handleAction} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* BLOC 3 & 4 - Classes and Teachers Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Classes Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-500" />
                <CardTitle className="text-lg">Surveillance des Classes</CardTitle>
              </div>
              <span className="text-sm text-muted-foreground">{classes.length} classes</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Classe</th>
                    <th className="text-center py-2 px-2 font-medium">Présence</th>
                    <th className="text-center py-2 px-2 font-medium">Devoirs</th>
                    <th className="text-center py-2 px-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.slice(0, 8).map((cls) => (
                    <tr key={cls.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-2 px-2">
                        <div>
                          <p className="font-medium">{cls.name}</p>
                          <p className="text-xs text-muted-foreground">{cls.studentCount} élèves</p>
                        </div>
                      </td>
                      <td className="text-center py-2 px-2">
                        {cls.attendanceRate !== null ? (
                          <span className={`font-medium ${
                            cls.attendanceRate >= 90 ? 'text-green-600' : 
                            cls.attendanceRate >= 75 ? 'text-orange-600' : 'text-red-600'
                          }`}>
                            {cls.attendanceRate}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-center py-2 px-2">
                        {cls.homeworkPending > 0 ? (
                          <span className="text-orange-600 font-medium">{cls.homeworkPending}</span>
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                        )}
                      </td>
                      <td className="text-center py-2 px-2">
                        <StatusBadge status={cls.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Teachers Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-lg">Suivi des Professeurs</CardTitle>
              </div>
              <span className="text-sm text-muted-foreground">{teachers.length} professeurs</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Professeur</th>
                    <th className="text-center py-2 px-2 font-medium">Classes</th>
                    <th className="text-center py-2 px-2 font-medium">Devoirs en retard</th>
                    <th className="text-center py-2 px-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.slice(0, 8).map((teacher) => (
                    <tr key={teacher.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-2 px-2">
                        <div>
                          <p className="font-medium">{teacher.first_name} {teacher.last_name}</p>
                          <p className="text-xs text-muted-foreground">{teacher.email}</p>
                        </div>
                      </td>
                      <td className="text-center py-2 px-2">{teacher.classCount}</td>
                      <td className="text-center py-2 px-2">
                        {teacher.homeworkLate > 0 ? (
                          <span className="text-orange-600 font-medium">{teacher.homeworkLate}</span>
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                        )}
                      </td>
                      <td className="text-center py-2 px-2">
                        <StatusBadge status={teacher.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      </>}

      {/* Side Panels */}
      <SidePanel
        isOpen={activePanel === 'student-attendance'}
        onClose={closePanel}
        title="Présence des Élèves"
      >
        {panelData && <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{panelData.value !== null && panelData.value !== undefined ? `${panelData.value}%` : '—'}</p>
            <p className="text-sm text-muted-foreground">Taux de présence aujourd'hui — {panelData?.absentCount || 0} absent(s)</p>
          </div>

          {panelData?.absentStudents && panelData.absentStudents.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">Élèves absents</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {panelData.absentStudents.map((student, idx) => (
                  <div key={idx} className="p-2 bg-red-50 rounded border border-red-200 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{student.name}</p>
                      <p className="text-xs text-muted-foreground">{student.className}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">❌ Absent</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <h3 className="font-medium">Actions rapides</h3>
            <div className="grid grid-cols-1 gap-2">
              <ActionButton icon={Eye} label="Voir liste des absents" variant="info" size="md" onClick={() => { closePanel(); navigate('/students'); }} />
            </div>
          </div>
        </div>}
      </SidePanel>

      <SidePanel
        isOpen={activePanel === 'teacher-attendance'}
        onClose={closePanel}
        title="Présence des Professeurs"
      >
        {panelData && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{panelData.value ?? '—'}{panelData.value !== null && panelData.value !== undefined ? '%' : ''}</p>
              <p className="text-xs text-muted-foreground">Créneaux tenus aujourd'hui{typeof panelData.realizedSlots === 'number' ? ` (${panelData.realizedSlots}/${panelData.expectedSlots})` : ''}</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-700">{panelData.hoursTaught ?? 0}h</p>
              <p className="text-xs text-blue-600">Heures enseignées aujourd'hui</p>
            </div>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Profs ayant assuré leur cours</span>
            <span className="font-semibold">{panelData.presentCount ?? 0}/{panelData.scheduledCount ?? 0}</span>
          </div>

          {panelData.absentTeachers && panelData.absentTeachers.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium text-red-700">Profs n'ayant pas assuré leur créneau</h3>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {panelData.absentTeachers.map((t) => (
                  <div key={t.id} className="p-2 bg-red-50 rounded border border-red-200">
                    <p className="text-sm font-medium">{t.name}</p>
                    {t.missedSlots?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.missedSlots.map((s, i) => (
                          <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                            {s.start_time}–{s.end_time} · {s.class_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-medium">Actions rapides</h3>
            <div className="grid grid-cols-1 gap-2">
              <ActionButton icon={Eye} label="Voir le suivi des profs" variant="info" size="md" onClick={() => { closePanel(); navigate('/teacher-tracking'); }} />
            </div>
          </div>
        </div>}
      </SidePanel>

      <SidePanel
        isOpen={activePanel === 'uncorrected-homework'}
        onClose={closePanel}
        title="Devoirs Non Corrigés"
      >
        {panelData && <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{panelData.value}</p>
            <p className="text-sm text-muted-foreground">Devoirs en attente de correction</p>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">Actions rapides</h3>
            <div className="grid grid-cols-1 gap-2">
              <ActionButton icon={Eye} label="Voir profs concernés" variant="info" size="md" onClick={() => { closePanel(); navigate('/teachers'); }} />
            </div>
          </div>
        </div>}
      </SidePanel>

      <SidePanel
        isOpen={activePanel === 'behavior-alerts'}
        onClose={closePanel}
        title="Alertes Comportement"
      >
        {panelData && <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{panelData.value}</p>
            <p className="text-sm text-muted-foreground">{panelData.studentCount || 0} élève(s) concerné(s)</p>
          </div>

          {/* Détails des incidents */}
          {panelData?.details && (
            <div className="space-y-2">
              <h3 className="font-medium">Détails des incidents</h3>
              <div className="grid grid-cols-2 gap-2">
                {panelData.details.perturbateur > 0 && (
                  <div className="p-2 bg-red-50 rounded border border-red-200">
                    <p className="text-lg font-bold text-red-700">{panelData.details.perturbateur}</p>
                    <p className="text-xs text-red-600">Perturbateurs</p>
                  </div>
                )}
                {panelData.details.phoneUse > 0 && (
                  <div className="p-2 bg-orange-50 rounded border border-orange-200">
                    <p className="text-lg font-bold text-orange-700">{panelData.details.phoneUse}</p>
                    <p className="text-xs text-orange-600">Téléphone</p>
                  </div>
                )}
                {panelData.details.sleeping > 0 && (
                  <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
                    <p className="text-lg font-bold text-yellow-700">{panelData.details.sleeping}</p>
                    <p className="text-xs text-yellow-600">Endormis</p>
                  </div>
                )}
                {panelData.details.bavarre > 0 && (
                  <div className="p-2 bg-purple-50 rounded border border-purple-200">
                    <p className="text-lg font-bold text-purple-700">{panelData.details.bavarre}</p>
                    <p className="text-xs text-purple-600">Bavardage</p>
                  </div>
                )}
                {panelData.details.homeworkMissing > 0 && (
                  <div className="p-2 bg-blue-50 rounded border border-blue-200">
                    <p className="text-lg font-bold text-blue-700">{panelData.details.homeworkMissing}</p>
                    <p className="text-xs text-blue-600">Sans devoirs</p>
                  </div>
                )}
                {panelData.details.cahierAbsent > 0 && (
                  <div className="p-2 bg-gray-50 rounded border border-gray-200">
                    <p className="text-lg font-bold text-gray-700">{panelData.details.cahierAbsent}</p>
                    <p className="text-xs text-gray-600">Sans cahier</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Liste des élèves concernés */}
          {panelData?.students && panelData.students.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">Élèves concernés</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {panelData.students.map((student, idx) => (
                  <div key={idx} className="p-2 bg-red-50 rounded border border-red-200 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{student.name}</p>
                      <p className="text-xs text-muted-foreground">{student.className}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {student.issues?.map((issue, i) => (
                        <span key={i} className={`text-xs px-1.5 py-0.5 rounded-full ${
                          issue === 'perturbateur' ? 'bg-red-100 text-red-700' :
                          issue === 'téléphone' ? 'bg-orange-100 text-orange-700' :
                          issue === 'dort' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {issue === 'perturbateur' ? '⚠️' : issue === 'téléphone' ? '📱' : issue === 'dort' ? '😴' : '💬'} {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-medium">Actions rapides</h3>
            <div className="grid grid-cols-1 gap-2">
              <ActionButton icon={Eye} label="Voir élèves concernés" variant="info" size="md" onClick={() => { closePanel(); navigate('/behavior'); }} />
              <ActionButton icon={FileText} label="Accéder à l'historique" variant="default" size="md" onClick={() => { closePanel(); navigate('/behavior'); }} />
            </div>
          </div>
        </div>}
      </SidePanel>

      <SidePanel
        isOpen={activePanel === 'classes-without-course'}
        onClose={closePanel}
        title="Classes Sans Cours"
      >
        {panelData && <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{panelData.value}</p>
            <p className="text-sm text-muted-foreground">Classes sans cours aujourd'hui</p>
          </div>

          {/* Liste des classes sans cours */}
          {panelData?.classes && panelData.classes.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">Classes concernées</h3>
              <div className="space-y-1">
                {panelData.classes.map((cls, idx) => (
                  <div key={idx} className="p-2 bg-orange-50 rounded border border-orange-200 flex items-center justify-between">
                    <span className="text-sm font-medium">{typeof cls === 'string' ? cls : cls.name}</span>
                    {cls.teacher && <span className="text-xs text-muted-foreground">Prof: {cls.teacher}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <h3 className="font-medium">Actions rapides</h3>
            <div className="grid grid-cols-1 gap-2">
              <ActionButton icon={Eye} label="Voir créneaux vides" variant="info" size="md" onClick={() => { closePanel(); navigate('/classes'); }} />
            </div>
          </div>
        </div>}
      </SidePanel>

      <SidePanel
        isOpen={activePanel === 'cahier-absent'}
        onClose={closePanel}
        title="Cahiers Absents"
      >
        {panelData && <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{panelData?.value || 0}</p>
            <p className="text-sm text-muted-foreground">Élèves sans cahier aujourd'hui</p>
          </div>

          {panelData?.students && panelData.students.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">Élèves concernés</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {panelData.students.map((student, idx) => (
                  <div key={idx} className="p-2 bg-gray-50 rounded border border-gray-200 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{student.name}</p>
                      <p className="text-xs text-muted-foreground">{student.className}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">📓 Sans cahier</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>}
      </SidePanel>

      <SidePanel
        isOpen={activePanel === 'homework-missing'}
        onClose={closePanel}
        title="Devoirs Non Faits"
      >
        {panelData && <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{panelData?.value || 0}</p>
            <p className="text-sm text-muted-foreground">Élèves sans devoirs aujourd'hui</p>
          </div>

          {panelData?.students && panelData.students.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">Élèves concernés</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {panelData.students.map((student, idx) => (
                  <div key={idx} className="p-2 bg-blue-50 rounded border border-blue-200 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{student.name}</p>
                      <p className="text-xs text-muted-foreground">{student.className}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">📝 Sans devoir</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-medium">Actions rapides</h3>
            <div className="grid grid-cols-1 gap-2">
              <ActionButton icon={Eye} label="Voir détails" variant="info" size="md" onClick={() => { closePanel(); navigate('/behavior'); }} />
            </div>
          </div>
        </div>}
      </SidePanel>

      <SidePanel
        isOpen={activePanel === 'class-details'}
        onClose={closePanel}
        title={`Détails - ${panelData?.name || 'Classe'}`}
      >
        {panelData && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xl font-bold">{panelData?.studentCount || 0}</p>
              <p className="text-xs text-muted-foreground">Élèves</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xl font-bold">{panelData?.attendanceRate || 0}%</p>
              <p className="text-xs text-muted-foreground">Présence</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">Actions</h3>
            <div className="grid grid-cols-1 gap-2">
              <ActionButton icon={Eye} label="Voir détails classe" variant="info" size="md" onClick={() => { closePanel(); navigate('/classes'); }} />
            </div>
          </div>
        </div>}
      </SidePanel>

      <SidePanel
        isOpen={activePanel === 'teacher-details'}
        onClose={closePanel}
        title={`${panelData?.first_name || ''} ${panelData?.last_name || ''}`}
      >
        {panelData && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xl font-bold">{panelData?.classCount || 0}</p>
              <p className="text-xs text-muted-foreground">Classes</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xl font-bold">{panelData?.homeworkLate || 0}</p>
              <p className="text-xs text-muted-foreground">Devoirs en retard</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">Actions</h3>
            <div className="grid grid-cols-1 gap-2">
              <ActionButton icon={Eye} label="Voir profil" variant="info" size="md" onClick={() => { closePanel(); navigate('/teachers'); }} />
            </div>
          </div>
        </div>}
      </SidePanel>
    </div>
  );
};

export default AdminDashboard;
