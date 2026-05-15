// Helpers pour catégoriser les messages WhatsApp (pédagogique, financier, transport, général)

const FINANCIAL_KEYWORDS = [
  'paiement', 'paie', 'payer', 'payé', 'paye',
  'facture', 'factures',
  'frais', 'mensualité', 'mensualites', 'mensualités',
  'scolarité', 'scolarite',
  'reçu', 'recu', 'recu de paiement',
  'impayé', 'impaye', 'impayés',
  'rappel', 'relance',
  'virement', 'espèces', 'especes', 'chèque', 'cheque',
  'دفع', 'فاتورة', 'مصاريف', 'رسوم', 'دين', 'سداد',
];

const TRANSPORT_KEYWORDS = [
  'bus', 'autobus',
  'transport', 'transports',
  'trajet', 'trajets',
  'chauffeur', 'driver',
  'ramassage', 'ramasser',
  'arrêt', 'arret', 'station',
  'horaire bus', 'retard bus',
  'حافلة', 'سائق', 'نقل', 'محطة',
];

function normalize(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Catégorise un message entrant selon son contenu.
// Retourne 'pedagogical' par défaut (cas le plus fréquent : questions sur élève).
export function categorizeIncoming(text) {
  const t = normalize(text);
  if (!t) return 'pedagogical';

  const hasAny = (list) => list.some((k) => t.includes(normalize(k)));

  if (hasAny(FINANCIAL_KEYWORDS)) return 'financial';
  if (hasAny(TRANSPORT_KEYWORDS)) return 'transport';
  return 'pedagogical';
}

// Catégorie par défaut pour les messages SORTANTS selon le rôle de l'expéditeur.
// Pour admin/school_admin → 'general' (peuvent surcharger via UI).
export function getCategoryForRole(role) {
  switch (role) {
    case 'pedagogical_manager':
    case 'pedagogical_director':
    case 'teacher':
      return 'pedagogical';
    case 'finance_manager':
      return 'financial';
    case 'transport_manager':
      return 'transport';
    default:
      return 'general';
  }
}

// Catégories autorisées pour chaque rôle (filtrage lecture).
// null = toutes catégories.
// Les managers ne voient PAS 'general' : seuls les admins voient les messages non catégorisés.
export function allowedCategoriesForRole(role) {
  switch (role) {
    case 'admin':
    case 'school_admin':
      return null;
    case 'pedagogical_manager':
    case 'pedagogical_director':
      return ['pedagogical'];
    case 'finance_manager':
      return ['financial'];
    case 'transport_manager':
      return ['transport'];
    default:
      return ['pedagogical'];
  }
}

// Indique si le rôle peut voir les rapports pédagogiques quotidiens
export function canSeePedagogicalReports(role) {
  return ['admin', 'school_admin', 'pedagogical_manager', 'pedagogical_director'].includes(role);
}

// Valide une catégorie soumise par l'utilisateur, sinon retourne celle par défaut du rôle.
export function resolveCategoryForSending(requestedCategory, role) {
  const valid = ['pedagogical', 'financial', 'transport', 'general'];
  // Admins peuvent choisir librement
  if (role === 'admin' || role === 'school_admin') {
    return valid.includes(requestedCategory) ? requestedCategory : 'general';
  }
  // Autres rôles : leur catégorie est imposée
  return getCategoryForRole(role);
}
