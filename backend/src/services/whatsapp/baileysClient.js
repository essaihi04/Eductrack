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

// Backoff exponentiel pour reconnexion (erreurs réseau / timeouts)
const reconnectDelay = (attempts) => {
  const base = [2_000, 5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
  return base[Math.min(attempts, base.length - 1)];
};

// Backoff plus court pour les "401 loggedOut" — on essaie plus longtemps
// avant de considérer la session comme vraiment perdue, car beaucoup de
// 401 sont en réalité transitoires (race condition creds, conflit MD…).
const loggedOutRetryDelay = (attempts) => {
  const base = [3_000, 10_000, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];
  return base[Math.min(attempts, base.length - 1)];
};

// Nombre de retries avant d'abandonner sur 401 (sans purger l'auth, juste
// passer en état needs_reconnect que l'admin pourra relancer manuellement).
const MAX_LOGGED_OUT_RETRIES = 6;

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
    // Keep-alive WebSocket : envoie un ping toutes les 10s pour éviter les
    // déconnexions 408 dues à des firewalls / NAT timeouts intermédiaires.
    keepAliveIntervalMs: 10_000,
    // Timeout connexion initial — laisse plus de marge sur réseaux lents.
    connectTimeoutMs: 60_000,
    // Empêche le téléchargement automatique de tous les messages historiques
    shouldSyncHistoryMessage: () => false,
    // Durée de vie de chaque QR. Par défaut Baileys donne 60s au PREMIER QR
    // puis seulement 20s aux suivants — trop court pour le flux mobile
    // "scan depuis l'app chat → ouverture page Appareils liés → re-scan".
    // On force 60s pour TOUS les QR (équivalent à WhatsApp Web officiel).
    qrTimeout: 60_000,
  });

  entry.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.qr = qr;
      // errorCorrectionLevel: 'L' (7%) = comme WhatsApp Web → QR MOINS dense
      // (carrés plus gros à taille d'écran égale) donc plus facile à scanner,
      // notamment sur iPhone (scanner iOS plus exigeant sur les QR denses).
      // À l'écran (sans reflets d'impression), 'L' est largement suffisant.
      // margin: 4 = grande zone blanche autour (quiet zone), comme WhatsApp Web.
      // width: 512 = QR HD, downscalé en CSS, reste net même sur écrans Retina.
      entry.qrDataUrl = await QRCode.toDataURL(qr, {
        errorCorrectionLevel: 'L',
        margin: 4,
        width: 512,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      entry.status = 'qr';
      console.log(`[baileys][${schoolId}] QR code généré (${qr.length} chars)`);
    }

    if (connection === 'open') {
      entry.status = 'connected';
      entry.qr = null;
      entry.qrDataUrl = null;
      entry.pairingCode = null;
      entry.reconnectAttempts = 0;
      entry.loggedOutRetried = false;
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
      // 515 = restartRequired : signal normal de WhatsApp juste après le scan du QR,
      // le socket doit être recréé immédiatement pour finaliser le pairing.
      const isRestartRequired = code === DisconnectReason.restartRequired || code === 515;

      entry.lastError = lastDisconnect?.error?.message || `code=${code}`;
      console.warn(`[baileys][${schoolId}] Déconnecté code=${code} loggedOut=${isLoggedOut} banned=${isBanned} restartRequired=${isRestartRequired}`);

      // Si l'admin a déclenché un logoutSession() explicite, on ne reconnecte
      // surtout pas (le flag est posé juste avant le logout).
      if (entry.adminLogout) {
        console.log(`[baileys][${schoolId}] Logout admin reçu — pas de reconnexion auto`);
        entry.adminLogout = false;
        return;
      }

      if (isBanned) {
        entry.status = 'banned';
        await supabaseAdmin
          .from('whatsapp_school_sessions')
          .update({ status: 'banned' })
          .eq('school_id', schoolId);
        console.error(`[baileys][${schoolId}] ⚠️ NUMÉRO BANNI PAR WHATSAPP — pas de reconnexion`);
        return;
      }

      // Restart requis (juste après pairing QR) : reconnexion rapide mais en
      // laissant le temps à `creds.update` d'écrire les credentials sur disque.
      if (isRestartRequired) {
        console.log(`[baileys][${schoolId}] 🔄 restartRequired : reconnexion dans 3000ms pour finaliser le pairing`);
        entry.status = 'disconnected';
        entry.sock = null;
        entry.reconnectAttempts = 0;
        entry.lastRestartAt = Date.now();
        entry.loggedOutAttempts = 0;
        // Délai plus long pour éviter que creds.update ne soit pas encore flushé
        // sur disque (cause majoritaire des 401 post-restart en boucle).
        setTimeout(() => startSession(schoolId, { onIncoming }), 3000);
        return;
      }

      if (isLoggedOut) {
        // 401 = credentials rejetés. La plupart des 401 sont en réalité
        // TRANSITOIRES (race condition d'écriture creds, conflit multi-device,
        // session sync server-side). On NE PURGE JAMAIS l'auth automatiquement —
        // l'admin doit explicitement appeler logoutSession() pour ça.
        entry.loggedOutAttempts = (entry.loggedOutAttempts || 0) + 1;
        entry.sock = null;

        if (entry.loggedOutAttempts <= MAX_LOGGED_OUT_RETRIES) {
          const delay = loggedOutRetryDelay(entry.loggedOutAttempts - 1);
          entry.status = 'disconnected';
          console.log(`[baileys][${schoolId}] ⚠️ 401 (tentative ${entry.loggedOutAttempts}/${MAX_LOGGED_OUT_RETRIES}) — retry dans ${delay}ms (auth conservé)`);
          setTimeout(() => startSession(schoolId, { onIncoming }), delay);
          return;
        }

        // Trop d'échecs → on s'arrête mais SANS purger l'auth.
        // L'admin pourra relancer manuellement via le bouton "Reconnecter"
        // (qui rappelle startSession), ou cliquer "Déconnecter" pour purger.
        entry.status = 'needs_reconnect';
        console.warn(`[baileys][${schoolId}] ❌ ${MAX_LOGGED_OUT_RETRIES} tentatives 401 échouées — pause. Auth files conservés. Admin doit relancer.`);
        await supabaseAdmin
          .from('whatsapp_school_sessions')
          .update({ status: 'needs_reconnect' })
          .eq('school_id', schoolId);
        return;
      }

      // Reconnexion avec backoff pour les erreurs réseau / 408 timeouts
      entry.status = 'disconnected';
      entry.sock = null;
      entry.reconnectAttempts += 1;
      const delay = reconnectDelay(entry.reconnectAttempts);
      console.log(`[baileys][${schoolId}] Reconnexion dans ${delay}ms (tentative ${entry.reconnectAttempts})`);
      setTimeout(() => startSession(schoolId, { onIncoming }), delay);
    }
  });

  // Messages entrants → callback fourni par le chatbot
  // On loggue TOUS les événements pour faciliter le debug du chatbot.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log(`[baileys][${schoolId}] 📨 messages.upsert type=${type} count=${messages?.length || 0}`);
    if (type !== 'notify') {
      console.log(`[baileys][${schoolId}] ⏭️  Ignoré (type≠notify): ${type}`);
      return;
    }
    for (const msg of messages) {
      const from = msg.key?.remoteJid;
      const fromMe = msg.key?.fromMe;
      const hasContent = !!msg.message;
      console.log(`[baileys][${schoolId}] 📩 from=${from} fromMe=${fromMe} hasMessage=${hasContent}`);
      if (!hasContent || fromMe) {
        console.log(`[baileys][${schoolId}] ⏭️  Filtré (fromMe ou pas de contenu)`);
        continue;
      }
      if (!onIncoming) {
        console.warn(`[baileys][${schoolId}] ⚠️  Pas de onIncoming callback configuré — message ignoré`);
        continue;
      }
      try {
        await onIncoming({ schoolId, msg, sock });
      } catch (e) {
        console.error(`[baileys][${schoolId}] ❌ Erreur handler entrant:`, e.message);
      }
    }
  });

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
 * Code d'appairage (8 caractères) déjà généré pour cette école, le cas échéant.
 */
