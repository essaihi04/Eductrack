/**
 * Provider WhatsApp unifié — Baileys self-hosted.
 *
 * API publique compatible avec l'ancien wrapper Wasender :
 *   - Format de réponse : { success: bool, data: { msgId }, message? }
 *
 * Toutes les opérations passent par la couche anti-ban.
 * Les media sont téléchargés depuis URL puis envoyés en buffer.
 */

import { getSocket, phoneToJid, checkNumberExists, getStatus, startSession, logoutSession, getQrDataUrl, getPairingCode, requestPairingCode, bootstrapAllSessions, shutdownAllSessions, startSessionWatchdog, resetForPairing, hasAuthState } from './baileysClient.js';
import * as cloud from './cloudApi.js';
import {
  checkAllowed,
  waitHumanDelay,
  simulateTyping,
  recordSent,
  pauseSession,
  processOutgoingText,
  ensureWarmupStarted,
  getStats,
} from './antiBan.js';
import { isOutboundBlocked, OUTBOUND_DISABLED_MESSAGE } from './outboundGate.js';
import { isOnWhatsApp } from './numberCheck.js';

// Écrire à des numéros qui ne sont pas sur WhatsApp est l'un des signaux
// anti-spam les plus lourds côté Meta. On refuse l'envoi UNIQUEMENT sur un
// « false » franc : un doute (session instable, timeout) renvoie null et le
// message part quand même — jamais priver un parent sur une incertitude.
const notOnWhatsApp = async (schoolId, phone) => {
  const exists = await isOnWhatsApp(schoolId, phone);
  if (exists === false) {
    return fail("Ce numéro n'est pas inscrit sur WhatsApp", { reason: 'not_on_whatsapp' });
  }
  return null;
};

