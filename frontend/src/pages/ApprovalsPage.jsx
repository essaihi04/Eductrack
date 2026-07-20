import { useEffect, useState } from 'react';
import { ShieldCheck, Settings, Inbox, Check, X, Loader2, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { askPrompt } from '../lib/prompt';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = async (path, { method = 'GET', body } = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

const TYPE_LABEL = {
  signalement: 'Signalement', activity: 'Activité parascolaire', feed: 'Cahier de vie',
  lost_item: 'Objet perdu', grade: 'Note / Mini-éval.', homework: 'Devoir', control: 'Contrôle',
};

const ApprovalsPage = () => {
  const { profile } = useAuth();
  const [tab, setTab] = useState('inbox');
  const [settings, setSettings] = useState([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState({ total: 0, by_type: {} });
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [s, r, st] = await Promise.all([
        api('/api/approvals/settings'),
        api(`/api/approvals/requests?status=${filter}`),
        api('/api/approvals/stats'),
      ]);
      setSettings(s.settings || []);
      setCanConfigure(!!s.can_configure);
      setRequests(r || []);
      setStats(st || { total: 0, by_type: {} });
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const toggleSetting = async (element_type, value) => {
    setSettings((prev) => prev.map((s) => s.element_type === element_type ? { ...s, requires_approval: value } : s));
    try { await api('/api/approvals/settings', { method: 'PUT', body: { element_type, requires_approval: value } }); }
    catch (e) { alert(e.message); load(); }
  };

  const decide = async (id, decision) => {
    setBusy(id + decision);
    try {
      let reason = null;
      if (decision === 'reject') { reason = (await askPrompt('Motif du refus (optionnel) :')) || null; }
      await api(`/api/approvals/requests/${id}/${decision === 'reject' ? 'reject' : 'approve'}`, { method: 'POST', body: { reason } });
      await load();
    } catch (e) { alert(e.message); }
    setBusy('');
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-6 shadow-lg mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-7 h-7" /> Approbations</h1>
        <p className="text-white/80 text-sm">Validez les éléments soumis par les professeurs</p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        <button onClick={() => setTab('inbox')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'inbox' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-600'}`}>
          <Inbox className="w-4 h-4" /> À valider {stats.total > 0 && <span className="ml-1 text-xs bg-red-500 text-white rounded-full px-2 py-0.5">{stats.total}</span>}
        </button>
        <button onClick={() => setTab('settings')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 ${tab === 'settings' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-600'}`}>
          <Settings className="w-4 h-4" /> Réglages
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : tab === 'settings' ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
          {!canConfigure && (
            <p className="px-4 py-3 text-sm text-amber-700 bg-amber-50">Lecture seule : seuls l'admin et le directeur pédagogique peuvent modifier les réglages.</p>
          )}
          {settings.map((s) => (
            <div key={s.element_type} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-500">{s.requires_approval ? 'Nécessite une approbation' : 'Publié directement par le prof'}</p>
              </div>
              <label className={`relative inline-flex items-center ${canConfigure ? 'cursor-pointer' : 'opacity-60'}`}>
                <input type="checkbox" className="sr-only peer" checked={s.requires_approval} disabled={!canConfigure}
                  onChange={(e) => toggleSetting(s.element_type, e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-checked:bg-indigo-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Stats par type */}
          {stats.total > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(stats.by_type).map(([t, n]) => (
                <span key={t} className="text-xs px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {TYPE_LABEL[t] || t} : {n}
                </span>
              ))}
            </div>
          )}

          {/* Filtre statut */}
          <div className="flex gap-2 mb-4">
            {[['pending', 'En attente'], ['approved', 'Approuvés'], ['rejected', 'Refusés'], ['all', 'Tous']].map(([k, lbl]) => (
              <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1 rounded-full text-sm ${filter === k ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{lbl}</button>
            ))}
          </div>

          {requests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">Aucune demande.</div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{TYPE_LABEL[r.element_type] || r.element_type}</span>
                        {r.classes?.name && <span className="text-xs text-gray-500">{r.classes.name}</span>}
                        {r.status === 'pending' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1"><Clock className="w-3 h-3" /> En attente</span>}
                        {r.status === 'approved' && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Approuvé</span>}
                        {r.status === 'rejected' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Refusé</span>}
                      </div>
                      <p className="font-semibold text-gray-900 mt-1">{r.title || '(Sans titre)'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {r.requester ? `Par ${r.requester.first_name} ${r.requester.last_name}` : ''} · {new Date(r.created_at).toLocaleString('fr-FR')}
                      </p>
                      {r.reason && <p className="text-xs italic text-gray-600 mt-1">Motif : {r.reason}</p>}
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => decide(r.id, 'approve')} disabled={!!busy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                          {busy === r.id + 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approuver
                        </button>
                        <button onClick={() => decide(r.id, 'reject')} disabled={!!busy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 bg-white text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50">
                          {busy === r.id + 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Refuser
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ApprovalsPage;
