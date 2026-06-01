import { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw, Clock, CalendarCheck, BookOpen, ClipboardCheck, ClipboardList,
  ChevronRight, ChevronLeft, AlertTriangle, TrendingUp, Users, GraduationCap, X
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';

const DAY_LABELS = {
  monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi',
  thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche'
};

// ===== Helpers de période =====
const toISO = (d) => d.toISOString().split('T')[0];

const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0=dim
  const diff = day === 0 ? -6 : 1 - day; // lundi
  d.setDate(d.getDate() + diff);
  return d;
};

const computePeriod = (mode, ref, customStart, customEnd, semester) => {
  const d = new Date(ref + 'T00:00:00');
  if (mode === 'day') {
    return { start: ref, end: ref };
  }
  if (mode === 'week') {
    const s = startOfWeek(d);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    return { start: toISO(s), end: toISO(e) };
  }
  if (mode === 'month') {
    const s = new Date(d.getFullYear(), d.getMonth(), 1);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: toISO(s), end: toISO(e) };
  }
  if (mode === 'semester') {
    const y = d.getFullYear();
    // S1: sept (année N) -> janvier (N+1) ; S2: février -> juin/août
    if (semester === 'S1') {
      const month = d.getMonth();
      const baseYear = month >= 7 ? y : y - 1; // si on est avant août, S1 = année précédente
      return { start: `${baseYear}-09-01`, end: `${baseYear + 1}-01-31` };
    }
    return { start: `${y}-02-01`, end: `${y}-06-30` };
  }
  // custom
  return { start: customStart, end: customEnd };
};

const rateColor = (pct) => {
  if (pct >= 80) return 'text-green-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
};
const barColor = (pct) => {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
};

const ProgressBar = ({ pct }) => (
  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
    <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
  </div>
);