// Interrupteur global (voir outboundGate.js) : notifications sortantes
// bloquées, réponses du chatbot toujours autorisées.
const blockedIfDisabled = (phone) => {
  if (!isOutboundBlocked()) return null;
  console.log(`[whatsapp] Envoi bloqué (notifications désactivées) → ${phone}`);
  return fail(OUTBOUND_DISABLED_MESSAGE, { reason: 'outbound_disabled' });
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const ok = (msgId, extra = {}) => ({ success: true, data: { msgId, ...extra } });
const fail = (message, extra = {}) => ({ success: false, message, ...extra });

const fetchAsBuffer = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement média échoué (${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
};

// Gère les erreurs Baileys → décide pause anti-ban
const handleSendError = (schoolId, err) => {
  const msg = err?.message || '';
  const code = err?.output?.statusCode || err?.data?.code;
  // Erreurs de timelock / rate limit côté WhatsApp
  if (code === 463 || /rate|spam|timelock/i.test(msg)) {
    pauseSession(schoolId, 'wa_rate_limit', 60 * 60 * 1000);
    return fail(msg || 'Erreur envoi WhatsApp', { reason: 'paused' });
  }
  if (code === 401 || code === 403) {
    pauseSession(schoolId, 'wa_auth_error', 5 * 60 * 1000);
    return fail(msg || 'Erreur envoi WhatsApp', { reason: 'session_down' });
  }
  // Socket fermé / timeout : la connexion est en cause, pas le destinataire.
  if (code === 428 || code === 408 || /connection|closed|timed? ?out|socket/i.test(msg)) {
    return fail(msg || 'Erreur envoi WhatsApp', { reason: 'session_down' });
  }
  return fail(msg || 'Erreur envoi WhatsApp');
};

// ─────────────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────────────

/**
 * Envoi texte simple.
 * @param {string} schoolId
 * @param {string} phone   E.164 (+212600...)
 * @param {string} text
 * @param {object} opts    { urgent?: bool, skipTyping?: bool, skipDelay?: bool }
 */
export async function sendText(schoolId, phone, text, opts = {}) {
  const blocked = blockedIfDisabled(phone);
  if (blocked) return blocked;
  if (await cloud.isCloudSchool(schoolId)) return cloud.sendText(schoolId, phone, text, opts);

  const sock = getSocket(schoolId);
  // `reason: 'session_down'` est capital : sans lui, une session qui tombe au
  // milieu d'une campagne faisait marquer tous les destinataires restants en
  // ÉCHEC DÉFINITIF. L'appelant (job d'envoi de masse) sait maintenant qu'il
  // s'agit d'un refus temporaire et reprend après reconnexion.
  if (!sock) return fail('Session WhatsApp non connectée', { reason: 'session_down' });

  const allowed = await checkAllowed(schoolId, opts);
  if (!allowed.allowed) return fail(allowed.message, { reason: allowed.reason });

  // Avant la temporisation : inutile d'immobiliser la file 1 à 2 minutes
  // pour un numéro auquel on ne pourra rien envoyer.
  const invalid = await notOnWhatsApp(schoolId, phone);
  if (invalid) return invalid;

  if (!opts.skipDelay) await waitHumanDelay(schoolId);

  const jid = phoneToJid(phone);
  if (!opts.skipTyping) await simulateTyping(sock, jid, text);

  try {
    const finalText = processOutgoingText(text);
    const sent = await sock.sendMessage(jid, { text: finalText });
    await recordSent(schoolId);
    return ok(sent?.key?.id || null);
  } catch (e) {
    return handleSendError(schoolId, e);
  }
}

/**
 * Envoi image depuis URL.
 */
export async function sendImage(schoolId, phone, imageUrl, caption = '', opts = {}) {
  const blocked = blockedIfDisabled(phone);
  if (blocked) return blocked;
  if (await cloud.isCloudSchool(schoolId)) return cloud.sendImage(schoolId, phone, imageUrl, caption, opts);

  const sock = getSocket(schoolId);
  // `reason: 'session_down'` est capital : sans lui, une session qui tombe au
  // milieu d'une campagne faisait marquer tous les destinataires restants en
  // ÉCHEC DÉFINITIF. L'appelant (job d'envoi de masse) sait maintenant qu'il
  // s'agit d'un refus temporaire et reprend après reconnexion.
  if (!sock) return fail('Session WhatsApp non connectée', { reason: 'session_down' });

  const allowed = await checkAllowed(schoolId, opts);
  if (!allowed.allowed) return fail(allowed.message, { reason: allowed.reason });

  // Avant la temporisation : inutile d'immobiliser la file 1 à 2 minutes
  // pour un numéro auquel on ne pourra rien envoyer.
  const invalid = await notOnWhatsApp(schoolId, phone);
  if (invalid) return invalid;

  if (!opts.skipDelay) await waitHumanDelay(schoolId);
  const jid = phoneToJid(phone);
  if (!opts.skipTyping) await simulateTyping(sock, jid, caption);

  try {
    const buf = await fetchAsBuffer(imageUrl);
    const sent = await sock.sendMessage(jid, {
      image: buf,
      caption: caption ? processOutgoingText(caption) : undefined,
    });
    await recordSent(schoolId);
    return ok(sent?.key?.id || null);
  } catch (e) {
    return handleSendError(schoolId, e);
  }
}

/**
 * Envoi document (PDF, etc.) depuis URL.
 */
export async function sendDocument(schoolId, phone, documentUrl, fileName, caption = '', mimetype = 'application/pdf', opts = {}) {
  const blocked = blockedIfDisabled(phone);
  if (blocked) return blocked;
  if (await cloud.isCloudSchool(schoolId)) return cloud.sendDocument(schoolId, phone, documentUrl, fileName, caption, mimetype, opts);

  const sock = getSocket(schoolId);
  // `reason: 'session_down'` est capital : sans lui, une session qui tombe au
  // milieu d'une campagne faisait marquer tous les destinataires restants en
  // ÉCHEC DÉFINITIF. L'appelant (job d'envoi de masse) sait maintenant qu'il
  // s'agit d'un refus temporaire et reprend après reconnexion.
  if (!sock) return fail('Session WhatsApp non connectée', { reason: 'session_down' });

  const allowed = await checkAllowed(schoolId, opts);
  if (!allowed.allowed) return fail(allowed.message, { reason: allowed.reason });

  // Avant la temporisation : inutile d'immobiliser la file 1 à 2 minutes
  // pour un numéro auquel on ne pourra rien envoyer.
  const invalid = await notOnWhatsApp(schoolId, phone);
  if (invalid) return invalid;

  if (!opts.skipDelay) await waitHumanDelay(schoolId);
  const jid = phoneToJid(phone);
  if (!opts.skipTyping) await simulateTyping(sock, jid, caption);

  try {
    const buf = await fetchAsBuffer(documentUrl);
    const sent = await sock.sendMessage(jid, {
      document: buf,
      fileName: fileName || 'document.pdf',
      mimetype,
      caption: caption ? processOutgoingText(caption) : undefined,
    });
    await recordSent(schoolId);
    return ok(sent?.key?.id || null);
  } catch (e) {
    return handleSendError(schoolId, e);
  }
}

/**
 * Envoi média générique depuis un buffer / chemin local (pour upload depuis backend).
 */
export async function sendMediaBuffer(schoolId, phone, buffer, { type = 'document', fileName, mimetype, caption } = {}, opts = {}) {
  const blocked = blockedIfDisabled(phone);
  if (blocked) return blocked;
  if (await cloud.isCloudSchool(schoolId)) return cloud.sendMediaBuffer(schoolId, phone, buffer, { type, fileName, mimetype, caption }, opts);

  const sock = getSocket(schoolId);
  // `reason: 'session_down'` est capital : sans lui, une session qui tombe au
  // milieu d'une campagne faisait marquer tous les destinataires restants en
  // ÉCHEC DÉFINITIF. L'appelant (job d'envoi de masse) sait maintenant qu'il
  // s'agit d'un refus temporaire et reprend après reconnexion.
  if (!sock) return fail('Session WhatsApp non connectée', { reason: 'session_down' });

  const allowed = await checkAllowed(schoolId, opts);
  if (!allowed.allowed) return fail(allowed.message, { reason: allowed.reason });

  // Avant la temporisation : inutile d'immobiliser la file 1 à 2 minutes
  // pour un numéro auquel on ne pourra rien envoyer.
  const invalid = await notOnWhatsApp(schoolId, phone);
  if (invalid) return invalid;

  if (!opts.skipDelay) await waitHumanDelay(schoolId);
  const jid = phoneToJid(phone);
  if (!opts.skipTyping) await simulateTyping(sock, jid, caption);

  try {
    const payload = type === 'image'
      ? { image: buffer, caption: caption ? processOutgoingText(caption) : undefined }
      : type === 'video'
        ? { video: buffer, caption: caption ? processOutgoingText(caption) : undefined }
        : type === 'audio'
          ? { audio: buffer, mimetype: mimetype || 'audio/mp4', ptt: false }
          : { document: buffer, fileName: fileName || 'file', mimetype: mimetype || 'application/octet-stream', caption: caption ? processOutgoingText(caption) : undefined };

    const sent = await sock.sendMessage(jid, payload);
    await recordSent(schoolId);
    return ok(sent?.key?.id || null);
  } catch (e) {
    return handleSendError(schoolId, e);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Session management (re-export propre)
// ─────────────────────────────────────────────────────────────────────────

export {
  startSession,
  logoutSession,
  getStatus,
  getQrDataUrl,
  getPairingCode,
  requestPairingCode,
  checkNumberExists,
  bootstrapAllSessions,
  resetForPairing,
  hasAuthState,
  shutdownAllSessions,
  startSessionWatchdog,
  ensureWarmupStarted,
  getStats,
};
