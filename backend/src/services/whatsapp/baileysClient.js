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
import { markWaAck } from '../communicationTracking.js';
import { ensureWarmupStarted, resetWarmup } from './antiBan.js';

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
// passer en état needs_reconnect que le watchdog / l'admin pourra relancer).
const MAX_LOGGED_OUT_RETRIES = 6;

/**
 * Version de WhatsApp Web annoncée au serveur, mise en cache.
 *
 * `fetchLatestBaileysVersion()` interroge raw.githubusercontent.com à CHAQUE
 * démarrage de session. Avec cinq écoles et des boucles de reconnexion, ça
 * fait des dizaines d'appels à GitHub par heure ; une fois limité ou
 * injoignable, la fonction retombe SILENCIEUSEMENT sur la version figée dans
 * la bibliothèque (`isLatest: false`). Annoncer une version de WhatsApp Web
 * périmée est précisément ce qui distingue un client automatisé d'un vrai
 * navigateur. On interroge donc une fois toutes les 6 h, et on trace
 * explicitement le cas où la version n'est pas à jour.
 */
const VERSION_TTL_MS = 6 * 3600_000;
let versionCache = { version: null, fetchedAt: 0 };

const getWaWebVersion = async () => {
  if (versionCache.version && Date.now() - versionCache.fetchedAt < VERSION_TTL_MS) {
    return versionCache.version;
  }
  const { version, isLatest } = await fetchLatestBaileysVersion();
  if (!isLatest) {
    console.warn(`[baileys] ⚠️ version WhatsApp Web non vérifiée (GitHub injoignable) — repli sur ${version.join('.')}`);
  } else {
    console.log(`[baileys] version WhatsApp Web ${version.join('.')}`);
  }
  versionCache = { version, fetchedAt: Date.now() };
  return version;
};

/**
 * Dernière opération demandée au socket, par école.
 *
 * Quand WhatsApp coupe la connexion, le log disait seulement
 * « Déconnecté code=428 » — sans jamais indiquer ce que l'application était en
 * train de faire. Impossible de distinguer une coupure réseau d'un appel qui
 * déplaît au serveur. On mémorise donc la dernière opération et on la joint au
 * message de déconnexion.
 */
export function markOp(schoolId, label) {
  const entry = sockets.get(schoolId);
  if (entry) entry.lastOp = { label, at: Date.now() };
}

const describeLastOp = (entry) => {
  if (!entry?.lastOp) return 'aucune';
  const ago = Math.round((Date.now() - entry.lastOp.at) / 1000);
  return `${entry.lastOp.label} il y a ${ago}s`;
};

// Passe à true dès qu'un SIGINT/SIGTERM arrive : plus aucune reconnexion n'est
// planifiée, sinon on recréerait des sockets pendant que le process s'éteint —
// c'est exactement ce qui laisse des credentials à moitié écrits sur le disque
// (cause majeure des 401 « loggedOut » au redémarrage suivant).
let shuttingDown = false;

/**
 * Planifie une reconnexion en gardant une référence sur le timer, pour pouvoir
 * l'annuler à l'arrêt du process. Un seul timer par école à la fois.
 */
const scheduleRestart = (schoolId, delay, onIncoming) => {
  if (shuttingDown) return;
  const entry = getEntry(schoolId);
  if (entry.retryTimer) clearTimeout(entry.retryTimer);
  entry.retryTimer = setTimeout(() => {
    entry.retryTimer = null;
    startSession(schoolId, { onIncoming });
  }, delay);
};

/**
 * Détruit proprement un socket existant AVANT d'en recréer un nouveau.
 *
 * ⚠️ Cause racine majeure des déconnexions « 401 / device_removed / conflict » :
 * lors d'un `connection.close`, l'ancien socket n'était pas démonté → ses
 * listeners restaient actifs et, si le WebSocket n'était pas totalement fermé,
 * on se retrouvait avec DEUX sockets sur le même numéro. WhatsApp détecte alors
 * un doublon d'appareil et force le logout du numéro (cf. issue Baileys #2110).
 *
 * On retire tous les listeners et on ferme le WebSocket sans envoyer de logout
 * (logout = invalidation côté téléphone → réservé à logoutSession()).
 */
function destroySocket(sock) {
  if (!sock) return;
  try { sock.ev.removeAllListeners('connection.update'); } catch {}
  try { sock.ev.removeAllListeners('creds.update'); } catch {}
  try { sock.ev.removeAllListeners('messages.upsert'); } catch {}
  // end() ferme le WebSocket sans déclencher de logout côté serveur WhatsApp.
  try { sock.end?.(undefined); } catch {}
  try { sock.ws?.close?.(); } catch {}
}

