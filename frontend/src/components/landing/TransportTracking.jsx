import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Bus, MapPin, MessageCircle, CheckCircle, School, Clock, Navigation, Bell } from 'lucide-react';

/**
 * Section landing : Suivi Transport en Temps Réel.
 * Animation 3D (CSS perspective) avec :
 *   - Carte inclinée façon 3D
 *   - Bus qui suit un itinéraire courbe vers l'école
 *   - Notifications WhatsApp qui apparaissent à des moments clés (approche, montée, arrivée)
 *   - Boucle infinie de 12s
 */

// Étapes du scénario (boucle de 12s)
// t en secondes ; chaque notif apparaît à t et disparaît à t+endOffset
const NOTIFICATIONS = [
  {
    id: 'approche',
    showAt: 1.5,
    hideAt: 5,
    icon: Clock,
    color: 'from-amber-400 to-orange-500',
    title: 'Bus en approche',
    text: '🚌 Le bus arrive dans 5 minutes chez Yassine',
    time: '07:38',
  },
  {
    id: 'monte',
    showAt: 5.5,
    hideAt: 9,
    icon: CheckCircle,
    color: 'from-green-400 to-emerald-600',
    title: 'Élève monté',
    text: '✅ Yassine est monté dans le bus à 07:42',
    time: '07:42',
  },
  {
    id: 'arrivee',
    showAt: 9.5,
    hideAt: 12,
    icon: School,
    color: 'from-blue-500 to-indigo-700',
    title: 'Arrivée à l\'école',
    text: '🏫 Yassine est arrivé à l\'école à 08:00',
    time: '08:00',
  },
];

const LOOP_DURATION = 12; // secondes

// Trajectoire du bus (pourcentages relatifs au container).
// 0% = départ (maison), 100% = arrivée (école).
// Coordonnées calculées pour suivre la route SVG dessinée plus bas.
const BUS_PATH = [
  { x: 12, y: 78 },  // départ maison
  { x: 28, y: 66 },
  { x: 38, y: 52 },
  { x: 52, y: 48 },
  { x: 62, y: 38 },
  { x: 75, y: 28 },
  { x: 85, y: 22 },  // arrivée école
];

