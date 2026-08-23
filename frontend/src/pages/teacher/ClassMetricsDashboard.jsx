import { useState, useEffect } from 'react';
import { 
  TrendingUp, AlertCircle, Star, Users, Filter, Calendar, 
  BookOpen, Phone, Moon, MessageSquare, CheckCircle, Target,
  Lightbulb, ChevronRight, Activity, RefreshCw, Eye, Heart,
  ThermometerSun, AlertTriangle, Clock, PenLine, Search, ClipboardList,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../i18n';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { 
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, Legend, BarChart, Bar, Cell 
} from 'recharts';

// Composant jauge de santé
const HealthScoreGauge = ({ score, status, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-12 h-12 text-sm',
    md: 'w-16 h-16 text-lg',
    lg: 'w-24 h-24 text-2xl'
  };
  
  const statusColors = {
    green: 'text-green-600 border-green-500',
    orange: 'text-orange-600 border-orange-500',
    red: 'text-red-600 border-red-500',
    gray: 'text-gray-400 border-gray-300'
  };
  
  return (
    <div className={`${sizeClasses[size]} rounded-full border-4 ${statusColors[status]} flex items-center justify-center font-bold`}>
      {score !== null ? score : '—'}
    </div>
  );
};

// Composant carte métrique
const MetricCard = ({ icon: Icon, label, value, subLabel, accent = 'blue', trend }) => {
  const accentColors = {
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    blue: 'bg-blue-100 text-blue-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600'
  };
  
  return (
    <div className="bg-white rounded-lg border p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${accentColors[accent]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          {subLabel && <p className="text-xs text-gray-400">{subLabel}</p>}
        </div>
        {trend !== undefined && (
          <div className={`text-sm font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
};

const ClassMetricsDashboard = ({ mode = 'dashboard' }) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t, lang } = useI18n();
  const isClassroom = mode === 'classroom';
  // Locale de formatage des dates alignee sur la langue de l'interface.
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterBadge, setFilterBadge] = useState('all');
  const [activeTab, setActiveTab] = useState(isClassroom ? 'students' : 'overview');
  const [studentSearch, setStudentSearch] = useState('');
  const [classAnalytics, setClassAnalytics] = useState(null);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [periodDays, setPeriodDays] = useState(7);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session: authSession } } = await supabase.auth.getSession();
    return authSession?.access_token;
  };

  useEffect(() => {
    fetchClasses();
    if (!isClassroom) fetchDashboardSummary();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchStudentsMetrics();
      fetchClassAnalytics();
    }
  }, [selectedClass, periodDays]);

  const fetchClasses = async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/my-classes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setClasses(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0) {
        setSelectedClass(data[0].id);
      }
    } catch (err) {
      console.error('Erreur:', err);
      setError(t('dash.errorClasses'));
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentsMetrics = async () => {
    if (!selectedClass) return;
    try {
      setLoading(true);
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/classes/${selectedClass}/students-metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erreur:', err);
      setError(t('dash.errorMetrics'));
    } finally {
      setLoading(false);
    }
  };

  const fetchClassAnalytics = async () => {
    if (!selectedClass) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/classes/${selectedClass}/analytics?days=${periodDays}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setClassAnalytics(data);
    } catch (err) {
      console.error('Erreur analytics:', err);
    }
  };

  const fetchDashboardSummary = async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/dashboard/summary?days=${periodDays}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setDashboardSummary(data);
    } catch (err) {
      console.error('Erreur summary:', err);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchClasses(),
      isClassroom ? Promise.resolve() : fetchDashboardSummary(),
      selectedClass ? fetchStudentsMetrics() : Promise.resolve(),
      selectedClass ? fetchClassAnalytics() : Promise.resolve()
    ]);
    setRefreshing(false);
  };

  const normalCount = students.filter(student => !['excellent', 'good', 'alert', 'unrated'].includes(student.badge)).length;
  const unratedCount = students.filter(student => student.badge === 'unrated').length;

  const filteredStudents = students.filter(student => {
    const needle = studentSearch.trim().toLocaleLowerCase(lang === 'ar' ? 'ar-MA' : 'fr-FR');
    if (needle && !String(student.name || '').toLocaleLowerCase(lang === 'ar' ? 'ar-MA' : 'fr-FR').includes(needle)) {
      return false;
    }
    if (filterBadge === 'all') return true;
    if (filterBadge === 'unrated') return student.badge === 'unrated';
    if (filterBadge === 'normal') return !['excellent', 'good', 'alert', 'unrated'].includes(student.badge);
    return student.badge === filterBadge;
  });

  const selectedClassData = classes.find(c => c.id === selectedClass);

  // Composant Student Card
  const StudentCard = ({ student }) => {
    let badgeColor = 'bg-yellow-100 text-yellow-800';
    let badgeIcon = '⚪';
    if (student.badge === 'unrated') {
      badgeColor = 'bg-gray-100 text-gray-500';
      badgeIcon = '—';
    } else if (student.badge === 'excellent') {
      badgeColor = 'bg-green-100 text-green-800';
      badgeIcon = '⭐';
    } else if (student.badge === 'good') {
      badgeColor = 'bg-blue-100 text-blue-800';
      badgeIcon = '✓';
    } else if (student.badge === 'alert') {
      badgeColor = 'bg-red-100 text-red-800';
      badgeIcon = '⚠️';
    }

    return (
      <div
        onClick={() => navigate(`/teacher/student/${student.id}`)}
        className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-200 hover:shadow-md transition-all cursor-pointer"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900">{student.name}</h3>
            <p className="text-xs text-gray-500">{t('dash.sessionsCount', { n: student.totalSessions })}</p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-bold ${badgeColor}`}>
            {badgeIcon} {student.globalScore !== null ? `${student.globalScore}%` : 'N/A'}
          </span>
        </div>

        <div className="space-y-2">
          {student.presenceScore !== null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{t('dash.metric.presence')}</span>
              <div className="flex-1 mx-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${student.presenceScore}%` }}
                />
              </div>
              <span className="font-semibold text-gray-900 w-8 text-right">{student.presenceScore}%</span>
            </div>
          )}

          {student.writingScore !== null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{t('dash.metric.writing')}</span>
              <div className="flex-1 mx-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500"
                  style={{ width: `${student.writingScore}%` }}
                />
              </div>
              <span className="font-semibold text-gray-900 w-8 text-right">{student.writingScore}%</span>
            </div>
          )}

          {student.sleepingScore !== null && (
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-gray-600 whitespace-nowrap flex items-center gap-1">😴 {t('dash.metric.sleeping')}</span>
              <div className="flex-1"></div>
              <span className="font-semibold text-gray-900 w-12 text-right">{student.sleepingPercentage}%</span>
              {typeof student.sleepingIncidents === 'number' && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold whitespace-nowrap">
                  {student.sleepingIncidents}×
                </span>
              )}
            </div>
          )}

          {student.homeworkScore !== null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{t('dash.metric.homework')}</span>
              <div className="flex-1 mx-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${student.homeworkScore}%` }}
                />
              </div>
              <span className="font-semibold text-gray-900 w-8 text-right">{student.homeworkScore}%</span>
            </div>
          )}

          {student.participationScore !== null && (
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-gray-600 whitespace-nowrap flex items-center gap-1">🙋 {t('dash.metric.participation')}</span>
              <div className="flex-1 mx-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500"
                  style={{ width: `${student.participationScore}%` }}
                />
              </div>
              <span className="font-semibold text-gray-900 w-12 text-right">{student.participationPercentage}%</span>
              {typeof student.participationIncidents === 'number' && (
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold whitespace-nowrap">
                  {student.participationIncidents}×
                </span>
              )}
            </div>
          )}

          {student.attitudeScore !== null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{t('dash.metric.attitude')}</span>
              <div className="flex-1 mx-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-pink-500"
                  style={{ width: `${student.attitudeScore}%` }}
                />
              </div>
              <span className="font-semibold text-gray-900 w-8 text-right">{student.attitudeScore}%</span>
            </div>
          )}

          {student.disciplineScore !== null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{t('dash.metric.vigilance')}</span>
              <div className="flex-1 mx-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500"
                  style={{ width: `${student.disciplineScore}%` }}
                />
              </div>
              <span className="font-semibold text-gray-900 w-8 text-right">{student.disciplineScore}%</span>
            </div>
          )}

          {student.phoneScore !== null && (
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-gray-600 whitespace-nowrap flex items-center gap-1">📱 {t('dash.metric.phone')}</span>
              <div className="flex-1"></div>
              <span className="font-semibold text-gray-900 w-12 text-right">{student.phoneUsePercentage}%</span>
              {typeof student.phoneIncidents === 'number' && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold whitespace-nowrap">
                  {student.phoneIncidents}×
                </span>
              )}
            </div>
          )}

          {student.cahierScore !== null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{t('dash.metric.notebook')}</span>
              <div className="flex-1 mx-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500"
                  style={{ width: `${student.cahierScore}%` }}
                />
              </div>
              <span className="font-semibold text-gray-900 w-8 text-right">{student.cahierScore}%</span>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
          <span className="font-medium text-gray-500">{selectedClassData?.name || t('classHub.class')}</span>
          <span className="flex items-center gap-1 font-semibold text-blue-600 group-hover:text-blue-700">
            {t('classHub.openStudent')} <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    );
  };

  if (loading && students.length === 0 && !dashboardSummary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            {isClassroom ? <Users className="w-8 h-8 text-blue-600" /> : <Activity className="w-8 h-8 text-blue-600" />}
            {isClassroom ? t('classHub.title') : t('dash.title')}
          </h1>
          <p className="text-gray-600 mt-1">{isClassroom ? t('classHub.subtitle') : t('dash.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg border hover:bg-gray-100 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex gap-1 bg-white rounded-lg border p-1">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setPeriodDays(d)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  periodDays === d ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t('dash.days', { n: d })}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Alertes globales */}
      {!isClassroom && dashboardSummary?.alerts?.length > 0 && (
        <div className="space-y-2">
          {dashboardSummary.alerts.slice(0, 3).map((alert, idx) => (
            <div 
              key={idx} 
              className={`flex items-center gap-3 p-3 rounded-lg ${
                alert.type === 'critical' ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'
              }`}
            >
              <AlertTriangle className={`w-5 h-5 ${alert.type === 'critical' ? 'text-red-600' : 'text-orange-600'}`} />
              <span className="text-sm font-medium">{alert.message}</span>
              <button 
                onClick={() => { setSelectedClass(alert.classId); setActiveTab('overview'); }}
                className="ml-auto text-sm text-blue-600 hover:underline"
              >
                {t('common.view')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Navigation par onglets */}
      <div className="flex gap-2 border-b pb-2 overflow-x-auto">
        {(isClassroom ? [
          { id: 'students', label: t('dash.tab.students'), icon: Users },
          { id: 'overview', label: t('dash.tab.overview'), icon: Eye },
          { id: 'trends', label: t('dash.tab.trends'), icon: TrendingUp },
          { id: 'recommendations', label: t('dash.tab.recommendations'), icon: Lightbulb }
        ] : [
          { id: 'overview', label: t('dash.tab.overview'), icon: Eye },
          { id: 'students', label: t('dash.tab.students'), icon: Users },
          { id: 'trends', label: t('dash.tab.trends'), icon: TrendingUp },
          { id: 'recommendations', label: t('dash.tab.recommendations'), icon: Lightbulb }
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sélecteur de classe */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-semibold text-gray-700" htmlFor="teacher-class-selector">
          {t('classHub.class')}
        </label>
        <select
          id="teacher-class-selector"
          value={selectedClass || ''}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {classes.map(cls => (
            <option key={cls.id} value={cls.id}>{cls.name}</option>
          ))}
        </select>
        {classAnalytics && (
          <div className="flex items-center gap-2">
            <HealthScoreGauge score={classAnalytics.healthScore} status={classAnalytics.healthStatus} size="sm" />
            <span className="text-sm text-gray-600">{t('dash.healthScore')}</span>
          </div>
        )}
      </div>

      {/* Toutes les actions fréquentes partent du même espace et conservent la
          classe sélectionnée dans l'écran de destination. */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="min-w-0 lg:me-auto">
              <p className="font-semibold text-gray-900">{t('classHub.toolsTitle')}</p>
              <p className="text-xs text-gray-500">
                {t('classHub.toolsSubtitle', { name: selectedClassData?.name || '—' })}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                disabled={!selectedClass}
                onClick={() => navigate(`/teacher/rapide?classId=${selectedClass}`)}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                <Calendar className="h-4 w-4" /> {t('classHub.startSession')}
              </button>
              <button
                type="button"
                disabled={!selectedClass}
                onClick={() => navigate(`/teacher/controls?action=create&classId=${selectedClass}`)}
                className="flex items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
              >
                <ClipboardList className="h-4 w-4" /> {t('classHub.newControl')}
              </button>
              <button
                type="button"
                disabled={!selectedClass}
                onClick={() => navigate(`/teacher/devoirs?action=create&classId=${selectedClass}`)}
                className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                <BookOpen className="h-4 w-4" /> {t('classHub.newHomework')}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Onglet: Vue classe (Overview) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Métriques de la classe */}
          {classAnalytics && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
                <MetricCard icon={Users} label={t('dash.metric.presence')} value={`${classAnalytics.metrics.presenceRate}%`} accent="green" />
                <MetricCard icon={PenLine} label={t('dash.metric.writing')} value={classAnalytics.metrics.writingRate === null ? '—' : `${classAnalytics.metrics.writingRate}%`} accent="purple" />
                <MetricCard icon={MessageSquare} label={t('dash.metric.participationPlus')} value={`${classAnalytics.metrics.participationPositiveRate}%`} accent="blue" />
                <MetricCard icon={Heart} label={t('dash.metric.attitude')} value={classAnalytics.metrics.attitudeCorrectRate === null ? '—' : `${classAnalytics.metrics.attitudeCorrectRate}%`} accent="pink" />
                <MetricCard icon={Eye} label={t('dash.metric.vigilance')} value={`${classAnalytics.metrics.disciplineGoodRate}%`} accent="yellow" />
                <MetricCard icon={Phone} label={t('dash.metric.phone')} value={`${classAnalytics.metrics.phoneUseRate}%`} accent="red" />
                <MetricCard icon={Moon} label={t('dash.metric.sleeping')} value={`${classAnalytics.metrics.sleepingRate}%`} accent="orange" />
              </div>

            </>
          )}

          {/* Statistiques élèves */}
          {students.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase">{t('dash.stat.totalStudents')}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{students.length}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase">{t('dash.stat.excellent')}</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{students.filter(s => s.badge === 'excellent').length}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-400">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase">{t('dash.stat.good')}</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{students.filter(s => s.badge === 'good').length}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase">{t('dash.stat.atRisk')}</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{students.filter(s => s.badge === 'alert').length}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Sessions récentes */}
          {classAnalytics?.recentSessions?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {t('dash.recentSessions')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {classAnalytics.recentSessions.map(session => (
                    <div key={session.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{session.topic || t('common.untitled')}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(session.date).toLocaleDateString(dateLocale)} • {session.start_time?.slice(0,5)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-green-600">{t('dash.present', { n: session.presenceRate ?? 0 })}</span>
                        <span className="text-blue-600">{t('dash.active', { n: session.participationRate ?? 0 })}</span>
                        {session.incidentsCount > 0 && (
                          <span className="text-red-600">{t('dash.incidents', { n: session.incidentsCount })}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {/* Onglet: Élèves */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <label className="relative block max-w-xl">
              <span className="sr-only">{t('classHub.searchStudent')}</span>
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder={t('classHub.searchPlaceholder')}
                className="w-full rounded-lg border border-gray-300 py-2.5 ps-10 pe-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </label>

            {/* Les filtres de besoin restent dans la même page que la liste. */}
            <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterBadge('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBadge === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              {t('dash.filter.all', { n: students.length })}
            </button>
            <button
              onClick={() => setFilterBadge('excellent')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBadge === 'excellent' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              {t('dash.filter.excellent', { n: students.filter(s => s.badge === 'excellent').length })}
            </button>
            <button
              onClick={() => setFilterBadge('good')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBadge === 'good' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              {t('dash.filter.good', { n: students.filter(s => s.badge === 'good').length })}
            </button>
            <button
              onClick={() => setFilterBadge('alert')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBadge === 'alert' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              {t('dash.filter.alert', { n: students.filter(s => s.badge === 'alert').length })}
            </button>
            <button
              onClick={() => setFilterBadge('normal')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBadge === 'normal' ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              {t('dash.filter.weak', { n: normalCount })}
            </button>
            <button
              onClick={() => setFilterBadge('unrated')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBadge === 'unrated' ? 'bg-gray-500 text-white' : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              {t('dash.filter.unrated', { n: unratedCount })}
            </button>
            </div>
          </div>

          {/* Grille d'élèves */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStudents.map(student => (
              <StudentCard key={student.id} student={student} />
            ))}
          </div>

          {filteredStudents.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600">{t('dash.noStudentForFilter')}</p>
            </div>
          )}
        </div>
      )}

      {/* Onglet: Tendances */}
      {activeTab === 'trends' && classAnalytics && (
        <div className="space-y-6">
          {classAnalytics.trends?.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{t('dash.trendTitle', { n: periodDays })}</CardTitle>
                  <CardDescription>{t('dash.trendSubtitle')}</CardDescription>
                </CardHeader>
                <CardContent className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={classAnalytics.trends.map(t => ({
                      ...t,
                      dateLabel: new Date(t.date).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="dateLabel" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#94a3b8" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Legend />
                      <Line type="monotone" dataKey="presenceRate" name={t('dash.metric.presence')} stroke="#22c55e" strokeWidth={2} />
                      <Line type="monotone" dataKey="participationRate" name={t('dash.metric.participation')} stroke="#3b82f6" strokeWidth={2} />
                      <Line type="monotone" dataKey="attitudeRate" name={t('dash.metric.attitude')} stroke="#ec4899" strokeWidth={2} />
                      <Line type="monotone" dataKey="disciplineRate" name={t('dash.metric.vigilance')} stroke="#eab308" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('dash.incidentsTitle')}</CardTitle>
                  <CardDescription>{t('dash.incidentsSubtitle')}</CardDescription>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={classAnalytics.trends.map(t => ({
                      ...t,
                      dateLabel: new Date(t.date).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="dateLabel" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 50]} tickFormatter={(v) => `${v}%`} stroke="#94a3b8" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Legend />
                      <Bar dataKey="phoneRate" name={t('dash.metric.phone')} fill="#ef4444" />
                      <Bar dataKey="sleepingRate" name={t('dash.metric.sleeping')} fill="#f97316" />
                      <Bar dataKey="perturbateurRate" name={t('dash.disruptive')} fill="#a855f7" />
                      <Bar dataKey="bavardRate" name={t('dash.chatty')} fill="#ec4899" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">{t('dash.noTrends')}</p>
              <p className="text-sm text-gray-400 mt-1">{t('dash.noTrendsHint')}</p>
            </div>
          )}
        </div>
      )}

      {/* Onglet: Recommandations */}
      {activeTab === 'recommendations' && (
        <div className="space-y-6">
          {classAnalytics?.issues?.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                {t('dash.issuesTitle')}
              </h2>
              {classAnalytics.issues.map((issue, idx) => (
                <Card key={idx} className={`border-l-4 ${issue.severity === 'high' ? 'border-l-red-500' : 'border-l-orange-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${issue.severity === 'high' ? 'bg-red-100' : 'bg-orange-100'}`}>
                        {issue.type === 'sleeping' && <Moon className={`w-5 h-5 ${issue.severity === 'high' ? 'text-red-600' : 'text-orange-600'}`} />}
                        {issue.type === 'phone' && <Phone className={`w-5 h-5 ${issue.severity === 'high' ? 'text-red-600' : 'text-orange-600'}`} />}
                        {issue.type === 'participation' && <MessageSquare className={`w-5 h-5 ${issue.severity === 'high' ? 'text-red-600' : 'text-orange-600'}`} />}
                        {issue.type === 'absence' && <Users className={`w-5 h-5 ${issue.severity === 'high' ? 'text-red-600' : 'text-orange-600'}`} />}
                        {issue.type === 'cahier' && <BookOpen className={`w-5 h-5 ${issue.severity === 'high' ? 'text-red-600' : 'text-orange-600'}`} />}
                        {issue.type === 'discipline' && <AlertCircle className={`w-5 h-5 ${issue.severity === 'high' ? 'text-red-600' : 'text-orange-600'}`} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{issue.label}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${issue.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                            {issue.value}%
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">💡 {issue.action}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h3 className="font-semibold text-lg">{t('dash.noIssue')}</h3>
              <p className="text-sm text-gray-600 mt-1">{t('dash.noIssueHint', { name: selectedClassData?.name })}</p>
            </div>
          )}

          {/* Conseils généraux */}
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-blue-600" />
                {t('dash.tipsTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                  <span>{t('dash.tip1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                  <span>{t('dash.tip2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                  <span>{t('dash.tip3')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                  <span>{t('dash.tip4')}</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ClassMetricsDashboard;
