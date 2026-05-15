import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, FileText, Activity, Bus, GraduationCap,
  CheckCircle2, XCircle, Clock, AlertCircle, Calendar, Award,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TABS = [
  { key: 'overview', label: "Vue d'ensemble", icon: Activity },
  { key: 'homework', label: 'Devoirs', icon: BookOpen },
  { key: 'grades', label: 'Notes', icon: Award },
  { key: 'tracking', label: 'Suivi', icon: GraduationCap },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'timetable', label: 'Emploi du temps', icon: Calendar },
];

const fetchJson = async (path) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = 'Erreur';
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
};

const ParentChildPage = () => {
  const { childId } = useParams();
  const navigate = useNavigate();
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

  useEffect(() => { load(); }, [childId]);

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

  if (loading) return <div className="flex items-center justify-center h-64">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!profile) return null;

  const total = stats?.total_sessions || 0;
  const presenceRate = total > 0 ? Math.round(((stats.present_count || 0) / total) * 100) : null;
  const homeworkRate = (() => {
    if (!stats || !stats.total_sessions) return null;
    return null;
  })();
  const concentreTotal = (stats?.concentre_count || 0) + (stats?.moyen_count || 0) + (stats?.distrait_count || 0);
  const disciplineRate = concentreTotal > 0 ? Math.round((stats.concentre_count / concentreTotal) * 100) : null;
  const partTotal = (stats?.excellent_participation || 0) + (stats?.good_participation || 0) + (stats?.faible_participation || 0);
  const participationRate = partTotal > 0 ? Math.round(((stats.excellent_participation + stats.good_participation) / partTotal) * 100) : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <button onClick={() => navigate('/parent')} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

      {/* Header */}
      <div className="rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 text-white p-6 shadow-lg mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center font-bold text-2xl">
            {(profile.first_name?.[0] || '').toUpperCase()}{(profile.last_name?.[0] || '').toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{profile.first_name} {profile.last_name}</h1>
            <p className="text-white/80 text-sm">
              {profile.classes ? `${profile.classes.name}${profile.classes.level ? ` • ${profile.classes.level}` : ''}` : 'Sans classe'}
              {profile.relationship ? ` • ${profile.relationship}` : ''}
            </p>
          </div>
          <button
            onClick={() => navigate('/parent/transport')}
            className="hidden sm:flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg backdrop-blur transition"
          >
            <Bus className="w-4 h-4" /> Transport
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto mb-4 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition ${
                active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Présence" value={presenceRate === null ? '—' : `${presenceRate}%`} icon={CheckCircle2} color="text-green-600" />
            <KPI label="Discipline" value={disciplineRate === null ? '—' : `${disciplineRate}%`} icon={Activity} color="text-orange-600" />
            <KPI label="Participation" value={participationRate === null ? '—' : `${participationRate}%`} icon={Award} color="text-blue-600" />
            <KPI label="Séances" value={total} icon={GraduationCap} color="text-purple-600" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat title="Présent" value={stats?.present_count || 0} color="bg-green-50 text-green-700" />
            <Stat title="Absent" value={stats?.absent_count || 0} color="bg-red-50 text-red-700" />
            <Stat title="Retard" value={stats?.late_count || 0} color="bg-orange-50 text-orange-700" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Comportement</h3>
              <BarLine label="Concentré" value={stats?.concentre_count || 0} total={concentreTotal} color="bg-green-500" />
              <BarLine label="Moyen" value={stats?.moyen_count || 0} total={concentreTotal} color="bg-yellow-500" />
              <BarLine label="Distrait" value={stats?.distrait_count || 0} total={concentreTotal} color="bg-red-500" />
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Participation</h3>
              <BarLine label="Excellente" value={stats?.excellent_participation || 0} total={partTotal} color="bg-green-500" />
              <BarLine label="Bonne" value={stats?.good_participation || 0} total={partTotal} color="bg-blue-500" />
              <BarLine label="Faible" value={stats?.faible_participation || 0} total={partTotal} color="bg-red-500" />
            </div>
          </div>
        </div>
      )}

      {tab === 'homework' && (
        <div className="space-y-3">
          {homework.length === 0 && <Empty>Aucun devoir.</Empty>}
          {homework.map(hw => {
            const sub = (hw.homework_submissions || [])[0];
            const submitted = sub && sub.status === 'submitted';
            return (
              <div key={hw.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{hw.title || 'Devoir'}</p>
                    <p className="text-sm text-gray-600">{hw.subjects?.name || '—'} • {hw.profiles?.first_name} {hw.profiles?.last_name}</p>
                    {hw.description && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{hw.description}</p>}
                    {hw.due_date && (
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> À rendre le {new Date(hw.due_date).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${submitted ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {submitted ? 'Rendu' : 'En attente'}
                  </span>
                </div>
                {sub?.grade !== undefined && sub?.grade !== null && (
                  <p className="mt-2 text-sm font-medium text-blue-700">Note : {sub.grade}</p>
                )}
                {sub?.feedback && <p className="mt-1 text-xs italic text-gray-600">« {sub.feedback} »</p>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'grades' && (
        <div className="space-y-3">
          {grades.length === 0 && <Empty>Aucune note de contrôle.</Empty>}
          {grades.map(g => {
            const max = 20;
            const pct = g.note != null ? (g.note / max) * 100 : null;
            const color = pct === null ? 'text-gray-500' : pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-blue-600' : 'text-red-600';
            return (
              <div key={g.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{g.subject_name || g.control_name || 'Contrôle'}</p>
                  <p className="text-sm text-gray-500">
                    {g.control_date && new Date(g.control_date).toLocaleDateString('fr-FR')}
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

      {tab === 'tracking' && (
        <div className="space-y-3">
          {history.length === 0 && <Empty>Pas de suivi récent.</Empty>}
          {history.map(t => (
            <div key={t.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-900 text-sm">
                  {t.session_date && new Date(t.session_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <p className="text-xs text-gray-500">{t.subject_name || '—'}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {t.presence && <Tag value={t.presence} kind="presence" />}
                {t.discipline && <Tag value={t.discipline} kind="discipline" />}
                {t.participation && <Tag value={t.participation} kind="participation" />}
                {t.homework && <Tag value={t.homework} kind="homework" />}
                {t.phone_use && <Tag value="téléphone" kind="phone" />}
              </div>
              {t.comment && <p className="mt-2 text-sm text-gray-700 italic">« {t.comment} »</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'documents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {documents.length === 0 && <Empty>Aucun document partagé.</Empty>}
          {documents.map(d => (
            <a
              key={d.id}
              href={d.file_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{d.title || d.name || 'Document'}</p>
                  <p className="text-xs text-gray-500">{d.subjects?.name || '—'}</p>
                  {d.created_at && <p className="text-[10px] text-gray-400 mt-1">{new Date(d.created_at).toLocaleDateString('fr-FR')}</p>}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {tab === 'timetable' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm overflow-x-auto">
          {timetable.length === 0 ? <Empty>Aucun emploi du temps.</Empty> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-2 px-2">Jour</th>
                  <th className="py-2 px-2">Heure</th>
                  <th className="py-2 px-2">Matière</th>
                  <th className="py-2 px-2">Enseignant</th>
                </tr>
              </thead>
              <tbody>
                {timetable.map(slot => (
                  <tr key={slot.id} className="border-b border-gray-100">
                    <td className="py-2 px-2">{dayName(slot.day_of_week)}</td>
                    <td className="py-2 px-2">{slot.start_time?.slice(0,5)} – {slot.end_time?.slice(0,5)}</td>
                    <td className="py-2 px-2">{slot.subjects?.name || '—'}</td>
                    <td className="py-2 px-2">{slot.profiles ? `${slot.profiles.first_name} ${slot.profiles.last_name}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

const KPI = ({ label, value, icon: Icon, color }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <Icon className={`w-5 h-5 ${color}`} />
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

const dayName = (d) => ({ 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche', 0: 'Dimanche' }[d] || d);

export default ParentChildPage;
