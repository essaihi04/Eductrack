import { createElement } from 'react';
import { motion as Motion } from 'framer-motion';
import {
  ArrowRight,
  Bus,
  CheckCircle2,
  FileScan,
  Languages,
  Play,
  School2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const reassurance = [
  { icon: School2, label: 'De la maternelle au lycée' },
  { icon: Languages, label: 'Français + العربية' },
  { icon: ShieldCheck, label: 'Chaque rôle, son espace' },
];

const LandingHero3D = ({ onStart, onRegister }) => (
  <section className="relative isolate overflow-hidden pb-20 pt-24 sm:pb-28 sm:pt-32 lg:min-h-[760px] lg:pt-36">
    <div className="pointer-events-none absolute inset-0 landing-compass-grid opacity-70" />
    <div className="pointer-events-none absolute -left-40 top-28 h-80 w-80 rounded-full bg-[#2A9D8F]/10 blur-3xl" />
    <div className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full bg-[#E66F51]/20 blur-3xl" />

    <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:gap-8 lg:px-8">
      <Motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65 }}
        className="relative z-10"
      >
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E66F51]/20 bg-white/75 px-4 py-2 text-sm font-extrabold text-[#B54C34] shadow-sm backdrop-blur">
          <Sparkles className="h-4 w-4 text-[#E8B447]" />
          La boussole numérique de votre école
        </div>

        <h1 className="max-w-3xl text-4xl font-black leading-[1.04] tracking-[-0.04em] text-[#173A59] sm:text-5xl lg:text-[4.35rem]">
          Pilotez l’école.
          <span className="mt-1 block bg-gradient-to-r from-[#E66F51] via-[#E8B447] to-[#2A9D8F] bg-clip-text text-transparent">
            Rassurez les parents.
          </span>
          <span className="mt-1 block">Faites grandir chaque élève.</span>
        </h1>

        <p className="mt-7 max-w-2xl text-lg font-medium leading-8 text-[#173A59]/70 sm:text-xl">
          Bousole relie la direction, les familles, les élèves et les professeurs dans une seule expérience : pédagogie, communication, finance, transport et vie scolaire avancent dans le même sens.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onStart}
            className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-[#173A59] px-6 py-3.5 text-base font-extrabold text-white shadow-[0_16px_40px_rgba(23,58,89,0.24)] transition hover:-translate-y-0.5 hover:bg-[#214F74]"
          >
            <Play className="h-4 w-4 fill-current" />
            Vivre une journée avec Bousole
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button
            type="button"
            onClick={onRegister}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#173A59]/20 bg-white/80 px-6 py-3.5 text-base font-extrabold text-[#173A59] shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-[#2A9D8F]/40 hover:bg-white"
          >
            Créer l’espace de mon école
          </button>
        </div>

        <div className="mt-8 flex flex-wrap gap-2.5">
          {reassurance.map(({ icon: Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-2 rounded-full bg-[#FFFDF8] px-3 py-2 text-xs font-bold text-[#173A59]/70 ring-1 ring-[#173A59]/10">
              {createElement(Icon, { className: 'h-3.5 w-3.5 text-[#2A9D8F]' })}
              {label}
            </span>
          ))}
        </div>
      </Motion.div>

      <Motion.div
        initial={{ opacity: 0, scale: 0.94, rotateY: -7 }}
        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
        transition={{ duration: 0.8, delay: 0.12 }}
        className="landing-3d-stage relative mx-auto w-full max-w-3xl lg:translate-x-7"
      >
        <Motion.div
          animate={{ y: [0, -8, 0], rotateX: [0, 1.2, 0], rotateY: [0, -1.3, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          className="landing-3d-card relative overflow-hidden rounded-[2.2rem] border border-white/80 bg-[#FFF7E9] p-2 shadow-[0_35px_90px_rgba(23,58,89,0.18)] sm:p-3"
        >
          <img
            src="/images/landing-v2/hero-school-ecosystem.webp"
            alt="Écosystème scolaire Bousole représenté en miniature 3D"
            className="aspect-[1.82/1] w-full rounded-[1.7rem] object-cover"
            loading="eager"
          />
          <div className="pointer-events-none absolute inset-0 rounded-[2.2rem] bg-gradient-to-t from-[#173A59]/5 via-transparent to-white/10" />
        </Motion.div>

        <Motion.div
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -left-2 top-5 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-xl backdrop-blur sm:-left-6 sm:top-10 sm:p-4"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#2A9D8F]/10 text-[#2A9D8F]">
              <School2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#173A59]/40">Direction</p>
              <p className="text-sm font-black text-[#173A59]">Une vue, toute l’école</p>
            </div>
          </div>
        </Motion.div>

        <Motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 5.4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          className="absolute -bottom-8 right-3 rounded-2xl border border-white/80 bg-white/95 p-3 shadow-xl backdrop-blur sm:right-8 sm:p-4"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#E66F51]/10 text-[#E66F51]">
              <FileScan className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#173A59]/40">Nouveau</p>
              <p className="text-sm font-black text-[#173A59]">Emplois du temps par IA</p>
              <p className="mt-0.5 text-xs font-semibold text-[#2A9D8F]">Images et PDF multipages</p>
            </div>
          </div>
        </Motion.div>

        <div className="absolute -right-2 top-1/2 hidden -translate-y-1/2 rounded-2xl border border-white/70 bg-[#173A59] p-3 text-white shadow-2xl sm:block">
          <Bus className="h-5 w-5 text-[#E8B447]" />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">Transport</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs font-extrabold">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#5FD1C3]" /> En direct
          </p>
        </div>
      </Motion.div>
    </div>
  </section>
);

export default LandingHero3D;
