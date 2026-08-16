import { createElement, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
  BellRing,
  BookOpenCheck,
  Bus,
  Check,
  Clock3,
  FileScan,
  LayoutDashboard,
  MessageCircle,
  ScanLine,
  Sparkles,
  UploadCloud,
  UserCheck,
  Users,
  WalletCards,
} from 'lucide-react';

const moments = [
  {
    id: 'import',
    time: '07:30',
    role: 'Direction',
    title: 'L’emploi du temps prend forme',
    description: 'Un PDF de plusieurs pages est analysé, normalisé et prêt à vérifier avant publication.',
    icon: FileScan,
    color: '#E66F51',
  },
  {
    id: 'class',
    time: '08:05',
    role: 'Professeur',
    title: 'La séance démarre en 30 secondes',
    description: 'Présences, cahiers, participation et comportement sont saisis depuis la même vue.',
    icon: UserCheck,
    color: '#2A9D8F',
  },
  {
    id: 'direction',
    time: '12:15',
    role: 'École',
    title: 'La direction garde le cap',
    description: 'Pédagogie, finance, transport et alertes prioritaires apparaissent dans un tableau clair.',
    icon: LayoutDashboard,
    color: '#173A59',
  },
  {
    id: 'family',
    time: '16:20',
    role: 'Parent & élève',
    title: 'La famille sait quoi faire ensuite',
    description: 'Arrivée du bus, devoirs et progrès de l’élève sont réunis dans des messages utiles.',
    icon: MessageCircle,
    color: '#E8B447',
  },
];

const BrowserChrome = ({ label, children }) => (
  <div className="overflow-hidden rounded-[1.6rem] border border-[#173A59]/10 bg-white shadow-[0_24px_70px_rgba(23,58,89,0.14)]">
    <div className="flex items-center gap-3 border-b border-[#173A59]/10 bg-[#FFF9EF] px-4 py-3">
      <div className="flex gap-1.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#E66F51]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#E8B447]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#2A9D8F]" />
      </div>
      <div className="mx-auto flex min-w-0 max-w-sm flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-[#173A59]/60 ring-1 ring-[#173A59]/10">
        <span className="h-2 w-2 rounded-full bg-[#2A9D8F]" />
        <span className="truncate">{label}</span>
      </div>
    </div>
    {children}
  </div>
);

