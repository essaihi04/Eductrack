import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import {
  Send, Sparkles, Download, RefreshCw, X, UserRound, LayoutGrid,
  MessageCircle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { preferredParentChild, rememberParentChild } from '../../lib/parentNavigation';
import { useParentAssistant } from '../../contexts/ParentAssistantContext';
import { useI18n } from '../../i18n';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token}` };
};

/**
 * Humeurs de l'assistant. L'avatar change d'emoji selon ce qu'il est en train
 * de faire ou de dire : c'est ce qui donne la sensation d'un interlocuteur
 * plutôt que d'un formulaire.
 */
const MOODS = {
  idle: { face: '🧭', ring: 'from-indigo-400 to-violet-500' },
  thinking: { face: '🤔', ring: 'from-amber-400 to-orange-500' },
  study: { face: '📚', ring: 'from-blue-400 to-indigo-500' },
  money: { face: '💰', ring: 'from-emerald-400 to-teal-500' },
  fun: { face: '🎒', ring: 'from-pink-400 to-rose-500' },
  blocked: { face: '🔒', ring: 'from-slate-400 to-slate-500' },
  hello: { face: '👋', ring: 'from-indigo-400 to-violet-500' },
};

/** Rendu markdown minimal : gras, italique, listes et sauts de ligne. */
const renderMarkdown = (md) => {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escape(md)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s(.+)$/gm, '<span class="block pl-3">• $1</span>')
    .replace(/\n/g, '<br/>');
};

export const ParentAssistantPanel = ({ compact = false, onClose, requestedChildId = '' }) => {
  const { t, dir, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const rtl = dir === 'rtl';

  const [children, setChildren] = useState([]);
  const [childId, setChildId] = useState('');
  const [menu, setMenu] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mood, setMood] = useState('hello');
  const [thinking, setThinking] = useState(false);
  const [openSection, setOpenSection] = useState(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [contextSuggestions, setContextSuggestions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const endRef = useRef(null);

  const greetingMessage = useCallback(() => ({
    from: 'bot',
    blocks: [{
      type: 'text',
      markdown: `**${t('passist.greetingTitle')}** 👋\n\n${t('passist.greetingBody')}`,
    }],
  }), [t]);

  const changeChild = useCallback((nextChildId) => {
    setChildId(nextChildId);
    rememberParentChild(nextChildId);
    setMood('hello');
    setOpenSection(null);
    setActionMenuOpen(false);
    setContextSuggestions([]);
    setInput('');
    setError('');
    setMessages([greetingMessage()]);
  }, [greetingMessage]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');
        const headers = await authHeaders();
        const menuRes = await fetch(`${apiUrl}/api/parent/assistant/menu?lang=${encodeURIComponent(lang)}`, { headers });
        if (!menuRes.ok) throw new Error(t('passist.loadError'));
        const menuData = await menuRes.json();
        const kids = Array.isArray(menuData?.children) ? menuData.children : [];

        const preferred = preferredParentChild(kids, requestedChildId || searchParams.get('childId'));
        setChildren(kids);
        setChildId(preferred);
        rememberParentChild(preferred);
        setMenu(menuData);
        setMessages([greetingMessage()]);
      } catch (e) {
        setError(e.message || t('passist.loadError'));
      } finally {
        setLoading(false);
      }
    })();
    // Les libellés du menu viennent du serveur et doivent suivre le changement
    // de langue même si la fenêtre est restée montée en arrière-plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    if (!requestedChildId || children.length === 0 || requestedChildId === childId) return;
    if (children.some((child) => child.id === requestedChildId)) changeChild(requestedChildId);
  }, [changeChild, childId, children, requestedChildId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const send = useCallback(async ({ action, text, label }) => {
    if (thinking) return;
    if (!childId) {
      setError(t('passist.noChild'));
      return;
    }
    setError('');
    setActionMenuOpen(false);
    setOpenSection(null);
    setContextSuggestions([]);

    setMessages((m) => [...m, { from: 'me', text: label || text }]);
    setInput('');
    setThinking(true);
    setMood('thinking');

    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiUrl}/api/parent/assistant/message`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_id: childId, action, text, lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('passist.sendError'));

      setMood(data.mood || 'idle');
      setContextSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      setMessages((m) => [...m, {
        from: 'bot',
        blocks: data.blocks || [],
      }]);
    } catch (e) {
      setMood('idle');
      setMessages((m) => [...m, { from: 'bot', blocks: [{ type: 'text', markdown: e.message }] }]);
    } finally {
      setThinking(false);
    }
  }, [childId, lang, thinking, t]);

  const avatar = MOODS[mood] || MOODS.idle;
  const selectedChild = useMemo(
    () => children.find((child) => child.id === childId) || null,
    [childId, children]
  );

  return (
    <div className={`flex flex-col ${compact ? 'h-full w-full' : 'h-[calc(100vh-8rem)] max-w-3xl mx-auto'}`} dir={dir}>
      {/* En-tête : avatar vivant + enfant concerné */}
      <div className="flex items-center gap-3 p-3 bg-card border rounded-t-2xl">
        <div className={`relative w-11 h-11 rounded-full bg-gradient-to-br ${avatar.ring} flex items-center justify-center text-xl shadow-md transition-all duration-500`}>
          <span key={avatar.face} className="animate-[fadeIn_0.3s_ease]">{avatar.face}</span>
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-card rounded-full" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{t('passist.title')}</p>
          <p className="text-xs text-muted-foreground truncate">
            {thinking ? t('passist.typing') : (menu?.school_name || t('passist.subtitle'))}
          </p>
        </div>

        {children.length > 1 && (
          <select
            value={childId}
            onChange={(e) => changeChild(e.target.value)}
            aria-label={t('passist.child')}
            className="text-xs border rounded-lg px-2 py-1.5 bg-background max-w-[42%]"
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
        )}
        {children.length === 1 && selectedChild && (
          <span className="inline-flex max-w-[42%] items-center gap-1.5 truncate rounded-full bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
            <UserRound className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{selectedChild.first_name} {selectedChild.last_name}</span>
          </span>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={t('passist.close')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Fil de conversation */}
      <div className="flex-1 overflow-y-auto bg-muted/30 border-x p-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> {t('common.loading')}
          </div>
        )}
        {error && (
          <div className="text-center text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
        )}

        {!loading && children.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <UserRound className="mx-auto mb-2 h-7 w-7 text-amber-600" />
            <p className="text-sm font-semibold text-amber-900">{t('passist.noChildTitle')}</p>
            <p className="mt-1 text-xs text-amber-800">{t('passist.noChild')}</p>
          </div>
        )}

        {!loading && selectedChild && !selectedChild.class && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            {t('passist.noClass', { name: selectedChild.first_name })}
          </div>
        )}

        {messages.map((msg, i) => (
          msg.from === 'me' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-3.5 py-2 text-sm shadow-sm">
                {msg.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-sm shrink-0 mt-1">
                🧭
              </div>
              <div className="max-w-[85%] space-y-2">
                {(msg.blocks || []).map((block, bi) => (
                  <MessageBlock key={bi} block={block} />
                ))}

              </div>
            </div>
          )
        ))}

        {thinking && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm shrink-0">🤔</div>
            <div className="bg-card border rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
              {[0, 150, 300].map((d) => (
                <span key={d} className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Le sélecteur remplace temporairement le composeur. Il n'occupe donc
          plus l'écran quand le parent lit la conversation. */}
      {actionMenuOpen && menu && children.length > 0 ? (
        <ActionPicker
          menu={menu}
          openSection={openSection}
          setOpenSection={setOpenSection}
          suggestions={contextSuggestions}
          thinking={thinking}
          rtl={rtl}
          t={t}
          onSelect={(item) => send({ action: item.action, label: `${item.emoji} ${item.label}` })}
          onClose={() => { setActionMenuOpen(false); setOpenSection(null); }}
        />
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); if (input.trim()) send({ text: input.trim() }); }}
          className="flex items-center gap-2 p-3 bg-card border rounded-b-2xl"
        >
          <button
            type="button"
            onClick={() => { setActionMenuOpen(true); setOpenSection(null); }}
            disabled={!childId || !menu || thinking}
            aria-label={t('passist.actionsOpen')}
            aria-expanded="false"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/5 text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LayoutGrid className="h-[18px] w-[18px]" />
            {contextSuggestions.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-amber-500" />
            )}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!childId || !menu?.ai_enabled || thinking}
            placeholder={!childId ? t('passist.noChildShort') : menu?.ai_enabled ? t('passist.placeholder') : t('passist.aiDisabled')}
            className="min-w-0 flex-1 rounded-full border bg-background px-4 py-2.5 text-sm disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!childId || !input.trim() || thinking || !menu?.ai_enabled}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            aria-label={t('passist.send')}
          >
            {thinking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className={`h-4 w-4 ${rtl ? 'rotate-180' : ''}`} />}
          </button>
        </form>
      )}

      <p className="shrink-0 py-1.5 text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
        <Sparkles className="w-3 h-3" /> {t('passist.disclaimer')}
      </p>
    </div>
  );
};

