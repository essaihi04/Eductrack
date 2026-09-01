/**
 * Référentiel des données que le chatbot peut communiquer aux parents,
 * et interrupteurs par école.
 *
 * C'est la SOURCE DE VÉRITÉ UNIQUE : l'écran d'administration se construit à
 * partir de cette liste, et les trois points de contrôle la consultent :
 *
 *   1. le menu           — une capacité coupée disparaît des options ;
 *   2. l'accès direct    — taper le numéro d'une option coupée est refusé ;
 *   3. la question libre — la donnée est retirée du contexte envoyé au LLM.
 *
 * Le 3e point est le plus important : sans lui, couper une entrée de menu ne
 * protège rien, le parent obtenant la même information en la demandant en
 * langage naturel.
 *
 * Par défaut TOUT est activé : une école qui ne touche à rien garde le
 * comportement actuel.
 */
import { supabaseAdmin } from '../../../config/supabase.js';

/**
 * `aiScope` relie la capacité aux données chargées dans le contexte du LLM
 * (voir buildStudentContext dans ai.js). Une capacité sans aiScope n'a pas
 * d'équivalent en question libre.
 *
 * `sensitivity` sert uniquement à l'affichage dans l'écran admin :
 *   high   = donnée personnelle sensible ou secret d'accès
 *   medium = donnée scolaire nominative
 *   low    = information générale de l'établissement
 */
