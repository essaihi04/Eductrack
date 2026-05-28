/**
 * Hero "Chatbot IA WhatsApp" — remplace l'ancien Hero marketing.
 *
 * Affiche un téléphone WhatsApp en 3D avec une conversation animée entre :
 *   - le PARENT (bulles vertes à droite)
 *   - l'ASSISTANT IA de l'école (bulles blanches à gauche)
 *
 * Cycle automatique de plusieurs sujets de discussion :
 *   1. Absences de la semaine
 *   2. Devoirs à faire
 *   3. Notes de Mathématiques — 2e semestre
 *   4. Comportement en classe
 *   5. Emploi du temps de demain
 *
 * Phases de l'animation pour chaque scénario :
 *   • phase 'parent'  → la bulle de question parent apparaît
 *   • phase 'typing'  → indicateur "Assistant en train d'écrire …"
 *   • phase 'bot'     → la réponse de l'assistant s'affiche
 *   • phase 'pause'   → pause avant de passer au scénario suivant (reset)
 *
 * Tout en CSS + framer-motion, aucun outil 3D lourd.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Sparkles, CheckCheck, Send, ArrowRight, MessageCircle, Mic,
} from 'lucide-react';
import { Button } from '../ui/Button';

// ───────────────────────────────────────────────────────────────
// Scénarios de conversation parent ↔ IA
// ───────────────────────────────────────────────────────────────
const SCHOOL_NAME = 'École Al Amine';
const ASSISTANT_NAME = 'Assistant Al Amine'; // "Assistant" + nom école

const SCENARIOS = [
  {
    id: 'absences',
    parent: 'Bonjour, mon fils a-t-il été absent cette semaine ?',
    bot: {
      header: 'Absences de la semaine',
      lines: [
        { type: 'meta', text: 'Semaine du 24 au 30 mai' },
        { type: 'item', icon: '•', text: 'Mardi 25/05 — séance de SVT (10h)' },
        { type: 'item', icon: '•', text: 'Jeudi 27/05 — séance de Physique (14h)' },
        { type: 'note', text: 'Total : 2 absences sur 18 séances (11%). Pensez à les justifier dans le portail parents.' },
      ],
    },
  },
  {
    id: 'homework',
    parent: 'Quels devoirs a-t-il pour cette semaine ?',
    bot: {
      header: 'Devoirs à rendre',
      lines: [
        { type: 'item', icon: '📘', text: 'Maths : exercices p. 47 (1 à 5) — vendredi' },
        { type: 'item', icon: '🧪', text: 'Physique : TP mécanique — jeudi' },
        { type: 'item', icon: '📗', text: 'Français : lecture chapitre 4 — mardi' },
        { type: 'note', text: '3 devoirs au total. Aucun n\'a encore été marqué comme rendu.' },
      ],
    },
  },
  {
    id: 'math-grades',
    parent: 'Quelles sont ses notes de Mathématiques au 2e semestre ?',
    bot: {
      header: 'Notes — Mathématiques (S2)',
      lines: [
        { type: 'item', icon: '✏️', text: 'Contrôle 1 — Fonctions : 14/20' },
        { type: 'item', icon: '✏️', text: 'Contrôle 2 — Dérivées : 12,5/20' },
        { type: 'item', icon: '✏️', text: 'Devoir surveillé : 15/20' },
        { type: 'item', icon: '✏️', text: 'Mini-évaluations : 8,5/10 (moy)' },
        { type: 'note', text: 'Moyenne du semestre : 13,8/20. En progression par rapport au S1 (12,4/20).' },
      ],
    },
  },
  {
    id: 'behavior',
    parent: 'Comment se comporte-t-il en classe ?',
    bot: {
      header: 'Comportement et participation',
      lines: [
        { type: 'meta', text: '7 dernières séances' },
        { type: 'item', icon: '•', text: 'Discipline : 4,8 / 5 — excellent' },
        { type: 'item', icon: '•', text: 'Participation : 4,2 / 5 — très bonne' },
        { type: 'item', icon: '•', text: 'Tenue du cahier : 86% — à surveiller' },
        { type: 'note', text: 'Aucun incident signalé. Un rappel pour le cahier serait utile.' },
      ],
    },
  },
  {
    id: 'schedule',
    parent: 'Quel est son emploi du temps demain ?',
    bot: {
      header: 'Emploi du temps — demain',
      lines: [
        { type: 'item', icon: '🕗', text: '08h00 — 09h00 : Mathématiques (salle 12)' },
        { type: 'item', icon: '🕘', text: '09h00 — 10h00 : Français (salle 8)' },
        { type: 'item', icon: '🕙', text: '10h15 — 12h15 : SVT (laboratoire)' },
        { type: 'item', icon: '🕑', text: '14h00 — 16h00 : Sport (gymnase)' },
        { type: 'note', text: 'Pensez à la tenue de sport pour l\'après-midi.' },
      ],
    },
  },
];

// Phase timings (ms)
const T_PARENT_DELAY = 400;
const T_TYPING_DELAY = 1200;
const T_BOT_DELAY = 1800;
const T_PAUSE = 2400;

// ───────────────────────────────────────────────────────────────
// Composant Hero principal
// ───────────────────────────────────────────────────────────────
const ChatbotHero = () => {
  const navigate = useNavigate();
  const [scIdx, setScIdx] = useState(0);
  const [phase, setPhase] = useState('parent'); // parent | typing | bot | pause
  const timersRef = useRef([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // Orchestrateur des phases
  useEffect(() => {
    clearTimers();
    if (phase === 'parent') {
      timersRef.current.push(setTimeout(() => setPhase('typing'), T_PARENT_DELAY + 1100));
    } else if (phase === 'typing') {
      timersRef.current.push(setTimeout(() => setPhase('bot'), T_TYPING_DELAY));
    } else if (phase === 'bot') {
      timersRef.current.push(setTimeout(() => setPhase('pause'), T_BOT_DELAY + 1500));
    } else if (phase === 'pause') {
      timersRef.current.push(setTimeout(() => {
        setScIdx(i => (i + 1) % SCENARIOS.length);
        setPhase('parent');
      }, T_PAUSE));
    }
    return clearTimers;
  }, [phase]);

  const scenario = SCENARIOS[scIdx];
  const showParent = phase === 'parent' || phase === 'typing' || phase === 'bot';
  const showTyping = phase === 'typing';
  const showBot = phase === 'bot';

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-blue-50 dark:from-gray-900 dark:via-emerald-950 dark:to-gray-900 overflow-hidden py-12">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-400/25 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-400/25 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-teal-300/15 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* ═══════════════ COLONNE GAUCHE : texte + CTA ═══════════════ */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring' }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-sm font-semibold mb-6"
            >
              <Sparkles className="w-4 h-4" />
              Assistant IA disponible 24/7 sur WhatsApp
            </motion.div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-[1.1]">
              Posez n'importe quelle question.{' '}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-green-600 bg-clip-text text-transparent">
                L'IA de votre école répond.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
              Vos parents discutent directement avec un assistant IA personnalisé,
              entraîné sur les données de leur enfant : absences, devoirs, notes,
              comportement, emploi du temps. Plus de tickets, plus d'appels —
              juste WhatsApp.
            </p>

            {/* Exemples de questions */}
            <div className="flex flex-wrap gap-2 mb-8 justify-center lg:justify-start">
              {[
                'Absences cette semaine ?',
                'Devoirs à rendre ?',
                'Notes de Maths ?',
                'Comportement en classe ?',
              ].map((q, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/80 dark:bg-gray-800/80 backdrop-blur text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 shadow-sm"
                >
                  {q}
                </span>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={() => navigate('/login')}
                  size="lg"
                  className="w-full sm:w-auto text-base px-7 py-6 shadow-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                >
                  Essayer gratuitement
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={() => window.open('https://wa.me/212641998700?text=Bonjour,%20je%20souhaite%20une%20d%C3%A9mo%20de%20l%27assistant%20IA%20EduTrack', '_blank')}
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto text-base px-7 py-6 border-2 border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                >
                  <MessageCircle className="mr-2 w-5 h-5" />
                  Voir une démo
                </Button>
              </motion.div>
            </div>
          </motion.div>

          {/* ═══════════════ COLONNE DROITE : téléphone WhatsApp IA ═══════════════ */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex justify-center"
            style={{ perspective: '1800px' }}
          >
            <div
              className="relative"
              style={{
                transform: 'rotateY(-10deg) rotateX(2deg)',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Châssis téléphone */}
              <div
                className="relative w-[330px] h-[640px] bg-gray-900 rounded-[44px] p-3 shadow-2xl"
                style={{
                  boxShadow:
                    '0 60px 120px -30px rgba(0,0,0,0.5), 0 40px 70px -30px rgba(16, 185, 129, 0.4), inset 0 0 0 2px rgba(255,255,255,0.1)',
                }}
              >
                {/* Notch + boutons latéraux */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-gray-900 rounded-b-2xl z-10" />
                <div className="absolute -left-1 top-28 w-1 h-12 bg-gray-700 rounded-l" />
                <div className="absolute -left-1 top-44 w-1 h-20 bg-gray-700 rounded-l" />
                <div className="absolute -right-1 top-32 w-1 h-16 bg-gray-700 rounded-r" />

                {/* Écran */}
                <div className="relative w-full h-full bg-[#ECE5DD] dark:bg-[#0B141A] rounded-[36px] overflow-hidden flex flex-col">
                  {/* Status bar */}
                  <div className="bg-[#075E54] dark:bg-[#1F2C34] px-4 pt-7 pb-2 text-white text-[10px] flex justify-between items-center">
                    <span className="font-semibold">9:41</span>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-1.5 border border-white rounded-sm relative">
                        <span className="absolute inset-0.5 bg-white rounded-[1px]" />
                      </span>
                    </div>
                  </div>

                  {/* Header chat — assistant école */}
                  <div className="bg-[#075E54] dark:bg-[#1F2C34] px-3 py-2 flex items-center gap-3 text-white shadow">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                      <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
                    </svg>
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center ring-2 ring-white/20">
                        <Bot className="w-5 h-5" />
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#075E54]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{ASSISTANT_NAME}</p>
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={showTyping ? 'typing' : 'online'}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="text-[10px] text-white/80"
                        >
                          {showTyping ? 'en train d\'écrire…' : 'en ligne'}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Zone conversation */}
                  <div
                    className="flex-1 overflow-hidden relative px-3 py-3"
                    style={{
                      backgroundImage:
                        'radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)',
                      backgroundSize: '12px 12px',
                    }}
                  >
                    {/* Date */}
                    <div className="flex justify-center mb-3">
                      <span className="px-2.5 py-0.5 rounded-md bg-white/80 dark:bg-white/10 text-[10px] text-gray-600 dark:text-gray-300 shadow-sm">
                        AUJOURD'HUI
                      </span>
                    </div>

                    {/* Bulles */}
                    <div className="flex flex-col gap-2.5 max-h-[460px] overflow-hidden">
                      <AnimatePresence mode="wait">
                        {showParent && (
                          <ParentBubble key={`${scenario.id}-p`} text={scenario.parent} />
                        )}
                      </AnimatePresence>

                      <AnimatePresence>
                        {showTyping && <TypingBubble key={`${scenario.id}-t`} />}
                      </AnimatePresence>

                      <AnimatePresence>
                        {showBot && <BotBubble key={`${scenario.id}-b`} bot={scenario.bot} />}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Input WhatsApp */}
                  <div className="bg-[#F0F0F0] dark:bg-[#1F2C34] px-2 py-2 flex items-center gap-2">
                    <div className="flex-1 bg-white dark:bg-[#2A3942] rounded-full px-3 py-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                      Message
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#075E54] dark:bg-[#00A884] flex items-center justify-center">
                      {phase === 'pause' ? (
                        <Mic className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reflet sous téléphone */}
              <div
                aria-hidden
                className="absolute left-8 right-8 -bottom-4 h-8 rounded-full bg-emerald-500/40 blur-2xl"
              />

              {/* Badge flottant "IA" */}
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.6, type: 'spring' }}
                className="absolute -top-2 -right-4 bg-white dark:bg-gray-800 rounded-2xl shadow-xl px-3 py-2 flex items-center gap-2 border border-emerald-200 dark:border-emerald-700/50"
              >
                <Bot className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">Propulsé par</p>
                  <p className="text-xs font-bold text-gray-900 dark:text-white leading-tight">IA + WhatsApp</p>
                </div>
              </motion.div>

              {/* Indicateur scénario actif */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5"
              >
                {SCENARIOS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === scIdx ? 'w-6 bg-emerald-500' : 'w-1.5 bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// ───────────────────────────────────────────────────────────────
// Bulle du PARENT (verte, à droite)
// ───────────────────────────────────────────────────────────────
const ParentBubble = ({ text }) => (
  <motion.div
    initial={{ opacity: 0, x: 20, scale: 0.94 }}
    animate={{ opacity: 1, x: 0, scale: 1 }}
    exit={{ opacity: 0, scale: 0.94 }}
    transition={{ type: 'spring', stiffness: 250, damping: 22 }}
    className="self-end max-w-[80%]"
  >
    <div className="relative bg-[#DCF8C6] dark:bg-[#005C4B] rounded-lg rounded-tr-none shadow px-2.5 py-1.5">
      <span
        aria-hidden
        className="absolute -right-1.5 top-0 w-2 h-2 bg-[#DCF8C6] dark:bg-[#005C4B]"
        style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
      />
      <p className="text-[12px] text-gray-800 dark:text-gray-100 leading-snug">{text}</p>
      <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
        <span className="text-[9px] text-gray-500 dark:text-gray-400">9:41</span>
        <CheckCheck className="w-3 h-3 text-blue-500" />
      </div>
    </div>
  </motion.div>
);

// ───────────────────────────────────────────────────────────────
// Indicateur "en train d'écrire …" (3 points animés, gauche)
// ───────────────────────────────────────────────────────────────
const TypingBubble = () => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="self-start"
  >
    <div className="relative bg-white dark:bg-[#202C33] rounded-lg rounded-tl-none shadow px-3 py-2.5">
      <span
        aria-hidden
        className="absolute -left-1.5 top-0 w-2 h-2 bg-white dark:bg-[#202C33]"
        style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
      />
      <div className="flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            animate={{
              opacity: [0.3, 1, 0.3],
              y: [0, -2, 0],
            }}
            transition={{
              duration: 0.9,
              repeat: Infinity,
              delay: i * 0.15,
            }}
            className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500"
          />
        ))}
      </div>
    </div>
  </motion.div>
);

