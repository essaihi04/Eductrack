import { useEffect, useMemo, useState } from 'react';
import { Bell, Bus, GraduationCap, Wallet, MessageSquare, Image as ImageIcon, FileText, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const CATEGORIES = [
  { key: '', label: 'Tout', icon: Bell, color: 'text-gray-700' },
  { key: 'pedagogical', label: 'Pédagogique', icon: GraduationCap, color: 'text-blue-600' },
  { key: 'transport', label: 'Transport', icon: Bus, color: 'text-orange-600' },
  { key: 'financial', label: 'Finance', icon: Wallet, color: 'text-emerald-600' },
  { key: 'general', label: 'Général', icon: MessageSquare, color: 'text-purple-600' },
];

const CATEGORY_BADGE = {
  pedagogical: { label: 'Pédagogique', cls: 'bg-blue-100 text-blue-700', icon: GraduationCap },
  transport: { label: 'Transport', cls: 'bg-orange-100 text-orange-700', icon: Bus },
  financial: { label: 'Finance', cls: 'bg-emerald-100 text-emerald-700', icon: Wallet },
  general: { label: 'Général', cls: 'bg-purple-100 text-purple-700', icon: MessageSquare },
};

const fmtDateTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Africa/Casablanca',
    });
  } catch {
    return iso;
  }
};

const fmtRelative = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)} j`;
  return fmtDateTime(iso);
};

const ParentNotificationsPage = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${apiUrl}/api/parent/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur de chargement');
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(
    () => filter ? items.filter(i => i.category === filter) : items,
    [items, filter]
  );

  const counts = useMemo(() => {
    const c = { '': items.length, pedagogical: 0, transport: 0, financial: 0, general: 0 };
    items.forEach(i => { if (c[i.category] !== undefined) c[i.category]++; });
    return c;
  }, [items]);

  if (loading) return <div className="flex items-center justify-center h-64">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
          <Bell className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-600 text-sm">Historique des messages WhatsApp reçus de l'école</p>
        </div>
      </header>

      {/* Filtres catégorie */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4 md:mx-0 md:px-0">
        {CATEGORIES.map(c => {
          const Icon = c.icon;
          const active = filter === c.key;
          return (
            <button
              key={c.key || 'all'}
              onClick={() => setFilter(c.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition ${
                active
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-white' : c.color}`} />
              {c.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>
                {counts[c.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <Bell className="w-10 h-10 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-700 font-medium">Aucune notification.</p>
          <p className="text-gray-500 text-sm mt-1">
            {filter ? 'Aucun message dans cette catégorie pour le moment.' : 'Les messages WhatsApp envoyés par l\'école apparaîtront ici.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(n => <NotificationCard key={n.id} n={n} />)}
      </div>
    </div>
  );
};

const NotificationCard = ({ n }) => {
  const cat = CATEGORY_BADGE[n.category] || CATEGORY_BADGE.general;
  const Icon = cat.icon;

  // Statut
  const isSent = n.status === 'sent';
  const isFailed = n.status === 'failed';
  const isPending = n.status === 'pending' || n.status === 'sending';

  // Première ligne du message comme "titre"
  const firstLine = (n.content || '').split('\n').find(l => l.trim()) || '';
  const title = firstLine.replace(/[*_~`]/g, '').slice(0, 80);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cat.cls.replace('text-', 'text-').replace('bg-', 'bg-')}`}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${cat.cls}`}>
              {cat.label}
            </span>
            {isSent && (
              <span className="text-[10px] uppercase font-semibold text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Reçu
              </span>
            )}
            {isFailed && (
              <span className="text-[10px] uppercase font-semibold text-red-700 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Échec
              </span>
            )}
            {isPending && (
              <span className="text-[10px] uppercase font-semibold text-orange-700 flex items-center gap-1">
                <Clock className="w-3 h-3" /> En attente
              </span>
            )}
            <span className="text-xs text-gray-500 ml-auto" title={fmtDateTime(n.sent_at)}>
              {fmtRelative(n.sent_at)}
            </span>
          </div>

          {title && <p className="font-semibold text-gray-900 text-sm">{title}</p>}

          {n.content && (
            <p className="text-sm text-gray-700 whitespace-pre-line mt-1">
              {n.content}
            </p>
          )}

          {n.media_url && n.message_type === 'image' && (
            <a href={n.media_url} target="_blank" rel="noreferrer" className="mt-2 inline-block">
              <img src={n.media_url} alt="" className="max-h-48 rounded-lg border border-gray-200" />
            </a>
          )}

          {n.media_url && n.message_type === 'document' && (
            <a
              href={n.media_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <FileText className="w-4 h-4" />
              {n.file_name || 'Document joint'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParentNotificationsPage;
