import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, Bus, GraduationCap, Wallet, MessageSquare, Image as ImageIcon, FileText, CheckCircle2, AlertCircle, Clock, ThumbsUp, Reply, Send, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { enablePushNotifications } from '../../lib/pushClient';
import { isNativePush, enableNativePush, nativePushState } from '../../lib/nativePush';
import { useI18n, useT } from '../../i18n';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Icônes et couleurs seulement : les libellés viennent du dictionnaire
// (pnotif.cat.*), la clé '' correspondant au filtre « Tout ».
const CATEGORIES = [
  { key: '', labelKey: 'pnotif.cat.all', icon: Bell, color: 'text-gray-700' },
  { key: 'pedagogical', labelKey: 'pnotif.cat.pedagogical', icon: GraduationCap, color: 'text-blue-600' },
  { key: 'transport', labelKey: 'pnotif.cat.transport', icon: Bus, color: 'text-orange-600' },
  { key: 'financial', labelKey: 'pnotif.cat.financial', icon: Wallet, color: 'text-emerald-600' },
  { key: 'general', labelKey: 'pnotif.cat.general', icon: MessageSquare, color: 'text-purple-600' },
];

const CATEGORY_BADGE = {
  pedagogical: { labelKey: 'pnotif.cat.pedagogical', cls: 'bg-blue-100 text-blue-700', icon: GraduationCap },
  transport: { labelKey: 'pnotif.cat.transport', cls: 'bg-orange-100 text-orange-700', icon: Bus },
  financial: { labelKey: 'pnotif.cat.financial', cls: 'bg-emerald-100 text-emerald-700', icon: Wallet },
  general: { labelKey: 'pnotif.cat.general', cls: 'bg-purple-100 text-purple-700', icon: MessageSquare },
};

const fmtDateTime = (iso, locale = 'fr-FR') => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Africa/Casablanca',
    });
  } catch {
    return iso;
  }
};

const fmtRelative = (iso, t, locale) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('pnotif.now');
  if (diff < 3600) return t('pnotif.minAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('pnotif.hAgo', { n: Math.floor(diff / 3600) });
  if (diff < 7 * 86400) return t('pnotif.dAgo', { n: Math.floor(diff / 86400) });
  return fmtDateTime(iso, locale);
};

