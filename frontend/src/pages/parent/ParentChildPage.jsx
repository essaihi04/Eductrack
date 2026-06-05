import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, FileText, Activity, Bus, GraduationCap,
  CheckCircle2, XCircle, Clock, AlertCircle, Calendar, Award,
  Eye, Download, BookOpen as BookOpenIcon, Edit3, Home as HomeIcon, RotateCcw, Star, FileImage,
  ChevronDown, ChevronUp, TrendingUp, AlertTriangle, Wallet,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '../../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TABS = [
  { key: 'overview', label: "Vue d'ensemble", icon: Activity },
  { key: 'homework', label: 'Devoirs', icon: BookOpen },
  { key: 'grades', label: 'Notes', icon: Award },
  { key: 'tracking', label: 'Suivi', icon: GraduationCap },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'timetable', label: 'Emploi du temps', icon: Calendar },
  { key: 'finance', label: 'Finance', icon: Wallet },
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

const fetchBlob = async (path) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = `Erreur (${res.status})`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  return res.blob();
};

const DOCUMENT_TYPE_META = {
  cours: { label: 'Cours', icon: BookOpenIcon, color: 'bg-blue-100 text-blue-700' },
  exercice: { label: 'Exercice', icon: Edit3, color: 'bg-purple-100 text-purple-700' },
  devoir: { label: 'Devoir maison', icon: HomeIcon, color: 'bg-emerald-100 text-emerald-700' },
  rattrapage: { label: 'Rattrapage', icon: RotateCcw, color: 'bg-orange-100 text-orange-700' },
  approfondissement: { label: 'Approfondissement', icon: Star, color: 'bg-amber-100 text-amber-700' },
};