export const CAPABILITIES = [
  // ── Menu principal ─────────────────────────────────────────────────────
  { id: 'main.pedagogy', menu: 'main', option: '1', label: 'Section « Suivi pédagogique »', description: 'Accès à tout le menu pédagogique.', sensitivity: 'medium' },
  { id: 'main.finance', menu: 'main', option: '2', label: 'Section « Finance / Paiements »', description: 'Accès à tout le menu financier.', sensitivity: 'high' },
  { id: 'main.schoollife', menu: 'main', option: '3', label: 'Section « Vie scolaire »', description: 'Accès à tout le menu vie scolaire.', sensitivity: 'low' },
  { id: 'main.ai', menu: 'main', option: '4', label: 'Question libre à l\'IA', description: 'Le parent pose une question en langage naturel. L\'IA ne voit que les données restées activées ci-dessous.', sensitivity: 'high' },
  { id: 'main.massar', menu: 'main', option: '5', label: 'Code Massar de l\'enfant', description: 'Identifiant national de l\'élève.', sensitivity: 'high' },
  { id: 'main.child', menu: 'main', option: '6', label: 'Changer d\'enfant', description: 'Bascule entre les enfants rattachés au parent.', sensitivity: 'low' },
  { id: 'main.account', menu: 'main', option: '7', label: 'Section « Configuration du compte »', description: 'Accès au menu de configuration.', sensitivity: 'high' },
  { id: 'main.appointment', menu: 'main', option: '8', label: 'Demande de rendez-vous', description: 'Le parent sollicite un rendez-vous avec l\'administration ou un professeur.', sensitivity: 'low' },

  // ── Suivi pédagogique ──────────────────────────────────────────────────
  { id: 'pedagogy.tracking', menu: 'pedagogy', option: '1', label: 'Dernier suivi de séance', description: 'Présence, participation, discipline, attitude et COMMENTAIRES DES PROFESSEURS.', sensitivity: 'high', aiScope: 'tracking' },
  { id: 'pedagogy.grades', menu: 'pedagogy', option: '2', label: 'Bilan par matière (notes)', description: 'Notes des contrôles et moyennes par matière.', sensitivity: 'medium', aiScope: 'grades' },
  { id: 'pedagogy.attendance', menu: 'pedagogy', option: '3', label: 'Présence de la semaine', description: 'Absences, retards et taux d\'assiduité.', sensitivity: 'medium', aiScope: 'attendance' },
  { id: 'pedagogy.unjustified', menu: 'pedagogy', option: '9', label: 'Absences à justifier', description: 'Liste des absences en attente de justificatif.', sensitivity: 'medium', aiScope: 'attendance' },
  { id: 'pedagogy.homework', menu: 'pedagogy', option: '4', label: 'Devoirs à faire', description: 'Devoirs en cours et rendus de l\'élève.', sensitivity: 'medium', aiScope: 'homework' },
  { id: 'pedagogy.timetable', menu: 'pedagogy', option: '5', label: 'Emploi du temps', description: 'Programme du jour et de la semaine, avec les professeurs.', sensitivity: 'low', aiScope: 'timetable' },
  { id: 'pedagogy.documents', menu: 'pedagogy', option: '6', label: 'Documents partagés', description: 'Documents déposés par les professeurs pour la classe.', sensitivity: 'low' },
  { id: 'pedagogy.bulletins', menu: 'pedagogy', option: '7', label: 'Bulletins scolaires', description: 'Moyennes générales, rang, mention, et PDF des bulletins.', sensitivity: 'high', aiScope: 'bulletins' },
  { id: 'pedagogy.daily_report', menu: 'pedagogy', option: '8', label: 'Rapport du jour', description: 'Synthèse de la journée de l\'élève, à la demande.', sensitivity: 'medium' },

  // ── Finance ────────────────────────────────────────────────────────────
  { id: 'finance.balance', menu: 'finance', option: '1', label: 'Solde et impayés', description: 'Montant dû et retards de paiement.', sensitivity: 'high', aiScope: 'finance' },
  { id: 'finance.last_invoice', menu: 'finance', option: '2', label: 'Dernière facture', description: 'Détail de la dernière facture émise (PDF inclus).', sensitivity: 'high', aiScope: 'finance' },
  { id: 'finance.history', menu: 'finance', option: '3', label: 'Historique des paiements', description: 'Paiements encaissés et leurs dates.', sensitivity: 'high', aiScope: 'finance' },
  { id: 'finance.due_dates', menu: 'finance', option: '4', label: 'Échéancier à venir', description: 'Prochaines échéances de paiement.', sensitivity: 'high', aiScope: 'finance' },
  { id: 'finance.payment_info', menu: 'finance', option: '5', label: 'Coordonnées de paiement', description: 'RIB, modalités et contacts de l\'école.', sensitivity: 'low' },

  // ── Vie scolaire ───────────────────────────────────────────────────────
  { id: 'schoollife.extracurricular', menu: 'schoollife', option: '1', label: 'Activités parascolaires', description: 'Activités proposées par l\'établissement.', sensitivity: 'low' },
  { id: 'schoollife.feed', menu: 'schoollife', option: '2', label: 'Cahier de vie (photos)', description: 'Photos de classe publiées par les enseignants.', sensitivity: 'medium' },
  { id: 'schoollife.lost_items', menu: 'schoollife', option: '3', label: 'Objets perdus', description: 'Objets trouvés, avec photos.', sensitivity: 'low' },
  { id: 'schoollife.polls', menu: 'schoollife', option: '4', label: 'Sondages', description: 'Consultation et vote aux sondages en cours.', sensitivity: 'low' },
  { id: 'schoollife.supplies', menu: 'schoollife', option: '5', label: 'Fournitures scolaires (PDF)', description: 'Liste des fournitures du niveau de l\'enfant.', sensitivity: 'low' },
  { id: 'schoollife.showcase', menu: 'schoollife', option: '6', label: 'Vitrine de l\'école', description: 'Présentation, taux de réussite, filières et galeries photos.', sensitivity: 'low' },

  // ── Configuration du compte ────────────────────────────────────────────
  { id: 'account.credentials', menu: 'account', option: '1', label: 'Identifiants (login et mot de passe)', description: 'Envoi des identifiants de connexion du parent et de l\'enfant.', sensitivity: 'high' },
  { id: 'account.location', menu: 'account', option: '2', label: 'Localisation du domicile', description: 'Consultation et mise à jour de l\'adresse pour le transport.', sensitivity: 'high' },
  { id: 'account.photo', menu: 'account', option: '3', label: 'Photo de profil de l\'enfant', description: 'Le parent envoie une photo qui devient l\'avatar de l\'élève.', sensitivity: 'medium' },
  { id: 'account.add_number', menu: 'account', option: '4', label: 'Ajout d\'un second numéro parent', description: 'Le parent rattache lui-même le numéro du second parent ou d\'un tuteur (jusqu\'à 3 par famille). Le nouveau numéro doit renvoyer un code reçu de vive voix, puis voit les mêmes données que le titulaire.', sensitivity: 'high' },
];

