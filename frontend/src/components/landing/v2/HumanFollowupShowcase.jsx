import { createElement, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  HeartHandshake,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  UserRoundCheck,
} from 'lucide-react';

const chatScenarios = {
  progress: {
    label: 'Comment l’aider ?',
    question: 'Comment puis-je aider Lina en mathématiques ?',
    answer: 'Lina progresse bien en géométrie. Les fractions restent à consolider. Je vous conseille 15 minutes d’exercice jeudi, puis le quiz préparé par son professeur.',
    detail: 'Réponse basée sur ses résultats et les observations autorisées.',
  },
  homework: {
    label: 'Ses devoirs ?',
    question: 'Quels devoirs Lina a-t-elle cette semaine ?',
    answer: 'Deux devoirs sont prévus : sciences pour vendredi et lecture pour lundi. Les consignes et les documents sont disponibles dans son espace.',
    detail: 'Les informations viennent du cahier de texte de sa classe.',
  },
  attendance: {
    label: 'Ses absences ?',
    question: 'Lina a-t-elle été absente ce mois-ci ?',
    answer: 'Une absence a été enregistrée et justifiée. Aucun retard n’est signalé ce mois-ci. Vous pouvez consulter le détail dans son dossier.',
    detail: 'Seules les données de votre enfant vous sont présentées.',
  },
};

const stageData = {
  maternelle: {
    label: 'Maternelle',
    years: '2017–2019',
    progress: 72,
    trend: 'Éveil en progression',
    qualities: ['Curiosité', 'Expression orale', 'Entraide'],
    focus: 'Allonger le temps de concentration',
    observation: 'Apprend vite lorsqu’elle manipule et raconte ce qu’elle découvre.',
  },
  primaire: {
    label: 'Primaire',
    years: '2019–2025',
    progress: 81,
    trend: '+9 points sur le cycle',
    qualities: ['Lecture', 'Créativité', 'Participation'],
    focus: 'Structurer la résolution de problèmes',
    observation: 'Très à l’aise à l’oral ; les étapes écrites renforcent ses acquis.',
  },
  college: {
    label: 'Collège',
    years: '2025–2028',
    progress: 86,
    trend: 'Trajectoire régulière',
    qualities: ['Sciences', 'Collaboration', 'Persévérance'],
    focus: 'Consolider les fractions et l’organisation',
    observation: 'La motivation reste forte quand les objectifs de la semaine sont visibles.',
  },
  lycee: {
    label: 'Lycée · Bac',
    years: '2028–2031',
    progress: 91,
    trend: 'Autonomie confirmée',
    qualities: ['Analyse', 'Autonomie', 'Projet scientifique'],
    focus: 'Gérer le temps pendant les évaluations',
    observation: 'Le parcours complet aide l’équipe à proposer une orientation cohérente.',
  },
};

