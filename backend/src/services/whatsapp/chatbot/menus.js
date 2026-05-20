/**
 * Définition des menus du chatbot.
 *
 * Format : chaque menu = liste d'options { id, emoji, label, action }.
 *  - id : code court tapé par l'utilisateur (1, 2, p1, f3, ...)
 *  - action : nom de la fonction de réponse à appeler
 *
 * On envoie d'abord en texte numéroté (toujours fonctionnel).
 * En option, on tente aussi un `listMessage` Baileys qui affiche un menu
 * cliquable sur les versions WhatsApp qui le supportent.
 */

import * as A from './answers.js';
import { getSocket, phoneToJid } from '../baileysClient.js';
import { sendText } from '../index.js';
import { simulateTyping, waitHumanDelay, recordSent, checkAllowed } from '../antiBan.js';

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
    { id: '3', emoji: '💬', label: 'Poser une question libre', action: 'goto:ai' },
    { id: '4', emoji: '👨‍👩‍👧', label: 'Changer d\'enfant', action: 'goto:child' },
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
    { id: '4', emoji: '✍️', label: 'Devoirs à faire',                action: A.getPendingHomework },
    { id: '5', emoji: '📆', label: 'Programme du jour',              action: A.getTodaySchedule },
    { id: '6', emoji: '📎', label: 'Documents partagés',             action: A.getRecentDocuments },
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
};

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
 * - Tente d'abord listMessage Baileys (rendu cliquable type "boutons")
 * - Si non supporté ou erreur → envoie en texte numéroté
 *
 * Dans tous les cas, l'utilisateur peut répondre par le NUMÉRO de l'option.
 */
export async function sendMenu(schoolId, phone, menu, ctx = {}) {
  const sock = getSocket(schoolId);
  if (!sock) return false;

  // Anti-ban check
  const allowed = await checkAllowed(schoolId, { urgent: true });
  if (!allowed.allowed) return false;

  await waitHumanDelay(schoolId);
  const jid = phoneToJid(phone);
  await simulateTyping(sock, jid);

  const text = renderMenuText(menu, ctx);

  // Tentative listMessage (rendu "bouton" sur certaines versions WhatsApp)
  try {
    const sections = [{
      title: menu.title,
      rows: menu.options.map((opt) => ({
        rowId: `${menu.id}:${opt.id}`,
        title: `${opt.emoji} ${opt.label}`,
        description: '',
      })),
    }];

    await sock.sendMessage(jid, {
      text,
      footer: ctx.schoolName || 'Eductrack',
      title: menu.title,
      buttonText: 'Voir les options',
      sections,
    });
    await recordSent(schoolId);
    return true;
  } catch (err) {
    // Fallback : envoi texte simple
    console.warn(`[chatbot] listMessage non supporté, fallback texte:`, err?.message);
    return await sendText(schoolId, phone, text, { urgent: true, skipDelay: true, skipTyping: true })
      .then((r) => !!r.success);
  }
}

/**
 * Trouve une option dans un menu à partir de la saisie utilisateur.
 * Accepte : numéro, label partiel, ou rowId "menu:id" (clic listMessage).
 */
export function matchMenuOption(menu, input) {
  if (!menu || !input) return null;
  const raw = String(input).trim();

  // Cas listMessage : "menuId:optionId"
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