const TransportTracking = () => {
  const [elapsed, setElapsed] = useState(0); // secondes dans la boucle

  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const dt = ((now - start) / 1000) % LOOP_DURATION;
      setElapsed(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Progression du bus (0 → 1) basée sur le temps écoulé
  const progress = Math.min(elapsed / (LOOP_DURATION - 1), 1);
  // Interpolation linéaire entre les waypoints du chemin
  const segIndex = Math.min(Math.floor(progress * (BUS_PATH.length - 1)), BUS_PATH.length - 2);
  const segT = (progress * (BUS_PATH.length - 1)) - segIndex;
  const p0 = BUS_PATH[segIndex];
  const p1 = BUS_PATH[segIndex + 1];
  const busX = p0.x + (p1.x - p0.x) * segT;
  const busY = p0.y + (p1.y - p0.y) * segT;
  // Angle du bus pour l'orientation
  const busAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x) * (180 / Math.PI);

  // Notif active à l'instant t
  const activeNotif = NOTIFICATIONS.find(n => elapsed >= n.showAt && elapsed < n.hideAt);

  return (
    <section className="relative py-24 overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950">
      {/* Décor : cercles flous en arrière-plan */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-300/30 dark:bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-300/30 dark:bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-sm font-semibold mb-4">
            <Bus className="w-4 h-4" />
            <span>Module Transport Scolaire</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Suivez le bus de votre enfant <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">en temps réel</span>
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            GPS en direct, notifications WhatsApp automatiques à chaque étape, et navigation intégrée Google Maps / Waze pour les chauffeurs.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Colonne gauche : avantages */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-5"
          >
            {[
              { icon: MapPin, color: 'bg-blue-500', title: 'GPS en temps réel', desc: 'Position du bus mise à jour toutes les 5 secondes sur une carte interactive.' },
              { icon: MessageCircle, color: 'bg-green-500', title: 'Notifications WhatsApp', desc: 'Le parent reçoit un message à l\'approche, à la montée et à l\'arrivée à l\'école.' },
              { icon: Navigation, color: 'bg-indigo-500', title: 'Navigation Google Maps / Waze', desc: 'Le chauffeur ouvre l\'itinéraire d\'un clic dans son application préférée.' },
              { icon: Bell, color: 'bg-amber-500', title: 'Alertes intelligentes', desc: 'Retards, déviations, absences : tout est signalé automatiquement.' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                whileHover={{ x: 6 }}
                className="flex gap-4 items-start p-4 rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur shadow-sm hover:shadow-md transition-shadow"
              >
                <div className={`shrink-0 w-12 h-12 ${item.color} rounded-xl flex items-center justify-center text-white shadow-lg`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Colonne droite : scène 3D animée */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative"
            style={{ perspective: '1600px' }}
          >
            {/* Carte inclinée style 3D */}
            <motion.div
              animate={{ rotateX: [14, 16, 14], rotateY: [-12, -10, -12] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              className="relative w-full aspect-[5/4] rounded-3xl overflow-hidden shadow-2xl"
              style={{ transformStyle: 'preserve-3d', transformOrigin: 'center center' }}
            >
              {/* Fond carte (rues simulées en SVG) */}
              <svg viewBox="0 0 100 80" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="mapBg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#dbeafe" />
                    <stop offset="1" stopColor="#c7d2fe" />
                  </linearGradient>
                  <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
                    <path d="M 8 0 L 0 0 0 8" fill="none" stroke="#94a3b8" strokeWidth="0.15" opacity="0.4" />
                  </pattern>
                </defs>
                <rect width="100" height="80" fill="url(#mapBg)" />
                <rect width="100" height="80" fill="url(#grid)" />
                {/* Quartiers (formes claires) */}
                <rect x="5" y="5" width="22" height="14" rx="1.5" fill="#fff" opacity="0.5" />
                <rect x="32" y="6" width="18" height="10" rx="1.5" fill="#fff" opacity="0.5" />
                <rect x="55" y="5" width="20" height="12" rx="1.5" fill="#fff" opacity="0.5" />
                <rect x="78" y="8" width="18" height="14" rx="1.5" fill="#fff" opacity="0.5" />
                <rect x="6" y="40" width="18" height="14" rx="1.5" fill="#fff" opacity="0.5" />
                <rect x="42" y="55" width="22" height="14" rx="1.5" fill="#fff" opacity="0.5" />
                <rect x="70" y="50" width="22" height="18" rx="1.5" fill="#fff" opacity="0.5" />
                {/* Routes principales */}
                <line x1="0" y1="33" x2="100" y2="33" stroke="#cbd5e1" strokeWidth="3" />
                <line x1="0" y1="60" x2="100" y2="60" stroke="#cbd5e1" strokeWidth="3" />
                <line x1="30" y1="0" x2="30" y2="80" stroke="#cbd5e1" strokeWidth="3" />
                <line x1="68" y1="0" x2="68" y2="80" stroke="#cbd5e1" strokeWidth="3" />

                {/* Itinéraire suivi par le bus (chemin courbe) */}
                <path
                  d="M 12 78 Q 22 72 28 66 T 38 52 Q 45 50 52 48 T 62 38 Q 70 32 75 28 T 85 22"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.2"
                  strokeDasharray="2 1.5"
                  opacity="0.85"
                />
                {/* Trace déjà parcourue (animée) */}
                <path
                  d="M 12 78 Q 22 72 28 66 T 38 52 Q 45 50 52 48 T 62 38 Q 70 32 75 28 T 85 22"
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  pathLength="1"
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - progress}
                  style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                />
              </svg>

              {/* Marqueur maison (départ) */}
              <div className="absolute" style={{ left: `${BUS_PATH[0].x}%`, top: `${BUS_PATH[0].y}%`, transform: 'translate(-50%, -100%)' }}>
                <div className="relative">
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-1.5 bg-black/30 rounded-full blur-sm"></div>
                  <div className="bg-white rounded-full p-2 shadow-xl ring-2 ring-amber-400">
                    <span className="block text-xl leading-none">🏠</span>
                  </div>
                </div>
              </div>

              {/* Marqueur école (arrivée) — pulse */}
              <div className="absolute" style={{ left: `${BUS_PATH[BUS_PATH.length - 1].x}%`, top: `${BUS_PATH[BUS_PATH.length - 1].y}%`, transform: 'translate(-50%, -100%)' }}>
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                    className="absolute inset-0 bg-blue-500 rounded-full"
                  />
                  <div className="relative bg-gradient-to-br from-blue-500 to-indigo-700 rounded-full p-2.5 shadow-xl ring-2 ring-white">
                    <School className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>

              {/* Bus animé qui suit la route */}
              <motion.div
                className="absolute z-10"
                style={{
                  left: `${busX}%`,
                  top: `${busY}%`,
                  transform: `translate(-50%, -50%) rotate(${busAngle}deg)`,
                  transition: 'left 0.1s linear, top 0.1s linear',
                }}
              >
                <div className="relative">
                  {/* Ombre projetée */}
                  <div className="absolute top-7 left-1/2 -translate-x-1/2 w-10 h-2 bg-black/30 rounded-full blur-md"></div>
                  {/* Halo lumineux phares */}
                  <motion.div
                    animate={{ opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-12 h-12 bg-yellow-300/40 rounded-full blur-xl"
                  />
                  <div
                    className="bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-xl px-2.5 py-1.5 shadow-2xl ring-2 ring-white flex items-center justify-center"
                    style={{ transform: `rotate(${-busAngle}deg)` }}
                  >
                    <Bus className="w-6 h-6 text-white drop-shadow" />
                  </div>
                </div>
              </motion.div>

              {/* Badge "EN DIRECT" */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                EN DIRECT
              </div>

              {/* Badge attribution carte (mimétisme) */}
              <div className="absolute bottom-2 right-2 text-[8px] text-slate-600/80 bg-white/70 px-1.5 py-0.5 rounded">
                Eductrack Map
              </div>
            </motion.div>

            {/* Notification WhatsApp flottante (style téléphone) */}
            <AnimatePresence mode="wait">
              {activeNotif && (
                <motion.div
                  key={activeNotif.id}
                  initial={{ opacity: 0, x: 60, y: -20, rotateY: 25, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, y: 0, rotateY: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 80, scale: 0.9 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute -right-4 md:-right-10 top-8 z-20 w-72"
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-4 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-[#25D366] rounded-full flex items-center justify-center shadow-md">
                        <MessageCircle className="w-5 h-5 text-white" fill="white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">WhatsApp · Eductrack</span>
                          <span className="text-[10px] text-slate-400">{activeNotif.time}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Notification automatique</span>
                      </div>
                    </div>
                    <div className={`bg-gradient-to-r ${activeNotif.color} text-white rounded-xl p-3 shadow-inner`}>
                      <div className="flex items-center gap-2 mb-1">
                        <activeNotif.icon className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wide">{activeNotif.title}</span>
                      </div>
                      <p className="text-sm font-medium leading-snug">{activeNotif.text}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mini KPI cards flottants */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="absolute -left-4 md:-left-8 -bottom-6 z-20 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 border border-slate-100 dark:border-slate-700"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center shadow">
                <Bus className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">Vitesse</div>
                <div className="text-lg font-black text-slate-900 dark:text-white leading-none">
                  {Math.round(28 + Math.sin(elapsed * 1.5) * 8)} <span className="text-xs font-bold text-slate-500">km/h</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Bandeau récap des étapes du scénario */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-20 grid md:grid-cols-3 gap-4"
        >
          {NOTIFICATIONS.map((n, i) => {
            const isActive = activeNotif?.id === n.id;
            return (
              <div
                key={n.id}
                className={`relative rounded-2xl p-5 transition-all duration-300 ${
                  isActive
                    ? 'bg-gradient-to-br ' + n.color + ' text-white shadow-2xl scale-105'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-md'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isActive ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-700'
                  }`}>
                    <n.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wide opacity-80">Étape {i + 1}</span>
                </div>
                <h4 className="font-bold mb-1">{n.title}</h4>
                <p className={`text-sm ${isActive ? 'opacity-95' : 'text-slate-500 dark:text-slate-400'}`}>{n.text}</p>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};

export default TransportTracking;
