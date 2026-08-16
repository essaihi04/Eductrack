import {
  LayoutDashboard, Users, UserCircle, TrendingUp, GraduationCap, BookOpen,
  Users2, FileText, ClipboardList, Calendar, ShieldCheck, BarChart3,
  Wallet, Bus, MapPin, Sparkles, Image as ImageIcon, Search, BarChart2,
  AlertTriangle, Settings, UserCog, MessageSquare, UserCheck, Bot, UserX,
  Send, Inbox, Smartphone, Building2, CalendarClock, Shuffle, ListChecks, Shield,
} from 'lucide-react';

// Source de navigation admin unique — utilisée par la Sidebar (domaines de
// 1er niveau) ET par DomainTabs (onglets affichés en haut du contenu).
// Modèle calqué sur financeNav.js : on déclare la structure une seule fois.
//
// Hiérarchie : DOMAINE → GROUPE(S) → ITEM(S).
//  - La barre latérale n'affiche que les DOMAINES (6 entrées max).
//  - Cliquer un domaine ouvre ses onglets dans la zone de contenu (hors barre).
//  - Un domaine à un seul groupe n'affiche que la rangée d'items.
//
// Chaque item/domaine porte la liste des rôles autorisés à le voir. Un domaine
// est masqué s'il ne reste aucun item visible pour le rôle courant.

// Groupes de rôles
const FULL = ['admin', 'school_admin'];                              // admins complets
const NON_MANAGER = ['admin', 'school_admin', 'pedagogical_director']; // tout sauf resp. pédagogique
const ALL_ADMIN = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'];
const PEDAGO = ['pedagogical_director', 'pedagogical_manager'];       // direction pédagogique seule

