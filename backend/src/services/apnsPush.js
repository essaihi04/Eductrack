// Push NATIF iOS via APNs (Apple Push Notification service), en direct.
//
// Pourquoi pas FCM comme sur Android ? Le plugin @capacitor/push-notifications
// remonte sur iOS un jeton APNs *brut*, pas un jeton FCM : firebase-admin ne sait
// pas l'adresser. Plutôt que d'embarquer le SDK Firebase iOS dans l'app (et un
// GoogleService-Info.plist de plus à maintenir), on parle directement à Apple —
// la clé APNs .p8 est de toute façon indispensable pour publier sur l'App Store.
//
// Variables d'environnement :
//   APNS_KEY_P8    contenu du fichier AuthKey_XXXXXXXXXX.p8 (PEM brut ou base64)
//   APNS_KEY_ID    identifiant de la clé (10 caractères, ex. ABC123DEFG)
//   APNS_TEAM_ID   identifiant d'équipe Apple Developer (10 caractères)
//   APNS_BUNDLE_ID identifiant de l'app (défaut : org.edtrack.app)
//   APNS_ENV       'production' (défaut) ou 'sandbox' pour les builds Xcode/Debug
import http2 from 'http2';
import jwt from 'jsonwebtoken';

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};

function loadKey() {
  const raw = process.env.APNS_KEY_P8 || process.env.APNS_KEY;
  if (!raw) return null;
  let text = String(raw).trim();
  // Base64 (pratique pour une variable d'env sur une seule ligne).
  if (!text.includes('BEGIN PRIVATE KEY')) {
    try { text = Buffer.from(text, 'base64').toString('utf8'); } catch { /* ignore */ }
  }
  // Les hébergeurs qui n'acceptent pas les retours à la ligne : on les restaure.
  text = text.replace(/\\n/g, '\n');
  return text.includes('BEGIN PRIVATE KEY') ? text : null;
}

const key = loadKey();
const keyId = process.env.APNS_KEY_ID || '';
const teamId = process.env.APNS_TEAM_ID || '';
const bundleId = process.env.APNS_BUNDLE_ID || 'org.edtrack.app';
const host = HOSTS[process.env.APNS_ENV === 'sandbox' ? 'sandbox' : 'production'];

const configured = !!(key && keyId && teamId);
if (!configured) {
  console.warn('[APNs] non configuré (APNS_KEY_P8 / APNS_KEY_ID / APNS_TEAM_ID). Push iOS désactivé.');
} else {
  console.log('[APNs] initialisé pour', bundleId, '→', host);
}

export const isApnsConfigured = () => configured;

// Apple refuse un jeton de plus d'1 h et limite la fréquence de renouvellement :
// on le régénère toutes les 50 min.
let cachedJwt = null;
let cachedJwtAt = 0;
function authToken() {
  const now = Date.now();
  if (cachedJwt && now - cachedJwtAt < 50 * 60 * 1000) return cachedJwt;
  cachedJwt = jwt.sign({ iss: teamId, iat: Math.floor(now / 1000) }, key, {
    algorithm: 'ES256',
    header: { alg: 'ES256', kid: keyId },
  });
  cachedJwtAt = now;
  return cachedJwt;
}

// Session HTTP/2 réutilisée entre les envois (Apple pénalise les reconnexions).
let session = null;
function getSession() {
  if (session && !session.closed && !session.destroyed) return session;
  session = http2.connect(host);
  session.on('error', (e) => {
    console.error('[APNs] session:', e.message);
    session = null;
  });
  session.on('close', () => { session = null; });
  return session;
}

function buildPayload(payload) {
  const body = {
    aps: {
      alert: {
        title: String(payload.title || 'Eductrack'),
        body: String(payload.body || ''),
        ...(payload.schoolName ? { subtitle: String(payload.schoolName) } : {}),
      },
      sound: 'default',
      'mutable-content': 1,
    },
    // Données lues par pushNotificationActionPerformed (nativePush.js) au tap.
    url: String(payload.url || '/'),
    ...(payload.tag ? { tag: String(payload.tag) } : {}),
    ...(payload.image ? { image: String(payload.image) } : {}),
    ...(payload.logo ? { logo: String(payload.logo) } : {}),
    ...(payload.schoolName ? { schoolName: String(payload.schoolName) } : {}),
  };
  return Buffer.from(JSON.stringify(body));
}

function sendOne(token, buffer, collapseId) {
  return new Promise((resolve) => {
    let req;
    try {
      req = getSession().request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${authToken()}`,
        'apns-topic': bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        ...(collapseId ? { 'apns-collapse-id': collapseId.slice(0, 64) } : {}),
        'content-type': 'application/json',
        'content-length': buffer.length,
      });
    } catch (e) {
      resolve({ ok: false, stale: false, reason: e.message });
      return;
    }

    let status = 0;
    let raw = '';
    req.setTimeout(10000, () => { req.close(); resolve({ ok: false, stale: false, reason: 'timeout' }); });
    req.on('response', (headers) => { status = Number(headers[':status']) || 0; });
    req.on('data', (chunk) => { raw += chunk; });
    req.on('error', (e) => resolve({ ok: false, stale: false, reason: e.message }));
    req.on('end', () => {
      if (status === 200) { resolve({ ok: true }); return; }
      let reason = raw;
      try { reason = JSON.parse(raw).reason || raw; } catch { /* ignore */ }
      // 410 Gone ou BadDeviceToken → l'app a été désinstallée : jeton à purger.
      const stale = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
      resolve({ ok: false, stale, reason: `${status} ${reason}` });
    });
    req.end(buffer);
  });
}

/**
 * Envoie une notification à une liste de jetons APNs.
 * @param {string[]} tokens
 * @param {{ title: string, body: string, url?: string, tag?: string, image?: string, logo?: string, schoolName?: string }} payload
 * @returns {Promise<{ sent: number, stale: string[] }>}
 */
export async function sendApnsToTokens(tokens, payload) {
  if (!configured || !tokens?.length) return { sent: 0, stale: [] };

  const buffer = buildPayload(payload);
  const results = await Promise.all(tokens.map((t) => sendOne(t, buffer, payload.tag)));

  const stale = [];
  let sent = 0;
  results.forEach((r, i) => {
    if (r.ok) { sent++; return; }
    if (r.stale) { stale.push(tokens[i]); return; }
    console.error('[APNs] envoi échoué:', r.reason);
  });
  return { sent, stale };
}