// ───────────────────────────────────────────────────────────────
// Bulle de l'ASSISTANT (blanche, gauche) — réponse structurée
// ───────────────────────────────────────────────────────────────
const BotBubble = ({ bot }) => (
  <motion.div
    initial={{ opacity: 0, y: 12, scale: 0.94 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0 }}
    transition={{ type: 'spring', stiffness: 250, damping: 22 }}
    className="self-start max-w-[88%]"
  >
    <div className="relative bg-white dark:bg-[#202C33] rounded-lg rounded-tl-none shadow px-2.5 py-2">
      <span
        aria-hidden
        className="absolute -left-1.5 top-0 w-2 h-2 bg-white dark:bg-[#202C33]"
        style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
      />

      {/* Header bot */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Bot className="w-3 h-3 text-emerald-600" />
        <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
          {bot.header}
        </p>
      </div>

      {/* Lignes */}
      <div className="space-y-1">
        {bot.lines.map((ln, i) => {
          if (ln.type === 'meta') {
            return (
              <p key={i} className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                {ln.text}
              </p>
            );
          }
          if (ln.type === 'item') {
            return (
              <motion.p
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08 }}
                className="text-[11px] text-gray-700 dark:text-gray-200 leading-snug flex gap-1.5"
              >
                <span className="flex-shrink-0">{ln.icon}</span>
                <span>{ln.text}</span>
              </motion.p>
            );
          }
          if (ln.type === 'note') {
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700"
              >
                <p className="text-[10.5px] text-gray-600 dark:text-gray-300 italic leading-snug">
                  {ln.text}
                </p>
              </motion.div>
            );
          }
          return null;
        })}
      </div>

      <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5">
        <span className="text-[9px] text-gray-400">9:41</span>
      </div>
    </div>
  </motion.div>
);

export default ChatbotHero;