// Bandeau « Activer la cloche sur ce téléphone ». Sans abonnement push actif,
// l'école dépose bien le message dans la boîte in-app, mais le téléphone ne
// SONNE pas (pas de notification système). Ce bandeau invite le parent à
// autoriser les notifications → crée l'abonnement (push_subscriptions) qui
// permet à l'école de faire sonner la cloche, même app fermée.
const PushEnableBanner = () => {
  const t = useT();
  // 'unsupported' | 'enabled' | 'denied' | 'prompt' | 'loading'
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  const refresh = async () => {
    // App installée (Capacitor) : on passe par le push natif (FCM), pas le web push.
    if (isNativePush()) {
      const s = await nativePushState();
      setState(s === 'granted' ? 'enabled' : s === 'denied' ? 'denied' : 'prompt');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(Notification.permission === 'granted' && sub ? 'enabled' : 'prompt');
    } catch {
      setState('prompt');
    }
  };

  useEffect(() => { refresh(); }, []);

  const enable = async () => {
    setBusy(true);
    try {
      if (isNativePush()) {
        const ok = await enableNativePush();
        await refresh();
        if (!ok) {
          alert(t('pnotif.push.failedNative'));
        }
        return;
      }
      const ok = await enablePushNotifications();
      await refresh();
      if (!ok && Notification.permission !== 'granted') {
        alert(t('pnotif.push.failedWeb'));
      }
    } catch (e) {
      alert(t('pnotif.push.error', { msg: e.message || t('pnotif.push.cannotEnable') }));
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading' || state === 'enabled' || hidden) return null;

  // iOS n'autorise le push que pour une app « installée » (ajoutée à l'écran d'accueil).
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (state === 'unsupported') {
    return (
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {t(isIOS ? 'pnotif.push.unsupportedIOS' : 'pnotif.push.unsupportedOther')}
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
        <BellRing className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">{t('pnotif.push.title')}</p>
        <p className="text-sm text-gray-600 mt-0.5">
          {t(state === 'denied' ? 'pnotif.push.denied' : 'pnotif.push.hint')}
        </p>
        {state === 'prompt' && (
          <button
            onClick={enable}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <BellRing className="w-4 h-4" />
            {busy ? t('pnotif.push.enabling') : t('pnotif.push.enable')}
          </button>
        )}
      </div>
      <button onClick={() => setHidden(true)} className="p-1 text-gray-400 hover:text-gray-600" aria-label={t('pnotif.push.hide')}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

const ParentNotificationsPage = () => {
  const { t, lang } = useI18n();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${apiUrl}/api/parent/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t('pnotif.loadError'));
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filter ? items.filter(i => i.category === filter) : items,
    [items, filter]
  );

  const counts = useMemo(() => {
    const c = { '': items.length, pedagogical: 0, transport: 0, financial: 0, general: 0 };
    items.forEach(i => { if (c[i.category] !== undefined) c[i.category]++; });
    return c;
  }, [items]);

  if (loading) return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
          <Bell className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('pnotif.title')}</h1>
          <p className="text-gray-600 text-sm">{t('pnotif.subtitle')}</p>
        </div>
      </header>

      <PushEnableBanner />

      {/* Filtres catégorie */}
      {items.length > 0 && <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4 md:mx-0 md:px-0">
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
              {t(c.labelKey)}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-600'}`}>
                {counts[c.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>}

      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <Bell className="w-10 h-10 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-700 font-medium">{t('pnotif.empty')}</p>
          <p className="text-gray-500 text-sm mt-1">
            {t(filter ? 'pnotif.emptyFiltered' : 'pnotif.emptyHint')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(n => <NotificationCard key={n.id} n={n} dateLocale={dateLocale} />)}
      </div>
    </div>
  );
};

// Une pièce jointe est une image si le type l'indique, ou d'après l'extension.
const isImageMedia = (n) => {
  if (!n?.media_url) return false;
  if (n.message_type === 'image') return true;
  if (n.message_type === 'document') return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(n.file_name || n.media_url);
};

// Retire les lignes contenant un lien brut (le document est affiché comme PJ).
const stripLinks = (text) => {
  if (!text || typeof text !== 'string') return text;
  return text
    .split('\n')
    .filter((line) => !/https?:\/\/\S+/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const NotificationCard = ({ n, dateLocale }) => {
  const t = useT();
  const cat = CATEGORY_BADGE[n.category] || CATEGORY_BADGE.general;
  const Icon = cat.icon;

  // Statut
  const isSent = n.status === 'sent';
  const isFailed = n.status === 'failed';
  const isPending = n.status === 'pending' || n.status === 'sending';

  // Interaction (canal app) : j'aime + réponse
  const [reaction, setReaction] = useState(n.reaction || null);
  const [respondedAt, setRespondedAt] = useState(n.responded_at || null);
  const [responseText, setResponseText] = useState(n.response_text || null);
  const [showReply, setShowReply] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const authFetch = async (path, body) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${apiUrl}/api/parent/notifications/${n.id}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('pnotif.error'));
    return res.json();
  };

  const toggleLike = async () => {
    if (busy) return;
    setBusy(true);
    const next = reaction ? null : '👍';
    setReaction(next); // optimiste
    try { await authFetch('/react', { like: !!next }); }
    catch { setReaction(reaction); } // rollback
    finally { setBusy(false); }
  };

  const sendReply = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const r = await authFetch('/respond', { text });
      setRespondedAt(r.responded_at);
      setResponseText(r.response_text);
      setShowReply(false);
      setDraft('');
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  // Première ligne du message comme "titre"
  const firstLine = (n.content || '').split('\n').find(l => l.trim()) || '';
  const title = firstLine.replace(/[*_~`]/g, '').slice(0, 80);
  const body = stripLinks(n.content);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cat.cls.replace('text-', 'text-').replace('bg-', 'bg-')}`}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${cat.cls}`}>
              {t(cat.labelKey)}
            </span>
            {isSent && (
              <span className="text-[10px] uppercase font-semibold text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {t('pnotif.received')}
              </span>
            )}
            {isFailed && (
              <span className="text-[10px] uppercase font-semibold text-red-700 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {t('pnotif.failed')}
              </span>
            )}
            {isPending && (
              <span className="text-[10px] uppercase font-semibold text-orange-700 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {t('pnotif.pending')}
              </span>
            )}
            <span className="text-xs text-gray-500 ml-auto" title={fmtDateTime(n.sent_at, dateLocale)}>
              {fmtRelative(n.sent_at, t, dateLocale)}
            </span>
          </div>

          {title && <p className="font-semibold text-gray-900 text-sm">{title}</p>}

          {body && (
            <p className="text-sm text-gray-700 whitespace-pre-line mt-1">
              {body}
            </p>
          )}

          {n.media_url && isImageMedia(n) && (
            <a href={n.media_url} target="_blank" rel="noreferrer" className="mt-2 inline-block">
              <img src={n.media_url} alt={n.file_name || ''} className="max-h-48 rounded-lg border border-gray-200" />
            </a>
          )}

          {n.media_url && !isImageMedia(n) && (
            <a
              href={n.media_url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <FileText className="w-4 h-4" />
              {n.file_name || t('pnotif.attachment')}
            </a>
          )}

          {/* Interaction parent : J'aime + Répondre (canal app) */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleLike}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition disabled:opacity-50 ${
                reaction
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
              }`}
            >
              <ThumbsUp className={`w-3.5 h-3.5 ${reaction ? 'fill-blue-600 text-blue-600' : ''}`} />
              {t(reaction ? 'pnotif.liked' : 'pnotif.like')}
            </button>
            <button
              onClick={() => setShowReply((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-emerald-300 transition disabled:opacity-50"
            >
              <Reply className="w-3.5 h-3.5" /> {t('pnotif.reply')}
            </button>
            {respondedAt && !showReply && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t('pnotif.replied')}
              </span>
            )}
          </div>

          {responseText && !showReply && (
            <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
              <p className="text-[11px] font-semibold text-emerald-700 mb-0.5">{t('pnotif.yourReply')}</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{responseText}</p>
            </div>
          )}

          {showReply && (
            <div className="mt-2 flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder={t('pnotif.replyPlaceholder')}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
              />
              <button
                onClick={sendReply}
                disabled={busy || !draft.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> {t('pnotif.send')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default ParentNotificationsPage;
