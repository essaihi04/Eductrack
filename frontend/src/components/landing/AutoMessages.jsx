/**
 * Section "Messages Automatiques" — schéma 3D interactif :
 *
 *   ┌─ Prof (3D card carousel : Contrôle / Devoir / Absence / Document)
 *   │     ↓ (signal envoyé)
 *   └─ Téléphone WhatsApp (mockup) qui affiche en direct le message reçu par le parent
 *
 * Animation : un timer cycle les 4 actions automatiquement. À chaque tick :
 *   1. la carte action correspondante s'illumine côté prof
 *   2. une "onde" voyage de gauche à droite
 *   3. une nouvelle bulle WhatsApp apparaît dans la conversation
 *
 * Effet 3D : `perspective` + `rotateY` sur le téléphone et la pile de cards prof.
 * Aucune dépendance 3D lourde (pas de three.js) — CSS transforms + framer-motion.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, BookOpen, AlertCircle, FileText,
  CheckCheck, Send, GraduationCap, Sparkles,
} from 'lucide-react';

// ───────────────────────────────────────────────────────────────
// Données des 4 scénarios
// ───────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: 'control',
    icon: ClipboardList,
    color: 'from-amber-500 to-orange-600',
    glow: 'shadow-amber-400/60',
    label: 'Contrôle planifié',
    sub: 'Mathématiques • lundi 14h',
    teacherAction: 'Le professeur planifie un contrôle',
    whatsapp: {
      header: 'École Al Amine',
      avatar: 'EA',
      time: 'maintenant',
      lines: [
        { type: 'badge', text: 'CONTROLE PROGRAMMÉ', color: 'bg-amber-500' },
        { type: 'title', text: 'Mathématiques' },
        { type: 'meta', text: 'Lundi 14h00 — Salle 12' },
        { type: 'body', text: 'Chapitre : Fonctions exponentielles\nDurée : 1 heure\nMatériel : calculatrice autorisée' },
      ],
    },
  },
  {
    id: 'homework',
    icon: BookOpen,
    color: 'from-blue-500 to-indigo-600',
    glow: 'shadow-blue-400/60',
    label: 'Devoir publié',
    sub: 'Physique • à rendre vendredi',
    teacherAction: 'Le professeur publie un devoir',
    whatsapp: {
      header: 'École Al Amine',
      avatar: 'EA',
      time: 'maintenant',
      lines: [
        { type: 'badge', text: 'NOUVEAU DEVOIR', color: 'bg-blue-500' },
        { type: 'title', text: 'Physique — Mécanique' },
        { type: 'meta', text: 'À rendre : vendredi 18h' },
        { type: 'body', text: 'Exercices p. 47 (1 à 5)\nFiche de TP en pièce jointe.' },
        { type: 'attach', text: 'fiche-mecanique.pdf' },
      ],
    },
  },
  {
    id: 'absence',
    icon: AlertCircle,
    color: 'from-red-500 to-rose-600',
    glow: 'shadow-red-400/60',
    label: 'Absence signalée',
    sub: 'Aujourd\'hui • séance de SVT',
    teacherAction: 'Le professeur enregistre une absence',
    whatsapp: {
      header: 'École Al Amine',
      avatar: 'EA',
      time: 'maintenant',
      lines: [
        { type: 'badge', text: 'ABSENCE', color: 'bg-red-500' },
        { type: 'title', text: 'Votre enfant a été absent' },
        { type: 'meta', text: 'SVT — séance de 10h' },
        { type: 'body', text: 'Merci de justifier l\'absence sur le portail parents ou par retour de message.' },
      ],
    },
  },
  {
    id: 'document',
    icon: FileText,
    color: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-400/60',
    label: 'Document partagé',
    sub: 'Cours Histoire — Chapitre 3',
    teacherAction: 'Le professeur partage un document',
    whatsapp: {
      header: 'École Al Amine',
      avatar: 'EA',
      time: 'maintenant',
      lines: [
        { type: 'badge', text: 'DOCUMENT', color: 'bg-emerald-500' },
        { type: 'title', text: 'Cours d\'Histoire' },
        { type: 'meta', text: 'Chapitre 3 — La Renaissance' },
        { type: 'body', text: 'Cours complet + corrigé des exercices.' },
        { type: 'attach', text: 'histoire-chapitre-3.pdf' },
      ],
    },
  },
];

// ───────────────────────────────────────────────────────────────
// Composant principal
// ───────────────────────────────────────────────────────────────
const AutoMessages = () => {
  const [activeIdx, setActiveIdx] = useState(0);
  // Bulles cumulées dans le téléphone (on garde les 4 dernières)
  const [bubbles, setBubbles] = useState([SCENARIOS[0]]);
  const intervalRef = useRef(null);

  // Cycle automatique toutes les 4s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setActiveIdx(prev => {
        const next = (prev + 1) % SCENARIOS.length;
        setBubbles(b => {
          const updated = [...b, SCENARIOS[next]];
          return updated.slice(-4); // ne garde que les 4 dernières
        });
        return next;
      });
    }, 4200);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Click manuel sur une action prof
  const onPickScenario = (idx) => {
    clearInterval(intervalRef.current);
    setActiveIdx(idx);
    setBubbles(b => {
      const updated = [...b, SCENARIOS[idx]];
      return updated.slice(-4);
    });
    // Redémarre le cycle après la sélection
    intervalRef.current = setInterval(() => {
      setActiveIdx(prev => {
        const next = (prev + 1) % SCENARIOS.length;
        setBubbles(b2 => [...b2, SCENARIOS[next]].slice(-4));
        return next;
      });
    }, 4200);
  };

  return (
    <section className="relative py-24 bg-gradient-to-br from-slate-50 via-[#FFF7E9] to-[#2A9D8F]/10 dark:from-gray-900 dark:via-gray-900 dark:to-[#173A59] overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-10 left-10 w-72 h-72 bg-[#E66F51]/15 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#2A9D8F]/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-300/10 dark:bg-teal-500/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E66F51]/10 dark:bg-[#E66F51]/20 text-[#B64A33] dark:text-[#FFB29F] text-sm font-semibold mb-4">
            <Sparkles className="w-4 h-4" />
            Notifications instantanées
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Le parent, informé <span className="text-[#2A9D8F]">en direct</span> sur WhatsApp
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Dès qu'un professeur planifie un contrôle, publie un devoir, signale une absence
            ou partage un document, un message <strong>structuré et lisible</strong> arrive
            instantanément sur le WhatsApp du parent. Aucun copier-coller, aucun effort.
          </p>
        </motion.div>

        {/* Scène 3D : Prof → onde → Téléphone */}
        <div
          className="relative grid lg:grid-cols-12 gap-8 lg:gap-4 items-center"
          style={{ perspective: '1800px' }}
        >
          {/* ═══════════════ COLONNE GAUCHE — PROF ═══════════════ */}
          <motion.div
            initial={{ opacity: 0, x: -40, rotateY: -10 }}
            whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="lg:col-span-5 relative"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Carte prof principale */}
            <div
              className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 border border-gray-100 dark:border-gray-700"
              style={{
                transform: 'rotateY(8deg) rotateX(2deg)',
                transformStyle: 'preserve-3d',
                boxShadow: '0 30px 60px -15px rgba(59, 130, 246, 0.25), 0 18px 36px -18px rgba(0, 0, 0, 0.3)',
              }}
            >
              {/* Header prof */}
              <div className="flex items-center gap-3 mb-5">
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <GraduationCap className="w-8 h-8 text-white" />
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Mme Bensaïd</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Professeur de Mathématiques</p>
                </div>
                <div className="ml-auto px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-xs font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  En ligne
                </div>
              </div>

              {/* Sous-titre */}
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={SCENARIOS[activeIdx].id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                  >
                    {SCENARIOS[activeIdx].teacherAction}
                  </motion.span>
                </AnimatePresence>
              </p>

              {/* Grille 4 actions */}
              <div className="grid grid-cols-2 gap-3">
                {SCENARIOS.map((sc, idx) => {
                  const Icon = sc.icon;
                  const active = idx === activeIdx;
                  return (
                    <motion.button
                      key={sc.id}
                      onClick={() => onPickScenario(idx)}
                      whileTap={{ scale: 0.96 }}
                      animate={{
                        scale: active ? 1.04 : 1,
                        y: active ? -2 : 0,
                      }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className={`relative overflow-hidden rounded-2xl p-3 text-left transition-all border-2 ${
                        active
                          ? 'border-transparent bg-gradient-to-br ' + sc.color + ' text-white shadow-2xl ' + sc.glow
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                      }`}
                    >
                      {/* Glow ring quand actif */}
                      {active && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute inset-0 ring-2 ring-white/40 rounded-2xl"
                        />
                      )}
                      <div className="flex items-center gap-2 mb-1.5 relative">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          active ? 'bg-white/25' : 'bg-white dark:bg-gray-800 shadow'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        {active && (
                          <motion.div
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="ml-auto"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </motion.div>
                        )}
                      </div>
                      <p className="text-xs font-bold relative">{sc.label}</p>
                      <p className={`text-[10px] mt-0.5 relative ${active ? 'text-white/85' : 'text-gray-500 dark:text-gray-400'}`}>
                        {sc.sub}
                      </p>
                    </motion.button>
                  );
                })}
              </div>

              {/* Statut envoi */}
              <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Notification parent</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={activeIdx}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1 text-green-600 dark:text-green-400 font-semibold"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Envoyée à l'instant
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>

            {/* Reflet sous la card prof */}
            <div
              aria-hidden
              className="absolute left-4 right-4 -bottom-3 h-6 rounded-full bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-xl"
            />
          </motion.div>

          {/* ═══════════════ COLONNE CENTRE — Onde / flèche ═══════════════ */}
          <div className="lg:col-span-2 hidden lg:flex flex-col items-center justify-center relative">
            <div className="relative w-full h-32 flex items-center justify-center">
              {/* Trait pointillé */}
              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-300 via-green-300 to-emerald-400 opacity-50" />
              {/* Particule animée */}
              <motion.div
                key={activeIdx}
                initial={{ x: '-100%', opacity: 0, scale: 0.5 }}
                animate={{ x: '100%', opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1.2, 0.5] }}
                transition={{ duration: 1.6, ease: 'easeInOut' }}
                className="absolute"
              >
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${SCENARIOS[activeIdx].color} shadow-2xl flex items-center justify-center`}>
                  <Send className="w-5 h-5 text-white" />
                </div>
              </motion.div>
            </div>
            {/* Label */}
            <div className="mt-2 text-center">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                via WhatsApp
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                &lt; 1 seconde
              </p>
            </div>
          </div>

          {/* ═══════════════ COLONNE DROITE — TÉLÉPHONE WHATSAPP ═══════════════ */}
          <motion.div
            initial={{ opacity: 0, x: 40, rotateY: 10 }}
            whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:col-span-5 flex justify-center"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div
              className="relative"
              style={{
                transform: 'rotateY(-8deg) rotateX(2deg)',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Châssis téléphone */}
              <div
                className="relative w-[320px] h-[620px] bg-gray-900 rounded-[44px] p-3 shadow-2xl"
                style={{
                  boxShadow:
                    '0 50px 100px -20px rgba(0,0,0,0.5), 0 30px 60px -30px rgba(34,197,94,0.4), inset 0 0 0 2px rgba(255,255,255,0.1)',
                }}
              >
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-gray-900 rounded-b-2xl z-10" />
                {/* Boutons latéraux */}
                <div className="absolute -left-1 top-28 w-1 h-12 bg-gray-700 rounded-l" />
                <div className="absolute -left-1 top-44 w-1 h-20 bg-gray-700 rounded-l" />
                <div className="absolute -right-1 top-32 w-1 h-16 bg-gray-700 rounded-r" />

                {/* Écran WhatsApp */}
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

                  {/* Header chat */}
                  <div className="bg-[#075E54] dark:bg-[#1F2C34] px-3 py-2 flex items-center gap-3 text-white shadow">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                      <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/>
                    </svg>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xs font-bold ring-2 ring-white/20">
                      EA
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">École Al Amine</p>
                      <p className="text-[10px] text-white/80">en ligne</p>
                    </div>
                  </div>

                  {/* WhatsApp pattern background */}
                  <div
                    className="flex-1 overflow-hidden relative px-3 py-3"
                    style={{
                      backgroundImage:
                        'radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)',
                      backgroundSize: '12px 12px',
                    }}
                  >
                    {/* Date sticker */}
                    <div className="flex justify-center mb-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-white/80 dark:bg-white/10 text-[10px] text-gray-600 dark:text-gray-300 shadow-sm">
                        AUJOURD'HUI
                      </span>
                    </div>

                    {/* Bulles WhatsApp */}
                    <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[440px] pr-1">
                      <AnimatePresence initial={false}>
                        {bubbles.map((sc, idx) => (
                          <ChatBubble key={`${sc.id}-${idx}`} scenario={sc} fresh={idx === bubbles.length - 1} />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Input WhatsApp */}
                  <div className="bg-[#F0F0F0] dark:bg-[#1F2C34] px-2 py-2 flex items-center gap-2">
                    <div className="flex-1 bg-white dark:bg-[#2A3942] rounded-full px-3 py-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                      Message
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#075E54] dark:bg-[#00A884] flex items-center justify-center">
                      <Send className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Reflet sous le téléphone */}
              <div
                aria-hidden
                className="absolute left-8 right-8 -bottom-4 h-8 rounded-full bg-emerald-500/30 blur-2xl"
              />
            </div>
          </motion.div>
        </div>

        {/* Mobile : flèche descendante (hidden on lg+) */}
        <div className="lg:hidden flex justify-center my-4 text-gray-400">
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          >
            <Send className="w-5 h-5 rotate-90" />
          </motion.div>
        </div>

        {/* Footer info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto"
        >
          {[
            { kpi: '< 1s', label: 'Délai de réception' },
            { kpi: '100%', label: 'Messages structurés et lisibles' },
            { kpi: '0', label: 'Effort pour l\'enseignant' },
          ].map((item, i) => (
            <div
              key={i}
              className="bg-white/70 dark:bg-gray-800/60 backdrop-blur rounded-2xl p-5 text-center border border-gray-100 dark:border-gray-700 shadow"
            >
              <div className="text-3xl font-bold bg-gradient-to-br from-green-600 to-emerald-500 bg-clip-text text-transparent">
                {item.kpi}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

// ───────────────────────────────────────────────────────────────
// Bulle de chat WhatsApp (entrée animée)
// ───────────────────────────────────────────────────────────────
const ChatBubble = ({ scenario, fresh }) => {
  const Icon = scenario.icon;
  const lines = scenario.whatsapp.lines;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 250, damping: 22 }}
      className="max-w-[88%] self-start"
    >
      <div className="bg-white dark:bg-[#202C33] rounded-lg rounded-tl-none shadow px-2.5 py-2 relative">
        {/* Petite flèche WhatsApp */}
        <span
          aria-hidden
          className="absolute -left-1.5 top-0 w-2 h-2 bg-white dark:bg-[#202C33]"
          style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
        />

        {lines.map((ln, i) => {
          if (ln.type === 'badge') {
            return (
              <div
                key={i}
                className={`inline-flex items-center gap-1 ${ln.color} text-white text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-md mb-1.5`}
              >
                <Icon className="w-2.5 h-2.5" />
                {ln.text}
              </div>
            );
          }
          if (ln.type === 'title') {
            return (
              <p key={i} className="text-[12px] font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {ln.text}
              </p>
            );
          }
          if (ln.type === 'meta') {
            return (
              <p key={i} className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                {ln.text}
              </p>
            );
          }
          if (ln.type === 'body') {
            return (
              <p
                key={i}
                className="text-[11px] text-gray-700 dark:text-gray-200 mt-1.5 whitespace-pre-line leading-snug"
              >
                {ln.text}
              </p>
            );
          }
          if (ln.type === 'attach') {
            return (
              <div
                key={i}
                className="mt-1.5 bg-gray-50 dark:bg-[#111B21] rounded-md px-2 py-1.5 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-red-500" />
                <span className="text-[10px] text-gray-700 dark:text-gray-300 truncate flex-1">
                  {ln.text}
                </span>
                <span className="text-[9px] text-gray-400">PDF</span>
              </div>
            );
          }
          return null;
        })}

        {/* Heure + double check */}
        <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5">
          <span className="text-[9px] text-gray-400">{scenario.whatsapp.time}</span>
          <CheckCheck className={`w-3 h-3 ${fresh ? 'text-blue-500' : 'text-gray-400'}`} />
        </div>
      </div>
    </motion.div>
  );
};

export default AutoMessages;
