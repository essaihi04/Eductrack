/**
 * Définition des menus du chatbot.
 *
 * Format : chaque menu = liste d'options { id, emoji, label, action }.
 *  - id : code court tapé par l'utilisateur (1, 2, p1, f3, ...)
 *  - action : nom de la fonction de réponse à appeler
 *
 * Le rendu par défaut est la LISTE cliquable native de l'API Cloud officielle.
 * Si elle échoue (hors fenêtre 24 h, numéro non rattaché), on retombe sur le
 * menu texte numéroté, auquel l'utilisateur peut toujours répondre par le
 * numéro de l'option.
 */

import * as A from './answers.js';
import { sendText } from '../index.js';
import * as cloud from '../cloudApi.js';
import { capabilityForOption, isCapabilityEnabled } from './capabilities.js';
import { customOptionsForMenu } from './customEntries.js';

// ─────────────────────────────────────────────────────────────────────────
// MENUS
// ─────────────────────────────────────────────────────────────────────────

export const MAIN_MENU = {
  id: 'main',
  title: 'Bienvenue 👋',
  description: 'Que souhaitez-vous consulter ?',
  options: [
    { id: '1', emoji: '📚', label: 'Suivi pédagogique', action: 'goto:pedagogy' },
    { id: '2', emoji: '💰', label: 'Finance / Paiements', action: 'goto:finance' },
    { id: '3', emoji: '🎒', label: 'Vie scolaire', action: 'goto:schoollife' },
    { id: '4', emoji: '💬', label: 'Poser une question libre', action: 'goto:ai' },
    { id: '5', emoji: '🆔', label: 'Code Massar de mon enfant', action: A.getMassarCode },
    { id: '6', emoji: '👨‍👩‍👧', label: 'Changer d\'enfant', action: 'goto:child' },
    { id: '7', emoji: '⚙️', label: 'Configuration du compte', action: 'goto:account' },
    { id: '8', emoji: '📅', label: 'Demander un rendez-vous', action: 'goto:appointment' },
  ],
};

export const ACCOUNT_MENU = {
  id: 'account',
  title: 'Configuration du compte ⚙️',
  description: 'Gérez votre compte et le profil de votre enfant',
  options: [
    { id: '1', emoji: '🔑', label: 'Mes identifiants (login & mot de passe)', action: 'goto:credentials' },
    { id: '2', emoji: '📍', label: 'Ma localisation (transport scolaire)',    action: 'goto:location' },
    { id: '3', emoji: '📷', label: 'Photo de profil de mon enfant',           action: 'goto:photo' },
    { id: '0', emoji: '🔙', label: 'Retour au menu principal',                action: 'goto:main' },
  ],
};

export const SCHOOL_LIFE_MENU = {
  id: 'schoollife',
  title: 'Vie scolaire 🎒',
  description: 'Activités, photos, objets perdus et sondages',
  options: [
    { id: '1', emoji: '✨', label: 'Activités parascolaires',        action: A.getExtracurricular },
    { id: '2', emoji: '📸', label: 'Cahier de vie (photos)',         action: A.getClassroomFeed },
    { id: '3', emoji: '🔍', label: 'Objets perdus',                  action: A.getLostItems },
    { id: '4', emoji: '🗳️', label: 'Sondages en cours',             action: A.getActivePolls },
    { id: '5', emoji: '🎒', label: 'Fournitures scolaires (PDF)',    action: 'goto:supplies' },
    { id: '6', emoji: '🏫', label: 'Notre école (infos & photos)',  action: 'goto:school' },
    { id: '0', emoji: '🔙', label: 'Retour au menu principal',       action: 'goto:main' },
  ],
};

export const PEDAGOGY_MENU = {
  id: 'pedagogy',
  title: 'Suivi pédagogique 📚',
  description: 'Choisissez ce que vous voulez consulter',
  options: [
    { id: '1', emoji: '📝', label: 'Dernier suivi',                  action: A.getLastControlGrades },
    { id: '2', emoji: '📊', label: 'Bilan par matière',               action: A.getAverageBySubject },
    { id: '3', emoji: '📅', label: 'Présence cette semaine',          action: A.getWeeklyAttendance },
    { id: '9', emoji: '📝', label: 'Absences à justifier',            action: A.getUnjustifiedAbsences },
    { id: '4', emoji: '✍️', label: 'Devoirs à faire',                action: A.getPendingHomework },
    { id: '5', emoji: '📆', label: 'Programme de demain',            action: A.getTodaySchedule },
    { id: '6', emoji: '📎', label: 'Documents partagés',             action: A.getRecentDocuments },
    { id: '7', emoji: '📄', label: 'Bulletins scolaires',            action: A.getBulletinSummary },
    { id: '8', emoji: '📊', label: 'Consulter mon rapport du jour',  action: 'report:now' },
    { id: '0', emoji: '🔙', label: 'Retour au menu principal',       action: 'goto:main' },
  ],
};

