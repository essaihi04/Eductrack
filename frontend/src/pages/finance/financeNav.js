import {
  Wallet, TrendingUp, TrendingDown, BookOpen,
  LayoutDashboard, LayoutGrid, BarChart3,
  Users, FileText, CreditCard, AlertCircle, Layers, Banknote,
  UserCog, Landmark, Scale,
  ListTree, CalendarRange, Building2,
  UserPlus, UserCheck,
} from 'lucide-react';

// Source de navigation finance unique — utilisée par la Sidebar ET le FinanceShell.
// 4 pôles, chacun avec ses onglets. Le premier onglet est la cible du lien du pôle
// dans la barre latérale ; `end` indique une correspondance exacte de chemin (index).

export const FINANCE_POLES = [
  {
    key: 'pilotage',
    label: 'Pilotage',
    icon: Wallet,
    color: 'blue',
    tabs: [
      { label: "Vue d'ensemble", path: '/finance', end: true, icon: LayoutDashboard },
      { label: 'Prévisionnel / Réel', path: '/finance/previsionnel', icon: LayoutGrid },
      { label: 'Rapports', path: '/finance/reports', icon: BarChart3 },
    ],
  },
  {
    key: 'recettes',
    label: 'Recettes & recouvrement',
    icon: TrendingUp,
    color: 'green',
    tabs: [
      {
        label: 'Élèves', path: '/finance/students', icon: Users,
        // Onglet "Élèves" : regroupe le suivi par élève et son recouvrement.
        subTabs: [
          { label: 'Liste élèves', path: '/finance/students', end: true, icon: Users },
          { label: 'Factures', path: '/finance/invoices', icon: FileText },
          { label: 'Paiements', path: '/finance/payments', icon: CreditCard },
          { label: 'Retards', path: '/finance/overdue', icon: AlertCircle },
        ],
      },
      { label: 'Modèles de frais', path: '/finance/fee-templates', icon: Layers },
      { label: 'Caisse', path: '/finance/cash-register', icon: Banknote },
    ],
  },
  {
    key: 'depenses',
    label: 'Dépenses & charges',
    icon: TrendingDown,
    color: 'red',
    tabs: [
      { label: 'Dépenses', path: '/finance/expenses', icon: TrendingDown },
      { label: 'Paie', path: '/finance/payroll', icon: UserCog },
      { label: 'Prêts & leasing', path: '/finance/loans', icon: Landmark },
      { label: 'Impôts & taxes', path: '/finance/taxes', icon: Scale },
    ],
  },
  {
    key: 'inscriptions',
    label: 'Inscriptions',
    icon: UserPlus,
    color: 'amber',
    tabs: [
      { label: 'Tableau de bord', path: '/finance/inscriptions', end: true, icon: LayoutDashboard },
      // L'onglet « Élèves » a fusionné avec Recettes → Élèves (/finance/students) :
      // une seule page multifonctionnelle (encaissement, plan de frais, fiche,
      // nouvel élève, réinscription…).
      { label: 'Réinscription', path: '/finance/inscriptions/reinscription', icon: UserCheck },
    ],
  },
  {
    key: 'comptabilite',
    label: 'Comptabilité',
    icon: BookOpen,
    color: 'purple',
    tabs: [
      { label: 'Relevés bancaires', path: '/finance/bank', icon: Building2 },
      { label: 'Plan comptable', path: '/finance/chart', icon: ListTree },
      { label: 'Budget', path: '/finance/budget', icon: CalendarRange },
    ],
  },
];

// Couleurs des pôles (classes Tailwind statiques pour rester compatibles avec le purge).
export const POLE_COLORS = {
  blue: { active: 'bg-blue-600 text-white', soft: 'bg-blue-50 text-blue-700', tab: 'border-blue-600 text-blue-700' },
  green: { active: 'bg-green-600 text-white', soft: 'bg-green-50 text-green-700', tab: 'border-green-600 text-green-700' },
  red: { active: 'bg-red-600 text-white', soft: 'bg-red-50 text-red-700', tab: 'border-red-600 text-red-700' },
  amber: { active: 'bg-amber-600 text-white', soft: 'bg-amber-50 text-amber-700', tab: 'border-amber-600 text-amber-700' },
  purple: { active: 'bg-purple-600 text-white', soft: 'bg-purple-50 text-purple-700', tab: 'border-purple-600 text-purple-700' },
};

// Feuilles d'un onglet : ses sous-onglets s'il en a, sinon lui-même.
const leavesOf = (tab) => (tab.subTabs && tab.subTabs.length ? tab.subTabs : [tab]);
// Tous les chemins (feuilles) d'un pôle, sous-onglets compris.
const leafPaths = (pole) => pole.tabs.flatMap((t) => leavesOf(t).map((l) => l.path));

// Pôle correspondant à un chemin (le plus spécifique gagne).
export function poleForPath(pathname) {
  let best = null;
  let bestLen = -1;
  for (const pole of FINANCE_POLES) {
    for (const tab of pole.tabs) {
      for (const leaf of leavesOf(tab)) {
        const match = leaf.end ? pathname === leaf.path : pathname.startsWith(leaf.path);
        if (match && leaf.path.length > bestLen) {
          best = pole;
          bestLen = leaf.path.length;
        }
      }
    }
  }
  return best || FINANCE_POLES[0];
}

// Onglet (niveau 2) correspondant à un chemin, sous-onglets compris.
export function tabForPath(pole, pathname) {
  let best = null;
  let bestLen = -1;
  for (const tab of pole.tabs) {
    for (const leaf of leavesOf(tab)) {
      const match = leaf.end ? pathname === leaf.path : pathname.startsWith(leaf.path);
      if (match && leaf.path.length > bestLen) {
        best = tab;
        bestLen = leaf.path.length;
      }
    }
  }
  return best || pole.tabs[0];
}

// Entrées de pôle pour la barre latérale (lien = premier onglet).
export const FINANCE_SIDEBAR_POLES = FINANCE_POLES.map((p) => ({
  key: p.key,
  label: p.label,
  icon: p.icon,
  path: p.tabs[0].path,
  paths: leafPaths(p),
}));
