import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const asNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const readJson = async (response, fallback) => {
  const data = await response.json().catch(() => fallback);
  if (!response.ok) {
    throw new Error(data?.error || `Impossible de charger les données (${response.status})`);
  }
  return data;
};

const isCompletedHomework = (homework) => {
  const status = homework?.homework_submissions?.[0]?.status;
  return status === 'submitted' || status === 'graded';
};

const isOverdueHomework = (homework) => {
  if (!homework?.due_date || isCompletedHomework(homework)) return false;
  const due = new Date(homework.due_date);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(23, 59, 59, 999);
  return due < new Date();
};

const formatShortDate = (value) => {
  if (!value) return 'Date à confirmer';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date à confirmer';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

const QuickLink = ({ to, icon, title, detail, tone }) => (
  <Link
    to={to}
    className="group flex min-h-[104px] items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
  >
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
      {createElement(icon, { className: 'h-5 w-5' })}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{detail}</span>
    </span>
    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
  </Link>
);

const Metric = ({ label, value, hint, tone = 'text-foreground' }) => (
  <div className="rounded-xl border bg-background/80 p-3">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className={`mt-1 text-xl font-bold ${tone}`}>{value}</p>
    <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
  </div>
);

const StudentDashboard = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalSessions: 0,
    attendanceRate: null,
    activityScore: null,
    vigilanceScore: null,
  });
  const [homework, setHomework] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [tomorrow, setTomorrow] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Ta session a expiré. Reconnecte-toi pour continuer.');

      const headers = { Authorization: `Bearer ${token}` };
      const [statsResponse, homeworkResponse, documentsResponse, tomorrowResponse] = await Promise.all([
        fetch(`${apiUrl}/api/students/me/tracking-stats`, { headers, cache: 'no-store' }),
        fetch(`${apiUrl}/api/students/me/homework`, { headers, cache: 'no-store' }),
        fetch(`${apiUrl}/api/students/me/documents`, { headers, cache: 'no-store' }),
        fetch(`${apiUrl}/api/students/me/tomorrow`, { headers, cache: 'no-store' }),
      ]);

      const [statsData, homeworkData, documentsData] = await Promise.all([
        readJson(statsResponse, {}),
        readJson(homeworkResponse, []),
        readJson(documentsResponse, []),
      ]);
      const tomorrowData = tomorrowResponse.ok
        ? await tomorrowResponse.json().catch(() => null)
        : null;

      const totalSessions = asNumber(statsData?.total_sessions);
      const presentCount = asNumber(statsData?.present_count);
      const concentrated = asNumber(statsData?.concentre_count);
      const average = asNumber(statsData?.moyen_count);
      const distracted = asNumber(statsData?.distrait_count);
      const disciplineTotal = concentrated + average + distracted;

      let attendanceRate = null;
      let activityScore = null;
      let vigilanceScore = null;

      if (totalSessions > 0) {
        attendanceRate = (presentCount / totalSessions) * 100;
        const notebookScore = (asNumber(statsData?.cahier_present_count) / totalSessions) * 100;
        const writingScore = (asNumber(statsData?.writing_count) / totalSessions) * 100;
        const participationScore = (
          asNumber(statsData?.excellent_participation) * 100
          + asNumber(statsData?.good_participation) * 75
          + asNumber(statsData?.faible_participation) * 50
        ) / totalSessions;
        vigilanceScore = disciplineTotal > 0
          ? ((concentrated * 100 + average * 50) / disciplineTotal)
          : null;
        const availableScores = [attendanceRate, notebookScore, writingScore, participationScore];
        if (vigilanceScore !== null) availableScores.push(vigilanceScore);
        activityScore = availableScores.reduce((sum, value) => sum + value, 0) / availableScores.length;
      }

      setStats({ totalSessions, attendanceRate, activityScore, vigilanceScore });
      setHomework(Array.isArray(homeworkData) ? homeworkData : []);
      setDocuments(Array.isArray(documentsData) ? documentsData : []);
      setTomorrow(tomorrowData);
    } catch (loadError) {
      setError(loadError?.message || 'Impossible de charger ton espace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const pendingHomework = useMemo(
    () => homework
      .filter((item) => !isCompletedHomework(item))
      .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || ''))),
    [homework],
  );
  const overdueHomework = useMemo(
    () => pendingHomework.filter(isOverdueHomework),
    [pendingHomework],
  );
  const unreadDocuments = useMemo(
    () => documents.filter((document) => !document.viewed),
    [documents],
  );
  const tomorrowSessions = Array.isArray(tomorrow?.sessions) ? tomorrow.sessions : [];
  const hasTracking = stats.totalSessions > 0;

  const nextStep = useMemo(() => {
    if (overdueHomework.length > 0) {
      return {
        title: 'Commence par le devoir en retard',
        text: overdueHomework[0]?.title || 'Ouvre tes devoirs et termine le plus urgent.',
        to: '/my-assignments',
        action: 'Voir mes devoirs',
      };
    }
    if (pendingHomework.length > 0) {
      return {
        title: 'Ta prochaine priorité',
        text: `${pendingHomework[0]?.title || 'Un devoir'} — pour le ${formatShortDate(pendingHomework[0]?.due_date)}.`,
        to: '/my-assignments',
        action: 'Ouvrir le devoir',
      };
    }
    if (unreadDocuments.length > 0) {
      return {
        title: 'Une ressource t’attend',
        text: unreadDocuments[0]?.title || 'Ton professeur a ajouté un nouveau document.',
        to: '/student/documents',
        action: 'Voir la ressource',
      };
    }
    if (hasTracking && stats.attendanceRate < 80) {
      return {
        title: 'Ton objectif simple',
        text: 'Arrive à l’heure à la prochaine séance. Un petit pas suffit pour progresser.',
        to: '/student/level',
        action: 'Voir ma progression',
      };
    }
    return {
      title: 'Rien d’urgent pour le moment',
      text: tomorrowSessions.length > 0
        ? 'Prépare simplement tes cours de demain.'
        : 'Profite de ce moment pour relire un cours ou organiser ton sac.',
      to: '/student/timetable',
      action: 'Voir mon emploi',
    };
  }, [hasTracking, overdueHomework, pendingHomework, stats.attendanceRate, tomorrowSessions.length, unreadDocuments]);

  const firstName = profile?.first_name || 'élève';

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin text-primary" />
          Préparation de ton espace…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="space-y-4 p-6 text-center">
            <p className="font-semibold text-red-800">Impossible de charger ton espace</p>
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white"
            >
              <RefreshCw className="h-4 w-4" /> Réessayer
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-4">
      <div className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-amber-50 p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Ton espace scolaire</p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">Bonjour {firstName} 👋</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Voici ce qui compte maintenant, sans chercher dans plusieurs écrans.
            </p>
          </div>
          <Link
            to={nextStep.to}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm"
          >
            {nextStep.action} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <section aria-labelledby="student-quick-access">
        <div className="mb-3">
          <h2 id="student-quick-access" className="text-lg font-semibold">Mes essentiels</h2>
          <p className="text-xs text-muted-foreground">Les quatre endroits utiles chaque jour</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink
            to="/student/timetable"
            icon={CalendarDays}
            title="Mon emploi"
            detail={tomorrowSessions.length > 0 ? `${tomorrowSessions.length} cours demain` : 'Aujourd’hui et demain'}
            tone="bg-blue-100 text-blue-700"
          />
          <QuickLink
            to="/my-assignments"
            icon={ClipboardList}
            title="Mes devoirs"
            detail={pendingHomework.length > 0 ? `${pendingHomework.length} à faire` : 'Tout est à jour'}
            tone="bg-amber-100 text-amber-700"
          />
          <QuickLink
            to="/my-grades"
            icon={BarChart3}
            title="Mes résultats"
            detail="Notes et progression"
            tone="bg-violet-100 text-violet-700"
          />
          <QuickLink
            to="/student/documents"
            icon={FileText}
            title="Mes ressources"
            detail={unreadDocuments.length > 0 ? `${unreadDocuments.length} nouvelle(s)` : 'Cours et documents'}
            tone="bg-emerald-100 text-emerald-700"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <Card className="h-full border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">{nextStep.title}</CardTitle>
                  <CardDescription className="mt-1">Une seule action claire à la fois</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{nextStep.text}</p>
              <Link to={nextStep.to} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                {nextStep.action} <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock3 className="h-5 w-5 text-blue-600" /> Demain
            </CardTitle>
            <CardDescription>{tomorrow?.dayLabel || 'Ta prochaine journée de cours'}</CardDescription>
          </CardHeader>
          <CardContent>
            {tomorrowSessions.length === 0 ? (
              <div className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
                Aucun cours affiché pour demain.
              </div>
            ) : (
              <div className="space-y-2">
                {tomorrowSessions.slice(0, 3).map((session, index) => (
                  <div key={`${session.startTime}-${session.subject}-${index}`} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="w-12 shrink-0 text-center text-xs font-bold text-primary">{session.startTime}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{session.subject || 'Cours'}</p>
                      <p className="truncate text-xs text-muted-foreground">{session.teacher || session.room || 'Détails à confirmer'}</p>
                    </div>
                  </div>
                ))}
                {tomorrowSessions.length > 3 && (
                  <p className="text-xs text-muted-foreground">+ {tomorrowSessions.length - 3} autre(s) cours</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {hasTracking ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-primary" /> Ma progression
                </CardTitle>
                <CardDescription>Basée sur {stats.totalSessions} séance{stats.totalSessions > 1 ? 's' : ''}</CardDescription>
              </div>
              <Link to="/student/level" className="text-xs font-semibold text-primary hover:underline">Voir le détail</Link>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Metric
              label="Présence"
              value={`${stats.attendanceRate.toFixed(0)}%`}
              hint="Séances suivies"
              tone={stats.attendanceRate >= 80 ? 'text-emerald-700' : 'text-amber-700'}
            />
            <Metric
              label="Régularité"
              value={`${stats.activityScore.toFixed(0)}%`}
              hint="Cahier, écriture et participation"
              tone={stats.activityScore >= 70 ? 'text-emerald-700' : 'text-amber-700'}
            />
            <Metric
              label="Concentration"
              value={stats.vigilanceScore === null ? '—' : `${stats.vigilanceScore.toFixed(0)}%`}
              hint={stats.vigilanceScore === null ? 'Pas encore évaluée' : 'Pendant les cours'}
              tone={stats.vigilanceScore !== null && stats.vigilanceScore >= 70 ? 'text-emerald-700' : 'text-amber-700'}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center sm:flex-row sm:text-left">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <BookOpen className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">Ta progression apparaîtra bientôt</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Aucune séance n’a encore été enregistrée. Les tirets ne sont ni une mauvaise note ni une alerte.
              </p>
            </div>
            <CheckCircle2 className="hidden h-5 w-5 text-emerald-600 sm:block" />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StudentDashboard;
