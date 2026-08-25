// Push NATIF via Firebase Cloud Messaging (app Capacitor Android/iOS).
// Complémentaire de webPush.js (navigateur/PWA). Le backend envoie à FCM avec
// le compte de service Firebase (clé privée fournie via variable d'environnement).
import fs from 'fs';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { supabaseAdmin } from '../config/supabase.js';
import { isApnsConfigured, sendApnsToTokens } from './apnsPush.js';

let messaging = null;
let configured = false;

// Compte de service, dans l'ordre de priorité :
//   1. FCM_SERVICE_ACCOUNT_JSON — contenu JSON brut OU base64 (idéal PaaS/hébergeur).
//   2. FCM_SERVICE_ACCOUNT_FILE / GOOGLE_APPLICATION_CREDENTIALS — chemin du fichier .json.
function loadServiceAccount() {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON || process.env.FCM_SERVICE_ACCOUNT;
  if (raw) {
    let text = String(raw).trim();
    if (!text.startsWith('{')) {
      // Base64 (pratique pour une variable d'env sur une seule ligne).
      try { text = Buffer.from(text, 'base64').toString('utf8'); } catch { /* ignore */ }
    }
    try { return JSON.parse(text); } catch (e) {
      console.error('[FCM] FCM_SERVICE_ACCOUNT_JSON invalide:', e.message);
      return null;
    }
  }

  const file = process.env.FCM_SERVICE_ACCOUNT_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file) {
    // Chemin relatif résolu depuis le dossier de démarrage du backend.
    const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) {
      console.error('[FCM] lecture du fichier de compte de service échouée:', abs, e.message);
      return null;
    }
  }

  return null;
}

(function init() {
  try {
    const svc = loadServiceAccount();
    if (!svc) {
      console.warn('[FCM] non configuré (FCM_SERVICE_ACCOUNT_JSON absent). Push natif désactivé.');
      return;
    }
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(svc) });
    messaging = getMessaging(app);
    configured = true;
    console.log('[FCM] initialisé pour le projet', svc.project_id);
  } catch (e) {
    console.error('[FCM] initialisation échouée:', e.message);
  }
})();

export const isFcmConfigured = () => configured;

/**
 * Envoie une notification native à tous les appareils d'un utilisateur.
 * @param {string} userId
 * @param {{ title: string, body: string, url?: string, tag?: string }} payload
 */
export async function sendFcmToUser(userId, payload) {
  if (!userId || (!configured && !isApnsConfigured())) return { sent: 0 };

  const { data: rows } = await supabaseAdmin
    .from('device_tokens')
    .select('id, token, platform')
    .eq('user_id', userId);
  if (!rows?.length) return { sent: 0 };

  // iOS parle APNs en direct (jeton APNs brut, illisible par FCM) ; Android et
  // le reste passent par FCM. Cf. apnsPush.js pour le pourquoi.
  const iosTokens = rows.filter((r) => r.platform === 'ios').map((r) => r.token);
  const tokens = rows.filter((r) => r.platform !== 'ios').map((r) => r.token);

  let sentIos = 0;
  if (iosTokens.length) {
    const res = await sendApnsToTokens(iosTokens, payload);
    sentIos = res.sent;
    if (res.stale.length) {
      await supabaseAdmin.from('device_tokens').delete().in('token', res.stale);
    }
  }

  if (!configured || !tokens.length) return { sent: sentIos };

  // Message DATA-ONLY : la notification est construite en natif par
  // SchoolMessagingService (APK) — seul moyen d'afficher le logo de l'école
  // en icône ronde (largeIcon), le nom de l'école en sous-titre, l'image
  // jointe en grand et la sonnerie de cloche. Toutes les valeurs de `data`
  // doivent être des chaînes (contrainte FCM).
  const message = {
    tokens,
    data: {
      title: String(payload.title || 'Bousole'),
      body: String(payload.body || ''),
      url: String(payload.url || '/'),
      ...(payload.tag ? { tag: String(payload.tag) } : {}),
      ...(payload.image ? { image: String(payload.image) } : {}),
      ...(payload.logo ? { logo: String(payload.logo) } : {}),
      ...(payload.schoolName ? { schoolName: String(payload.schoolName) } : {}),
    },
    android: { priority: 'high' },
  };

  let sent = 0;
  const stale = [];
  try {
    const resp = await messaging.sendEachForMulticast(message);
    resp.responses.forEach((r, i) => {
      if (r.success) { sent++; return; }
      const code = r.error?.code || '';
      // Jeton périmé/invalide → suppression pour ne pas réessayer indéfiniment.
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        stale.push(tokens[i]);
      } else {
        console.error('[FCM] envoi échoué:', code, r.error?.message);
      }
    });
  } catch (e) {
    console.error('[FCM] sendEachForMulticast:', e.message);
    return { sent: sentIos };
  }

  if (stale.length) {
    await supabaseAdmin.from('device_tokens').delete().in('token', stale);
  }
  return { sent: sent + sentIos };
}

/** Un utilisateur a-t-il au moins un appareil natif enregistré ? */
export async function userHasDeviceToken(userId) {
  if (!userId || (!configured && !isApnsConfigured())) return false;
  const { data } = await supabaseAdmin
    .from('device_tokens')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  return !!(data && data.length);
}
