/**
 * Section "Transport scolaire" — visualisation 3D :
 *
 *   ┌──────────────────────────┐         ┌──────────────────┐
 *   │   MAP (vue inclinée)     │  ────► │ WhatsApp Phone   │
 *   │    • Itinéraire courbe   │  signal │ Notifications    │
 *   │    • Bus animé           │  GPS    │  parent (temps   │
 *   │    • Maison / École      │         │   réel)          │
 *   └──────────────────────────┘         └──────────────────┘
 *
 * Boucle de 14s. À chaque étape du bus (départ → approche → montée →
 * trajet → arrivée), une notification WhatsApp s'ajoute dans le téléphone
 * du parent. La progression du bus est synchronisée avec les bulles.
 *
 * 100% CSS/SVG + framer-motion — pas de bibliothèque cartographique.
 */

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bus, MapPin, Navigation, CheckCheck, Send, School, Home,
  Clock, AlertCircle, ShieldCheck, Sparkles,
} from 'lucide-react';

const SCHOOL_NAME = 'École Al Amine';

// Étapes du voyage du bus (en pourcentage 0 → 100 sur le chemin SVG)
const STEPS = [
  {
    id: 'depart',
    at: 0.05,        // position du bus sur le tracé
    showBubbleAt: 0, // moment d'apparition de la notif (en s, dans la timeline 14s)
    badge: 'DEPART',
    badgeColor: 'bg-blue-500',
    icon: Clock,
    title: 'Bus en route',
    body: 'Le bus a quitté le dépôt. Arrivée prévue dans 8 min.',
    eta: '07:38',
  },
  {
    id: 'approche',
    at: 0.32,
    showBubbleAt: 3,
    badge: 'APPROCHE',
    badgeColor: 'bg-amber-500',
    icon: AlertCircle,
    title: 'Bus à 5 minutes',
    body: 'Yassine, préparez-vous : le bus arrive bientôt à votre arrêt.',
    eta: '07:40',
  },
  {
    id: 'montee',
    at: 0.55,
    showBubbleAt: 6,
    badge: 'MONTEE',
    badgeColor: 'bg-emerald-500',
    icon: ShieldCheck,
    title: 'Élève monté à bord',
    body: 'Yassine est bien monté dans le bus à l\'arrêt « Avenue Mohammed V ».',
    eta: '07:44',
  },
  {
    id: 'arrivee',
    at: 0.95,
    showBubbleAt: 9.5,
    badge: 'ARRIVEE',
    badgeColor: 'bg-purple-500',
    icon: School,
    title: 'Arrivée à l\'école',
    body: 'Yassine a été déposé à l\'école en toute sécurité.',
    eta: '07:58',
  },
];

const LOOP_DURATION = 14000; // ms
const RESET_GAP = 1500;

