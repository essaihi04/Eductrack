import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Eye, MessageCircle, MessageSquare, Smartphone, BellOff, RefreshCw, Search,
  TrendingUp, Users, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

/**
 * Dashboard d'engagement des parents (hub Communication).
 *
 * Répond à : qui a vu ? qui a répondu ? par quel canal ? quels parents
 * suivent l'école, lesquels sont injoignables ?
 *
 * Données : GET /api/admin/whatsapp/engagement/summary et /engagement/parents.
 */

const SEGMENTS = {
  reactif:     { label: '✅ Réactif',          desc: 'Lit ET répond',                 cls: 'bg-emerald-100 text-emerald-700' },
  lecteur:     { label: '👀 Lit sans répondre', desc: 'Ouvre les messages',            cls: 'bg-blue-100 text-blue-700' },
  silencieux:  { label: '😶 Silencieux',        desc: 'Reçoit mais aucune lecture',    cls: 'bg-amber-100 text-amber-700' },
  injoignable: { label: '⚠️ Injoignable',       desc: 'Aucun envoi n\'a abouti',       cls: 'bg-red-100 text-red-700' },
};

const PERIODS = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
];

const fmtDate = (iso) => iso
  ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';

const StatCard = ({ icon: Icon, iconCls, title, value, sub }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
      <Icon className={`w-4 h-4 ${iconCls}`} /> {title}
    </div>
    <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

export default function EngagementDashboard({ apiUrl, getAuthToken, onOpenConversation }) {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [sumRes, parRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/whatsapp/engagement/summary?days=${days}`, { headers }),
        fetch(`${apiUrl}/api/admin/whatsapp/engagement/parents?days=${days}`, { headers }),
      ]);
      const sumData = await sumRes.json();
      const parData = await parRes.json();
      setSummary(sumData?.totals ? sumData : null);
      setParents(Array.isArray(parData?.parents) ? parData.parents : []);
    } catch (e) {
      console.error('Erreur dashboard engagement:', e);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, getAuthToken, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const segmentCounts = useMemo(() => {
    const counts = { reactif: 0, lecteur: 0, silencieux: 0, injoignable: 0 };
    parents.forEach(p => { if (counts[p.segment] !== undefined) counts[p.segment]++; });
    return counts;
  }, [parents]);

  const filteredParents = useMemo(() => {
    const q = (search || '').toLowerCase().trim();
    return parents.filter(p => {
      if (segmentFilter !== 'all' && p.segment !== segmentFilter) return false;
      if (!q) return true;
      return (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q);
    });
  }, [parents, search, segmentFilter]);

  const chartData = useMemo(() => (summary?.byDay || []).map(d => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  })), [summary]);

  const t = summary?.totals;
  const cov = summary?.coverage;
  const ch = summary?.channels;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* En-tête + période */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" /> Engagement des parents
            </h2>
            <p className="text-xs text-gray-500">Lectures, réponses et canaux sur la période — tous envois du hub confondus</p>
          </div>
          <div className="flex items-center gap-1.5">
            {PERIODS.map(p => (
              <button key={p.days} onClick={() => setDays(p.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  days === p.days ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {p.label}
              </button>
            ))}
            <button onClick={fetchData} className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50" title="Actualiser">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading && !summary ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" /> Chargement des métriques...
          </div>
        ) : !t ? (
          <div className="text-center py-16 text-gray-400 text-sm">Aucune donnée disponible.</div>
        ) : (
          <>
            {/* Cartes principales */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard icon={Eye} iconCls="text-blue-600" title="Taux de lecture"
                value={`${t.readRate}%`}
                sub={`${t.readTotal} vus / ${t.reached} atteints — 📲 ${t.readApp} app · 💬 ${t.readWa} WhatsApp`} />
              <StatCard icon={MessageCircle} iconCls="text-emerald-600" title="Taux de réponse"
                value={`${t.responseRate}%`}
                sub={`${t.responded} parent(s) ont répondu (WhatsApp)`} />
              <StatCard icon={Smartphone} iconCls="text-indigo-600" title="Parents avec l'app"
                value={cov?.parentsTotal ? `${Math.round((cov.parentsWithApp / cov.parentsTotal) * 100)}%` : '—'}
                sub={`${cov?.parentsWithApp || 0} / ${cov?.parentsTotal || 0} parents — canal gratuit`} />
              <StatCard icon={BellOff} iconCls="text-red-500" title="Opt-out WhatsApp"
                value={cov?.parentsOptedOut ?? 0}
                sub={`${cov?.parentsWithWhatsapp || 0} parents avec numéro WhatsApp`} />
            </div>

            {/* Canaux utilisés + timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Canaux utilisés ({days} j)</h3>
                <div className="space-y-2.5 text-sm">
                  {[
                    { label: '💬 WhatsApp envoyés', value: ch?.waSent || 0, cls: 'bg-green-500' },
                    { label: '✓✓ WhatsApp remis', value: ch?.waDelivered || 0, cls: 'bg-green-300' },
                    { label: '📲 Push envoyés', value: ch?.pushSent || 0, cls: 'bg-indigo-500' },
                    { label: '📥 Boîte in-app', value: ch?.appInbox || 0, cls: 'bg-indigo-300' },
                  ].map(row => {
                    const max = Math.max(ch?.waSent || 0, ch?.waDelivered || 0, ch?.pushSent || 0, ch?.appInbox || 0, 1);
                    return (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-0.5">
                          <span>{row.label}</span><span className="font-semibold">{row.value}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className={`${row.cls} h-1.5 rounded-full transition-all`} style={{ width: `${(row.value / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-3">
                  {t.recipients} destinataire(s) sur {t.messages} envoi(s) — {t.failed} échec(s)
                </p>
              </div>

              <div className="lg:col-span-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Activité par jour</h3>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="sent" name="Envoyés" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="read" name="Vus" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="responded" name="Réponses" stroke="#10b981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Table des parents */}
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Users className="w-4 h-4" /> Suivi par parent ({filteredParents.length})
                </h3>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un parent..."
                    className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-56" />
                </div>
              </div>

              {/* Filtres segments */}
              <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-1.5 overflow-x-auto">
                <button onClick={() => setSegmentFilter('all')}
                  className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition ${
                    segmentFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  Tous ({parents.length})
                </button>
                {Object.entries(SEGMENTS).map(([key, seg]) => (
                  <button key={key} onClick={() => setSegmentFilter(key)} title={seg.desc}
                    className={`px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition ${
                      segmentFilter === key ? 'bg-gray-800 text-white' : `${seg.cls} hover:opacity-80`
                    }`}>
                    {seg.label} ({segmentCounts[key]})
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="text-left px-4 py-2 font-semibold">Parent</th>
                      <th className="text-center px-2 py-2 font-semibold">Envoyés</th>
                      <th className="text-center px-2 py-2 font-semibold">Vus</th>
                      <th className="text-center px-2 py-2 font-semibold">Réponses</th>
                      <th className="text-left px-2 py-2 font-semibold">Canal de lecture</th>
                      <th className="text-left px-2 py-2 font-semibold">Dernier vu</th>
                      <th className="text-left px-2 py-2 font-semibold">Segment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredParents.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun parent sur cette période.</td></tr>
                    ) : filteredParents.map(p => {
                      const seg = SEGMENTS[p.segment] || SEGMENTS.silencieux;
                      const readPct = p.reached ? Math.round((p.read / p.reached) * 100) : 0;
                      const openInbox = () => onOpenConversation?.({
                        phone: p.phone, parentId: p.parent_id, name: p.name,
                      });
                      return (
                        <tr key={p.parent_id}
                          onClick={onOpenConversation ? openInbox : undefined}
                          title={onOpenConversation ? 'Ouvrir la conversation dans la boîte de réception' : undefined}
                          className={`hover:bg-gray-50/70 ${onOpenConversation ? 'cursor-pointer' : ''}`}>
                          <td className="px-4 py-2">
                            <p className="font-medium text-gray-800 flex items-center gap-1.5">
                              {p.name || 'Parent'}
                              {p.hasApp && <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-600" title="App installée">📲</span>}
                              {p.optedOut && <span className="text-[10px] px-1 py-0.5 rounded bg-red-50 text-red-600" title="Opt-out WhatsApp (STOP)">🚫 WA</span>}
                            </p>
                            <p className="text-[11px] text-gray-400">{p.phone || 'App uniquement'}</p>
                          </td>
                          <td className="text-center px-2 py-2 text-gray-700">{p.sent}</td>
                          <td className="text-center px-2 py-2">
                            <span className={`font-semibold ${p.read > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{p.read}</span>
                            <span className="text-[10px] text-gray-400 ml-1">({readPct}%)</span>
                          </td>
                          <td className="text-center px-2 py-2">
                            <span className={`font-semibold ${p.responded > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{p.responded}</span>
                          </td>
                          <td className="px-2 py-2 text-xs text-gray-600">
                            {p.read > 0
                              ? (p.preferredChannel === 'app' ? '📲 Application' : '💬 WhatsApp')
                              : '—'}
                            {p.read > 0 && (p.readApp > 0 && p.readWa > 0) && (
                              <span className="text-[10px] text-gray-400 ml-1">({p.readApp} app / {p.readWa} WA)</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-xs text-gray-500">{fmtDate(p.lastReadAt)}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${seg.cls}`}>{seg.label}</span>
                              {onOpenConversation && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); openInbox(); }}
                                  title="Ouvrir la conversation"
                                  className="p-1 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50">
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Aide de lecture */}
              <div className="px-4 py-2.5 border-t border-gray-100 flex items-start gap-2 text-[11px] text-gray-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p>
                  « Vu » = notification lue dans l'app ou ✓✓ bleu WhatsApp (si les accusés de lecture du parent sont activés).
                  « Réponse » = message WhatsApp reçu après un envoi. Les parents ⚠️ injoignables n'ont ni app ni WhatsApp fonctionnel :
                  pensez à mettre à jour leur numéro ou à les inviter à installer l'application.{' '}
                  Cliquez sur une ligne pour ouvrir la conversation du parent dans la boîte de réception.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