const ClassroomFollowup = () => (
  <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
    <Motion.div
      initial={{ opacity: 0, x: -24 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      className="relative pb-8 sm:pb-10"
    >
      <div className="overflow-hidden rounded-[2rem] bg-[#173A59] p-2 shadow-[0_30px_80px_rgba(23,58,89,0.2)]">
        <img
          src="/images/landing-v2/teacher-classroom-followup.webp"
          alt="Professeure suivant la participation et le travail de ses élèves pendant la classe"
          className="aspect-[1.5/1] w-full rounded-[1.55rem] object-cover"
          loading="lazy"
        />
      </div>

      <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-xs font-extrabold text-[#173A59] shadow-lg backdrop-blur sm:left-6 sm:top-6">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#2A9D8F]" />
        Suivi pendant la séance
      </div>

      <div className="absolute -bottom-1 left-4 right-4 rounded-2xl bg-white p-4 shadow-[0_20px_55px_rgba(23,58,89,0.18)] ring-1 ring-[#173A59]/10 sm:left-8 sm:right-8 sm:p-5">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['27', 'Présents'],
            ['18', 'Cahiers'],
            ['12', 'Participations'],
            ['1', 'À revoir'],
          ].map(([value, label], index) => (
            <div key={label} className={index === 3 ? 'text-[#E66F51]' : 'text-[#2A9D8F]'}>
              <p className="text-lg font-black sm:text-xl">{value}</p>
              <p className="mt-0.5 truncate text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#173A59]/40 sm:text-[10px]">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </Motion.div>

    <div>
      <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#2A9D8F]">
        <UserRoundCheck className="h-4 w-4" />
        Le professeur dans la classe
      </span>
      <h3 className="mt-4 text-3xl font-black leading-tight tracking-[-0.035em] text-[#173A59] sm:text-4xl">Observer, noter, accompagner — sans quitter les élèves des yeux.</h3>
      <p className="mt-5 text-base font-medium leading-7 text-[#173A59]/60 sm:text-lg">Depuis une seule vue, le professeur enregistre la présence, le travail, la discipline et la participation. Chaque observation utile rejoint le parcours de l’élève et peut déclencher la bonne action.</p>

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {[
          ['Présence immédiate', ClipboardCheck],
          ['Qualité du travail', BookOpenCheck],
          ['Participation valorisée', Star],
          ['Parent informé si nécessaire', HeartHandshake],
        ].map(([label, Icon]) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-[#173A59]/10">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#2A9D8F]/10 text-[#2A9D8F]">{createElement(Icon, { className: 'h-4 w-4' })}</span>
            <span className="text-sm font-extrabold text-[#173A59]">{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#E8B447]/30 bg-[#E8B447]/10 p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#A77410]" />
        <p className="text-sm font-bold leading-6 text-[#173A59]/70">Une observation n’est pas une étiquette : elle enrichit l’historique pour mieux comprendre l’évolution de l’élève.</p>
      </div>
    </div>
  </div>
);

const ParentChatbot = () => {
  const [activeScenario, setActiveScenario] = useState('progress');
  const scenario = chatScenarios[activeScenario];

  return (
    <div className="relative overflow-hidden rounded-[2.4rem] bg-[#173A59] px-5 py-10 text-white shadow-[0_32px_90px_rgba(23,58,89,0.22)] sm:px-10 sm:py-14 lg:px-16">
      <div className="pointer-events-none absolute inset-0 landing-dark-grid opacity-40" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#2A9D8F]/30 blur-3xl" />
      <div className="relative grid items-center gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:gap-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#BDE8E2] ring-1 ring-white/10">
            <Bot className="h-4 w-4" />
            Assistant parent Boussoule
          </span>
          <h3 className="mt-5 text-3xl font-black leading-tight tracking-[-0.035em] sm:text-4xl">Le parent pose sa question. Le téléphone lui répond clairement.</h3>
          <p className="mt-5 text-base font-medium leading-7 text-white/60 sm:text-lg">Devoirs, présence ou accompagnement personnalisé : le chatbot retrouve l’information autorisée et répond dans un langage simple, en français ou en arabe.</p>

          <p className="mt-7 text-xs font-extrabold uppercase tracking-[0.16em] text-white/40">Essayez une question</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {Object.entries(chatScenarios).map(([key, item]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveScenario(key)}
                aria-pressed={activeScenario === key}
                className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${activeScenario === key ? 'bg-[#E8B447] text-[#173A59] shadow-lg' : 'bg-white/10 text-white/70 ring-1 ring-white/10 hover:bg-white/20 hover:text-white'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-7 space-y-3 text-sm font-bold text-white/70">
            <p className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#72D8CC]" /> Chaque parent ne voit que ses enfants.</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[#72D8CC]" /> L’école choisit les informations accessibles.</p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[390px] rounded-[2.6rem] border-[7px] border-[#0B2437] bg-[#0B2437] p-1.5 shadow-[0_35px_90px_rgba(0,0,0,0.35)]">
          <div className="overflow-hidden rounded-[2rem] bg-[#EFE8DC]">
            <div className="relative bg-[#0E4B45] px-4 pb-3 pt-7 text-white">
              <div className="absolute left-1/2 top-2 h-4 w-24 -translate-x-1/2 rounded-full bg-[#0B2437]" />
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#2A9D8F] text-sm font-black">B</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">Boussoule · École Al Manar</p>
                  <p className="text-[10px] font-semibold text-white/60">Assistant parent · disponible</p>
                </div>
                <MessageCircle className="h-5 w-5 text-white/70" />
              </div>
            </div>

            <div className="min-h-[340px] bg-[radial-gradient(circle_at_10%_20%,rgba(42,157,143,0.08),transparent_40%),radial-gradient(circle_at_90%_70%,rgba(232,180,71,0.08),transparent_35%)] p-3.5">
              <div className="mx-auto mb-4 w-fit rounded-full bg-white/80 px-3 py-1 text-[9px] font-bold text-[#173A59]/40 shadow-sm">Aujourd’hui</div>
              <AnimatePresence mode="wait">
                <Motion.div key={activeScenario} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }} className="space-y-3">
                  <div className="ml-auto max-w-[86%] rounded-2xl rounded-tr-sm bg-[#D7F6E8] p-3 text-[12px] font-semibold leading-5 text-[#173A59] shadow-sm">
                    {scenario.question}
                    <div className="mt-1 flex justify-end gap-0.5 text-[9px] text-[#2A9D8F]"><Check className="h-3 w-3" /><Check className="-ml-1.5 h-3 w-3" /></div>
                  </div>
                  <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white p-3 text-[12px] font-semibold leading-5 text-[#173A59] shadow-sm">
                    <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#2A9D8F]"><Sparkles className="h-3 w-3" /> Boussoule répond</span>
                    {scenario.answer}
                    <p className="mt-2 border-t border-[#173A59]/10 pt-2 text-[9px] font-bold leading-4 text-[#173A59]/40">{scenario.detail}</p>
                  </div>
                </Motion.div>
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 border-t border-[#173A59]/10 bg-[#F7F4EE] p-3">
              <div className="flex-1 rounded-full bg-white px-4 py-2.5 text-[10px] font-semibold text-[#173A59]/30 shadow-sm">Posez votre question…</div>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#2A9D8F] text-white"><Send className="h-4 w-4" /></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StudentJourney = () => {
  const [activeStage, setActiveStage] = useState('maternelle');
  const stage = stageData[activeStage];

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[0.94fr_1.06fr] lg:gap-14">
      <div className="relative">
        <div className="overflow-hidden rounded-[2rem] bg-white p-2 shadow-[0_28px_75px_rgba(23,58,89,0.15)] ring-1 ring-[#173A59]/10">
          <img src="/images/landing-v2/student-growth-compass.webp" alt="Parcours personnel d’un élève de la maternelle au baccalauréat guidé par une boussole" className="aspect-[1.5/1] w-full rounded-[1.55rem] object-cover" loading="lazy" />
        </div>
        <div className="absolute -bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl bg-[#173A59] p-4 text-white shadow-2xl sm:left-8 sm:right-auto sm:min-w-[285px]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">Mémoire du parcours</p>
            <p className="mt-1 text-sm font-black">De la maternelle au bac</p>
          </div>
          <ArrowUpRight className="h-5 w-5 text-[#E8B447]" />
        </div>
      </div>

      <div>
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#E66F51]">
          <BrainCircuit className="h-4 w-4" />
          Dossier élève 360°
        </span>
        <h3 className="mt-4 text-3xl font-black leading-tight tracking-[-0.035em] text-[#173A59] sm:text-4xl">Chaque année ajoute une pièce à son histoire, jamais une nouvelle page blanche.</h3>
        <p className="mt-5 text-base font-medium leading-7 text-[#173A59]/60 sm:text-lg">Résultats, diagnostics, assiduité et observations construisent une lecture continue de ses performances, de ses qualités et de ses points à renforcer.</p>

        <div className="mt-7 rounded-[1.7rem] bg-white p-4 shadow-[0_18px_50px_rgba(23,58,89,0.1)] ring-1 ring-[#173A59]/10 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#2A9D8F]">Exemple de dossier</p>
              <p className="mt-1 text-lg font-black text-[#173A59]">Lina El Amrani</p>
            </div>
            <span className="rounded-full bg-[#2A9D8F]/10 px-3 py-1.5 text-[10px] font-extrabold text-[#207F74]">Parcours continu</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(stageData).map(([key, item]) => (
              <button key={key} type="button" onClick={() => setActiveStage(key)} aria-pressed={activeStage === key} className={`rounded-xl px-2.5 py-2.5 text-xs font-extrabold transition ${activeStage === key ? 'bg-[#173A59] text-white shadow-lg' : 'bg-[#FFF7E9] text-[#173A59]/50 hover:text-[#173A59]'}`}>
                {item.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <Motion.div key={activeStage} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="mt-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#173A59]/40">{stage.years}</p>
                  <p className="mt-1 text-sm font-black text-[#173A59]">{stage.trend}</p>
                </div>
                <p className="text-2xl font-black text-[#2A9D8F]">{stage.progress}%</p>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#173A59]/10">
                <Motion.div initial={{ width: 0 }} animate={{ width: `${stage.progress}%` }} transition={{ duration: 0.55 }} className="h-full rounded-full bg-gradient-to-r from-[#E8B447] via-[#2A9D8F] to-[#173A59]" />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#2A9D8F]/10 p-3.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#207F74]">Qualités observées</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {stage.qualities.map((quality) => <span key={quality} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold text-[#173A59] shadow-sm">{quality}</span>)}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#E66F51]/10 p-3.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.13em] text-[#B84D36]">Point à renforcer</p>
                  <p className="mt-2 text-xs font-extrabold leading-5 text-[#173A59]">{stage.focus}</p>
                </div>
              </div>
              <p className="mt-3 rounded-xl bg-[#FFF7E9] p-3 text-xs font-bold leading-5 text-[#173A59]/60">« {stage.observation} »</p>
            </Motion.div>
          </AnimatePresence>

          <div className="mt-4 flex items-center gap-3 border-t border-[#173A59]/10 pt-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#E8B447]/20 text-[#A77410]"><BarChart3 className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-black text-[#173A59]">Synthèse et rapport pédagogique assistés par IA</p><p className="mt-0.5 text-[10px] font-semibold text-[#173A59]/40">Générés à la demande, puis vérifiés par l’équipe.</p></div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#173A59]/30" />
          </div>
        </div>
      </div>
    </div>
  );
};

const HumanFollowupShowcase = () => (
  <section id="followup" className="relative scroll-mt-20 overflow-hidden bg-[#FFF7E9] py-24 sm:py-32">
    <div className="pointer-events-none absolute inset-0 landing-compass-grid opacity-40" />
    <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#2A9D8F]/10 px-4 py-2 text-sm font-extrabold text-[#207F74]">
          <Sparkles className="h-4 w-4" />
          Le suivi humain, rendu visible
        </div>
        <h2 className="mt-5 text-3xl font-black tracking-[-0.035em] text-[#173A59] sm:text-5xl">On ne suit pas des cases. On accompagne des parcours.</h2>
        <p className="mt-5 text-lg font-medium leading-8 text-[#173A59]/60">Boussoule relie ce qui se passe en classe, les questions de la famille et l’évolution personnelle de chaque élève.</p>
      </div>

      <div className="mt-16">
        <ClassroomFollowup />
      </div>
      <div className="mt-24 sm:mt-32">
        <ParentChatbot />
      </div>
      <div className="mt-24 sm:mt-32">
        <StudentJourney />
      </div>
    </div>
  </section>
);

export default HumanFollowupShowcase;
