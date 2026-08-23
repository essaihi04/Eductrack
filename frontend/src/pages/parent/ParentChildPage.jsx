import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { saveBlob, openBlob } from '../../lib/download';
import {
  ArrowLeft, BookOpen, FileText, Activity, Bus, GraduationCap,
  CheckCircle2, XCircle, Clock, AlertCircle, Calendar, Award,
  Eye, Download, BookOpen as BookOpenIcon, Edit3, Home as HomeIcon, RotateCcw, Star, FileImage,
  ChevronDown, ChevronUp, TrendingUp, AlertTriangle, Camera,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { parentPathForChild, rememberParentChild } from '../../lib/parentNavigation';
import { useI18n, useT } from '../../i18n';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TABS = [
  { key: 'overview', labelKey: 'pchild.tab.overview', icon: Activity },
  { key: 'school', labelKey: 'pchild.tab.school', icon: BookOpen },
  { key: 'tracking', labelKey: 'pchild.tab.tracking', icon: GraduationCap },
  { key: 'resources', labelKey: 'pchild.tab.resources', icon: FileText },
];

const fetchJson = async (path) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = 'Erreur';
    try { const j = await res.json(); msg = j.error || msg; } catch { /* réponse non JSON */ }
    throw new Error(msg);
  }
  return res.json();
};

const fetchBlob = async (path) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = `Erreur (${res.status})`;
    try { const j = await res.json(); msg = j.error || msg; } catch { /* réponse non JSON */ }
    throw new Error(msg);
  }
  return res.blob();
};

const DOCUMENT_TYPE_META = {
  cours: { labelKey: 'pchild.docType.cours', icon: BookOpenIcon, color: 'bg-blue-100 text-blue-700' },
  exercice: { labelKey: 'pchild.docType.exercice', icon: Edit3, color: 'bg-purple-100 text-purple-700' },
  devoir: { labelKey: 'pchild.docType.devoir', icon: HomeIcon, color: 'bg-emerald-100 text-emerald-700' },
  rattrapage: { labelKey: 'pchild.docType.rattrapage', icon: RotateCcw, color: 'bg-orange-100 text-orange-700' },
  approfondissement: { labelKey: 'pchild.docType.approfondissement', icon: Star, color: 'bg-amber-100 text-amber-700' },
};

const getFileIcon = (fileName = '') => {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return <FileText className="w-8 h-8 text-red-500" />;
  if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return <FileImage className="w-8 h-8 text-blue-500" />;
  if (['doc', 'docx'].includes(ext)) return <FileText className="w-8 h-8 text-blue-600" />;
  if (['ppt', 'pptx'].includes(ext)) return <FileText className="w-8 h-8 text-orange-500" />;
  return <FileText className="w-8 h-8 text-gray-500" />;
};

