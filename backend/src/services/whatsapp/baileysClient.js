/**
 * Baileys multi-session manager.
 *
 * Une session WhatsApp par école (school_id).
 * Auth state persisté sur le filesystem (volume monté en prod).
 *
 * Variables d'environnement :
 *   WHATSAPP_AUTH_DIR : dossier racine pour stocker les credentials
 *                       (défaut: ./data/whatsapp_auth)
 *
 * ⚠️ En production, ce dossier DOIT être un volume persistant
 *    (Docker volume, disque attaché). Sinon vous perdez les sessions
 *    à chaque redéploiement et devez re-scanner le QR.
 */

import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from 'baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { supabaseAdmin } from '../../config/supabase.js';

const AUTH_ROOT = process.env.WHATSAPP_AUTH_DIR || path.join(process.cwd(), 'data', 'whatsapp_auth');

// Logger silencieux — Baileys est très verbeux par défaut
const logger = P({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

// État global : 1 socket par école
const sockets = new Map(); // school_id -> { sock, status, qr, qrDataUrl, phone, lastError }

const ensureAuthDir = (schoolId) => {
  const dir = path.join(AUTH_ROOT, String(schoolId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const getEntry = (schoolId) => {
  if (!sockets.has(schoolId)) {
    sockets.set(schoolId, {
      sock: null,
      status: 'disconnected', // disconnected | connecting | qr | connected | logged_out | banned
      qr: null,
      qrDataUrl: null,
      phone: null,
      lastError: null,
      reconnectAttempts: 0,
    });
  }
  return sockets.get(schoolId);
};

// Backoff exponentiel pour reconnexion
const reconnectDelay = (attempts) => {
  const base = [5_000, 30_000, 5 * 60_000, 30 * 60_000, 60 * 60_000];
  return base[Math.min(attempts, base.length - 1)];
};

/**
 * Démarre (ou redémarre) une session pour une école.
 */
export async function startSession(schoolId, { onIncoming } = {}) {
  if (!schoolId) throw new Error('schoolId requis');
  const entry = getEntry(schoolId);

  // Déjà en cours
  if (entry.sock && (entry.status === 'connecting' || entry.status === 'connected' || entry.status === 'qr')) {
    return entry;
  }

  entry.status = 'connecting';
  entry.lastError = null;

  const authDir = ensureAuthDir(schoolId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: Browsers.appropriate('Chrome'), // signature humaine
    syncFullHistory: false,
    markOnlineOnConnect: false, // évite de spammer "online" → ban-tier
    generateHighQualityLinkPreview: false,
    // Empêche le téléchargement automatique de tous les messages historiques
    shouldSyncHistoryMessage: () => false,
  });

  entry.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.qr = qr;
      entry.qrDataUrl = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'L', margin: 2, width: 320 });
      entry.status = 'qr';
      console.log(`[baileys][${schoolId}] QR code généré`);
    }

    if (connection === 'open') {
      entry.status = 'connected';
      entry.qr = null;
      entry.qrDataUrl = null;
      entry.reconnectAttempts = 0;
      // Récupère le numéro
      const me = sock.user?.id?.split(':')[0]?.split('@')[0] || null;
      entry.phone = me;
      console.log(`[baileys][${schoolId}] Connecté (numéro: ${me})`);

      // Met à jour la table de mapping
      await supabaseAdmin
        .from('whatsapp_school_sessions')
        .upsert({
          school_id: schoolId,
          phone_number: me,
          status: 'connected',
          last_connected_at: new Date().toISOString(),
        }, { onConflict: 'school_id' });
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : null;
      const isLoggedOut = code === DisconnectReason.loggedOut;
      const isBanned = code === DisconnectReason.forbidden || code === 403;

      entry.lastError = lastDisconnect?.error?.message || `code=${code}`;
      console.warn(`[baileys][${schoolId}] Déconnecté code=${code} loggedOut=${isLoggedOut} banned=${isBanned}`);

      if (isLoggedOut) {
        entry.status = 'logged_out';
        // Purge auth → nécessite re-scan QR
        try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}
        await supabaseAdmin
          .from('whatsapp_school_sessions')
          .update({ status: 'logged_out' })
          .eq('school_id', schoolId);
        return;
      }

      if (isBanned) {
        entry.status = 'banned';
        await supabaseAdmin
          .from('whatsapp_school_sessions')
          .update({ status: 'banned' })
          .eq('school_id', schoolId);
        console.error(`[baileys][${schoolId}] ⚠️ NUMÉRO BANNI PAR WHATSAPP`);
        return;
      }

      // Reconnexion avec backoff
      entry.reconnectAttempts += 1;
      const delay = reconnectDelay(entry.reconnectAttempts);
      console.log(`[baileys][${schoolId}] Reconnexion dans ${delay}ms (tentative ${entry.reconnectAttempts})`);
      setTimeout(() => startSession(schoolId, { onIncoming }), delay);
    }
  });

  // Messages entrants → callback fourni par le chatbot
  if (onIncoming) {
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        try {
          await onIncoming({ schoolId, msg, sock });
        } catch (e) {
          console.error(`[baileys][${schoolId}] Erreur handler entrant:`, e.message);
        }
      }
    });
  }

  return entry;
}