export function getPairingCode(schoolId) {
  return sockets.get(schoolId)?.pairingCode || null;
}

/**
 * Connexion par CODE (alternative au QR) — utile quand le scan échoue (iPhone).
 * L'utilisateur saisit ce code dans WhatsApp → Appareils connectés →
 * « Lier avec numéro de téléphone ».
 * @param {string} schoolId
 * @param {string} phone  numéro complet au format international (avec ou sans +)
 */
export async function requestPairingCode(schoolId, phone, { onIncoming } = {}) {
  if (!schoolId) throw new Error('schoolId requis');
  const clean = String(phone || '').replace(/[^\d]/g, '');
  if (clean.length < 8) {
    throw new Error('Numéro invalide. Utilisez le format international, ex : 2126XXXXXXXX');
  }

  let entry = getEntry(schoolId);
  if (entry.status === 'connected') throw new Error('Session déjà connectée');

  // Démarre la session si le socket n'est pas actif
  if (!entry.sock || !['connecting', 'qr'].includes(entry.status)) {
    await startSession(schoolId, { onIncoming });
    entry = getEntry(schoolId);
  }
  const sock = entry.sock;
  if (!sock) throw new Error('Impossible de démarrer la session');
  if (sock.authState?.creds?.registered) throw new Error('Numéro déjà appairé');

  // Le WebSocket doit être ouvert avant requestPairingCode → on réessaie ~12s.
  let code = null;
  let lastErr = null;
  for (let i = 0; i < 8; i++) {
    try {
      code = await sock.requestPairingCode(clean);
      if (code) break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!code) throw lastErr || new Error('Impossible de générer le code, réessayez.');

  entry.pairingCode = code;
  entry.status = 'qr'; // en attente d'appairage (code ou QR)
  console.log(`[baileys][${schoolId}] Code d'appairage généré pour ${clean}`);
  return code;
}

/**
 * Déconnexion volontaire DÉCLENCHÉE PAR L'ADMIN → invalide côté téléphone
 * ET purge les credentials. C'est le SEUL endroit qui supprime les fichiers
 * d'auth — toute autre déconnexion (401, 408, 515, network) conserve l'auth
 * pour permettre la reconnexion automatique sans nouveau scan QR.
 */
export async function logoutSession(schoolId) {
  const entry = sockets.get(schoolId);
  // Marque l'opération comme un logout admin pour que l'event 'close'
  // ne déclenche PAS de reconnexion automatique.
  if (entry) entry.adminLogout = true;
  if (entry?.sock) {
    try {
      await entry.sock.logout();
    } catch (e) {
      console.warn(`[baileys][${schoolId}] Logout error:`, e.message);
    }
  }
  // Purge auth + état (uniquement sur action admin explicite)
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

  // En plus des sessions enregistrées en DB, on tente aussi de bootstrapper
  // toute école qui a un dossier d'auth sur le filesystem (cas où la session
  // s'est déconnectée avec needs_reconnect mais l'auth a été conservée).
  const dbSchoolIds = new Set((rows || []).map(r => r.school_id));
  const fsSchoolIds = [];
  try {
    if (fs.existsSync(AUTH_ROOT)) {
      for (const entry of fs.readdirSync(AUTH_ROOT)) {
        const dir = path.join(AUTH_ROOT, entry);
        if (fs.statSync(dir).isDirectory()) fsSchoolIds.push(entry);
      }
    }
  } catch {}

  const allIds = new Set([...dbSchoolIds, ...fsSchoolIds]);
  for (const schoolId of allIds) {
    const authDir = path.join(AUTH_ROOT, String(schoolId));
    if (!fs.existsSync(authDir)) continue; // pas encore appairé
    try {
      console.log(`[baileys] bootstrap ${schoolId} (auth présent)`);
      await startSession(schoolId, { onIncoming });
    } catch (e) {
      console.error(`[baileys] bootstrap ${schoolId}:`, e.message);
    }
  }
}