// Domaines pilotés par DomainTabs (Finance est géré à part via FinanceShell).
export const ADMIN_DOMAINS = [
  {
    key: 'pedagogie',
    label: 'Pédagogie',
    icon: GraduationCap,
    roles: ALL_ADMIN,
    groups: [
      {
        key: 'classes',
        label: 'Classes',
        items: [
          { label: 'Classes', path: '/classes', icon: GraduationCap, roles: ALL_ADMIN },
          { label: 'Répartition', path: '/admin/class-assignment', icon: Shuffle, roles: ALL_ADMIN },
          { label: 'Suivi de séance', path: '/teacher/rapide', icon: Calendar, roles: PEDAGO },
          { label: 'Dashboard classes', path: '/teacher/dashboard', icon: BarChart3, roles: PEDAGO },
        ],
      },
      {
        key: 'eleves',
        label: 'Élèves',
        items: [
          { label: 'Tous les élèves', path: '/students', icon: Users, roles: ALL_ADMIN },
          { label: 'Absences', path: '/absences', icon: UserX, roles: ALL_ADMIN },
          { label: 'Comportement', path: '/behavior', icon: BarChart3, roles: ALL_ADMIN },
          { label: 'Parents', path: '/parents', icon: Users2, roles: ALL_ADMIN },
          { label: 'Réinscription', path: '/admin/reinscription', icon: UserCheck, roles: NON_MANAGER },
        ],
      },
      {
        key: 'equipe',
        label: 'Équipe',
        items: [
          { label: 'Professeurs', path: '/teachers', icon: UserCircle, roles: ALL_ADMIN },
          { label: 'Suivi des profs', path: '/teacher-tracking', icon: TrendingUp, roles: ALL_ADMIN },
        ],
      },
      {
        key: 'evaluation',
        label: 'Évaluations',
        items: [
          { label: 'Saisie des notes', path: '/admin/notes-saisie', icon: ClipboardList, roles: ALL_ADMIN },
          { label: 'Récap par contrôle', path: '/admin/notes-recap', icon: ListChecks, roles: ALL_ADMIN },
          { label: 'Bulletins', path: '/admin/bulletins', icon: FileText, roles: ALL_ADMIN },
          { label: "Notes d'examens", path: '/admin/exam-notes', icon: GraduationCap, roles: ALL_ADMIN },
          { label: 'Notes des profs', path: '/admin/class-notes', icon: ClipboardList, roles: ALL_ADMIN },
          { label: 'Cahier de texte', path: '/cahier-de-texte', icon: FileText, roles: ALL_ADMIN },
          { label: 'Devoirs', path: '/teacher/devoirs', icon: FileText, roles: PEDAGO },
        ],
      },
      {
        key: 'organisation',
        label: 'Organisation',
        items: [
          { label: 'Matières', path: '/subjects', icon: BookOpen, roles: ALL_ADMIN },
          { label: 'Coefficients', path: '/admin/coefficients', icon: BookOpen, roles: ALL_ADMIN },
          { label: 'Approbations', path: '/approvals', icon: ShieldCheck, roles: ALL_ADMIN },
          { label: 'Config. année', path: '/admin/school-year-config', icon: Calendar, roles: ALL_ADMIN },
        ],
      },
    ],
  },
  {
    // Hub communication unifié : envoi aux parents par app (push) et/ou
    // WhatsApp, suivi de lecture/réponse et dashboard d'engagement.
    key: 'communication',
    label: 'Communication',
    icon: MessageSquare,
    roles: ALL_ADMIN,
    groups: [
      {
        key: 'envoyer',
        label: 'Envoyer',
        items: [
          { label: 'Parents', path: '/communication/send', icon: Send, roles: ALL_ADMIN },
          { label: 'Professeurs', path: '/communication/teachers', icon: UserCircle, roles: ALL_ADMIN },
          { label: 'Planifier', path: '/communication/planning', icon: Calendar, roles: ALL_ADMIN },
        ],
      },
      {
        key: 'suivi',
        label: 'Suivi & engagement',
        items: [
          { label: 'Dashboard parents', path: '/communication/dashboard', icon: BarChart3, roles: ALL_ADMIN },
          { label: 'Boîte de réception', path: '/communication/inbox', icon: Inbox, roles: ALL_ADMIN },
          { label: 'Rendez-vous parents', path: '/appointments', icon: CalendarClock, roles: ALL_ADMIN },
        ],
      },
      {
        key: 'canaux',
        label: 'Automatisation & canaux',
        items: [
          { label: 'Rapports IA', path: '/communication/reports', icon: Bot, roles: ALL_ADMIN },
          { label: 'Documents chatbot', path: '/communication/documents', icon: BookOpen, roles: ALL_ADMIN },
          { label: 'Accès chatbot', path: '/communication/access', icon: Shield, roles: ALL_ADMIN },
          { label: 'Vitrine école', path: '/communication/ecole', icon: Building2, roles: ALL_ADMIN },
          { label: 'Connexion WhatsApp', path: '/communication/connection', icon: Smartphone, roles: ALL_ADMIN },
        ],
      },
    ],
  },
  {
    key: 'transport',
    label: 'Transport',
    icon: Bus,
    roles: NON_MANAGER,
    groups: [
      {
        key: 'transport',
        label: 'Transport',
        items: [
          { label: 'Tableau', path: '/transport', end: true, icon: LayoutDashboard, roles: NON_MANAGER },
          { label: 'Suivi en direct', path: '/transport/live', icon: MapPin, roles: NON_MANAGER },
          { label: 'Bus & élèves', path: '/transport/buses', icon: Bus, roles: NON_MANAGER },
          { label: 'Chauffeurs', path: '/transport/drivers', icon: UserCircle, roles: NON_MANAGER },
        ],
      },
    ],
  },
  {
    key: 'vie-scolaire',
    label: 'Vie scolaire',
    icon: Sparkles,
    roles: ALL_ADMIN,
    groups: [
      {
        key: 'vie-scolaire',
        label: 'Vie scolaire',
        items: [
          { label: 'Parascolaire', path: '/school-life/parascolaire', icon: Sparkles, roles: ALL_ADMIN },
          { label: 'Cahier de vie', path: '/school-life/cahier-de-vie', icon: ImageIcon, roles: ALL_ADMIN },
          { label: 'Objets perdus', path: '/school-life/objets-perdus', icon: Search, roles: ALL_ADMIN },
          { label: 'Sondages', path: '/school-life/sondages', icon: BarChart2, roles: ALL_ADMIN },
          { label: 'Signalements', path: '/school-life/signalements', icon: AlertTriangle, roles: ALL_ADMIN },
        ],
      },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    icon: Settings,
    roles: ALL_ADMIN,
    groups: [
      {
        key: 'equipe',
        label: 'Équipe & outils',
        items: [
          { label: 'Resp. financiers', path: '/admin/finance-managers', icon: UserCog, roles: FULL },
          { label: 'Direct. pédagogiques', path: '/admin/pedagogical-directors', icon: UserCog, roles: FULL },
          { label: 'Resp. pédagogiques', path: '/admin/pedagogical-managers', icon: UserCog, roles: NON_MANAGER },
          { label: 'Resp. transport', path: '/transport/managers', icon: UserCog, roles: FULL },
          { label: 'Réceptionniste (chatbot)', path: '/admin/receptionists', icon: Bot, roles: FULL },
        ],
      },
    ],
  },
];

// --- Helpers ----------------------------------------------------------------

const itemVisible = (item, role) => !item.roles || item.roles.includes(role);

// Items visibles d'un groupe pour un rôle donné.
export function visibleItems(group, role) {
  return group.items.filter((it) => itemVisible(it, role));
}

// Groupes (avec leurs items filtrés) visibles d'un domaine pour un rôle.
export function visibleGroups(domain, role) {
  return domain.groups
    .map((g) => ({ ...g, items: visibleItems(g, role) }))
    .filter((g) => g.items.length > 0);
}

// Un domaine est visible s'il reste au moins un item accessible au rôle.
export function domainVisible(domain, role) {
  if (domain.roles && !domain.roles.includes(role)) return false;
  return visibleGroups(domain, role).length > 0;
}

// Chemin d'entrée d'un domaine = 1er item visible pour le rôle.
export function domainEntryPath(domain, role) {
  const groups = visibleGroups(domain, role);
  return groups[0]?.items[0]?.path || '/dashboard';
}

const matchItem = (item, pathname) =>
  item.end ? pathname === item.path : pathname.startsWith(item.path);

// Domaine + groupe correspondant à un chemin (le match le plus spécifique gagne).
export function domainForPath(pathname, role) {
  let best = null;
  let bestLen = -1;
  for (const domain of ADMIN_DOMAINS) {
    if (domain.roles && !domain.roles.includes(role)) continue;
    for (const group of domain.groups) {
      for (const item of group.items) {
        if (!itemVisible(item, role)) continue;
        if (matchItem(item, pathname) && item.path.length > bestLen) {
          best = { domain, group };
          bestLen = item.path.length;
        }
      }
    }
  }
  return best;
}

// Entrées de la barre latérale pour le rôle (domaines + Finance ajouté à part).
export function adminSidebarDomains(role) {
  return ADMIN_DOMAINS
    .filter((d) => domainVisible(d, role))
    .map((d) => ({
      key: d.key,
      label: d.label,
      icon: d.icon,
      path: domainEntryPath(d, role),
    }));
}
