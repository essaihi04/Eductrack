import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, Download, RefreshCw, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
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

const ParentAssistantPage = () => {
  const { t, dir } = useI18n();
  const rtl = dir === 'rtl';

  const [children, setChildren] = useState([]);
  const [childId, setChildId] = useState('');
  const [menu, setMenu] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mood, setMood] = useState('hello');
  const [thinking, setThinking] = useState(false);
  const [openSection, setOpenSection] = useState(null);
  const [error, setError] = useState('');

  const endRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        const [childRes, menuRes] = await Promise.all([
          fetch(`${apiUrl}/api/parent/children`, { headers }),
          fetch(`${apiUrl}/api/parent/assistant/menu`, { headers }),
        ]);
        const kids = childRes.ok ? await childRes.json() : [];
        const menuData = menuRes.ok ? await menuRes.json() : null;

        setChildren(kids);
        if (kids.length > 0) setChildId(kids[0].id);
        setMenu(menuData);

        setMessages([{
          from: 'bot',
          blocks: [{
            type: 'text',
            markdown: `**${t('passist.greetingTitle')}** 👋\n\n${t('passist.greetingBody')}`,
          }],
        }]);
      } catch {
        setError(t('passist.loadError'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const send = useCallback(async ({ action, text, label }) => {
    if (thinking) return;
    setError('');

    setMessages((m) => [...m, { from: 'me', text: label || text }]);
    setInput('');
    setThinking(true);
    setMood('thinking');

    try {
      const headers = await authHeaders();
      const res = await fetch(`${apiUrl}/api/parent/assistant/message`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ child_id: childId, action, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('passist.sendError'));

      setMood(data.mood || 'idle');
      setMessages((m) => [...m, {
        from: 'bot',
        blocks: data.blocks || [],
        suggestions: data.suggestions || [],
      }]);
    } catch (e) {
      setMood('idle');
      setMessages((m) => [...m, { from: 'bot', blocks: [{ type: 'text', markdown: e.message }] }]);
    } finally {
      setThinking(false);
    }
  }, [childId, thinking, t]);

  const avatar = MOODS[mood] || MOODS.idle;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto" dir={dir}>
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
            onChange={(e) => setChildId(e.target.value)}
            className="text-xs border rounded-lg px-2 py-1.5 bg-background max-w-[45%]"
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Fil de conversation */}
      <div className="flex-1 overflow-y-auto bg-muted/30 border-x p-3 space-y-3">
        {error && (
          <div className="text-center text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
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

                {msg.suggestions?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {msg.suggestions.map((s) => (
                      <button
                        key={s.action}
                        onClick={() => send({ action: s.action, label: `${s.emoji} ${s.label}` })}
                        className="text-xs px-2.5 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                      >
                        {s.emoji} {s.label}
                      </button>
                    ))}
                  </div>
                )}
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

      {/* Boutons de navigation : le parent ne tape jamais un numéro */}
      {menu && (
        <div className="bg-card border-x px-3 py-2 space-y-2 max-h-52 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5">
            {menu.sections.map((s) => (
              <button
                key={s.menu}
                onClick={() => setOpenSection(openSection === s.menu ? null : s.menu)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1 ${
                  openSection === s.menu ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                }`}
              >
                {s.emoji} {s.label}
                <ChevronDown className={`w-3 h-3 transition-transform ${openSection === s.menu ? 'rotate-180' : ''}`} />
              </button>
            ))}
            {menu.shortcuts.map((s) => (
              <button
                key={s.action}
                onClick={() => send({ action: s.action, label: `${s.emoji} ${s.label}` })}
                className="text-xs px-3 py-1.5 rounded-full border hover:bg-muted transition-colors"
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>

          {openSection && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t">
              {menu.sections.find((s) => s.menu === openSection)?.options.map((o) => (
                <button
                  key={o.action}
                  onClick={() => { send({ action: o.action, label: `${o.emoji} ${o.label}` }); setOpenSection(null); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors"
                >
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saisie libre */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (input.trim()) send({ text: input.trim() }); }}
        className="flex items-center gap-2 p-3 bg-card border rounded-b-2xl"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!menu?.ai_enabled || thinking}
          placeholder={menu?.ai_enabled ? t('passist.placeholder') : t('passist.aiDisabled')}
          className="flex-1 text-sm border rounded-full px-4 py-2.5 bg-background disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!input.trim() || thinking || !menu?.ai_enabled}
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
          aria-label={t('passist.send')}
        >
          {thinking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className={`w-4 h-4 ${rtl ? 'rotate-180' : ''}`} />}
        </button>
      </form>

      <p className="text-[10px] text-center text-muted-foreground mt-2 flex items-center justify-center gap-1">
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

  return (
    <div
      className="bg-card border rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed shadow-sm"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(block.markdown || '') }}
    />
  );
};

export default ParentAssistantPage;