/**
 * Démarre (ou redémarre) une session pour une école.
 */
export async function startSession(schoolId, { onIncoming } = {}) {
  if (!schoolId) throw new Error('schoolId requis');
  if (shuttingDown) return getEntry(schoolId);
  const entry = getEntry(schoolId);

  // Déjà en cours
  if (entry.sock && (entry.status === 'connecting' || entry.status === 'connected' || entry.status === 'qr')) {
    return entry;
  }

  // Verrou anti-reconnexions parallèles : si un startSession est déjà en train
  // de créer un socket pour cette école, on n'en lance pas un second. Deux
  // sockets concurrents sur le même numéro = conflit → logout forcé par WhatsApp.
  if (entry.starting) {
    console.log(`[baileys][${schoolId}] startSession déjà en cours — ignoré (anti-doublon)`);
    return entry;
  }
  entry.starting = true;

  // Démonte tout socket résiduel (close partiel, reconnexion manuelle…) avant
  // d'en créer un nouveau, pour ne jamais avoir 2 sockets actifs en parallèle.
  if (entry.sock) {
    destroySocket(entry.sock);
    entry.sock = null;
  }

  entry.status = 'connecting';
  entry.lastError = null;

  let state, saveCreds, version;
  try {
    const authDir = ensureAuthDir(schoolId);
    ({ state, saveCreds } = await useMultiFileAuthState(authDir));
    version = await getWaWebVersion();
  } catch (e) {
    // Init échouée (lecture auth, fetch version réseau…) : on libère le verrou
    // pour ne pas laisser l'école bloquée, et on replanifie une reconnexion.
    entry.starting = false;
    entry.status = 'disconnected';
    entry.lastError = e.message;
    entry.reconnectAttempts = (entry.reconnectAttempts || 0) + 1;
    const delay = reconnectDelay(entry.reconnectAttempts);
    console.error(`[baileys][${schoolId}] Échec init (${e.message}) — retry dans ${delay}ms`);
    scheduleRestart(schoolId, delay, onIncoming);
    return entry;
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    // `printQRInTerminal` a été SUPPRIMÉ de Baileys 7 (marqué @deprecated dans
    // les types) : le QR passe uniquement par l'event connection.update, que
    // l'on convertit déjà en data-URL pour l'interface admin.
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
  // Verrou levé : le socket est créé, ses listeners sont posés juste après.
  entry.starting = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Ignore tout event provenant d'un socket périmé : si entre-temps un nouveau
    // socket a été créé pour cette école, `entry.sock` ne pointe plus sur celui-ci.
    // Sans ce garde, un ancien socket en cours de fermeture pouvait planifier
    // une 2e reconnexion en parallèle (→ conflit / logout forcé).
    if (entry.sock !== sock) return;

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
      // Le compteur 401 doit repartir de zéro après une reconnexion réussie :
      // sans ça, un 401 isolé des semaines plus tard tombait déjà sur un
      // compteur épuisé et parquait la session sans réessayer une seule fois.
      entry.loggedOutAttempts = 0;
      entry.reconnectNotified = false;
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

      // Démarre la montée en charge si elle ne l'est pas déjà. Sans cet appel
      // `warmup_started_at` restait NULL pour tout le monde et le plafond
      // journalier serait figé à vie sur celui du premier jour.
      await ensureWarmupStarted(schoolId);

      // Un même numéro WhatsApp appairé à DEUX écoles = deux appareils
      // concurrents sur un seul compte. WhatsApp en éjecte un (401), le
      // watchdog le relance, il éjecte l'autre : va-et-vient sans fin qui
      // finit par faire bannir le numéro.
      await detectNumberConflict(schoolId, me);
    }

    if (connection === 'close') {
      const wasConnected = entry.status === 'connected';
      const code = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : null;
      const isLoggedOut = code === DisconnectReason.loggedOut;
      const isBanned = code === DisconnectReason.forbidden || code === 403;
      // 515 = restartRequired : signal normal de WhatsApp juste après le scan du QR,
      // le socket doit être recréé immédiatement pour finaliser le pairing.
      const isRestartRequired = code === DisconnectReason.restartRequired || code === 515;

      entry.lastError = lastDisconnect?.error?.message || `code=${code}`;
      console.warn(
        `[baileys][${schoolId}] Déconnecté code=${code} loggedOut=${isLoggedOut} banned=${isBanned} ` +
        `restartRequired=${isRestartRequired} | dernière opération: ${describeLastOp(entry)} | ` +
        `motif: ${entry.lastError}`
      );

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
        scheduleRestart(schoolId, 3000, onIncoming);
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
          scheduleRestart(schoolId, delay, onIncoming);
          return;
        }

        // Trop d'échecs → on s'arrête mais SANS purger l'auth.
        // L'admin pourra relancer manuellement via le bouton "Reconnecter"
        // (qui rappelle startSession), ou cliquer "Déconnecter" pour purger.
        entry.status = 'needs_reconnect';
        console.warn(`[baileys][${schoolId}] ❌ ${MAX_LOGGED_OUT_RETRIES} tentatives 401 échouées — pause. Le watchdog réessaiera, l'admin peut aussi relancer.`);
        await supabaseAdmin
          .from('whatsapp_school_sessions')
          .update({ status: 'needs_reconnect' })
          .eq('school_id', schoolId);
        await notifyAdminsSessionDown(schoolId, entry);
        return;
      }

      // Reconnexion avec backoff pour les erreurs réseau / 408 timeouts
      entry.status = 'disconnected';
      entry.sock = null;
      entry.reconnectAttempts += 1;
      // La base restait figée sur « connected » tant qu'il n'y avait ni ban ni
      // 401 : l'interface annonçait une session vivante alors que le socket
      // était tombé. On écrit une seule fois, au décrochage.
      if (wasConnected) {
        await supabaseAdmin
          .from('whatsapp_school_sessions')
          .update({ status: 'disconnected' })
          .eq('school_id', schoolId);
      }
      const delay = reconnectDelay(entry.reconnectAttempts);
      console.log(`[baileys][${schoolId}] Reconnexion dans ${delay}ms (tentative ${entry.reconnectAttempts})`);
      scheduleRestart(schoolId, delay, onIncoming);
    }
  });

  // Messages entrants → callback fourni par le chatbot
  // On loggue TOUS les événements pour faciliter le debug du chatbot.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Ignore les messages d'un socket périmé (remplacé par une reconnexion).
    if (entry.sock !== sock) return;
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

  // Accusés de remise/lecture de NOS messages (✓✓ / ✓✓ bleu) → tracking
  // des communications (delivered_at / read_at). Statuts Baileys :
  // 3 = DELIVERY_ACK (remis), 4 = READ (lu), 5 = PLAYED (audio écouté).
  sock.ev.on('messages.update', async (updates) => {
    if (entry.sock !== sock) return;
    for (const u of updates || []) {
      try {
        const status = u.update?.status;
        if (!u.key?.fromMe || !u.key?.id || typeof status !== 'number') continue;
        if (status >= 4) await markWaAck(u.key.id, 'read');
        else if (status === 3) await markWaAck(u.key.id, 'delivered');
      } catch (e) {
        console.error(`[baileys][${schoolId}] ack update:`, e.message);
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
    // Démontage propre des listeners + WebSocket après le logout.
    destroySocket(entry.sock);
    entry.sock = null;
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
    markOp(schoolId, `onWhatsApp ${phone}`);
    const [result] = await sock.onWhatsApp(jid);
    return result?.exists ? result.jid : null;
  } catch {
    return null;
  }
}


/**
 * Repère un numéro WhatsApp partagé par deux écoles et fait céder la plus
 * ancienne.
 *
 * Aucun garde n'existait à ce niveau : la protection anti-doublon de socket
 * agit PAR ÉCOLE (`entry.starting`, `destroySocket`), elle ne voyait donc pas
 * deux écoles différentes réclamant le même compte WhatsApp.
 *
 * Arbitrage : la connexion qui vient de s'ouvrir gagne — c'est le résultat de
 * l'action humaine la plus récente, un scan de QR. L'autre école est mise en
 * `conflict`, ce qui la sort du va-et-vient : le watchdog ignore cet état, elle
 * ne se reconnectera donc plus tant qu'un administrateur n'aura pas tranché.
 */
async function detectNumberConflict(schoolId, phone) {
  if (!phone) return;
  try {
    const { data: others } = await supabaseAdmin
      .from('whatsapp_school_sessions')
      .select('school_id, phone_number')
      .eq('phone_number', phone)
      .neq('school_id', schoolId);
    if (!others || others.length === 0) return;

    for (const other of others) {
      console.error(
        `[baileys][${schoolId}] ⚠️ CONFLIT DE NUMÉRO : ${phone} est aussi appairé à l'école ` +
        `${other.school_id}. Deux appareils sur un même compte WhatsApp = éjection mutuelle (401) ` +
        `en boucle, et risque de bannissement. L'école ${other.school_id} est mise en pause.`
      );

      const otherEntry = sockets.get(other.school_id);
      if (otherEntry) {
        if (otherEntry.retryTimer) { clearTimeout(otherEntry.retryTimer); otherEntry.retryTimer = null; }
        if (otherEntry.sock) destroySocket(otherEntry.sock);
        otherEntry.sock = null;
        otherEntry.status = 'conflict';
        otherEntry.lastError = `Numéro ${phone} déjà utilisé par une autre école`;
      }

      await supabaseAdmin
        .from('whatsapp_school_sessions')
        .update({ status: 'conflict' })
        .eq('school_id', other.school_id);

      await notifyAdminsNumberConflict(other.school_id, phone);
    }
  } catch (e) {
    console.error(`[baileys][${schoolId}] détection de conflit de numéro :`, e.message);
  }
}

/** Prévient les admins de l'école mise en pause pour cause de numéro partagé. */
async function notifyAdminsNumberConflict(schoolId, phone) {
  try {
    const { data: admins } = await supabaseAdmin
      .from('profiles').select('id').eq('school_id', schoolId)
      .in('role', ['admin', 'school_admin']);
    if (!admins || admins.length === 0) return;
    await supabaseAdmin.from('notifications').insert(
      admins.map((a) => ({
        user_id: a.id,
        title: 'WhatsApp : numéro déjà utilisé',
        message: `Le numéro ${phone} vient d'être appairé à une autre école. Une même ligne WhatsApp ne peut pas servir deux établissements : les deux se déconnecteraient en boucle. Appairez un numéro distinct depuis Communication → Connexion.`,
        type: 'system',
        school_id: schoolId,
        data: { kind: 'whatsapp_number_conflict', phone },
      }))
    );
  } catch (e) {
    console.error(`[baileys][${schoolId}] alerte conflit :`, e.message);
  }
}

/**
 * Prévient les administrateurs de l'école qu'il faut rescanner le QR.
 *
 * Un 401 épuisé n'est PAS rattrapable automatiquement : WhatsApp a invalidé les
 * credentials, seul un nouveau scan les rétablit. Sans cette alerte, personne
 * n'était au courant tant qu'un admin n'ouvrait pas la page Connexion — les
 * messages partaient en échec pendant des jours.
 *
 * Une seule notification par épisode (`reconnectNotified`), remise à zéro à la
 * prochaine connexion réussie.
 */
async function notifyAdminsSessionDown(schoolId, entry) {
  if (entry.reconnectNotified) return;
  entry.reconnectNotified = true;
  try {
    // Anti-doublon inter-redémarrages : l'état en mémoire repart de zéro à
    // chaque boot, mais l'école n'a pas besoin d'une alerte par redémarrage.
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('data->>kind', 'whatsapp_session_down')
      .gte('created_at', since);
    if (count && count > 0) return;

    const { data: admins } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('school_id', schoolId)
      .in('role', ['admin', 'school_admin']);
    if (!admins || admins.length === 0) return;
    await supabaseAdmin.from('notifications').insert(
      admins.map((a) => ({
        user_id: a.id,
        title: 'WhatsApp déconnecté',
        message: "La session WhatsApp de l'école n'est plus valide. Ouvrez Communication → Connexion et rescannez le QR code pour rétablir l'envoi des messages.",
        type: 'system',
        school_id: schoolId,
        data: { kind: 'whatsapp_session_down', school_id: schoolId },
      }))
    );
    console.log(`[baileys][${schoolId}] Admins prévenus : QR à rescanner`);
  } catch (e) {
    console.error(`[baileys][${schoolId}] Alerte admin échouée:`, e.message);
  }
}

/**
 * Arrêt propre du process (SIGINT/SIGTERM, redéploiement pm2).
 *
 * Sans ça, le process était tué avec ses WebSockets ouverts et, si un
 * `creds.update` était en cours d'écriture, le fichier restait tronqué :
 * au démarrage suivant WhatsApp refusait les credentials (401) et la session
 * était perdue pour de bon. On ferme les sockets SANS logout (l'appairage côté
 * téléphone reste valide) puis on laisse le disque se vider.
 */
export async function shutdownAllSessions() {
  shuttingDown = true;
  for (const [schoolId, entry] of sockets.entries()) {
    if (entry.retryTimer) { clearTimeout(entry.retryTimer); entry.retryTimer = null; }
    if (entry.sock) {
      destroySocket(entry.sock);
      entry.sock = null;
    }
    entry.status = 'disconnected';
    console.log(`[baileys][${schoolId}] socket fermé proprement (arrêt du serveur)`);
  }
  // Laisse le temps aux écritures d'auth en cours d'atteindre le disque.
  await new Promise((r) => setTimeout(r, 800));
}

/**
 * Surveillance périodique des sessions.
 *
 * Le backoff intégré couvre les coupures réseau, mais une session parquée en
 * `needs_reconnect` ne réessayait plus JAMAIS jusqu'au redémarrage du process.
 * Le watchdog relance UNE tentative par passage : si le 401 persiste, la
 * session repart aussitôt en `needs_reconnect` (compteur déjà au maximum) au
 * lieu de rejouer un cycle complet de 6 essais.
 */
export function startSessionWatchdog(onIncoming, intervalMs = 15 * 60_000) {
  setInterval(async () => {
    if (shuttingDown) return;
    let dirs = [];
    try {
      if (fs.existsSync(AUTH_ROOT)) dirs = fs.readdirSync(AUTH_ROOT);
    } catch { return; }
    for (const schoolId of dirs) {
      const entry = sockets.get(schoolId);

      // Aucune entrée en mémoire alors que l'auth existe sur le disque : le
      // bootstrap du démarrage a échoué pour cette école (Supabase injoignable,
      // erreur réseau). Sans ce rattrapage elle restait muette jusqu'au
      // redémarrage suivant.
      if (!entry) {
        console.log(`[baileys][${schoolId}] watchdog : jamais démarrée — démarrage`);
        try { await startSession(schoolId, { onIncoming }); }
        catch (e) { console.error(`[baileys][${schoolId}] watchdog:`, e.message); }
        continue;
      }

      // Session vivante, en cours d'appairage, bannie ou déconnectée par
      // l'admin : on ne touche à rien.
      // 'conflict' : numéro partagé avec une autre école. Relancer relancerait
      // le va-et-vient d'éjections — un humain doit d'abord changer de numéro.
      if (['connected', 'connecting', 'qr', 'banned', 'conflict'].includes(entry.status)) continue;
      if (entry.adminLogout) continue;
      // Une reconnexion est déjà planifiée par le backoff : on la laisse faire.
      if (entry.retryTimer) continue;
      console.log(`[baileys][${schoolId}] watchdog : session ${entry.status} — nouvelle tentative`);
      entry.loggedOutAttempts = MAX_LOGGED_OUT_RETRIES;
      try { await startSession(schoolId, { onIncoming }); }
      catch (e) { console.error(`[baileys][${schoolId}] watchdog:`, e.message); }
    }
  }, intervalMs).unref?.();
}


/**
 * Indique si des credentials existent sur le disque pour cette école.
 */
export function hasAuthState(schoolId) {
  try {
    return fs.existsSync(path.join(AUTH_ROOT, String(schoolId), 'creds.json'));
  } catch {
    return false;
  }
}

/**
 * Repart d'un appairage NEUF : purge les credentials puis relance une session.
 *
 * POURQUOI C'EST INDISPENSABLE
 * ----------------------------
 * Baileys n'émet un QR que s'il n'a AUCUN credential enregistré. Tant que
 * creds.json est là, il tente de se connecter avec — et si WhatsApp les a
 * invalidés (401 à répétition), il boucle sur l'échec sans jamais produire de
 * QR. L'écran « Scannez le QR code » tournait donc indéfiniment : la seule
 * façon d'obtenir un nouveau code est de supprimer d'abord l'ancien appairage.
 *
 * À la différence de logoutSession(), on n'appelle PAS sock.logout() : il
 * s'adresse au serveur WhatsApp pour délier l'appareil, ce qui échoue (ou
 * traîne) sur une session déjà morte. L'appareil est de toute façon déjà
 * invalide côté téléphone. On garde aussi la ligne whatsapp_school_sessions,
 * pour ne pas perdre le rattachement de l'école à son numéro.
 */
export async function resetForPairing(schoolId, { onIncoming } = {}) {
  const entry = sockets.get(schoolId);
  if (entry) {
    if (entry.retryTimer) { clearTimeout(entry.retryTimer); entry.retryTimer = null; }
    if (entry.sock) destroySocket(entry.sock);
  }
  sockets.delete(schoolId);

  try {
    fs.rmSync(path.join(AUTH_ROOT, String(schoolId)), { recursive: true, force: true });
    console.log(`[baileys][${schoolId}] credentials purgés — réappairage demandé`);
  } catch (e) {
    console.error(`[baileys][${schoolId}] purge auth:`, e.message);
  }

  await supabaseAdmin
    .from('whatsapp_school_sessions')
    .update({ status: 'disconnected' })
    .eq('school_id', schoolId);

  // Nouveau scan de QR = nouvel appareil lié aux yeux de WhatsApp : le numéro
  // perd le bénéfice de son historique et doit remonter en charge doucement.
  await resetWarmup(schoolId);

  return startSession(schoolId, { onIncoming });
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