const ImportSimulation = () => (
  <BrowserChrome label="Bousole · Import emploi du temps">
    <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[0.72fr_1.28fr]">
      <div className="rounded-2xl border-2 border-dashed border-[#E66F51]/25 bg-[#E66F51]/5 p-4">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#E66F51] shadow-sm">
          <UploadCloud className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm font-black text-[#173A59]">emploi-du-temps.pdf</p>
        <p className="mt-1 text-xs font-semibold text-[#173A59]/50">8 pages · 24 classes détectées</p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white">
          <Motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: 1.1 }}
            className="h-full rounded-full bg-gradient-to-r from-[#E66F51] to-[#E8B447]"
          />
        </div>
        <div className="mt-4 space-y-2 text-xs font-bold">
          <p className="flex items-center gap-2 text-[#2A9D8F]"><Check className="h-3.5 w-3.5" /> Grilles reconnues</p>
          <p className="flex items-center gap-2 text-[#2A9D8F]"><Check className="h-3.5 w-3.5" /> Matières normalisées</p>
          <p className="flex items-center gap-2 text-[#2A9D8F]"><Check className="h-3.5 w-3.5" /> Conflits signalés</p>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl bg-[#173A59] p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Aperçu intelligent</p>
            <p className="mt-1 text-sm font-black">Classe 3A · semaine type</p>
          </div>
          <span className="rounded-full bg-[#2A9D8F]/20 px-2.5 py-1 text-[10px] font-extrabold text-[#72D8CC]">Prêt à vérifier</span>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-1.5 text-[9px] font-bold text-[#173A59]">
          {Array.from({ length: 20 }, (_, index) => {
            const colors = ['bg-[#FFF7E9]', 'bg-[#FFD8CE]', 'bg-[#BDE8E2]', 'bg-[#F9DA8B]'];
            return (
              <Motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.025 }}
                className={`h-9 rounded-md ${colors[index % colors.length]}`}
              />
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-white/10 px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-bold text-white/60"><ScanLine className="h-4 w-4 text-[#E8B447]" /> Vérification humaine avant publication</span>
          <span className="text-xs font-black text-[#72D8CC]">0 bloc perdu</span>
        </div>
      </div>
    </div>
  </BrowserChrome>
);

const ClassSimulation = () => {
  const students = [
    ['Sara El Amrani', 'Présente', 'Participe'],
    ['Yassine Naji', 'Présent', 'Cahier vérifié'],
    ['Lina Tazi', 'Absente', 'Parent informé'],
  ];

  return (
    <BrowserChrome label="Bousole · Suivi rapide · 3A">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#2A9D8F]">Mathématiques · séance 1</p>
            <h3 className="mt-1 text-xl font-black text-[#173A59]">Bonjour 3A 👋</h3>
          </div>
          <div className="flex gap-2">
            <span className="rounded-xl bg-[#2A9D8F]/10 px-3 py-2 text-xs font-black text-[#207F74]">27 présents</span>
            <span className="rounded-xl bg-[#E66F51]/10 px-3 py-2 text-xs font-black text-[#B84D36]">1 absence</span>
          </div>
        </div>
        <div className="mt-5 space-y-2.5">
          {students.map(([name, status, detail], index) => (
            <Motion.div
              key={name}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3 rounded-2xl border border-[#173A59]/10 bg-[#FFFDF8] p-3"
            >
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black ${index === 2 ? 'bg-[#E66F51]/10 text-[#E66F51]' : 'bg-[#2A9D8F]/10 text-[#2A9D8F]'}`}>
                {name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-[#173A59]">{name}</p>
                <p className="text-xs font-semibold text-[#173A59]/50">{detail}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${index === 2 ? 'bg-[#E66F51]/10 text-[#B84D36]' : 'bg-[#2A9D8F]/10 text-[#207F74]'}`}>{status}</span>
            </Motion.div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#173A59] p-3.5 text-white shadow-lg">
          <BellRing className="h-5 w-5 shrink-0 text-[#E8B447]" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black">Absence transmise au parent</p>
            <p className="mt-0.5 text-[10px] font-semibold text-white/60">WhatsApp + portail parent · à l’instant</p>
          </div>
          <Check className="h-4 w-4 text-[#72D8CC]" />
        </div>
      </div>
    </BrowserChrome>
  );
};

const DirectionSimulation = () => {
  const metrics = [
    { label: 'Présence', value: '96%', icon: UserCheck, color: '#2A9D8F' },
    { label: 'Bus actifs', value: '4/4', icon: Bus, color: '#E8B447' },
    { label: 'Encaissements', value: 'À jour', icon: WalletCards, color: '#E66F51' },
  ];

  return (
    <BrowserChrome label="Bousole · Tableau de bord direction">
      <div className="p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map(({ label, value, icon: Icon, color }, index) => (
            <Motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="rounded-2xl border border-[#173A59]/10 bg-[#FFFDF8] p-4">
              <div className="flex items-center justify-between">
                {createElement(Icon, { className: 'h-5 w-5', style: { color } })}
                <span className="h-2 w-2 rounded-full bg-[#2A9D8F]" />
              </div>
              <p className="mt-4 text-2xl font-black text-[#173A59]">{value}</p>
              <p className="mt-0.5 text-xs font-bold text-[#173A59]/50">{label}</p>
            </Motion.div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl bg-[#173A59] p-4 text-white">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black">Cap de la semaine</p>
              <span className="text-[10px] font-bold text-white/40">Mise à jour en direct</span>
            </div>
            <div className="mt-4 flex h-28 items-end gap-2">
              {[48, 67, 55, 82, 73, 91, 86].map((height, index) => (
                <Motion.div key={index} initial={{ height: 0 }} animate={{ height: `${height}%` }} transition={{ delay: index * 0.06 }} className="flex-1 rounded-t-lg bg-gradient-to-t from-[#2A9D8F] to-[#72D8CC]" />
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            {[
              ['3 dossiers à vérifier', Users, '#E66F51'],
              ['Bulletins prêts', BookOpenCheck, '#2A9D8F'],
              ['Tournées à l’heure', Bus, '#E8B447'],
            ].map(([label, Icon, color]) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-[#173A59]/10 bg-white p-3">
                {createElement(Icon, { className: 'h-4 w-4', style: { color } })}
                <span className="text-xs font-extrabold text-[#173A59]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BrowserChrome>
  );
};

const FamilySimulation = () => (
  <BrowserChrome label="Bousole · Famille El Amrani">
    <div className="grid gap-4 bg-[#F8F1E5] p-4 sm:p-6 md:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-[1.6rem] bg-[#0E3D37] p-3 text-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-1 pb-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#2A9D8F] text-xs font-black">B</div>
          <div>
            <p className="text-xs font-black">École Al Manar</p>
            <p className="text-[10px] text-white/60">Informations utiles</p>
          </div>
        </div>
        <div className="mt-3 space-y-2.5 text-[11px] font-semibold leading-relaxed text-[#173A59]">
          <div className="ml-5 rounded-xl rounded-tr-sm bg-[#D8F5E8] p-3">🚌 Le bus arrive dans environ 6 minutes.</div>
          <div className="ml-2 rounded-xl rounded-tr-sm bg-[#D8F5E8] p-3">📘 Devoir de sciences à rendre vendredi.</div>
          <div className="ml-8 rounded-xl rounded-tr-sm bg-[#D8F5E8] p-3">⭐ Une nouvelle réussite a été ajoutée au parcours de Lina.</div>
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#173A59]/10">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#2A9D8F]">Aujourd’hui</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#E8B447]/20 text-sm font-black text-[#A77410]">LE</div>
            <div>
              <p className="font-black text-[#173A59]">Lina El Amrani</p>
              <p className="text-xs font-semibold text-[#173A59]/50">Collège · 3A</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#2A9D8F]/10 p-3"><p className="text-lg font-black text-[#2A9D8F]">3</p><p className="text-[10px] font-bold text-[#173A59]/50">devoirs suivis</p></div>
            <div className="rounded-xl bg-[#E8B447]/10 p-3"><p className="text-lg font-black text-[#A77410]">+1</p><p className="text-[10px] font-bold text-[#173A59]/50">nouveau badge</p></div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-[#173A59]/10">
          <Clock3 className="h-5 w-5 text-[#E66F51]" />
          <div><p className="text-xs font-black text-[#173A59]">Prochain repère : mathématiques</p><p className="text-[10px] font-semibold text-[#173A59]/40">Demain · 08:00</p></div>
        </div>
      </div>
    </div>
  </BrowserChrome>
);

const Simulation = ({ id }) => {
  if (id === 'import') return <ImportSimulation />;
  if (id === 'class') return <ClassSimulation />;
  if (id === 'direction') return <DirectionSimulation />;
  return <FamilySimulation />;
};

const SchoolDaySimulator = () => {
  const [activeId, setActiveId] = useState(moments[0].id);
  const active = moments.find((moment) => moment.id === activeId) || moments[0];

  return (
    <section id="experience" className="relative scroll-mt-20 overflow-hidden bg-white py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#FFF7E9] to-transparent" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#173A59]/5 px-4 py-2 text-sm font-extrabold text-[#173A59]">
            <Sparkles className="h-4 w-4 text-[#E66F51]" />
            Simulation interactive
          </div>
          <h2 className="mt-5 text-3xl font-black tracking-[-0.035em] text-[#173A59] sm:text-5xl">Une journée d’école, enfin fluide.</h2>
          <p className="mt-5 text-lg font-medium leading-8 text-[#173A59]/60">Choisissez un moment de la journée et découvrez ce que chaque utilisateur vit réellement dans Bousole.</p>
        </div>

        <div className="mt-14 grid items-start gap-8 lg:grid-cols-[0.38fr_0.62fr] lg:gap-12">
          <div className="relative space-y-3 lg:sticky lg:top-28">
            <div className="absolute bottom-6 left-[1.72rem] top-6 hidden w-px bg-[#173A59]/10 sm:block" />
            {moments.map((moment) => {
              const Icon = moment.icon;
              const selected = activeId === moment.id;
              return (
                <button
                  key={moment.id}
                  type="button"
                  onClick={() => setActiveId(moment.id)}
                  aria-pressed={selected}
                  className={`relative w-full rounded-2xl border p-4 text-left transition duration-300 sm:pl-[4.7rem] ${selected ? 'border-[#173A59]/10 bg-[#FFF9EF] shadow-[0_14px_35px_rgba(23,58,89,0.09)]' : 'border-transparent bg-transparent hover:border-[#173A59]/10 hover:bg-[#FFFDF8]'}`}
                >
                  <span className={`mb-3 inline-grid h-11 w-11 place-items-center rounded-xl sm:absolute sm:left-3 sm:top-4 sm:mb-0 ${selected ? 'bg-[#173A59] text-white shadow-lg' : 'bg-white text-[#173A59] ring-1 ring-[#173A59]/10'}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em]">
                    <span style={{ color: moment.color }}>{moment.time}</span>
                    <span className="text-[#173A59]/30">·</span>
                    <span className="text-[#173A59]/40">{moment.role}</span>
                  </div>
                  <p className="mt-1.5 text-base font-black text-[#173A59]">{moment.title}</p>
                  <p className={`mt-1.5 text-sm font-medium leading-6 text-[#173A59]/60 ${selected ? 'block' : 'hidden sm:block'}`}>{moment.description}</p>
                </button>
              );
            })}
          </div>

          <div className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#173A59]/40">Expérience en direct</p>
                <p className="mt-1 text-sm font-black text-[#173A59]">{active.role} · {active.time}</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#2A9D8F]/10 px-3 py-1.5 text-xs font-extrabold text-[#207F74]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#2A9D8F]" />
                Simulation
              </span>
            </div>
            <AnimatePresence mode="wait">
              <Motion.div key={activeId} initial={{ opacity: 0, y: 14, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
                <Simulation id={activeId} />
              </Motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SchoolDaySimulator;
