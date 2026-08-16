import { motion as Motion } from 'framer-motion';
import {
  ArrowRight,
  BrainCircuit,
  Bus,
  Check,
  FileSpreadsheet,
  Languages,
  LayoutGrid,
  MessageCircle,
  MonitorSmartphone,
  Route,
  Sparkles,
  UserRoundSearch,
  WalletCards,
} from 'lucide-react';
import BrandLogo from '../../BrandLogo';

const capabilities = [
  {
    icon: FileSpreadsheet,
    title: 'Emplois du temps par IA',
    description: 'Importez des images ou un PDF multipage, vérifiez les grilles reconnues puis publiez.',
    badge: 'Nouveau',
    tone: 'coral',
    span: 'lg:col-span-2',
  },
  {
    icon: UserRoundSearch,
    title: 'Dossier élève 360°',
    description: 'Un parcours continu de la maternelle au bac : performances, qualités, points à renforcer, synthèse et rapport assisté par IA.',
    badge: 'Parcours complet',
    tone: 'teal',
    span: 'lg:col-span-1',
  },
  {
    icon: BrainCircuit,
    title: 'Répartition intelligente',
    description: 'Analyse du niveau, contraintes, glisser-déposer et plan de classe 2D avec photos.',
    badge: 'IA + contrôle humain',
    tone: 'gold',
    span: 'lg:col-span-1',
  },
  {
    icon: LayoutGrid,
    title: 'Notes & bulletins reliés',
    description: 'Saisie par contrôle, récapitulatif imprimable, appréciations et bulletins parents.',
    badge: 'Pédagogie',
    tone: 'navy',
    span: 'lg:col-span-2',
  },
  {
    icon: MessageCircle,
    title: 'Communication utile',
    description: 'WhatsApp, documents, rendez-vous, vitrine de l’école et informations générales.',
    badge: 'Familles',
    tone: 'teal',
    span: 'lg:col-span-2',
  },
  {
    icon: WalletCards,
    title: 'Finance & inscriptions',
    description: 'Frais, factures, paiements, impayés, budgets, caisse et réinscriptions suivis.',
    badge: 'Gestion',
    tone: 'coral',
    span: 'lg:col-span-1',
  },
  {
    icon: Bus,
    title: 'Transport en direct',
    description: 'Tournées, chauffeurs, montées, déposes et position du bus partagée aux familles.',
    badge: 'GPS',
    tone: 'gold',
    span: 'lg:col-span-1',
  },
  {
    icon: Languages,
    title: 'Français & العربية',
    description: 'Les espaces parents et professeurs s’adaptent à la langue de chaque utilisateur.',
    badge: 'Bilingue',
    tone: 'navy',
    span: 'lg:col-span-2',
  },
];

const tones = {
  coral: { icon: 'bg-[#E66F51]/10 text-[#E66F51]', badge: 'bg-[#E66F51]/10 text-[#B84D36]', hover: 'hover:border-[#E66F51]/30' },
  teal: { icon: 'bg-[#2A9D8F]/10 text-[#2A9D8F]', badge: 'bg-[#2A9D8F]/10 text-[#207F74]', hover: 'hover:border-[#2A9D8F]/30' },
  gold: { icon: 'bg-[#E8B447]/20 text-[#A77410]', badge: 'bg-[#E8B447]/20 text-[#8B6410]', hover: 'hover:border-[#E8B447]/30' },
  navy: { icon: 'bg-[#173A59]/10 text-[#173A59]', badge: 'bg-[#173A59]/10 text-[#173A59]', hover: 'hover:border-[#173A59]/25' },
};