const getFileIcon = (fileName = '') => {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return <FileText className="w-8 h-8 text-red-500" />;
  if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return <FileImage className="w-8 h-8 text-blue-500" />;
  if (['doc', 'docx'].includes(ext)) return <FileText className="w-8 h-8 text-blue-600" />;
  if (['ppt', 'pptx'].includes(ext)) return <FileText className="w-8 h-8 text-orange-500" />;
  return <FileText className="w-8 h-8 text-gray-500" />;
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} Ko`;
  return `${(kb / 1024).toFixed(1)} Mo`;
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
  const [finance, setFinance] = useState({ invoices: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [childId]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [p, s, h, hw, doc, g, tt, fin] = await Promise.all([
        fetchJson(`/api/parent/children/${childId}/profile`),
        fetchJson(`/api/parent/children/${childId}/tracking-stats`),
        fetchJson(`/api/parent/children/${childId}/tracking-history?limit=30`),
        fetchJson(`/api/parent/children/${childId}/homework`).catch(() => []),
        fetchJson(`/api/parent/children/${childId}/documents`).catch(() => []),
        fetchJson(`/api/parent/children/${childId}/control-grades`).catch(() => []),
        fetchJson(`/api/parent/children/${childId}/timetable`).catch(() => []),
        fetchJson(`/api/parent/children/${childId}/invoices`).catch(() => ({ invoices: [], summary: null })),
      ]);
      setProfile(p);
      setStats(s);
      setHistory(Array.isArray(h) ? h : []);
      setHomework(Array.isArray(hw) ? hw : []);
      setDocuments(Array.isArray(doc) ? doc : []);
      setGrades(Array.isArray(g) ? g : []);
      setTimetable(Array.isArray(tt) ? tt : []);
      setFinance(fin && Array.isArray(fin.invoices) ? fin : { invoices: [], summary: null });
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
                    <p className="text-sm font-medium text-blue-700">
                      {hw.subject_name || hw.subjects?.name || 'Matière non renseignée'}
                    </p>
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

      {tab === 'tracking' && <TrackingAnalytics history={history} />}

      {tab === 'documents' && (
        <div className="space-y-3">
          {documents.length === 0 && <Empty>Aucun document partagé.</Empty>}
          {documents.map(d => (
            <DocumentCard key={d.id} doc={d} childId={childId} />
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
                  <th className="py-2 px-2">Salle</th>
                  <th className="py-2 px-2">Enseignant</th>
                </tr>
              </thead>
              <tbody>
                {[...timetable]
                  .sort((a, b) => (dayIndex(a.day_of_week) - dayIndex(b.day_of_week)) || String(a.start_time).localeCompare(String(b.start_time)))
                  .map(slot => (
                    <tr key={slot.id} className="border-b border-gray-100">
                      <td className="py-2 px-2 capitalize">{dayName(slot.day_of_week)}</td>
                      <td className="py-2 px-2">{slot.start_time?.slice(0,5)} – {slot.end_time?.slice(0,5)}</td>
                      <td className="py-2 px-2">{slot.subject?.name || '—'}</td>
                      <td className="py-2 px-2">{slot.room || '—'}</td>
                      <td className="py-2 px-2">{slot.teacher ? `${slot.teacher.first_name} ${slot.teacher.last_name}` : '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'finance' && <FinanceTab finance={finance} />}
    </div>
  );
};

// ---------- Onglet Finance ----------
const FINANCE_STATUS = {
  paid: { label: 'Payée', cls: 'bg-green-100 text-green-700' },
  partial: { label: 'Partielle', cls: 'bg-orange-100 text-orange-700' },
  issued: { label: 'À payer', cls: 'bg-blue-100 text-blue-700' },
  pending: { label: 'À payer', cls: 'bg-blue-100 text-blue-700' },
  overdue: { label: 'En retard', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Annulée', cls: 'bg-gray-100 text-gray-500' },
};
const fmtMoney = (n, cur = 'MAD') => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

const FinanceTab = ({ finance }) => {
  const { invoices = [], summary } = finance || {};
  const cur = invoices[0]?.currency || 'MAD';
  if (invoices.length === 0) return <Empty>Aucune facture pour le moment.</Empty>;
  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Stat title="Total facturé" value={fmtMoney(summary.total, cur)} color="bg-blue-50 text-blue-700" />
          <Stat title="Payé" value={fmtMoney(summary.paid, cur)} color="bg-green-50 text-green-700" />
          <Stat title="Reste à payer" value={fmtMoney(summary.remaining, cur)} color={summary.remaining > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'} />
        </div>
      )}
      <div className="space-y-3">
        {invoices.map((inv) => {
          const st = FINANCE_STATUS[inv.status] || { label: inv.status, cls: 'bg-gray-100 text-gray-600' };
          return (
            <div key={inv.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{inv.period_label || inv.invoice_number || 'Facture'}</p>
                  <p className="text-xs text-gray-500">
                    {inv.invoice_number ? `N° ${inv.invoice_number}` : ''}
                    {inv.due_date ? ` • Échéance ${new Date(inv.due_date).toLocaleDateString('fr-FR')}` : ''}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${st.cls}`}>{st.label}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><span className="text-gray-500 text-xs block">Total</span>{fmtMoney(inv.total, inv.currency || cur)}</div>
                <div><span className="text-gray-500 text-xs block">Payé</span><span className="text-green-700">{fmtMoney(inv.amount_paid, inv.currency || cur)}</span></div>
                <div><span className="text-gray-500 text-xs block">Reste</span><span className={inv.remaining > 0 ? 'text-red-600 font-semibold' : 'text-green-700'}>{fmtMoney(inv.remaining, inv.currency || cur)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
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

const DAY_NAMES_FR = {
  monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi',
  friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche',
  1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche', 0: 'Dimanche',
};
const DAY_ORDER = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
const dayName = (d) => DAY_NAMES_FR[d] || d;
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

const VALUE_LABELS = {
  // présence
  present: 'Présent', absent: 'Absent', late: 'En retard', excused: 'Excusé',
  // discipline
  concentre: 'Concentré', moyen: 'Moyen', distrait: 'Distrait',
  // participation
  excellent: 'Excellente', bon: 'Bonne', faible: 'Faible',
  // devoirs
  done: 'Fait', not_done: 'Non fait', partial: 'Partiel', forgotten: 'Oublié',
  // qualité cahier
  good: 'Bonne', complete: 'Complet', readable: 'Lisible',
  bad: 'Mauvaise', missing: 'Manquant', incomplete: 'Incomplet',
  illegible: 'Illisible', unreadable: 'Illisible', partially: 'Partiel',
  // attitude
  positive: 'Positive', neutral: 'Neutre', negative: 'Négative', perturbateur: 'Perturbateur',
  // écriture
  applique: 'Appliquée', soigneuse: 'Soignée', neglige: 'Négligée', moyenne: 'Moyenne',
};

const TONE_CLS = {
  pos: 'bg-green-100 text-green-700 border-green-200',
  neg: 'bg-red-100 text-red-700 border-red-200',
  warn: 'bg-orange-100 text-orange-700 border-orange-200',
  neutral: 'bg-gray-100 text-gray-700 border-gray-200',
};

// Définit les paramètres affichés et leur libellé / icône
const TRACKING_DIMENSIONS = [
  { key: 'presence', label: 'Présence', icon: '🧍' },
  { key: 'participation', label: 'Participation', icon: '🙋' },
  { key: 'discipline', label: 'Discipline', icon: '🎯' },
  { key: 'homework', label: 'Devoir maison', icon: '📚' },
  { key: 'attitude', label: 'Attitude', icon: '😊' },
  { key: 'writing', label: 'Écriture', icon: '✍️' },
  { key: 'cahier_present', label: 'Cahier présent', icon: '📓', isBool: true },
  { key: 'sleeping', label: 'Endormi en classe', icon: '😴', isBool: true, badIfTrue: true },
  { key: 'phone_use', label: 'Usage téléphone', icon: '📱', isBool: true, badIfTrue: true },
  { key: 'cahier_lesson', label: 'Cahier — leçon', icon: '📖' },
  { key: 'cahier_documents', label: 'Cahier — documents', icon: '🗂️' },
  { key: 'cahier_readability', label: 'Cahier — lisibilité', icon: '🔍' },
];

const renderTrackingValue = (dim, raw) => {
  if (raw === null || raw === undefined || raw === '') return null;

  if (dim.isBool) {
    const truthy = raw === true || raw === 'true' || raw === 1;
    const tone = dim.badIfTrue ? (truthy ? 'neg' : 'pos') : (truthy ? 'pos' : 'neg');
    return { tone, text: truthy ? 'Oui' : 'Non' };
  }

  const tone = VALUE_TONE[String(raw)] || 'neutral';
  const text = VALUE_LABELS[String(raw)] || String(raw);
  return { tone, text };
};

const TrackingCard = ({ t }) => {
  const sessionDate = t.session_date && new Date(t.session_date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const items = TRACKING_DIMENSIONS
    .map(dim => ({ dim, value: renderTrackingValue(dim, t[dim.key]) }))
    .filter(x => x.value !== null);

  // Mini-évaluation (note numérique)
  const miniEval = t.mini_eval !== null && t.mini_eval !== undefined && t.mini_eval !== '' ? Number(t.mini_eval) : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="font-semibold text-gray-900 text-sm capitalize">{sessionDate || 'Date inconnue'}</p>
        <p className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
          {t.subject_name || '—'}
        </p>
      </div>

      {items.length === 0 && miniEval === null && !t.comment && !t.notes && (
        <p className="text-xs text-gray-500">Aucun paramètre renseigné.</p>
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
                <span className="font-medium">{dim.label}</span>
              </span>
              <span className="font-semibold capitalize">{value.text}</span>
            </div>
          ))}
        </div>
      )}

      {miniEval !== null && (
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 text-xs font-medium">
          📝 Mini-évaluation : <span className="font-bold">{miniEval}/20</span>
        </div>
      )}

      {t.comment && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
          <p className="text-[10px] uppercase font-semibold text-amber-800 mb-0.5">Commentaire du prof</p>
          <p className="text-sm text-amber-900 italic">« {t.comment} »</p>
        </div>
      )}

      {t.notes && t.notes !== t.comment && (
        <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-2.5">
          <p className="text-[10px] uppercase font-semibold text-gray-600 mb-0.5">Notes</p>
          <p className="text-sm text-gray-700">{t.notes}</p>
        </div>
      )}
    </div>
  );
};