const TeacherTrackingDashboard = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [mode, setMode] = useState('week');
  const [refDate, setRefDate] = useState(toISO(new Date()));
  const [customStart, setCustomStart] = useState(toISO(new Date()));
  const [customEnd, setCustomEnd] = useState(toISO(new Date()));
  const [semester, setSemester] = useState('S1');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [sortBy, setSortBy] = useState('slots_rate');

  const period = useMemo(
    () => computePeriod(mode, refDate, customStart, customEnd, semester),
    [mode, refDate, customStart, customEnd, semester]
  );

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(
        `${apiUrl}/api/admin/teachers/tracking-dashboard?start=${period.start}&end=${period.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur de chargement');
      setData(json);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Erreur de chargement');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start, period.end]);

  const teachers = data?.teachers || [];

  const sorted = useMemo(() => {
    const arr = [...teachers];
    arr.sort((a, b) => {
      if (sortBy === 'name') return `${a.last_name}`.localeCompare(`${b.last_name}`);
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });
    return arr;
  }, [teachers, sortBy]);

  // ===== Totaux globaux =====
  const totals = useMemo(() => {
    const t = {
      expected: 0, realized: 0, hours: 0, sessions: 0, tracked: 0,
      homework: 0, ctrlPlanned: 0, ctrlDone: 0, activeTeachers: 0
    };
    teachers.forEach(x => {
      t.expected += x.expected_slots;
      t.realized += x.realized_slots;
      t.hours += x.hours_taught;
      t.sessions += x.sessions_count;
      t.tracked += x.sessions_with_tracking;
      t.homework += x.homework_count;
      t.ctrlPlanned += x.controls_planned;
      t.ctrlDone += x.controls_completed;
      if (x.sessions_count > 0) t.activeTeachers += 1;
    });
    return t;
  }, [teachers]);

  const globalSlotsRate = totals.expected > 0 ? Math.round((totals.realized / totals.expected) * 100) : 0;

  const shiftRef = (deltaDays) => {
    const d = new Date(refDate + 'T00:00:00');
    d.setDate(d.getDate() + deltaDays);
    setRefDate(toISO(d));
  };

  const periodLabel = () => {
    if (mode === 'day') return new Date(period.start + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return `${new Date(period.start + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → ${new Date(period.end + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  const MODES = [
    { key: 'day', label: 'Jour' },
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
    { key: 'semester', label: 'Semestre' },
    { key: 'custom', label: 'Période' }
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-blue-600" />
            Suivi des Professeurs
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Activité et taux de réalisation par professeur — <span className="font-medium">{periodLabel()}</span>
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Filtres de période */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {MODES.map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  mode === m.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {mode === 'custom' ? (
              <>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase block mb-1">Du</label>
                  <input type="date" value={customStart} max={customEnd}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase block mb-1">Au</label>
                  <input type="date" value={customEnd} min={customStart}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </div>
              </>
            ) : mode === 'semester' ? (
              <div className="flex items-center gap-2">
                {['S1', 'S2'].map(s => (
                  <button key={s} onClick={() => setSemester(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm border ${
                      semester === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                    {s === 'S1' ? 'Semestre 1' : 'Semestre 2'}
                  </button>
                ))}
                <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => shiftRef(mode === 'month' ? -30 : mode === 'day' ? -1 : -7)}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                <button onClick={() => shiftRef(mode === 'month' ? 30 : mode === 'day' ? 1 : 7)}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* KPI globaux */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={CalendarCheck} color="blue" label="Créneaux réalisés"
          value={`${globalSlotsRate}%`} sub={`${totals.realized}/${totals.expected} créneaux`} />
        <KpiCard icon={Clock} color="violet" label="Heures enseignées"
          value={`${totals.hours.toFixed(1)}h`} sub={`${totals.sessions} séances`} />
        <KpiCard icon={ClipboardCheck} color="green" label="Contrôles réalisés"
          value={`${totals.ctrlDone}/${totals.ctrlPlanned}`} sub="planifiés" />
        <KpiCard icon={BookOpen} color="amber" label="Devoirs créés"
          value={totals.homework} sub={`${totals.activeTeachers}/${teachers.length} profs actifs`} />
      </div>

      {/* Liste des profs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" /> Professeurs ({teachers.length})
            </CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Trier par</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                <option value="slots_rate">Taux de créneaux</option>
                <option value="hours_taught">Heures enseignées</option>
                <option value="tracking_rate">Taux de suivi</option>
                <option value="homework_count">Devoirs</option>
                <option value="controls_rate">Contrôles</option>
                <option value="name">Nom</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-10 text-muted-foreground">Chargement...</p>
          ) : sorted.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground">Aucun professeur sur cette période</p>
          ) : (
            <div className="space-y-2">
              {sorted.map(t => (
                <button key={t.id} onClick={() => setSelected(t)}
                  className="w-full text-left border rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-[160px]">
                      <p className="font-semibold text-gray-900">{t.first_name} {t.last_name}</p>
                      <p className="text-xs text-gray-500">{t.email}</p>
                    </div>

                    <div className="flex-1 min-w-[200px] max-w-sm">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500">Créneaux réalisés</span>
                        <span className={`font-bold ${rateColor(t.slots_rate)}`}>
                          {t.slots_rate}% <span className="text-gray-400 font-normal">({t.realized_slots}/{t.expected_slots})</span>
                        </span>
                      </div>
                      <ProgressBar pct={t.slots_rate} />
                    </div>

                    <div className="flex items-center gap-4 text-center">
                      <Metric icon={Clock} value={`${t.hours_taught}h`} label="heures" />
                      <Metric icon={ClipboardList} value={`${t.sessions_with_tracking}`} label="suivis" />
                      <Metric icon={BookOpen} value={t.homework_count} label="devoirs" />
                      <Metric icon={ClipboardCheck} value={`${t.controls_completed}/${t.controls_planned}`} label="contrôles" />
                      <ChevronRight className="w-5 h-5 text-gray-300" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <TeacherDetailModal teacher={selected} period={period} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

const COLORS = {
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  green: 'bg-green-50 text-green-600',
  amber: 'bg-amber-50 text-amber-600'
};

const KpiCard = ({ icon: Icon, color, label, value, sub }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${COLORS[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight">{value}</p>
          <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
          <p className="text-[11px] text-gray-400 truncate">{sub}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

const Metric = ({ icon: Icon, value, label }) => (
  <div className="flex flex-col items-center min-w-[52px]">
    <Icon className="w-4 h-4 text-gray-400 mb-0.5" />
    <span className="text-sm font-bold text-gray-900">{value}</span>
    <span className="text-[10px] text-gray-400">{label}</span>
  </div>
);

const TeacherDetailModal = ({ teacher: t, period, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-blue-600" />
              {t.first_name} {t.last_name}
            </h3>
            <p className="text-sm text-gray-500">{t.email}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* KPI détaillés */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <DetailKpi label="Créneaux réalisés" value={`${t.slots_rate}%`}
              sub={`${t.realized_slots}/${t.expected_slots}`} color="blue" pct={t.slots_rate} />
            <DetailKpi label="Heures enseignées" value={`${t.hours_taught}h`}
              sub={`${t.sessions_count} séances`} color="violet" />
            <DetailKpi label="Taux de suivi" value={`${t.tracking_rate}%`}
              sub={`${t.sessions_with_tracking}/${t.sessions_count} séances`} color="green" pct={t.tracking_rate} />
            <DetailKpi label="Devoirs créés" value={t.homework_count} color="amber" />
            <DetailKpi label="Contrôles réalisés" value={`${t.controls_completed}/${t.controls_planned}`}
              sub={`${t.controls_rate}%`} color="rose" pct={t.controls_rate} />
          </div>

          {/* Par classe */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-2 text-sm">Répartition par classe</h4>
            {t.by_class.length === 0 ? (
              <p className="text-sm text-gray-400">Aucun créneau planifié sur cette période.</p>
            ) : (
              <div className="space-y-2">
                {t.by_class.map(c => (
                  <div key={c.class_id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-gray-800">{c.class_name}</span>
                      <span className="text-gray-500">{c.hours}h • {c.realized}/{c.expected} créneaux</span>
                    </div>
                    <ProgressBar pct={c.rate} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Créneaux manqués */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-2 text-sm flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Créneaux non saisis ({t.missed_slots.length})
            </h4>
            {t.missed_slots.length === 0 ? (
              <p className="text-sm text-green-600">Tous les créneaux ont été saisis.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
                {t.missed_slots.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-gray-800">
                        {new Date(m.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className="text-gray-400"> • {m.start_time}–{m.end_time}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-700">{m.class_name}</span>
                      <span className="text-gray-400 text-xs"> · {m.subject}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const DETAIL_COLORS = {
  blue: 'text-blue-600', violet: 'text-violet-600', green: 'text-green-600',
  amber: 'text-amber-600', rose: 'text-rose-600'
};

const DetailKpi = ({ label, value, sub, color, pct }) => (
  <div className="border rounded-lg p-3">
    <p className={`text-xl font-bold ${DETAIL_COLORS[color]}`}>{value}</p>
    <p className="text-xs font-medium text-gray-700">{label}</p>
    {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    {typeof pct === 'number' && <div className="mt-1.5"><ProgressBar pct={pct} /></div>}
  </div>
);

export default TeacherTrackingDashboard;
