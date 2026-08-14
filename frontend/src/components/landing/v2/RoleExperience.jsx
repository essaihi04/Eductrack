import { useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  HeartHandshake,
  School2,
  Sparkles,
  Users,
} from 'lucide-react';

const roleData = {
  school: {
    tab: 'École',
    eyebrow: 'Direction & administration',
    icon: School2,
    color: '#173A59',
    image: '/images/landing-v2/school-operations.webp',
    imageAlt: 'Équipe de direction pilotant les opérations scolaires en 3D',
    headline: 'Je vois l’école entière sans courir après l’information.',
    body: 'La direction retrouve les indicateurs pédagogiques, les encaissements, les tournées de bus, les inscriptions et les alertes dans un espace cohérent.',
    outcomes: ['Décisions appuyées par des données lisibles', 'Rôles délégués et actions traçables', 'Imports Excel, images et PDF pour gagner du temps'],
    signal: 'Pilotage unifié',
  },
  parent: {
    tab: 'Parents',
    eyebrow: 'Confiance au quotidien',
    icon: HeartHandshake,
    color: '#E66F51',
    image: '/images/landing-v2/family-journey.webp',
    imageAlt: 'Parent et élève accueillis par leur école en 3D',
    headline: 'Je sais où en est mon enfant et comment l’aider.',
    body: 'Le parent reçoit l’essentiel sur WhatsApp et retrouve les détails dans son portail : absences, devoirs, notes, rendez-vous, finance et transport.',
    outcomes: ['Une information claire, au bon moment', 'Un espace par enfant, en français ou en arabe', 'Moins d’appels répétitifs au secrétariat'],
    signal: 'Famille rassurée',
  },
  student: {
    tab: 'Élèves',
    eyebrow: 'Repères & motivation',
    icon: GraduationCap,
    color: '#E8B447',
    image: '/images/landing-v2/family-journey.webp',
    imageAlt: 'Élève avançant vers son école sur une trajectoire en forme de boussole',
    headline: 'Je vois ce qui m’attend et les progrès que je réalise.',
    body: 'L’élève accède à son emploi du temps, ses devoirs, ses documents, ses notes, ses bulletins et ses badges sans se perdre dans plusieurs outils.',
    outcomes: ['Priorités de la semaine visibles', 'Documents et devoirs réunis', 'Badges et niveaux pour valoriser l’effort'],
    signal: 'Élève orienté',
  },
  teacher: {
    tab: 'Professeurs',
    eyebrow: 'La classe, sans friction',
    icon: BookOpen,
    color: '#2A9D8F',
    image: '/images/landing-v2/school-operations.webp',
    imageAlt: 'Organisation pédagogique et emploi du temps en miniature 3D',
    headline: 'Je consacre mon temps aux élèves, pas à la ressaisie.',
    body: 'Le professeur enregistre la séance, planifie les contrôles, partage les documents, suit les élèves et prépare les appréciations depuis un parcours simple.',
    outcomes: ['Suivi rapide pendant la séance', 'Notes, contrôles et cahier de texte reliés', 'Interface disponible en français et en arabe'],
    signal: 'Temps pédagogique retrouvé',
  },
};

const RoleExperience = () => {
  const [activeRole, setActiveRole] = useState('school');
  const active = roleData[activeRole];
  const ActiveIcon = active.icon;

  return (
    <section id="roles" className="relative scroll-mt-20 overflow-hidden bg-[#173A59] py-24 text-white sm:py-32">
      <div className="pointer-events-none absolute inset-0 landing-dark-grid opacity-40" />
      <div className="pointer-events-none absolute -left-44 top-1/3 h-96 w-96 rounded-full bg-[#2A9D8F]/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-16 h-96 w-96 rounded-full bg-[#E66F51]/20 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold text-[#CFF4EF] ring-1 ring-white/10">
              <Users className="h-4 w-4" />
              Une plateforme, quatre expériences
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-[-0.035em] sm:text-5xl">Chacun voit ce qui compte pour lui.</h2>
            <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-white/60">Boussoule ne montre pas la même complexité à tout le monde. Chaque rôle reçoit un parcours clair, avec les bons repères et les bonnes actions.</p>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 rounded-2xl bg-white/5 p-1.5 ring-1 ring-white/10 sm:flex sm:w-auto sm:max-w-full sm:overflow-x-auto">
            {Object.entries(roleData).map(([key, role]) => {
              const Icon = role.icon;
              const selected = key === activeRole;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveRole(key)}
                  aria-pressed={selected}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-extrabold transition sm:shrink-0 ${selected ? 'bg-white text-[#173A59] shadow-lg' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
                >
                  <Icon className="h-4 w-4" />
                  {role.tab}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.07fr_0.93fr] lg:gap-14">
          <AnimatePresence mode="wait">
            <Motion.div key={`${activeRole}-image`} initial={{ opacity: 0, x: -20, rotateY: 5 }} animate={{ opacity: 1, x: 0, rotateY: 0 }} exit={{ opacity: 0, x: 15 }} transition={{ duration: 0.38 }} className="landing-3d-stage relative">
              <div className="landing-3d-card overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-2 shadow-[0_35px_90px_rgba(0,0,0,0.28)] backdrop-blur">
                <img src={active.image} alt={active.imageAlt} className="aspect-[1.5/1] w-full rounded-[1.55rem] object-cover" loading="lazy" />
              </div>
              <div className="absolute -bottom-6 left-5 rounded-2xl bg-white p-4 text-[#173A59] shadow-2xl sm:left-8">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ backgroundColor: active.color }}><ActiveIcon className="h-5 w-5" /></span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#173A59]/40">Résultat</p>
                    <p className="text-sm font-black">{active.signal}</p>
                  </div>
                </div>
              </div>
            </Motion.div>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <Motion.div key={`${activeRole}-copy`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.32 }}>
              <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: active.color === '#173A59' ? '#9ADFD6' : active.color }}>
                <Sparkles className="h-4 w-4" />
                {active.eyebrow}
              </div>
              <h3 className="mt-4 text-3xl font-black leading-tight tracking-[-0.03em] sm:text-4xl">« {active.headline} »</h3>
              <p className="mt-5 text-base font-medium leading-7 text-white/60 sm:text-lg">{active.body}</p>
              <div className="mt-7 space-y-3">
                {active.outcomes.map((outcome) => (
                  <div key={outcome} className="flex items-start gap-3 rounded-2xl bg-white/5 p-3.5 ring-1 ring-white/10">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#72D8CC]" />
                    <span className="text-sm font-bold text-white/80">{outcome}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })} className="group mt-7 inline-flex items-center gap-2 text-sm font-extrabold text-[#F9D780] transition hover:text-white">
                Voir Boussoule pour {activeRole === 'school' ? 'mon établissement' : activeRole === 'parent' ? 'les familles' : activeRole === 'student' ? 'les élèves' : 'les enseignants'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};

export default RoleExperience;