export const FINANCE_MENU = {
  id: 'finance',
  title: 'Finance & Paiements 💰',
  description: 'Choisissez l\'information souhaitée',
  options: [
    { id: '1', emoji: '💰', label: 'Solde et impayés',               action: A.getFinanceBalance },
    { id: '2', emoji: '🧾', label: 'Dernière facture',               action: A.getLastInvoice },
    { id: '3', emoji: '💳', label: 'Historique des paiements',       action: A.getPaymentHistory },
    { id: '4', emoji: '📅', label: 'Échéancier à venir',             action: A.getUpcomingDueDates },
    { id: '5', emoji: '📞', label: 'Coordonnées de paiement',        action: A.getSchoolPaymentInfo },
    { id: '0', emoji: '🔙', label: 'Retour au menu principal',       action: 'goto:main' },
  ],
};

export const MENUS = {
  main: MAIN_MENU,
  pedagogy: PEDAGOGY_MENU,
  finance: FINANCE_MENU,
  schoollife: SCHOOL_LIFE_MENU,
  account: ACCOUNT_MENU,
};

// ─────────────────────────────────────────────────────────────────────────
// Menu effectif d'une école
// ─────────────────────────────────────────────────────────────────────────

/**
 * Construit le menu réellement présenté à un parent :
 *  - les options dont la capacité est coupée sont retirées ;
 *  - les contenus ajoutés par l'administration sont insérés avant le retour.
 *
 * Les menus déclarés plus haut restent le référentiel immuable ; on n'en
 * renvoie qu'une copie, jamais une version modifiée en place.
 */
export async function resolveMenu(schoolId, menuId) {
  const base = MENUS[menuId] || MENUS.main;

  const kept = [];
  for (const opt of base.options) {
    // L'option de retour n'est jamais gouvernée par une capacité.
    if (opt.id === '0') continue;
    const cap = capabilityForOption(base.id, opt.id);
    if (cap && !(await isCapabilityEnabled(schoolId, cap.id))) continue;
    // `menuId` permet au dispatcher de revérifier la capacité au moment de
    // l'exécution, sans avoir à retrouver de quel menu vient l'option.
    kept.push({ ...opt, menuId: base.id });
  }

  const custom = await customOptionsForMenu(schoolId, base.id);
  const back = base.options.find((o) => o.id === '0');

  return {
    ...base,
    options: [...kept, ...custom, ...(back ? [back] : [])],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Formatage texte du menu (toujours envoyé, fallback universel)
// ─────────────────────────────────────────────────────────────────────────

export function renderMenuText(menu, ctx = {}) {
  const lines = [];
  lines.push(`*${menu.title}*`);
  if (ctx.studentName) lines.push(`👶 Élève : *${ctx.studentName}*`);
  lines.push('━━━━━━━━━━━━━━━━━━━');
  if (menu.description) {
    lines.push(menu.description);
    lines.push('');
  }
  menu.options.forEach((opt) => {
    lines.push(`*${opt.id}.* ${opt.emoji} ${opt.label}`);
  });
  lines.push('');
  lines.push('_Répondez avec le numéro de votre choix._');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Envoi du menu via WhatsApp (interactive list + texte de secours)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Envoie un menu sur WhatsApp.
 * - Liste cliquable native de l'API Cloud officielle (vrais boutons)
 * - En cas d'échec (hors fenêtre 24 h, numéro non rattaché) → texte numéroté
 *
 * Dans tous les cas, l'utilisateur peut répondre par le NUMÉRO de l'option.
 */
export async function sendMenu(schoolId, phone, menu, ctx = {}) {
  const r = await cloud.sendListMenu(schoolId, phone, menu, ctx);
  if (r?.success) return true;

  console.warn(`[chatbot] liste Cloud échouée, repli texte:`, r?.message);
  const res = await sendText(schoolId, phone, renderMenuText(menu, ctx), { urgent: true });
  return !!res.success;
}

/**
 * Trouve une option dans un menu à partir de la saisie utilisateur.
 * Accepte : numéro, label partiel, ou rowId "menu:id" (clic listMessage).
 */
export function matchMenuOption(menu, input) {
  if (!menu || !input) return null;
  const raw = String(input).trim();

  // Cas clic sur une ligne de liste : "menuId:optionId"
  if (raw.includes(':')) {
    const [mId, optId] = raw.split(':');
    if (mId === menu.id) {
      return menu.options.find((o) => o.id === optId) || null;
    }
  }

  // Cas numéro direct
  const byId = menu.options.find((o) => o.id === raw);
  if (byId) return byId;

  // Cas label partiel (recherche tolérante)
  const lower = raw.toLowerCase();
  return menu.options.find((o) => o.label.toLowerCase().includes(lower)) || null;
}
