/**
 * Provider WhatsApp unifié — API Cloud officielle de Meta (seul provider).
 *
 * Baileys (connexion non-officielle par QR code) a été retiré du projet : plus
 * de socket WebSocket, plus de session à appairer, plus de couche anti-ban.
 * Tout passe par des appels HTTPS Graph API avec un token System User central,
 * chaque école étant identifiée par son `phone_number_id`.
 *
 * Ce module ne fait plus que deux choses par-dessus `cloudApi.js` :
 *   1. appliquer l'interrupteur global des notifications (outboundGate) ;
 *   2. garder le format de réponse historique { success, data: { msgId } }.
 */

import * as cloud from './cloudApi.js';
import { isOutboundBlocked, OUTBOUND_DISABLED_MESSAGE } from './outboundGate.js';

const fail = (message, extra = {}) => ({ success: false, message, ...extra });

// Interrupteur global (voir outboundGate.js) : notifications sortantes
// bloquées, réponses du chatbot toujours autorisées.
const blockedIfDisabled = (phone) => {
  if (!isOutboundBlocked()) return null;
  console.log(`[whatsapp] Envoi bloqué (notifications désactivées) → ${phone}`);
  return fail(OUTBOUND_DISABLED_MESSAGE, { reason: 'outbound_disabled' });
};

// Aucun numéro Cloud API rattaché à l'école : refus TEMPORAIRE
// (`reason: 'session_down'`). Sans ce marqueur, une campagne en cours
// marquerait tous les destinataires restants en échec définitif alors qu'il
// suffit de rattacher le numéro pour reprendre l'envoi.
const notConfigured = async (schoolId) => {
  if (await cloud.isCloudSchool(schoolId)) return null;
  return fail('Numéro WhatsApp non configuré pour cette école (API Cloud)', { reason: 'session_down' });
};

// ─────────────────────────────────────────────────────────────────────────
// API publique d'envoi
// ─────────────────────────────────────────────────────────────────────────

/**
 * Envoi texte simple.
 * @param {string} schoolId
 * @param {string} phone   E.164 (+212600...)
 * @param {string} text
 * @param {object} opts    conservé pour compatibilité (ignoré par le Cloud API)
 */
export async function sendText(schoolId, phone, text, opts = {}) {
  const blocked = blockedIfDisabled(phone);
  if (blocked) return blocked;
  const missing = await notConfigured(schoolId);
  if (missing) return missing;
  return cloud.sendText(schoolId, phone, text, opts);
}

/** Envoi image depuis URL. */
export async function sendImage(schoolId, phone, imageUrl, caption = '', opts = {}) {
  const blocked = blockedIfDisabled(phone);
  if (blocked) return blocked;
  const missing = await notConfigured(schoolId);
  if (missing) return missing;
  return cloud.sendImage(schoolId, phone, imageUrl, caption, opts);
}

/** Envoi document (PDF, etc.) depuis URL. */
export async function sendDocument(schoolId, phone, documentUrl, fileName, caption = '', mimetype = 'application/pdf', opts = {}) {
  const blocked = blockedIfDisabled(phone);
  if (blocked) return blocked;
  const missing = await notConfigured(schoolId);
  if (missing) return missing;
  return cloud.sendDocument(schoolId, phone, documentUrl, fileName, caption, mimetype, opts);
}

/** Envoi média depuis un buffer généré côté backend (bulletins, factures…). */
export async function sendMediaBuffer(schoolId, phone, buffer, { type = 'document', fileName, mimetype, caption } = {}, opts = {}) {
  const blocked = blockedIfDisabled(phone);
  if (blocked) return blocked;
  const missing = await notConfigured(schoolId);
  if (missing) return missing;
  return cloud.sendMediaBuffer(schoolId, phone, buffer, { type, fileName, mimetype, caption }, opts);
}

// ─────────────────────────────────────────────────────────────────────────
// État de la connexion
// ─────────────────────────────────────────────────────────────────────────

export { getStatus, isCloudSchool, invalidateCache } from './cloudApi.js';