/** Un bloc de réponse : texte, image ou pièce jointe. */
const MessageBlock = ({ block }) => {
  if (block.type === 'image') {
    return (
      <a href={block.url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={block.url} alt={block.name || ''} className="rounded-xl max-h-64 border shadow-sm" />
      </a>
    );
  }

  if (block.type === 'file') {
    return (
      <a
        href={block.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-card border rounded-xl px-3 py-2.5 hover:bg-muted transition-colors"
      >
        <Download className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm truncate">{block.name}</span>
      </a>
    );
  }

  if (block.type === 'secure_file') return <SecureFileBlock block={block} />;

  return (
    <div
      className="bg-card border rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed shadow-sm"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(block.markdown || '') }}
    />
  );
};

const SecureFileBlock = ({ block }) => {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState('idle');

  const download = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    try {
      const headers = await authHeaders();
      const separator = block.endpoint.includes('?') ? '&' : '?';
      const response = await fetch(
        `${apiUrl.replace(/\/$/, '')}${block.endpoint}${separator}lang=${encodeURIComponent(lang)}`,
        { headers },
      );
      if (!response.ok) throw new Error(t('passist.downloadError'));
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const disposition = response.headers.get('content-disposition') || '';
      const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'fournitures.pdf';
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={download}
        disabled={status === 'loading'}
        className="flex w-full items-center gap-2 rounded-xl border bg-card px-3 py-2.5 text-start transition-colors hover:bg-muted disabled:opacity-60"
      >
        {status === 'loading'
          ? <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-primary" />
          : <Download className="h-4 w-4 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1 truncate text-sm">{block.name}</span>
        <span className="text-[10px] font-medium uppercase text-muted-foreground">
          {status === 'loading' ? t('passist.downloading') : 'PDF'}
        </span>
      </button>
      {status === 'error' && <p className="px-2 text-xs text-red-600">{t('passist.downloadError')}</p>}
    </div>
  );
};

const ActionPicker = ({
  menu, openSection, setOpenSection, suggestions, thinking, rtl, t, onSelect, onClose,
}) => {
  const section = (menu.sections || []).find((item) => item.menu === openSection);
  const BackIcon = rtl ? ChevronRight : ChevronLeft;
  const uniqueSuggestions = suggestions.filter((item, index, items) => (
    items.findIndex((candidate) => candidate.action === item.action) === index
  ));

  return (
    <div className="shrink-0 rounded-b-2xl border bg-card px-3 py-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
      <div className="mb-2 flex items-center gap-2">
        {section ? (
          <button
            type="button"
            onClick={() => setOpenSection(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:bg-muted"
            aria-label={t('passist.backToTopics')}
          >
            <BackIcon className="h-4 w-4" />
          </button>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LayoutGrid className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{section?.label || t('passist.actionsTitle')}</p>
          <p className="truncate text-[10px] text-muted-foreground">{t('passist.actionsHint')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {t('passist.actionsClose')}
        </button>
      </div>

      <div className="max-h-40 space-y-2 overflow-y-auto pe-1">
        {section ? (
          <div className="grid grid-cols-2 gap-1.5">
            {(section.options || []).map((item) => (
              <ActionButton key={item.action} item={item} disabled={thinking} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <>
            {uniqueSuggestions.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('passist.suggestionsTitle')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {uniqueSuggestions.map((item) => (
                    <ActionButton key={item.action} item={item} disabled={thinking} onSelect={onSelect} compact />
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              {(menu.sections || []).map((item) => (
                <button
                  key={item.menu}
                  type="button"
                  disabled={thinking}
                  onClick={() => setOpenSection(item.menu)}
                  className="flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-start text-xs font-medium transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                >
                  <span className="text-base">{item.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {rtl ? <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              ))}
              {(menu.shortcuts || []).map((item) => (
                <ActionButton key={item.action} item={item} disabled={thinking} onSelect={onSelect} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const ActionButton = ({ item, disabled, onSelect, compact = false }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onSelect(item)}
    className={`${compact ? 'rounded-full px-2.5 py-1.5' : 'min-h-10 rounded-xl px-3 py-2'} flex items-center gap-2 border bg-muted/50 text-start text-xs transition hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50`}
  >
    <span className="shrink-0">{item.emoji}</span>
    <span className="min-w-0 flex-1 truncate">{item.label}</span>
  </button>
);

// Compatibilité avec les anciens favoris /parent/assistant : la route ouvre
// désormais la bulle flottante puis revient à l'accueil parent.
const ParentAssistantPage = () => {
  const [searchParams] = useSearchParams();
  const { openAssistant } = useParentAssistant();
  const [ready, setReady] = useState(false);
  const requestedChildId = searchParams.get('childId') || '';

  useEffect(() => {
    openAssistant(requestedChildId);
    setReady(true);
  }, [openAssistant, requestedChildId]);

  return ready ? <Navigate to="/parent" replace /> : null;
};

export default ParentAssistantPage;
