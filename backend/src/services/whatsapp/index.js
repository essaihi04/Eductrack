/**
 * Provider WhatsApp unifié — Baileys self-hosted.
 *
 * API publique compatible avec l'ancien wrapper Wasender :
 *   - Format de réponse : { success: bool, data: { msgId }, message? }
 *
 * Toutes les opérations passent par la couche anti-ban.
 * Les media sont téléchargés depuis URL puis envoyés en buffer.
 */

import { getSocket, phoneToJid, checkNumberExists, getStatus, startSession, logoutSession, getQrDataUrl, bootstrapAllSessions } from './baileysClient.js';
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
  } else if (code === 401 || code === 403) {
    pauseSession(schoolId, 'wa_auth_error', 5 * 60 * 1000);
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
  const sock = getSocket(schoolId);
  if (!sock) return fail('Session WhatsApp non connectée');

  const allowed = await checkAllowed(schoolId, opts);
  if (!allowed.allowed) return fail(allowed.message, { reason: allowed.reason });

  if (!opts.skipDelay) await waitHumanDelay(schoolId);

  const jid = phoneToJid(phone);
  if (!opts.skipTyping) await simulateTyping(sock, jid);

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
  const sock = getSocket(schoolId);
  if (!sock) return fail('Session WhatsApp non connectée');

  const allowed = await checkAllowed(schoolId, opts);
  if (!allowed.allowed) return fail(allowed.message, { reason: allowed.reason });

  if (!opts.skipDelay) await waitHumanDelay(schoolId);
  const jid = phoneToJid(phone);
  if (!opts.skipTyping) await simulateTyping(sock, jid);

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
  const sock = getSocket(schoolId);
  if (!sock) return fail('Session WhatsApp non connectée');

  const allowed = await checkAllowed(schoolId, opts);
  if (!allowed.allowed) return fail(allowed.message, { reason: allowed.reason });

  if (!opts.skipDelay) await waitHumanDelay(schoolId);
  const jid = phoneToJid(phone);
  if (!opts.skipTyping) await simulateTyping(sock, jid);

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
  const sock = getSocket(schoolId);
  if (!sock) return fail('Session WhatsApp non connectée');

  const allowed = await checkAllowed(schoolId, opts);
  if (!allowed.allowed) return fail(allowed.message, { reason: allowed.reason });

  if (!opts.skipDelay) await waitHumanDelay(schoolId);
  const jid = phoneToJid(phone);
  if (!opts.skipTyping) await simulateTyping(sock, jid);

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
  checkNumberExists,
  bootstrapAllSessions,
  ensureWarmupStarted,
  getStats,
};