const ChildActivityBadge = ({ kind, date }) => {
  const seen = !!date;
  const label = kind === 'view' ? 'Vu' : 'Téléchargé';
  const labelNo = kind === 'view' ? 'Pas encore vu' : 'Non téléchargé';
  const Icon = kind === 'view' ? Eye : Download;

  const cls = seen
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-gray-50 text-gray-500 border-gray-200';

  let dateStr = '';
  if (seen) {
    try {
      dateStr = new Date(date).toLocaleString('fr-FR', {
        day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Africa/Casablanca',
      });
    } catch {}
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium ${cls}`}>
      <Icon className="w-3 h-3" />
      {seen ? (
        <>
          <span>{label} par votre enfant</span>
          <span className="opacity-70">• {dateStr}</span>
        </>
      ) : (
        <span>{labelNo} par votre enfant</span>
      )}
    </span>
  );
};

const DocumentCard = ({ doc, childId }) => {
  const [busy, setBusy] = useState('');
  const meta = DOCUMENT_TYPE_META[doc.document_type] || { label: doc.document_type || 'Document', icon: FileText, color: 'bg-gray-100 text-gray-700' };
  const TypeIcon = meta.icon;
  const teacher = doc.profiles ? `${doc.profiles.first_name || ''} ${doc.profiles.last_name || ''}`.trim() : '';

  const handleAction = async (mode) => {
    try {
      setBusy(mode);
      const inline = mode === 'view' ? '?inline=1' : '';
      const blob = await fetchBlob(`/api/parent/children/${childId}/documents/${doc.id}/download${inline}`);
      const url = window.URL.createObjectURL(blob);
      if (mode === 'view') {
        window.open(url, '_blank', 'noopener,noreferrer');
        // Révocation différée pour laisser le temps au navigateur d'ouvrir le blob
        setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
      } else {
        const a = window.document.createElement('a');
        a.href = url;
        a.download = doc.file_name || `document-${doc.id}`;
        window.document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
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
                {new Date(doc.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
            {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
          </div>

          {doc.controls_plan?.name && (
            <div className="mt-2 text-xs text-blue-600">🔗 Lié au contrôle : {doc.controls_plan.name}</div>
          )}

          {/* Statut de consultation par l'enfant */}
          <div className="mt-3 flex flex-wrap gap-2">
            <ChildActivityBadge
              kind="view"
              date={doc.child_viewed_at}
            />
            <ChildActivityBadge
              kind="download"
              date={doc.child_downloaded_at}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={() => handleAction('view')}
            disabled={!!busy}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            title="Aperçu"
          >
            <Eye className="w-4 h-4" />
            <span className="hidden sm:inline">{busy === 'view' ? '…' : 'Voir'}</span>
          </button>
          <button
            onClick={() => handleAction('download')}
            disabled={!!busy}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            title="Télécharger"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{busy === 'download' ? '…' : 'Télécharger'}</span>
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

const formatShortDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  } catch { return iso; }
};

const computeAnalytics = (history) => {
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
    { dim: 'Présence', score: total ? Math.round(((present + late * 0.5) / total) * 100) : 0 },
    { dim: 'Participation', score: partTotal ? Math.round((partGood / partTotal) * 100) : 0 },
    { dim: 'Discipline', score: discTotal ? Math.round(((discGood + discMid * 0.5) / discTotal) * 100) : 0 },
    { dim: 'Devoirs', score: hwTotal ? Math.round((hwGood / hwTotal) * 100) : 0 },
    { dim: 'Attitude', score: attTotal ? Math.round((attGood / attTotal) * 100) : 0 },
  ];

  // 2. Mini-évaluations — série temporelle
  const evalSeries = history
    .filter((h) => h.mini_eval !== null && h.mini_eval !== undefined && h.mini_eval !== '')
    .map((h) => ({
      date: h.session_date,
      label: formatShortDate(h.session_date),
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
    if (!weeks[wk]) weeks[wk] = { week: wk, label: formatShortDate(wk), present: 0, late: 0, absent: 0 };
    if (h.presence === 'present') weeks[wk].present += 1;
    else if (h.presence === 'late') weeks[wk].late += 1;
    else if (h.presence === 'absent') weeks[wk].absent += 1;
  });
  const weeklyAttendance = Object.values(weeks)
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-8);

  // 4. Distributions (donuts)
  const disciplineDist = [
    { name: 'Concentré', value: discGood, color: CHART_COLORS.green },
    { name: 'Moyen', value: discMid, color: CHART_COLORS.yellow },
    { name: 'Distrait', value: history.filter((h) => h.discipline === 'distrait').length, color: CHART_COLORS.red },
  ].filter((d) => d.value > 0);

  const participationDist = [
    { name: 'Excellente', value: history.filter((h) => h.participation === 'excellent').length, color: CHART_COLORS.green },
    { name: 'Bonne', value: history.filter((h) => ['bon', 'bonne'].includes(h.participation)).length, color: CHART_COLORS.blue },
    { name: 'Faible', value: history.filter((h) => h.participation === 'faible').length, color: CHART_COLORS.red },
  ].filter((d) => d.value > 0);

  // 5. Incidents
  const incidents = [
    { name: 'Téléphone', value: history.filter((h) => h.phone_use === true || h.phone_use === 'true').length, color: CHART_COLORS.red },
    { name: 'Endormi', value: history.filter((h) => h.sleeping === true || h.sleeping === 'true').length, color: CHART_COLORS.orange },
    { name: 'Devoirs ✗', value: history.filter((h) => h.homework === 'not_done').length, color: CHART_COLORS.red },
    { name: 'Absences', value: absent, color: CHART_COLORS.red },
    { name: 'Retards', value: late, color: CHART_COLORS.orange },
  ].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);

  // 6. Stats par matière
  const bySubject = {};
  history.forEach((h) => {
    const s = h.subject_name || '— (non renseignée)';
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

const TrackingAnalytics = ({ history }) => {
  const [showDetails, setShowDetails] = useState(false);
  const data = useMemo(() => computeAnalytics(history), [history]);

  if (!history || history.length === 0) {
    return (
      <Empty>
        Aucune séance n'a encore été enregistrée par les enseignants.
        <br />
        Les graphiques s'afficheront dès que le suivi commencera.
      </Empty>
    );
  }

  const { counts, radarData, evalSeries, evalAvg, weeklyAttendance, disciplineDist, participationDist, incidents, subjectStats } = data;
  const presenceRate = counts.total ? Math.round((counts.present / counts.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Séances suivies" value={counts.total} icon={GraduationCap} color="text-purple-600" />
        <KPI label="Présence" value={`${presenceRate}%`} icon={CheckCircle2} color="text-green-600" />
        <KPI
          label="Mini-éval. moy."
          value={evalAvg !== null ? `${evalAvg}/20` : '—'}
          icon={Award}
          color={evalAvg === null ? 'text-gray-400' : evalAvg >= 15 ? 'text-green-600' : evalAvg >= 10 ? 'text-blue-600' : 'text-red-600'}
        />
        <KPI label="Incidents" value={incidents.reduce((s, i) => s + i.value, 0)} icon={AlertTriangle} color="text-orange-600" />
      </div>

      {/* Radar + Pies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Profil global" subtitle="Score sur 100 par dimension" icon={Activity}>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: '#4b5563' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Radar name="Score" dataKey="score" stroke={CHART_COLORS.blue} fill={CHART_COLORS.blue} fillOpacity={0.4} />
              <Tooltip formatter={(v) => `${v}/100`} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Discipline" subtitle="Concentration en classe" icon={Activity}>
          {disciplineDist.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-10">Aucune donnée disponible.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={disciplineDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {disciplineDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} séances`, n]} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Participation" subtitle="Implication en classe" icon={Award}>
          {participationDist.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-10">Aucune donnée disponible.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={participationDist} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {participationDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} séances`, n]} />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Mini-évaluations dans le temps */}
      <ChartCard title="Évolution des mini-évaluations" subtitle={`${evalSeries.length} notes — moyenne ${evalAvg !== null ? evalAvg + '/20' : '—'}`} icon={TrendingUp}>
        {evalSeries.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-10">Aucune mini-évaluation enregistrée pour le moment.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={evalSeries} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis domain={[0, 20]} tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip
                formatter={(v) => [`${v}/20`, 'Note']}
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
      <ChartCard title="Présence par semaine" subtitle="8 dernières semaines" icon={Calendar}>
        {weeklyAttendance.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-10">Pas de données hebdomadaires.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weeklyAttendance} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="present" stackId="a" name="Présent" fill={CHART_COLORS.green} radius={[0, 0, 0, 0]} />
              <Bar dataKey="late" stackId="a" name="Retard" fill={CHART_COLORS.orange} />
              <Bar dataKey="absent" stackId="a" name="Absent" fill={CHART_COLORS.red} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Incidents */}
      {incidents.length > 0 && (
        <ChartCard title="Points de vigilance" subtitle="Incidents et oublis cumulés" icon={AlertTriangle}>
          <ResponsiveContainer width="100%" height={Math.max(180, incidents.length * 40)}>
            <BarChart layout="vertical" data={incidents} margin={{ top: 5, right: 20, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} width={90} />
              <Tooltip formatter={(v) => [`${v} fois`, 'Occurrences']} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {incidents.map((i, idx) => <Cell key={idx} fill={i.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Par matière */}
      {subjectStats.length > 0 && (
        <ChartCard title="Performances par matière" subtitle={`${subjectStats.length} matière${subjectStats.length > 1 ? 's' : ''}`} icon={BookOpen}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600 text-xs uppercase">
                  <th className="py-2 px-2 font-semibold">Matière</th>
                  <th className="py-2 px-2 font-semibold text-center">Séances</th>
                  <th className="py-2 px-2 font-semibold text-center">Présence</th>
                  <th className="py-2 px-2 font-semibold text-center">Participation</th>
                  <th className="py-2 px-2 font-semibold text-center">Moy. /20</th>
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
              Détail des {history.length} séance{history.length > 1 ? 's' : ''}
            </span>
          </div>
          {showDetails ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        {showDetails && (
          <div className="p-4 space-y-3 border-t border-gray-100 bg-gray-50">
            {history.map((t) => <TrackingCard key={t.id} t={t} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentChildPage;