const formatFileSize = (bytes, t) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} ${t('pchild.size.kb')}`;
  return `${(kb / 1024).toFixed(1)} ${t('pchild.size.mb')}`;
};

const ParentChildPage = () => {
  const { childId } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const [tab, setTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [homework, setHomework] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [grades, setGrades] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  useEffect(() => {
    rememberParentChild(childId);
    load();
    // `load` lit uniquement l'identifiant courant ; le changement de route
    // est l'unique déclencheur voulu ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`${apiUrl}/api/parent/children/${childId}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t('pchild.photoError'));
      }
      const data = await res.json();
      setProfile((p) => ({ ...p, avatar_url: data.avatar_url }));
    } catch (err) {
      alert(err.message);
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [p, s, h, hw, doc, g, tt] = await Promise.all([
        fetchJson(`/api/parent/children/${childId}/profile`),
        fetchJson(`/api/parent/children/${childId}/tracking-stats`),
        fetchJson(`/api/parent/children/${childId}/tracking-history?limit=30`),
        fetchJson(`/api/parent/children/${childId}/homework`).catch(() => []),
        fetchJson(`/api/parent/children/${childId}/documents`).catch(() => []),
        fetchJson(`/api/parent/children/${childId}/control-grades`).catch(() => []),
        fetchJson(`/api/parent/children/${childId}/timetable`).catch(() => []),
      ]);
      setProfile(p);
      setStats(s);
      setHistory(Array.isArray(h) ? h : []);
      setHomework(Array.isArray(hw) ? hw : []);
      setDocuments(Array.isArray(doc) ? doc : []);
      setGrades(Array.isArray(g) ? g : []);
      setTimetable(Array.isArray(tt) ? tt : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!profile) return null;

  const total = stats?.total_sessions || 0;
  const presenceRate = total > 0 ? Math.round(((stats.present_count || 0) / total) * 100) : null;
  const concentreTotal = (stats?.concentre_count || 0) + (stats?.moyen_count || 0) + (stats?.distrait_count || 0);
  const disciplineRate = concentreTotal > 0 ? Math.round((stats.concentre_count / concentreTotal) * 100) : null;
  const partTotal = (stats?.excellent_participation || 0) + (stats?.good_participation || 0) + (stats?.faible_participation || 0);
  const participationRate = partTotal > 0 ? Math.round(((stats.excellent_participation + stats.good_participation) / partTotal) * 100) : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <button onClick={() => navigate('/parent')} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4">
        <ArrowLeft className="w-4 h-4" /> {t('pchild.back')}
      </button>

      {/* Header */}
      <div className="rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white p-6 shadow-lg mb-6">
        <div className="flex items-center gap-4">
          <div className="relative group">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url.startsWith('http') ? profile.avatar_url : `${apiUrl}${profile.avatar_url}`}
                alt={`${profile.first_name} ${profile.last_name}`}
                className="w-16 h-16 rounded-full object-cover border-2 border-white/40"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center font-bold text-2xl">
                {(profile.first_name?.[0] || '').toUpperCase()}{(profile.last_name?.[0] || '').toUpperCase()}
              </div>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              title={t('pchild.photoUpload')}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white text-blue-600 shadow flex items-center justify-center hover:bg-blue-50 transition disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{profile.first_name} {profile.last_name}</h1>
            <p className="text-white/80 text-sm">
              {profile.classes ? `${profile.classes.name}${profile.classes.level ? ` • ${profile.classes.level}` : ''}` : t('pchild.noClass')}
              {profile.relationship ? ` • ${profile.relationship}` : ''}
            </p>
          </div>
          <button
            onClick={() => navigate(parentPathForChild('/parent/transport', childId))}
            className="hidden sm:flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg backdrop-blur transition"
          >
            <Bus className="w-4 h-4" /> {t('pchild.transport')}
          </button>
        </div>
      </div>

      {!profile.classes && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{t('pchild.noClassHelp')}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto mb-4 border-b border-gray-200">
        {TABS.map(tabItem => {
          const Icon = tabItem.icon;
          const active = tab === tabItem.key;
          return (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition ${
                active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" /> {t(tabItem.labelKey)}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label={t('pchild.kpi.presence')} value={presenceRate === null ? '—' : `${presenceRate}%`} icon={CheckCircle2} color="text-green-600" />
            <KPI label={t('pchild.kpi.discipline')} value={disciplineRate === null ? '—' : `${disciplineRate}%`} icon={Activity} color="text-orange-600" />
            <KPI label={t('pchild.kpi.participation')} value={participationRate === null ? '—' : `${participationRate}%`} icon={Award} color="text-blue-600" />
            <KPI label={t('pchild.kpi.sessions')} value={total} icon={GraduationCap} color="text-purple-600" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat title={t('pchild.stat.present')} value={stats?.present_count || 0} color="bg-green-50 text-green-700" />
            <Stat title={t('pchild.stat.absent')} value={stats?.absent_count || 0} color="bg-red-50 text-red-700" />
            <Stat title={t('pchild.stat.late')} value={stats?.late_count || 0} color="bg-orange-50 text-orange-700" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">{t('pchild.behavior')}</h3>
              <BarLine label={t('pchild.val.concentre')} value={stats?.concentre_count || 0} total={concentreTotal} color="bg-green-500" />
              <BarLine label={t('pchild.val.moyen')} value={stats?.moyen_count || 0} total={concentreTotal} color="bg-yellow-500" />
              <BarLine label={t('pchild.val.distrait')} value={stats?.distrait_count || 0} total={concentreTotal} color="bg-red-500" />
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">{t('pchild.participation')}</h3>
              <BarLine label={t('pchild.val.excellent')} value={stats?.excellent_participation || 0} total={partTotal} color="bg-green-500" />
              <BarLine label={t('pchild.val.bon')} value={stats?.good_participation || 0} total={partTotal} color="bg-blue-500" />
              <BarLine label={t('pchild.val.faible')} value={stats?.faible_participation || 0} total={partTotal} color="bg-red-500" />
            </div>
          </div>
        </div>
      )}

      {tab === 'school' && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">{t('pchild.tab.homework')}</h2>
          {homework.length === 0 && <Empty>{t('pchild.empty.homework')}</Empty>}
          {homework.map(hw => {
            const sub = (hw.homework_submissions || [])[0];
            const submitted = sub && sub.status === 'submitted';
            return (
              <div key={hw.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{hw.title || t('pchild.hw.title')}</p>
                    <p className="text-sm font-medium text-blue-700">
                      {hw.subject_name || hw.subjects?.name || t('pchild.hw.noSubject')}
                    </p>
                    {hw.description && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{hw.description}</p>}
                    {hw.due_date && (
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {t('pchild.hw.due', { date: new Date(hw.due_date).toLocaleDateString(dateLocale) })}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${submitted ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {t(submitted ? 'pchild.hw.submitted' : 'pchild.hw.pending')}
                  </span>
                </div>
                {sub?.grade !== undefined && sub?.grade !== null && (
                  <p className="mt-2 text-sm font-medium text-blue-700">{t('pchild.hw.grade', { grade: sub.grade })}</p>
                )}
                {sub?.feedback && <p className="mt-1 text-xs italic text-gray-600">« {sub.feedback} »</p>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'school' && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900 pt-3">{t('pchild.tab.grades')}</h2>
          {grades.length === 0 && <Empty>{t('pchild.empty.grades')}</Empty>}
          {grades.map(g => {
            const max = 20;
            const pct = g.note != null ? (g.note / max) * 100 : null;
            const color = pct === null ? 'text-gray-500' : pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-blue-600' : 'text-red-600';
            return (
              <div key={g.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{g.subject_name || g.control_name || t('pchild.grade.control')}</p>
                  <p className="text-sm text-gray-500">
                    {g.control_date && new Date(g.control_date).toLocaleDateString(dateLocale)}
                    {g.teacher_name ? ` • ${g.teacher_name}` : ''}
                  </p>
                  {g.appreciation && <p className="text-xs italic text-gray-600 mt-1">« {g.appreciation} »</p>}
                </div>
                <div className={`text-2xl font-bold ${color}`}>
                  {g.note ?? '—'}<span className="text-sm text-gray-500">/{max}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'tracking' && <TrackingAnalytics history={history} dateLocale={dateLocale} />}

      {tab === 'resources' && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">{t('pchild.tab.documents')}</h2>
          {documents.length === 0 && <Empty>{t('pchild.empty.documents')}</Empty>}
          {documents.map(d => (
            <DocumentCard key={d.id} doc={d} childId={childId} dateLocale={dateLocale} />
          ))}
        </div>
      )}

      {tab === 'resources' && (
        <div className="space-y-3 pt-3">
          <h2 className="text-lg font-bold text-gray-900">{t('pchild.tab.timetable')}</h2>
          <TimetableGrid slots={timetable} />
        </div>
      )}
    </div>
  );
};

// ---------- Emploi du temps : grille hebdomadaire (paysage) ----------
const SUBJECT_PALETTE = [
  'bg-blue-50 border-blue-200 text-blue-800',
  'bg-emerald-50 border-emerald-200 text-emerald-800',
  'bg-purple-50 border-purple-200 text-purple-800',
  'bg-amber-50 border-amber-200 text-amber-800',
  'bg-rose-50 border-rose-200 text-rose-800',
  'bg-cyan-50 border-cyan-200 text-cyan-800',
  'bg-indigo-50 border-indigo-200 text-indigo-800',
  'bg-teal-50 border-teal-200 text-teal-800',
  'bg-orange-50 border-orange-200 text-orange-800',
  'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800',
];
const subjectColor = (name) => {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SUBJECT_PALETTE[h % SUBJECT_PALETTE.length];
};
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

const TimetableGrid = ({ slots }) => {
  const t = useT();
  if (!slots || slots.length === 0) return <Empty>{t('pchild.empty.timetable')}</Empty>;

  // Jours présents dans les données, triés (lun → dim)
  const days = [...new Set(slots.map((s) => s.day_of_week))].sort((a, b) => dayIndex(a) - dayIndex(b));
  // Créneaux horaires distincts (par heure de début/fin), triés
  const slotKeys = [...new Set(slots.map((s) => `${hhmm(s.start_time)}|${hhmm(s.end_time)}`))]
    .sort((a, b) => a.localeCompare(b));

  const cell = (day, key) => {
    const [st, en] = key.split('|');
    return slots.find((s) => s.day_of_week === day && hhmm(s.start_time) === st && hhmm(s.end_time) === en);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
      <table className="w-full border-collapse min-w-[680px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-gradient-to-br from-blue-600 to-purple-600 text-white text-xs font-semibold px-3 py-3 w-24 rounded-tl-xl">
              <Clock className="w-4 h-4 inline" />
            </th>
            {days.map((d, i) => (
              <th
                key={d}
                className={`bg-gradient-to-br from-blue-600 to-purple-600 text-white text-sm font-semibold px-3 py-3 capitalize ${i === days.length - 1 ? 'rounded-tr-xl' : ''}`}
              >
                {dayName(d, t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slotKeys.map((key, ri) => {
            const [st, en] = key.split('|');
            return (
              <tr key={key} className={ri % 2 ? 'bg-gray-50/50' : 'bg-white'}>
                <td className="sticky left-0 z-10 bg-inherit border-r border-gray-200 px-2 py-2 text-center align-middle">
                  <div className="text-xs font-bold text-gray-700">{st}</div>
                  <div className="text-[10px] text-gray-400">{en}</div>
                </td>
                {days.map((d) => {
                  const s = cell(d, key);
                  return (
                    <td key={d} className="border-l border-gray-100 px-1.5 py-1.5 align-top">
                      {s ? (
                        <div className={`rounded-lg border px-2 py-1.5 h-full ${subjectColor(s.subject?.name)}`}>
                          <div className="font-semibold text-xs leading-tight">{s.subject?.name || t('pchild.timetable.course')}</div>
                          {s.teacher && (
                            <div className="text-[10px] opacity-80 mt-0.5 truncate">
                              {s.teacher.first_name} {s.teacher.last_name}
                            </div>
                          )}
                          {s.room && <div className="text-[10px] opacity-70 mt-0.5">📍 {s.room}</div>}
                        </div>
                      ) : (
                        <div className="h-8" />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const KPI = ({ label, value, icon, color }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    {createElement(icon, { className: `w-5 h-5 ${color}` })}
    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    <p className="text-xs uppercase text-gray-500">{label}</p>
  </div>
);

const Stat = ({ title, value, color }) => (
  <div className={`rounded-lg p-4 text-center ${color}`}>
    <p className="text-xs uppercase font-semibold">{title}</p>
    <p className="text-2xl font-bold mt-1">{value}</p>
  </div>
);

const BarLine = ({ label, value, total, color }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-700 mb-1">
        <span>{label}</span>
        <span className="font-medium">{value} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const Empty = ({ children }) => (
  <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
    {children}
  </div>
);

const TAG_STYLES = {
  presence: { present: 'bg-green-100 text-green-700', absent: 'bg-red-100 text-red-700', late: 'bg-orange-100 text-orange-700', excused: 'bg-blue-100 text-blue-700' },
  discipline: { concentre: 'bg-green-100 text-green-700', moyen: 'bg-yellow-100 text-yellow-700', distrait: 'bg-red-100 text-red-700' },
  participation: { excellent: 'bg-green-100 text-green-700', bon: 'bg-blue-100 text-blue-700', faible: 'bg-red-100 text-red-700' },
  homework: { done: 'bg-green-100 text-green-700', not_done: 'bg-red-100 text-red-700', partial: 'bg-orange-100 text-orange-700' },
  phone: { 'téléphone': 'bg-red-100 text-red-700' },
};
const Tag = ({ value, kind }) => {
  const cls = TAG_STYLES[kind]?.[value] || 'bg-gray-100 text-gray-700';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cls}`}>{value}</span>;
};

// Le jour arrive soit en anglais (« monday »), soit en numéro ISO : les deux
// pointent vers la même clé de traduction pchild.day.*.
const DAY_KEYS = {
  monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday', thursday: 'thursday',
  friday: 'friday', saturday: 'saturday', sunday: 'sunday',
  1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday', 7: 'sunday', 0: 'sunday',
};
const DAY_ORDER = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
const dayName = (d, t) => (DAY_KEYS[d] ? t(`pchild.day.${DAY_KEYS[d]}`) : d);
const dayIndex = (d) => DAY_ORDER[d] ?? (typeof d === 'number' ? d : 99);

// ---------- Suivi détaillé (tous les paramètres trackés par le prof) ----------

// Tonalité d'une valeur : positive (vert), neutre (gris), négative (rouge), warning (orange)
const VALUE_TONE = {
  // présence
  present: 'pos', absent: 'neg', late: 'warn', excused: 'neutral',
  // discipline
  concentre: 'pos', moyen: 'warn', distrait: 'neg',
  // participation
  excellent: 'pos', bon: 'pos', faible: 'neg',
  // devoirs
  done: 'pos', not_done: 'neg', partial: 'warn', forgotten: 'neg',
  // qualité cahier
  good: 'pos', complete: 'pos', readable: 'pos',
  bad: 'neg', missing: 'neg', incomplete: 'neg', illegible: 'neg', unreadable: 'neg',
  partially: 'warn',
  // attitude
  positive: 'pos', neutral: 'neutral', negative: 'neg', perturbateur: 'neg',
  // écriture
  applique: 'pos', soigneuse: 'pos', neglige: 'neg', moyenne: 'warn',
};

// Valeurs traduites via pchild.val.<valeur> ; une valeur hors liste est
// affichée telle quelle (elle vient de la base).
const VALUE_KEYS = new Set([
  // présence
  'present', 'absent', 'late', 'excused',
  // discipline
  'concentre', 'moyen', 'distrait',
  // participation
  'excellent', 'bon', 'faible',
  // devoirs
  'done', 'not_done', 'partial', 'forgotten',
  // qualité cahier
  'good', 'complete', 'readable',
  'bad', 'missing', 'incomplete', 'illegible', 'unreadable', 'partially',
  // attitude
  'positive', 'neutral', 'negative', 'perturbateur',
  // écriture
  'applique', 'soigneuse', 'neglige', 'moyenne',
]);

const TONE_CLS = {
  pos: 'bg-green-100 text-green-700 border-green-200',
  neg: 'bg-red-100 text-red-700 border-red-200',
  warn: 'bg-orange-100 text-orange-700 border-orange-200',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
};

// Définit les paramètres affichés et leur libellé / icône
const TRACKING_DIMENSIONS = [
  { key: 'presence', labelKey: 'pchild.dim.presence', icon: '🧍' },
  { key: 'participation', labelKey: 'pchild.dim.participation', icon: '🙋' },
  { key: 'discipline', labelKey: 'pchild.dim.discipline', icon: '🎯' },
  { key: 'homework', labelKey: 'pchild.dim.homework', icon: '📚' },
  { key: 'attitude', labelKey: 'pchild.dim.attitude', icon: '😊' },
  { key: 'writing', labelKey: 'pchild.dim.writing', icon: '✍️' },
  { key: 'cahier_present', labelKey: 'pchild.dim.cahierPresent', icon: '📓', isBool: true },
  { key: 'sleeping', labelKey: 'pchild.dim.sleeping', icon: '😴', isBool: true, badIfTrue: true },
  { key: 'phone_use', labelKey: 'pchild.dim.phoneUse', icon: '📱', isBool: true, badIfTrue: true },
  { key: 'cahier_lesson', labelKey: 'pchild.dim.cahierLesson', icon: '📖' },
  { key: 'cahier_documents', labelKey: 'pchild.dim.cahierDocuments', icon: '🗂️' },
  { key: 'cahier_readability', labelKey: 'pchild.dim.cahierReadability', icon: '🔍' },
];

const renderTrackingValue = (dim, raw, t) => {
  if (raw === null || raw === undefined || raw === '') return null;

  if (dim.isBool) {
    const truthy = raw === true || raw === 'true' || raw === 1;
    const tone = dim.badIfTrue ? (truthy ? 'neg' : 'pos') : (truthy ? 'pos' : 'neg');
    return { tone, text: t(truthy ? 'pchild.yes' : 'pchild.no') };
  }

  const value = String(raw);
  const tone = VALUE_TONE[value] || 'neutral';
  const text = VALUE_KEYS.has(value) ? t(`pchild.val.${value}`) : value;
  return { tone, text };
};

const TrackingCard = ({ entry, dateLocale }) => {
  const t = useT();
  const sessionDate = entry.session_date && new Date(entry.session_date).toLocaleDateString(dateLocale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const items = TRACKING_DIMENSIONS
    .map(dim => ({ dim, value: renderTrackingValue(dim, entry[dim.key], t) }))
    .filter(x => x.value !== null);

  // Mini-évaluation (note numérique)
  const miniEval = entry.mini_eval !== null && entry.mini_eval !== undefined && entry.mini_eval !== '' ? Number(entry.mini_eval) : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="font-semibold text-gray-900 text-sm capitalize">{sessionDate || t('pchild.track.unknownDate')}</p>
        <p className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
          {entry.subject_name || '—'}
        </p>
      </div>

      {items.length === 0 && miniEval === null && !entry.comment && !entry.notes && (
        <p className="text-xs text-gray-500">{t('pchild.track.noParam')}</p>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map(({ dim, value }) => (
            <div
              key={dim.key}
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${TONE_CLS[value.tone]}`}
            >
              <span className="flex items-center gap-1.5 text-gray-700">
                <span>{dim.icon}</span>
                <span className="font-medium">{t(dim.labelKey)}</span>
              </span>
              <span className="font-semibold capitalize">{value.text}</span>
            </div>
          ))}
        </div>
      )}

      {miniEval !== null && (
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 text-xs font-medium">
          {t('pchild.track.miniEval')} <span className="font-bold">{miniEval}/20</span>
        </div>
      )}

      {entry.comment && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
          <p className="text-[10px] uppercase font-semibold text-amber-800 mb-0.5">{t('pchild.track.teacherComment')}</p>
          <p className="text-sm text-amber-900 italic">« {entry.comment} »</p>
        </div>
      )}

      {entry.notes && entry.notes !== entry.comment && (
        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-2.5">
          <p className="text-[10px] uppercase font-semibold text-gray-600 mb-0.5">{t('pchild.track.notes')}</p>
          <p className="text-sm text-gray-700">{entry.notes}</p>
        </div>
      )}
    </div>
  );
};

const ChildActivityBadge = ({ kind, date, dateLocale }) => {
  const t = useT();
  const seen = !!date;
  const label = t(kind === 'view' ? 'pchild.activity.viewed' : 'pchild.activity.downloaded');
  const labelNo = t(kind === 'view' ? 'pchild.activity.notViewed' : 'pchild.activity.notDownloaded');
  const Icon = kind === 'view' ? Eye : Download;

  const cls = seen
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-gray-50 text-gray-500 border-gray-200';

  let dateStr = '';
  if (seen) {
    try {
      dateStr = new Date(date).toLocaleString(dateLocale, {
        day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Africa/Casablanca',
      });
    } catch { /* date invalide : le libellé reste vide */ }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium ${cls}`}>
      <Icon className="w-3 h-3" />
      {seen ? (
        <>
          <span>{label}</span>
          <span className="opacity-70">• {dateStr}</span>
        </>
      ) : (
        <span>{labelNo}</span>
      )}
    </span>
  );
};

const DocumentCard = ({ doc, childId, dateLocale }) => {
  const t = useT();
  const [busy, setBusy] = useState('');
  const meta = DOCUMENT_TYPE_META[doc.document_type]
    ? { ...DOCUMENT_TYPE_META[doc.document_type], label: t(DOCUMENT_TYPE_META[doc.document_type].labelKey) }
    : { label: doc.document_type || t('pchild.docType.default'), icon: FileText, color: 'bg-gray-100 text-gray-700' };
  const TypeIcon = meta.icon;
  const teacher = doc.profiles ? `${doc.profiles.first_name || ''} ${doc.profiles.last_name || ''}`.trim() : '';

  const handleAction = async (mode) => {
    try {
      setBusy(mode);
      const inline = mode === 'view' ? '?inline=1' : '';
      const blob = await fetchBlob(`/api/parent/children/${childId}/documents/${doc.id}/download${inline}`);
      const fileName = doc.file_name || `document-${doc.id}`;
      if (mode === 'view') {
        await openBlob(blob, fileName);
      } else {
        await saveBlob(blob, fileName);
      }
    } catch (e) {
      alert(`❌ ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-start gap-4">
        <div className="shrink-0">{getFileIcon(doc.file_name)}</div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${meta.color}`}>
              <TypeIcon className="w-3 h-3" />
              {meta.label}
            </span>
            {doc.subjects?.name && (
              <span className="text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                {doc.subjects.name}
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold text-gray-900 truncate">{doc.title}</h3>
          <p className="text-xs text-gray-500 truncate">{doc.file_name}</p>

          {doc.description && (
            <p className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">{doc.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
            {teacher && (
              <span className="flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5" />
                {teacher}
              </span>
            )}
            {doc.created_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(doc.created_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
            {doc.file_size && <span>{formatFileSize(doc.file_size, t)}</span>}
          </div>

          {doc.controls_plan?.name && (
            <div className="mt-2 text-xs text-blue-600">{t('pchild.doc.linkedControl', { name: doc.controls_plan.name })}</div>
          )}

          {/* Statut de consultation par l'enfant */}
          <div className="mt-3 flex flex-wrap gap-2">
            <ChildActivityBadge
              kind="view"
              date={doc.child_viewed_at}
              dateLocale={dateLocale}
            />
            <ChildActivityBadge
              kind="download"
              date={doc.child_downloaded_at}
              dateLocale={dateLocale}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={() => handleAction('view')}
            disabled={!!busy}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title={t('pchild.doc.preview')}
          >
            <Eye className="w-4 h-4" />
            <span className="hidden sm:inline">{busy === 'view' ? '…' : t('pchild.doc.view')}</span>
          </button>
          <button
            onClick={() => handleAction('download')}
            disabled={!!busy}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            title={t('pchild.doc.download')}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{busy === 'download' ? '…' : t('pchild.doc.download')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// TrackingAnalytics — Visualisations intelligentes du suivi pédagogique
// ─────────────────────────────────────────────────────────────────────

const CHART_COLORS = {
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
  purple: '#8b5cf6',
  gray: '#94a3b8',
};

const formatShortDate = (iso, locale = 'fr-FR') => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short' });
  } catch { return iso; }
};

const computeAnalytics = (history, t, locale) => {
  if (!history || history.length === 0) return null;

  const total = history.length;
  const present = history.filter((h) => h.presence === 'present').length;
  const late = history.filter((h) => h.presence === 'late').length;
  const absent = history.filter((h) => h.presence === 'absent').length;

  const partGood = history.filter((h) => ['excellent', 'bon', 'bonne'].includes(h.participation)).length;
  const partTotal = history.filter((h) => h.participation).length;

  const discGood = history.filter((h) => h.discipline === 'concentre').length;
  const discMid = history.filter((h) => h.discipline === 'moyen').length;
  const discTotal = history.filter((h) => h.discipline).length;

  const hwGood = history.filter((h) => h.homework === 'done').length;
  const hwTotal = history.filter((h) => h.homework).length;

  const attGood = history.filter((h) => h.attitude === 'positive').length;
  const attTotal = history.filter((h) => h.attitude).length;

  // 1. Radar — profil global
  const radarData = [
    { dim: t('pchild.dim.presence'), score: total ? Math.round(((present + late * 0.5) / total) * 100) : 0 },
    { dim: t('pchild.dim.participation'), score: partTotal ? Math.round((partGood / partTotal) * 100) : 0 },
    { dim: t('pchild.dim.discipline'), score: discTotal ? Math.round(((discGood + discMid * 0.5) / discTotal) * 100) : 0 },
    { dim: t('pchild.an.dim.homework'), score: hwTotal ? Math.round((hwGood / hwTotal) * 100) : 0 },
    { dim: t('pchild.dim.attitude'), score: attTotal ? Math.round((attGood / attTotal) * 100) : 0 },
  ];

  // 2. Mini-évaluations — série temporelle
  const evalSeries = history
    .filter((h) => h.mini_eval !== null && h.mini_eval !== undefined && h.mini_eval !== '')
    .map((h) => ({
      date: h.session_date,
      label: formatShortDate(h.session_date, locale),
      note: Number(h.mini_eval),
      subject: h.subject_name || '—',
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const evalAvg = evalSeries.length
    ? Number((evalSeries.reduce((s, e) => s + e.note, 0) / evalSeries.length).toFixed(1))
    : null;

  // 3. Présence par semaine (8 dernières)
  const weeks = {};
  history.forEach((h) => {
    if (!h.session_date) return;
    const d = new Date(h.session_date);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const wk = monday.toISOString().slice(0, 10);
    if (!weeks[wk]) weeks[wk] = { week: wk, label: formatShortDate(wk, locale), present: 0, late: 0, absent: 0 };
    if (h.presence === 'present') weeks[wk].present += 1;
    else if (h.presence === 'late') weeks[wk].late += 1;
    else if (h.presence === 'absent') weeks[wk].absent += 1;
  });
  const weeklyAttendance = Object.values(weeks)
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-8);

  // 4. Distributions (donuts)
  const disciplineDist = [
    { name: t('pchild.val.concentre'), value: discGood, color: CHART_COLORS.green },
    { name: t('pchild.val.moyen'), value: discMid, color: CHART_COLORS.yellow },
    { name: t('pchild.val.distrait'), value: history.filter((h) => h.discipline === 'distrait').length, color: CHART_COLORS.red },
  ].filter((d) => d.value > 0);

  const participationDist = [
    { name: t('pchild.val.excellent'), value: history.filter((h) => h.participation === 'excellent').length, color: CHART_COLORS.green },
    { name: t('pchild.val.bon'), value: history.filter((h) => ['bon', 'bonne'].includes(h.participation)).length, color: CHART_COLORS.blue },
    { name: t('pchild.val.faible'), value: history.filter((h) => h.participation === 'faible').length, color: CHART_COLORS.red },
  ].filter((d) => d.value > 0);

  // 5. Incidents
  const incidents = [
    { name: t('pchild.an.inc.phone'), value: history.filter((h) => h.phone_use === true || h.phone_use === 'true').length, color: CHART_COLORS.red },
    { name: t('pchild.an.inc.sleeping'), value: history.filter((h) => h.sleeping === true || h.sleeping === 'true').length, color: CHART_COLORS.orange },
    { name: t('pchild.an.inc.homework'), value: history.filter((h) => h.homework === 'not_done').length, color: CHART_COLORS.red },
    { name: t('pchild.an.inc.absences'), value: absent, color: CHART_COLORS.red },
    { name: t('pchild.an.inc.lates'), value: late, color: CHART_COLORS.orange },
  ].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);

  // 6. Stats par matière
  const bySubject = {};
  history.forEach((h) => {
    const s = h.subject_name || t('pchild.an.noSubject');
    if (!bySubject[s]) bySubject[s] = { subject: s, sessions: 0, present: 0, evalSum: 0, evalCount: 0, partGood: 0, partTotal: 0 };
    const x = bySubject[s];
    x.sessions += 1;
    if (h.presence === 'present') x.present += 1;
    if (h.mini_eval !== null && h.mini_eval !== undefined && h.mini_eval !== '') {
      x.evalSum += Number(h.mini_eval);
      x.evalCount += 1;
    }
    if (h.participation) {
      x.partTotal += 1;
      if (['excellent', 'bon', 'bonne'].includes(h.participation)) x.partGood += 1;
    }
  });
  const subjectStats = Object.values(bySubject)
    .map((s) => ({
      subject: s.subject,
      sessions: s.sessions,
      presenceRate: Math.round((s.present / s.sessions) * 100),
      participationRate: s.partTotal ? Math.round((s.partGood / s.partTotal) * 100) : null,
      avgEval: s.evalCount > 0 ? Number((s.evalSum / s.evalCount).toFixed(1)) : null,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    counts: { total, present, late, absent },
    radarData,
    evalSeries,
    evalAvg,
    weeklyAttendance,
    disciplineDist,
    participationDist,
    incidents,
    subjectStats,
  };
};

const ChartCard = ({ title, subtitle, icon: Icon, children }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon className="w-4 h-4 text-gray-600" />}
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

const TrackingAnalytics = ({ history, dateLocale }) => {
  const t = useT();
  const [showDetails, setShowDetails] = useState(false);
  const data = useMemo(() => computeAnalytics(history, t, dateLocale), [history, t, dateLocale]);

  if (!history || history.length === 0) {
    return (
      <Empty>
        {t('pchild.an.emptyLine1')}
        <br />
        {t('pchild.an.emptyLine2')}
      </Empty>
    );
  }

  const { counts, radarData, evalSeries, evalAvg, weeklyAttendance, disciplineDist, participationDist, incidents, subjectStats } = data;
  const presenceRate = counts.total ? Math.round((counts.present / counts.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label={t('pchild.an.kpi.sessions')} value={counts.total} icon={GraduationCap} color="text-purple-600" />
        <KPI label={t('pchild.an.kpi.presence')} value={`${presenceRate}%`} icon={CheckCircle2} color="text-green-600" />
        <KPI
          label={t('pchild.an.kpi.avgEval')}
          value={evalAvg !== null ? `${evalAvg}/20` : '—'}
          icon={Award}
          color={evalAvg === null ? 'text-gray-400' : evalAvg >= 15 ? 'text-green-600' : evalAvg >= 10 ? 'text-blue-600' : 'text-red-600'}
        />
        <KPI label={t('pchild.an.kpi.incidents')} value={incidents.reduce((s, i) => s + i.value, 0)} icon={AlertTriangle} color="text-orange-600" />
      </div>

      {/* Radar + Pies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title={t('pchild.an.profile')} subtitle={t('pchild.an.profileSub')} icon={Activity}>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: '#4b5563' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Radar name={t('pchild.an.score')} dataKey="score" stroke={CHART_COLORS.blue} fill={CHART_COLORS.blue} fillOpacity={0.4} />
              <Tooltip formatter={(v) => `${v}/100`} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t('pchild.an.discipline')} subtitle={t('pchild.an.disciplineSub')} icon={Activity}>
          {disciplineDist.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-10">{t('pchild.an.noData')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={disciplineDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {disciplineDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [t('pchild.an.tt.sessions', { n: v }), n]} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={t('pchild.an.participation')} subtitle={t('pchild.an.participationSub')} icon={Award}>
          {participationDist.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-10">{t('pchild.an.noData')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={participationDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {participationDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [t('pchild.an.tt.sessions', { n: v }), n]} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Mini-évaluations dans le temps */}
      <ChartCard
        title={t('pchild.an.evalTitle')}
        subtitle={t('pchild.an.evalSub', { n: evalSeries.length, avg: evalAvg !== null ? `${evalAvg}/20` : '—' })}
        icon={TrendingUp}
      >
        {evalSeries.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-10">{t('pchild.an.noEval')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={evalSeries} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis domain={[0, 20]} tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip
                formatter={(v) => [`${v}/20`, t('pchild.an.tt.note')]}
                labelFormatter={(l, payload) => {
                  const p = payload && payload[0]?.payload;
                  return p ? `${l} — ${p.subject}` : l;
                }}
              />
              <Line type="monotone" dataKey="note" stroke={CHART_COLORS.purple} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Présence hebdomadaire empilée */}
      <ChartCard title={t('pchild.an.weekly')} subtitle={t('pchild.an.weeklySub')} icon={Calendar}>
        {weeklyAttendance.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-10">{t('pchild.an.noWeekly')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weeklyAttendance} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="present" stackId="a" name={t('pchild.stat.present')} fill={CHART_COLORS.green} radius={[0, 0, 0, 0]} />
              <Bar dataKey="late" stackId="a" name={t('pchild.stat.late')} fill={CHART_COLORS.orange} />
              <Bar dataKey="absent" stackId="a" name={t('pchild.stat.absent')} fill={CHART_COLORS.red} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Incidents */}
      {incidents.length > 0 && (
        <ChartCard title={t('pchild.an.incidentsTitle')} subtitle={t('pchild.an.incidentsSub')} icon={AlertTriangle}>
          <ResponsiveContainer width="100%" height={Math.max(180, incidents.length * 40)}>
            <BarChart layout="vertical" data={incidents} margin={{ top: 5, right: 20, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} width={90} />
              <Tooltip formatter={(v) => [t('pchild.an.tt.times', { n: v }), t('pchild.an.tt.occurrences')]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {incidents.map((i, idx) => <Cell key={idx} fill={i.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Par matière */}
      {subjectStats.length > 0 && (
        <ChartCard
          title={t('pchild.an.subjectsTitle')}
          subtitle={t(subjectStats.length > 1 ? 'pchild.an.subjectsSubMany' : 'pchild.an.subjectsSubOne', { n: subjectStats.length })}
          icon={BookOpen}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600 text-xs uppercase">
                  <th className="py-2 px-2 font-semibold">{t('pchild.an.col.subject')}</th>
                  <th className="py-2 px-2 font-semibold text-center">{t('pchild.an.col.sessions')}</th>
                  <th className="py-2 px-2 font-semibold text-center">{t('pchild.an.col.presence')}</th>
                  <th className="py-2 px-2 font-semibold text-center">{t('pchild.an.col.participation')}</th>
                  <th className="py-2 px-2 font-semibold text-center">{t('pchild.an.col.avg')}</th>
                </tr>
              </thead>
              <tbody>
                {subjectStats.map((s) => (
                  <tr key={s.subject} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-2 font-medium text-gray-900">{s.subject}</td>
                    <td className="py-2 px-2 text-center text-gray-700">{s.sessions}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        s.presenceRate >= 90 ? 'bg-green-100 text-green-700'
                        : s.presenceRate >= 75 ? 'bg-blue-100 text-blue-700'
                        : s.presenceRate >= 60 ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                      }`}>
                        {s.presenceRate}%
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center text-gray-700">
                      {s.participationRate !== null ? `${s.participationRate}%` : '—'}
                    </td>
                    <td className="py-2 px-2 text-center font-semibold text-gray-900">
                      {s.avgEval !== null ? s.avgEval : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {/* Détail des séances (collapsible) */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-600" />
            <span className="font-semibold text-gray-900 text-sm">
              {t(history.length > 1 ? 'pchild.an.detailsMany' : 'pchild.an.detailsOne', { n: history.length })}
            </span>
          </div>
          {showDetails ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        {showDetails && (
          <div className="p-4 space-y-3 border-t border-gray-100 bg-gray-50">
            {history.map((entry) => <TrackingCard key={entry.id} entry={entry} dateLocale={dateLocale} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentChildPage;
