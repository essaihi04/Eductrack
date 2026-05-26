import { useEffect, useMemo, useState } from 'react';
import { Bell, Bus, GraduationCap, Wallet, MessageSquare, Image as ImageIcon, FileText, CheckCircle2, AlertCircle, Clock, Settings, ChevronDown, ChevronUp, Save, Sparkles } from 'lucide-react';
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

      <PreferencesPanel />

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

// ─────────────────────────────────────────────────────────────────────────
// Panneau de préférences WhatsApp (rapports IA quotidiens / hebdomadaires)
// ─────────────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  { value: 0, label: 'Dimanche', short: 'Dim' },
  { value: 1, label: 'Lundi', short: 'Lun' },
  { value: 2, label: 'Mardi', short: 'Mar' },
  { value: 3, label: 'Mercredi', short: 'Mer' },
  { value: 4, label: 'Jeudi', short: 'Jeu' },
  { value: 5, label: 'Vendredi', short: 'Ven' },
  { value: 6, label: 'Samedi', short: 'Sam' },
];

const PreferencesPanel = () => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasCustomPrefs, setHasCustomPrefs] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [frequency, setFrequency] = useState('daily');
  const [weeklyDay, setWeeklyDay] = useState(1);
  const [preferredTime, setPreferredTime] = useState('18:00');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${apiUrl}/api/parent/notification-preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erreur de chargement');
      const data = await res.json();
      const p = data.preferences;
      const d = data.defaults;
      if (p) {
        setHasCustomPrefs(true);
        setEnabled(!!p.enabled);
        setFrequency(p.frequency || 'daily');
        setWeeklyDay(p.weekly_day ?? 1);
        setPreferredTime(String(p.preferred_time || '18:00').substring(0, 5));
      } else {
        setHasCustomPrefs(false);
        setEnabled(d.enabled);
        setFrequency(d.frequency);
        setWeeklyDay(d.weekly_day ?? 1);
        setPreferredTime(d.preferred_time);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const body = {
        enabled,
        frequency,
        weekly_day: frequency === 'weekly' ? weeklyDay : null,
        preferred_time: preferredTime,
      };
      const res = await fetch(`${apiUrl}/api/parent/notification-preferences`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de l\'enregistrement');
      }
      setHasCustomPrefs(true);
      setSuccess('Préférences enregistrées ✓');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900">Rapports IA WhatsApp</p>
            <p className="text-xs text-gray-500">
              {loading ? 'Chargement...' :
                !enabled ? '🔕 Désactivés' :
                frequency === 'daily' ? `Quotidien à ${preferredTime}` :
                `Hebdomadaire (${WEEKDAYS[weeklyDay]?.label || ''}) à ${preferredTime}`}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {expanded && !loading && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Toggle activation */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="font-medium text-gray-900 text-sm">Recevoir les rapports IA</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Reçu sur votre numéro WhatsApp configuré. Vous pouvez désactiver à tout moment.
              </p>
            </div>
            <Toggle checked={enabled} onChange={setEnabled} />
          </div>

          {enabled && (
            <>
              {/* Fréquence */}
              <div>
                <p className="font-medium text-gray-900 text-sm mb-2">Fréquence</p>
                <div className="grid grid-cols-2 gap-2">
                  <FreqOption
                    active={frequency === 'daily'}
                    onClick={() => setFrequency('daily')}
                    title="Quotidien"
                    desc="Chaque jour avec séance"
                  />
                  <FreqOption
                    active={frequency === 'weekly'}
                    onClick={() => setFrequency('weekly')}
                    title="Hebdomadaire"
                    desc="Un résumé / semaine"
                  />
                </div>
              </div>

              {/* Jour (uniquement si hebdo) */}
              {frequency === 'weekly' && (
                <div>
                  <p className="font-medium text-gray-900 text-sm mb-2">Jour de réception</p>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setWeeklyDay(d.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                          weeklyDay === d.value
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400'
                        }`}
                      >
                        {d.short}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Heure */}
              <div>
                <p className="font-medium text-gray-900 text-sm mb-2">Heure de réception</p>
                <input
                  type="time"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 focus:outline-none text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Heure du Maroc (Africa/Casablanca)</p>
              </div>
            </>
          )}

          {!hasCustomPrefs && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
              ℹ️ Vous utilisez actuellement les paramètres par défaut de l'école. Enregistrez pour personnaliser.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              {success}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Toggle = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative w-11 h-6 rounded-full transition shrink-0 ${
      checked ? 'bg-emerald-500' : 'bg-gray-300'
    }`}
    role="switch"
    aria-checked={checked}
  >
    <span
      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-5' : ''
      }`}
    />
  </button>
);

const FreqOption = ({ active, onClick, title, desc }) => (
  <button
    onClick={onClick}
    className={`text-left px-3 py-2 rounded-lg border transition ${
      active
        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
        : 'bg-white border-gray-200 hover:border-emerald-300'
    }`}
  >
    <p className="text-sm font-semibold text-gray-900">{title}</p>
    <p className="text-xs text-gray-500">{desc}</p>
  </button>
);

export default ParentNotificationsPage;