/** Capacité → menu de destination quand elle ouvre une section entière. */
const SECTION_OF_MENU = {
  pedagogy: 'main.pedagogy',
  finance: 'main.finance',
  schoollife: 'main.schoollife',
  account: 'main.account',
};

export const CAPABILITY_IDS = CAPABILITIES.map((c) => c.id);
const CAPABILITY_BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

/** Capacité correspondant à une option de menu, ou null. */
export function capabilityForOption(menuId, optionId) {
  return CAPABILITIES.find((c) => c.menu === menuId && c.option === optionId) || null;
}

/**
 * Table absente = migration ADD_CHATBOT_ACCESS_CONTROL.sql pas encore exécutée.
 * PostgREST le signale par le code PGRST205 et le message « Could not find the
 * table … in the schema cache » ; Postgres direct dit « does not exist ».
 */
export function isMissingTableError(error) {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  const msg = String(error.message || '');
  return msg.includes('does not exist') || msg.includes('Could not find the table');
}

// ── Chargement des interrupteurs, avec cache court ────────────────────────

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // schoolId -> { disabled: Set, expiresAt }

/**
 * Renvoie l'ensemble des capacités DÉSACTIVÉES pour une école.
 * On stocke les désactivations plutôt que les activations : une capacité
 * ajoutée au code plus tard est donc active par défaut, sans migration.
 */
export async function disabledCapabilities(schoolId) {
  if (!schoolId) return new Set();

  const hit = cache.get(schoolId);
  if (hit && hit.expiresAt > Date.now()) return hit.disabled;

  let disabled = new Set();
  try {
    const { data, error } = await supabaseAdmin
      .from('chatbot_capabilities')
      .select('capability_id, is_enabled')
      .eq('school_id', schoolId)
      .eq('is_enabled', false);
    if (error) throw error;
    disabled = new Set((data || []).map((r) => r.capability_id));
  } catch (e) {
    // Table absente (migration non exécutée) ou base indisponible : on
    // conserve le comportement actuel plutôt que de tout couper. Couper par
    // défaut priverait les parents de tout le chatbot sur un simple incident.
    if (!isMissingTableError(e)) {
      console.warn('[chatbot] lecture des interrupteurs échouée:', e.message);
    }
  }

  cache.set(schoolId, { disabled, expiresAt: Date.now() + CACHE_TTL_MS });
  return disabled;
}

/** À appeler après toute modification pour que l'effet soit immédiat. */
export function invalidateCapabilityCache(schoolId) {
  if (schoolId) cache.delete(schoolId);
  else cache.clear();
}

/**
 * Une capacité est-elle utilisable ? Une capacité de section coupée
 * (ex. main.finance) coupe aussi tout son sous-menu.
 */
export async function isCapabilityEnabled(schoolId, capabilityId) {
  const disabled = await disabledCapabilities(schoolId);
  if (disabled.has(capabilityId)) return false;

  const cap = CAPABILITY_BY_ID.get(capabilityId);
  const parent = cap && SECTION_OF_MENU[cap.menu];
  if (parent && disabled.has(parent)) return false;

  return true;
}

/**
 * Portées de données autorisées dans le contexte du LLM, pour une école.
 * Renvoie un Set de `aiScope` (tracking, grades, attendance, homework,
 * timetable, bulletins, finance).
 */
export async function allowedAiScopes(schoolId) {
  const disabled = await disabledCapabilities(schoolId);
  const scopes = new Set();

  for (const cap of CAPABILITIES) {
    if (!cap.aiScope) continue;
    if (disabled.has(cap.id)) continue;
    const parent = SECTION_OF_MENU[cap.menu];
    if (parent && disabled.has(parent)) continue;
    scopes.add(cap.aiScope);
  }

  return scopes;
}