const CapabilitiesAndCTA = ({ onRegister }) => {
  const openWhatsApp = () => {
    window.open('https://wa.me/212641998700?text=Bonjour,%20je%20souhaite%20une%20démo%20personnalisée%20de%20Bousole%20pour%20mon%20école', '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <section id="capabilities" className="relative scroll-mt-20 overflow-hidden bg-[#FFF7E9] py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 landing-compass-grid opacity-45" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#E66F51]/10 px-4 py-2 text-sm font-extrabold text-[#B84D36]">
                <Sparkles className="h-4 w-4" />
                Bousole aujourd’hui
              </div>
              <h2 className="mt-5 text-3xl font-black tracking-[-0.035em] text-[#173A59] sm:text-5xl">Bien plus qu’un suivi scolaire.</h2>
            </div>
            <p className="max-w-2xl text-lg font-medium leading-8 text-[#173A59]/60 lg:justify-self-end">Les dernières fonctions couvrent tout le parcours : préparer l’année, organiser les classes, accompagner l’élève, informer la famille et piloter l’établissement.</p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {capabilities.map((capability, index) => {
              const Icon = capability.icon;
              const tone = tones[capability.tone];
              return (
                <Motion.article
                  key={capability.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: (index % 4) * 0.06 }}
                  className={`group relative overflow-hidden rounded-[1.6rem] border border-[#173A59]/10 bg-white/90 p-5 shadow-[0_14px_38px_rgba(23,58,89,0.06)] backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(23,58,89,0.11)] ${tone.hover} ${capability.span}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tone.icon}`}><Icon className="h-5 w-5" /></span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${tone.badge}`}>{capability.badge}</span>
                  </div>
                  <h3 className="mt-6 text-lg font-black text-[#173A59]">{capability.title}</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-[#173A59]/60">{capability.description}</p>
                  <div className="pointer-events-none absolute -bottom-10 -right-8 h-24 w-24 rounded-full bg-current opacity-[0.025] transition-transform duration-500 group-hover:scale-150" />
                </Motion.article>
              );
            })}
          </div>

          <div className="mt-16 grid overflow-hidden rounded-[2rem] bg-white shadow-[0_26px_70px_rgba(23,58,89,0.12)] ring-1 ring-[#173A59]/10 lg:grid-cols-[1.02fr_0.98fr]">
            <div className="relative min-h-[320px] overflow-hidden">
              <img src="/images/landing-v2/school-operations.webp" alt="Pilotage numérique des opérations d’une école en 3D" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-white/30 lg:bg-gradient-to-l" />
            </div>
            <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
              <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#2A9D8F]">Une technologie qui reste humaine</span>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.025em] text-[#173A59] sm:text-3xl">L’IA prépare. L’équipe vérifie. L’école décide.</h3>
              <p className="mt-4 text-base font-medium leading-7 text-[#173A59]/60">Bousole automatise les tâches répétitives sans enlever le contrôle aux équipes : chaque import, suggestion ou rapport reste vérifiable avant utilisation.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {['Contrôle humain conservé', 'Données par établissement', 'Historique des actions', 'Expérience multi-rôles'].map((item) => (
                  <span key={item} className="flex items-center gap-2 text-sm font-bold text-[#173A59]/70"><Check className="h-4 w-4 text-[#2A9D8F]" />{item}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="relative scroll-mt-20 overflow-hidden bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2.4rem] bg-gradient-to-br from-[#173A59] via-[#1B4C61] to-[#2A9D8F] px-6 py-12 text-white shadow-[0_32px_90px_rgba(23,58,89,0.24)] sm:px-10 lg:px-16 lg:py-16">
            <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full border-[44px] border-white/5" />
            <div className="pointer-events-none absolute -bottom-44 left-1/3 h-80 w-80 rounded-full bg-[#E66F51]/20 blur-3xl" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_auto]">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-extrabold text-[#CFF4EF] ring-1 ring-white/10">
                  <Route className="h-4 w-4" />
                  Votre école, votre prochain cap
                </div>
                <h2 className="mt-5 text-3xl font-black tracking-[-0.035em] sm:text-5xl">Montrez-nous votre quotidien. Nous vous montrerons le chemin le plus simple.</h2>
                <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-white/70">Une démonstration adaptée à votre établissement, vos niveaux, votre organisation et vos priorités.</p>
                <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold text-white/70">
                  <span className="flex items-center gap-2"><MonitorSmartphone className="h-4 w-4 text-[#F9D780]" /> Web, Android et Windows</span>
                  <span className="flex items-center gap-2"><Languages className="h-4 w-4 text-[#F9D780]" /> Français et arabe</span>
                  <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-[#F9D780]" /> Accompagnement WhatsApp</span>
                </div>
              </div>
              <div className="flex min-w-[230px] flex-col gap-3">
                <button type="button" onClick={openWhatsApp} className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-base font-extrabold text-[#173A59] shadow-xl transition hover:-translate-y-0.5">
                  Demander une démo
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button type="button" onClick={onRegister} className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-6 py-3.5 text-base font-extrabold text-white transition hover:bg-white/20">Créer mon école</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#173A59]/10 bg-[#FFF7E9] py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 text-center sm:px-6 md:flex-row md:text-left lg:px-8">
          <BrandLogo iconClassName="h-11 w-11" showTagline />
          <p className="text-sm font-semibold text-[#173A59]/50">© {new Date().getFullYear()} Bousole · Ensemble, guidons chaque élève.</p>
          <button type="button" onClick={openWhatsApp} className="inline-flex items-center gap-2 text-sm font-extrabold text-[#2A9D8F] transition hover:text-[#173A59]"><MessageCircle className="h-4 w-4" />Parler à l’équipe</button>
        </div>
      </footer>
    </>
  );
};

export default CapabilitiesAndCTA;
