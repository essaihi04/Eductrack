import {
  Wallet, TrendingUp, TrendingDown, BookOpen,
  LayoutDashboard, LayoutGrid, BarChart3,
  Users, FileText, CreditCard, AlertCircle, Layers, Banknote,
  UserCog, Landmark, Scale,
  ListTree, CalendarRange, Building2,
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
      { label: 'Encaissement', path: '/finance/quick-collect', icon: Banknote },
      { label: 'Élèves', path: '/finance/students', icon: Users },
      { label: 'Factures', path: '/finance/invoices', icon: FileText },
      { label: 'Paiements', path: '/finance/payments', icon: CreditCard },
      { label: 'Retards', path: '/finance/overdue', icon: AlertCircle },
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
    key: 'comptabilite',
    label: 'Comptabilité',
    icon: BookOpen,
    color: 'purple',
    tabs: [
      { label: 'Plan comptable', path: '/finance/chart', icon: ListTree },
      { label: 'Budget', path: '/finance/budget', icon: CalendarRange },
      { label: 'Relevés bancaires', path: '/finance/bank', icon: Building2 },
    ],
  },
];

// Couleurs des pôles (classes Tailwind statiques pour rester compatibles avec le purge).
export const POLE_COLORS = {
  blue: { active: 'bg-blue-600 text-white', soft: 'bg-blue-50 text-blue-700', tab: 'border-blue-600 text-blue-700' },
  green: { active: 'bg-green-600 text-white', soft: 'bg-green-50 text-green-700', tab: 'border-green-600 text-green-700' },
  red: { active: 'bg-red-600 text-white', soft: 'bg-red-50 text-red-700', tab: 'border-red-600 text-red-700' },
  purple: { active: 'bg-purple-600 text-white', soft: 'bg-purple-50 text-purple-700', tab: 'border-purple-600 text-purple-700' },
};

// Pôle correspondant à un chemin (le plus spécifique gagne).
export function poleForPath(pathname) {
  let best = null;
  let bestLen = -1;
  for (const pole of FINANCE_POLES) {
    for (const tab of pole.tabs) {
      const match = tab.end ? pathname === tab.path : pathname.startsWith(tab.path);
      if (match && tab.path.length > bestLen) {
        best = pole;
        bestLen = tab.path.length;
      }
    }
  }
  return best || FINANCE_POLES[0];
}

// Entrées de pôle pour la barre latérale (lien = premier onglet).
export const FINANCE_SIDEBAR_POLES = FINANCE_POLES.map((p) => ({
  key: p.key,
  label: p.label,
  icon: p.icon,
  path: p.tabs[0].path,
  paths: p.tabs.map((t) => t.path),
}));