const TransportTracking = () => {
  // Progression 0..1 du bus sur la route (recalculée à chaque frame)
  const [progress, setProgress] = useState(0);
  // Bulles WhatsApp visibles (cumulatif)
  const [bubbles, setBubbles] = useState([]);
  // Étape actuellement « active » (mise en avant)
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const animRef = useRef(null);
  const startRef = useRef(null);

  // Animation principale (requestAnimationFrame)
  useEffect(() => {
    const tick = (ts) => {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = elapsed / LOOP_DURATION; // 0..1+

      if (t >= 1) {
        // Pause puis reset
        setTimeout(() => {
          setBubbles([]);
          setActiveStepIdx(0);
          setProgress(0);
          startRef.current = null;
          animRef.current = requestAnimationFrame(tick);
        }, RESET_GAP);
        return;
      }

      // Progression du bus : interpolation entre les étapes
      // Position lissée selon l'avancement dans le temps total
      setProgress(t);

      // Apparition des bulles selon showBubbleAt
      STEPS.forEach((step, idx) => {
        const stepStart = step.showBubbleAt / (LOOP_DURATION / 1000);
        if (t >= stepStart) {
          setBubbles(prev => {
            if (prev.find(b => b.id === step.id)) return prev;
            return [...prev, step];
          });
          if (idx > activeStepIdx) setActiveStepIdx(idx);
        }
      });

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position courante du bus sur la courbe SVG (interpolation entre les étapes)
  const busPositionPct = (() => {
    // On mappe le temps total sur la position cible (at) de chaque étape
    // pour un mouvement réaliste : le bus glisse smooth entre les étapes
    const t = progress;
    const timeline = STEPS.map((s, i) => ({
      at: s.at,
      time: s.showBubbleAt / (LOOP_DURATION / 1000),
    }));
    // Avant la 1re étape : interp depuis 0
    if (t <= timeline[0].time) {
      return (t / Math.max(timeline[0].time, 0.001)) * timeline[0].at;
    }
    for (let i = 0; i < timeline.length - 1; i++) {
      if (t >= timeline[i].time && t < timeline[i + 1].time) {
        const local = (t - timeline[i].time) / (timeline[i + 1].time - timeline[i].time);
        return timeline[i].at + local * (timeline[i + 1].at - timeline[i].at);
      }
    }
    // Après la dernière : interp jusqu'à 1
    const last = timeline[timeline.length - 1];
    const local = (t - last.time) / Math.max(1 - last.time, 0.001);
    return last.at + local * (1 - last.at);
  })();

  return (
    <section className="relative py-24 bg-gradient-to-br from-[#FFF7E9] via-white to-[#2A9D8F]/15 dark:from-gray-900 dark:via-[#173A59] dark:to-gray-900 overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#E8B447]/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#2A9D8F]/25 rounded-full blur-3xl" />
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
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E8B447]/18 dark:bg-[#E8B447]/20 text-[#9B6919] dark:text-[#F4CF78] text-sm font-semibold mb-4">
            <Navigation className="w-4 h-4" />
            Suivi GPS temps réel
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Le bus de votre enfant,{' '}
            <span className="bg-gradient-to-r from-[#E66F51] via-[#E8B447] to-[#2A9D8F] bg-clip-text text-transparent">
              suivi en direct
            </span>
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Position GPS du bus visible sur une carte, et notifications WhatsApp
            automatiques aux parents à chaque étape clé : départ, approche,
            montée à bord et arrivée à l'école.
          </p>
        </motion.div>

        {/* Scène 3D : Map ←→ Téléphone */}
        <div
          className="grid lg:grid-cols-12 gap-8 items-center"
          style={{ perspective: '1800px' }}
        >
          {/* ═══════════════ COLONNE GAUCHE — MAP ═══════════════ */}
          <motion.div
            initial={{ opacity: 0, x: -40, rotateY: -8 }}
            whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="lg:col-span-7 relative"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div
              className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white dark:border-gray-800"
              style={{
                transform: 'rotateY(6deg) rotateX(3deg)',
                transformStyle: 'preserve-3d',
                boxShadow:
                  '0 50px 100px -20px rgba(37, 211, 102, 0.4), 0 30px 60px -30px rgba(0,0,0,0.4)',
              }}
            >
              {/* Map background */}
              <MapBackground />

              {/* SVG Itinéraire + bus */}
              <svg
                viewBox="0 0 600 400"
                className="absolute inset-0 w-full h-full"
                preserveAspectRatio="xMidYMid slice"
              >
                <defs>
                  <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="50%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#14b8a6" />
                  </linearGradient>
                  <filter id="busGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Tracé "fantôme" (chemin complet) */}
                <path
                  id="bus-route"
                  d="M 60 320 Q 150 280, 180 220 T 280 160 Q 360 130, 400 90 T 540 60"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="6 8"
                  opacity="0.6"
                />

                {/* Tracé "progression" (s'allonge avec le bus) */}
                <path
                  d="M 60 320 Q 150 280, 180 220 T 280 160 Q 360 130, 400 90 T 540 60"
                  fill="none"
                  stroke="url(#routeGrad)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  pathLength="1"
                  strokeDasharray={`${busPositionPct} 1`}
                  style={{ transition: 'stroke-dasharray 0.1s linear' }}
                />

                {/* Maison (départ) */}
                <g transform="translate(60, 320)">
                  <circle r="22" fill="white" stroke="#22c55e" strokeWidth="3" />
                  <foreignObject x="-10" y="-10" width="20" height="20">
                    <Home className="w-5 h-5 text-green-600" />
                  </foreignObject>
                </g>

                {/* École (arrivée) */}
                <g transform="translate(540, 60)">
                  <circle r="24" fill="white" stroke="#14b8a6" strokeWidth="3" />
                  <foreignObject x="-11" y="-11" width="22" height="22">
                    <School className="w-5 h-5 text-pink-600" />
                  </foreignObject>
                </g>

                {/* Points d'étape sur le trajet */}
                {STEPS.map((step, i) => (
                  <PointOnPath key={step.id} at={step.at} active={i <= activeStepIdx} step={step} />
                ))}

                {/* Bus animé */}
                <BusOnPath at={busPositionPct} />
              </svg>

              {/* HUD overlay : info top-left */}
              <div className="absolute top-4 left-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Bus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">Bus #142 — Tournée Nord</p>
                  <p className="text-xs font-bold text-gray-900 dark:text-white leading-tight">
                    {Math.round(busPositionPct * 100)}% du trajet
                  </p>
                </div>
              </div>

              {/* HUD overlay : ETA top-right */}
              <div className="absolute top-4 right-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur rounded-xl shadow-lg px-3 py-2">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">Arrivée prévue</p>
                <p className="text-sm font-bold text-green-600 dark:text-green-400 leading-tight">07:58</p>
              </div>

              {/* HUD overlay : étape courante bottom-left */}
              <div className="absolute bottom-4 left-4 right-4">
                <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur rounded-xl shadow-lg px-3 py-2 flex items-center gap-3">
                  <div className="flex gap-1 flex-shrink-0">
                    {STEPS.map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${
                          i <= activeStepIdx ? 'w-6 bg-green-500' : 'w-1.5 bg-gray-300 dark:bg-gray-600'
                        }`}
                      />
                    ))}
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeStepIdx}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="min-w-0 flex-1"
                    >
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">Étape en cours</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-white leading-tight truncate">
                        {STEPS[activeStepIdx]?.title}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex-shrink-0">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    LIVE
                  </div>
                </div>
              </div>
            </div>

            {/* Reflet */}
            <div
              aria-hidden
              className="absolute left-8 right-8 -bottom-4 h-8 rounded-full bg-green-500/30 blur-2xl"
            />
          </motion.div>

          {/* ═══════════════ COLONNE DROITE — TÉLÉPHONE ═══════════════ */}
          <motion.div
            initial={{ opacity: 0, x: 40, rotateY: 8 }}
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
              <div
                className="relative w-[320px] h-[620px] bg-gray-900 rounded-[44px] p-3 shadow-2xl"
                style={{
                  boxShadow:
                    '0 60px 120px -30px rgba(0,0,0,0.5), 0 40px 70px -30px rgba(37, 211, 102, 0.4), inset 0 0 0 2px rgba(255,255,255,0.1)',
                }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-gray-900 rounded-b-2xl z-10" />
                <div className="absolute -left-1 top-28 w-1 h-12 bg-gray-700 rounded-l" />
                <div className="absolute -left-1 top-44 w-1 h-20 bg-gray-700 rounded-l" />
                <div className="absolute -right-1 top-32 w-1 h-16 bg-gray-700 rounded-r" />

                <div className="relative w-full h-full bg-[#ECE5DD] dark:bg-[#0B141A] rounded-[36px] overflow-hidden flex flex-col">
                  <div className="bg-[#075E54] dark:bg-[#1F2C34] px-4 pt-7 pb-2 text-white text-[10px] flex justify-between items-center">
                    <span className="font-semibold">7:38</span>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-1.5 border border-white rounded-sm relative">
                        <span className="absolute inset-0.5 bg-white rounded-[1px]" />
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#075E54] dark:bg-[#1F2C34] px-3 py-2 flex items-center gap-3 text-white shadow">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                      <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z" />
                    </svg>
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center ring-2 ring-white/20">
                        <Bus className="w-5 h-5" />
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#075E54]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">Transport {SCHOOL_NAME}</p>
                      <p className="text-[10px] text-white/80">notifications en direct</p>
                    </div>
                  </div>

                  <div
                    className="flex-1 overflow-hidden relative px-3 py-3"
                    style={{
                      backgroundImage:
                        'radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)',
                      backgroundSize: '12px 12px',
                    }}
                  >
                    <div className="flex justify-center mb-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-white/80 dark:bg-white/10 text-[10px] text-gray-600 dark:text-gray-300 shadow-sm">
                        AUJOURD'HUI — TRAJET MATIN
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[460px] pr-1">
                      <AnimatePresence>
                        {bubbles.map((b, idx) => (
                          <TransportBubble
                            key={b.id}
                            step={b}
                            fresh={idx === bubbles.length - 1}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>

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

              <div
                aria-hidden
                className="absolute left-8 right-8 -bottom-4 h-8 rounded-full bg-green-500/40 blur-2xl"
              />
            </div>
          </motion.div>
        </div>

        {/* KPI Footer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto"
        >
          {[
            { kpi: 'GPS', label: 'Position bus en temps réel' },
            { kpi: '4 étapes', label: 'Notifications WhatsApp automatiques' },
            { kpi: '100%', label: 'Sécurité — montée et arrivée confirmées' },
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
// Map background : grille routes + pâtés de maisons (pur SVG/CSS)
// ───────────────────────────────────────────────────────────────
const MapBackground = () => (
  <div className="relative w-full h-[400px] bg-gradient-to-br from-green-100 via-emerald-50 to-blue-50 dark:from-gray-800 dark:via-gray-800 dark:to-blue-950">
    <svg viewBox="0 0 600 400" className="absolute inset-0 w-full h-full">
      {/* Quartiers résidentiels (verts clairs) */}
      <rect x="20" y="20" width="120" height="80" fill="#a7f3d0" opacity="0.4" rx="4" />
      <rect x="160" y="40" width="100" height="60" fill="#bbf7d0" opacity="0.4" rx="4" />
      <rect x="280" y="20" width="140" height="90" fill="#a7f3d0" opacity="0.4" rx="4" />
      <rect x="440" y="30" width="140" height="100" fill="#bbf7d0" opacity="0.4" rx="4" />

      <rect x="30" y="180" width="100" height="80" fill="#fef3c7" opacity="0.4" rx="4" />
      <rect x="150" y="160" width="120" height="100" fill="#fde68a" opacity="0.3" rx="4" />
      <rect x="290" y="200" width="120" height="80" fill="#fef3c7" opacity="0.4" rx="4" />

      <rect x="40" y="290" width="140" height="100" fill="#dbeafe" opacity="0.4" rx="4" />
      <rect x="200" y="310" width="160" height="80" fill="#bfdbfe" opacity="0.3" rx="4" />
      <rect x="380" y="290" width="180" height="100" fill="#dbeafe" opacity="0.4" rx="4" />

      {/* Routes (grille principale) */}
      <g stroke="#d1d5db" strokeWidth="3" opacity="0.7">
        <line x1="0" y1="140" x2="600" y2="140" />
        <line x1="0" y1="280" x2="600" y2="280" />
        <line x1="140" y1="0" x2="140" y2="400" />
        <line x1="280" y1="0" x2="280" y2="400" />
        <line x1="430" y1="0" x2="430" y2="400" />
      </g>
      {/* Routes secondaires */}
      <g stroke="#e5e7eb" strokeWidth="1.5" opacity="0.6">
        <line x1="0" y1="70" x2="600" y2="70" />
        <line x1="0" y1="210" x2="600" y2="210" />
        <line x1="0" y1="350" x2="600" y2="350" />
        <line x1="70" y1="0" x2="70" y2="400" />
        <line x1="210" y1="0" x2="210" y2="400" />
        <line x1="360" y1="0" x2="360" y2="400" />
        <line x1="510" y1="0" x2="510" y2="400" />
      </g>

      {/* Petits arbres ronds */}
      {[
        [80, 110], [200, 90], [320, 110], [490, 100],
        [60, 270], [220, 270], [330, 270], [470, 270],
        [110, 390], [380, 390], [550, 390],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#22c55e" opacity="0.5" />
      ))}
    </svg>
  </div>
);

// ───────────────────────────────────────────────────────────────
// Point d'étape sur le tracé (waypoint)
// ───────────────────────────────────────────────────────────────
const PointOnPath = ({ at, active, step }) => {
  // Reprend l'équation du path pour obtenir un point. On le calcule
  // statiquement avec quelques positions clés mappées.
  const pos = pointOnRoute(at);
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <motion.circle
        r="8"
        fill={active ? '#22c55e' : '#cbd5e1'}
        stroke="white"
        strokeWidth="3"
        animate={active ? { scale: [1, 1.3, 1] } : {}}
        transition={{ duration: 1.2, repeat: active ? Infinity : 0 }}
      />
    </g>
  );
};

// ───────────────────────────────────────────────────────────────
// Bus animé sur le tracé
// ───────────────────────────────────────────────────────────────
const BusOnPath = ({ at }) => {
  const pos = pointOnRoute(at);
  const next = pointOnRoute(Math.min(at + 0.02, 1));
  const angle = (Math.atan2(next.y - pos.y, next.x - pos.x) * 180) / Math.PI;
  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      style={{ transition: 'transform 0.1s linear' }}
    >
      {/* Halo */}
      <circle r="22" fill="#3b82f6" opacity="0.2">
        <animate attributeName="r" values="22;28;22" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.2;0.05;0.2" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Cercle bus */}
      <circle r="16" fill="url(#routeGrad)" filter="url(#busGlow)" />
      <circle r="16" fill="none" stroke="white" strokeWidth="2.5" />
      {/* Icône bus */}
      <foreignObject x="-9" y="-9" width="18" height="18" style={{ overflow: 'visible' }}>
        <Bus className="w-[18px] h-[18px] text-white" />
      </foreignObject>
    </g>
  );
};

// ───────────────────────────────────────────────────────────────
// Échantillonnage du path SVG : approximation par Bezier discrétisée
// ───────────────────────────────────────────────────────────────
// Le path est :
//   M 60 320 Q 150 280, 180 220 T 280 160 Q 360 130, 400 90 T 540 60
//
// On échantillonne par segments Q (quadratique) :
//   1. Q (60,320)→(180,220) ctrl (150,280)
//   2. T → équivalent à Q (180,220)→(280,160) ctrl reflété (210,160) ≈ (210,160)
//   3. Q (280,160)→(400,90)  ctrl (360,130)
//   4. T → Q (400,90)→(540,60) ctrl reflété (440,50)
const SEGMENTS = [
  // [P0, P1(ctrl), P2]
  [[60, 320], [150, 280], [180, 220]],
  [[180, 220], [210, 160], [280, 160]],
  [[280, 160], [360, 130], [400, 90]],
  [[400, 90], [440, 50], [540, 60]],
];

function quadAt([p0, p1, p2], t) {
  const inv = 1 - t;
  return {
    x: inv * inv * p0[0] + 2 * inv * t * p1[0] + t * t * p2[0],
    y: inv * inv * p0[1] + 2 * inv * t * p1[1] + t * t * p2[1],
  };
}

function pointOnRoute(progress) {
  // progress 0..1 → indice segment + t local
  const p = Math.max(0, Math.min(1, progress));
  const segCount = SEGMENTS.length;
  const scaled = p * segCount;
  const idx = Math.min(Math.floor(scaled), segCount - 1);
  const t = scaled - idx;
  return quadAt(SEGMENTS[idx], t);
}

// ───────────────────────────────────────────────────────────────
// Bulle WhatsApp pour une étape transport
// ───────────────────────────────────────────────────────────────
const TransportBubble = ({ step, fresh }) => {
  const Icon = step.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 250, damping: 22 }}
      className="max-w-[88%] self-start"
    >
      <div className="bg-white dark:bg-[#202C33] rounded-lg rounded-tl-none shadow px-2.5 py-2 relative">
        <span
          aria-hidden
          className="absolute -left-1.5 top-0 w-2 h-2 bg-white dark:bg-[#202C33]"
          style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
        />

        <div className={`inline-flex items-center gap-1 ${step.badgeColor} text-white text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-md mb-1.5`}>
          <Icon className="w-2.5 h-2.5" />
          {step.badge}
        </div>

        <p className="text-[12px] font-bold text-gray-900 dark:text-gray-100 leading-tight">
          {step.title}
        </p>
        <p className="text-[11px] text-gray-700 dark:text-gray-200 mt-1 leading-snug">
          {step.body}
        </p>

        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
          <Clock className="w-2.5 h-2.5" />
          <span>{step.eta}</span>
        </div>

        <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5">
          <span className="text-[9px] text-gray-400">{step.eta}</span>
          <CheckCheck className={`w-3 h-3 ${fresh ? 'text-blue-500' : 'text-gray-400'}`} />
        </div>
      </div>
    </motion.div>
  );
};

export default TransportTracking;