/**
 * Récupère le socket actif d'une école (ou null si pas connecté).
 */
export function getSocket(schoolId) {
  const entry = sockets.get(schoolId);
  if (!entry || entry.status !== 'connected') return null;
  return entry.sock;
}

/**
 * Status de la session.
 */
export function getStatus(schoolId) {
  const entry = sockets.get(schoolId);
  if (!entry) return { status: 'disconnected', connected: false };
  return {
    status: entry.status,
    connected: entry.status === 'connected',
    phone: entry.phone,
    has_qr: !!entry.qrDataUrl,
    last_error: entry.lastError,
  };
}

/**
 * QR code en data URL (pour affichage frontend).
 */
export function getQrDataUrl(schoolId) {
  const entry = sockets.get(schoolId);
  return entry?.qrDataUrl || null;
}

/**
 * Déconnexion volontaire (logout) → invalide aussi côté téléphone.
 */
export async function logoutSession(schoolId) {
  const entry = sockets.get(schoolId);
  if (!entry?.sock) return false;
  try {
    await entry.sock.logout();
  } catch (e) {
    console.warn(`[baileys][${schoolId}] Logout error:`, e.message);
  }
  // Purge auth + état
  try { fs.rmSync(path.join(AUTH_ROOT, String(schoolId)), { recursive: true, force: true }); } catch {}
  sockets.delete(schoolId);
  await supabaseAdmin
    .from('whatsapp_school_sessions')
    .update({ status: 'disconnected', phone_number: null })
    .eq('school_id', schoolId);
  return true;
}

/**
 * Convertit un numéro E.164 (+212600...) en JID WhatsApp.
 */
export function phoneToJid(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/[^\d]/g, '');
  return `${clean}@s.whatsapp.net`;
}

/**
 * Vérifie qu'un numéro existe sur WhatsApp avant l'envoi.
 * (réduit le nombre d'erreurs et donc le risque comportemental)
 */
export async function checkNumberExists(schoolId, phone) {
  const sock = getSocket(schoolId);
  if (!sock) return null;
  try {
    const jid = phoneToJid(phone);
    const [result] = await sock.onWhatsApp(jid);
    return result?.exists ? result.jid : null;
  } catch {
    return null;
  }
}

/**
 * Démarre toutes les sessions des écoles déjà appariées (au boot du serveur).
 */
export async function bootstrapAllSessions(onIncoming) {
  const { data: rows } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('school_id, status')
    .neq('status', 'banned');

  for (const row of rows || []) {
    const authDir = path.join(AUTH_ROOT, String(row.school_id));
    if (!fs.existsSync(authDir)) continue; // pas encore appairé
    try {
      await startSession(row.school_id, { onIncoming });
    } catch (e) {
      console.error(`[baileys] bootstrap ${row.school_id}:`, e.message);
    }
  }
}
