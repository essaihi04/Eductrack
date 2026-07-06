// Service de notifications push web (VAPID).
// Réutilisable pour transport, devoirs, alertes, etc.
import webpush from 'web-push';
import { supabaseAdmin } from '../config/supabase.js';
import { sendFcmToUser } from './fcmPush.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@eductrack.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[WebPush] VAPID keys not configured. Push notifications disabled.');
}

export const isPushConfigured = () => Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
export const getVapidPublicKey = () => VAPID_PUBLIC_KEY || null;

// Logo + nom de l'école d'un utilisateur (cache 1 h) : logo affiché en icône
// de la notification (web + icône ronde Android), nom en sous-titre (Android).
const _schoolCache = new Map(); // user_id -> { logo, name, ts }
const SCHOOL_TTL = 60 * 60 * 1000;
async function schoolInfoForUser(userId) {
  const hit = _schoolCache.get(userId);
  if (hit && Date.now() - hit.ts < SCHOOL_TTL) return hit;
  const info = { logo: null, name: null, ts: Date.now() };
  try {
    const { data: prof } = await supabaseAdmin
      .from('profiles').select('school_id').eq('id', userId).maybeSingle();
    if (prof?.school_id) {
      const { data: school } = await supabaseAdmin
        .from('schools').select('logo_url, name').eq('id', prof.school_id).maybeSingle();
      info.logo = school?.logo_url || null;
      info.name = school?.name || null;
    }
  } catch { /* facultatif */ }
  _schoolCache.set(userId, info);
  return info;
}

/** Envoi Web Push seul (navigateur / PWA). */
async function sendWebPushToUser(userId, payload) {
  if (!isPushConfigured() || !userId) return 0;

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subs?.length) return 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag,
    icon: payload.icon || '/icon-192.png',
    ...(payload.image ? { image: payload.image } : {})
  });

  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth }
      }, body);
      sent++;
    } catch (e) {
      // Subscription expirée → suppression
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabaseAdmin.from('push_subscriptions').delete().eq('id', s.id);
      } else {
        console.error('[WebPush] send error:', e.statusCode, e.body);
      }
    }
  }));

  return sent;
}

/**
 * Envoie une notification à un utilisateur sur TOUS ses canaux app :
 * Web Push (navigateur/PWA) ET push natif FCM (app Capacitor installée).
 * Point d'entrée unique — tous les appelants (transport, communications,
 * WhatsApp, routeur) passent par ici et couvrent donc les deux canaux.
 * @param {string} userId
 * @param {{ title: string, body: string, url?: string, tag?: string, icon?: string }} payload
 */
export async function sendPushToUser(userId, payload) {
  if (!userId) return { sent: 0 };
  // Identité de l'école dans la notification : logo (icône web + icône ronde
  // Android via SchoolMessagingService) et nom (sous-titre Android).
  const school = await schoolInfoForUser(userId);
  const p = {
    ...payload,
    icon: payload.icon || school.logo || undefined,
    logo: payload.logo || school.logo || undefined,
    schoolName: payload.schoolName || school.name || undefined,
  };
  const [web, native] = await Promise.all([
    sendWebPushToUser(userId, p).catch(() => 0),
    sendFcmToUser(userId, p).catch(() => ({ sent: 0 })),
  ]);
  return { sent: web + (native.sent || 0) };
}

export async function sendPushToUsers(userIds, payload) {
  let total = 0;
  for (const uid of userIds) {
    const { sent } = await sendPushToUser(uid, payload);
    total += sent;
  }
  return { sent: total };
}
