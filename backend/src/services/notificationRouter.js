/**
 * Routeur de notifications — choisit le canal le moins cher qui atteint le parent.
 *
 * Priorité :
 *   1. Le parent a l'app (abonnement push actif) → PUSH (gratuit)
 *   2. Sinon, et pas d'opt-out WhatsApp           → WhatsApp (API Cloud, payant)
 *   3. Sinon (opt-out + pas d'app)                → rien (dispo à l'ouverture de l'app)
 *
 * « A l'app »      = au moins une ligne dans push_subscriptions (user_id = parent_id).
 * « Opt-out WA »   = parent_contacts.consent_status = 'opted_out' (canal whatsapp).
 */

import { supabaseAdmin } from '../config/supabase.js';
import { sendPushToUser, isPushConfigured } from './webPush.js';
import { userHasDeviceToken } from './fcmPush.js';
import { sendText } from './whatsapp/index.js';

/** Le parent a-t-il installé l'app ? (abonnement Web Push OU jeton d'appareil natif) */
export async function parentHasApp(parentId) {
  if (!parentId) return false;
  // Web Push (navigateur / PWA)
  if (isPushConfigured()) {
    const { data } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', parentId)
      .limit(1);
    if (data && data.length) return true;
  }
  // Push natif (app Capacitor installée)
  if (await userHasDeviceToken(parentId)) return true;
  return false;
}

/**
 * Le parent a-t-il une fenêtre de service WhatsApp ouverte (< 24 h) ?
 * = il a envoyé un message entrant dans les dernières 24 h → l'envoi WhatsApp
 * est GRATUIT (et autorisé en texte libre, même sur Cloud API).
 */
export async function whatsappWindowOpen(parentId) {
  if (!parentId) return false;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .select('id')
    .eq('parent_id', parentId)
    .gte('created_at', since)
    .limit(1);
  return !!(data && data.length);
}

/** Date du jour en heure du Maroc (YYYY-MM-DD). */
function todayCasa() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });
}

/** Le parent a-t-il cliqué « Je ne veux pas » pour le transport aujourd'hui ? */
export async function isTransportSkippedToday(parentId) {
  if (!parentId) return false;
  const { data } = await supabaseAdmin
    .from('transport_daily_skip')
    .select('parent_id')
    .eq('parent_id', parentId)
    .eq('day', todayCasa())
    .maybeSingle();
  return !!data;
}

/** Marque le parent comme « pas de transport aujourd'hui ». */
export async function setTransportSkipToday(parentId) {
  if (!parentId) return;
  await supabaseAdmin
    .from('transport_daily_skip')
    .upsert({ parent_id: parentId, day: todayCasa() }, { onConflict: 'parent_id,day' });
}

/** Pied de page incitatif ajouté aux WhatsApp des parents SANS app. */
function nudgeFooter() {
  const link = process.env.APP_INSTALL_URL || process.env.PUBLIC_BASE_URL || 'https://etrack.ma';
  return `\n\n━━━━━━━━━━━━━\n📲 Installez l'app pour tout voir *gratuitement* : ${link}\n💬 _Répondez à ce message pour rester en contact gratuit._`;
}

/** Le parent a-t-il refusé les notifications WhatsApp ? */
export async function whatsappOptedOut(parentId) {
  if (!parentId) return false;
  const { data } = await supabaseAdmin
    .from('parent_contacts')
    .select('consent_status')
    .eq('parent_id', parentId)
    .eq('channel', 'whatsapp');
  return (data || []).some((c) => c.consent_status === 'opted_out');
}

/**
 * Marque (ou retire) l'opt-out WhatsApp d'un parent.
 * @param {string} parentId
 * @param {boolean} optedOut  true = ne plus recevoir de WhatsApp
 */
export async function setWhatsappOptOut(parentId, optedOut) {
  const { error } = await supabaseAdmin
    .from('parent_contacts')
    .update({ consent_status: optedOut ? 'opted_out' : 'opted_in' })
    .eq('parent_id', parentId)
    .eq('channel', 'whatsapp');
  if (error) console.error('[notificationRouter] setWhatsappOptOut:', error.message);
  return !error;
}

/**
 * Achemine une notification proactive vers le bon canal.
 * @param {object} p
 * @param {string} p.parentId
 * @param {string} p.schoolId
 * @param {string} p.phone           numéro WhatsApp E.164 (peut être null)
 * @param {object} p.push            payload push { title, body, url?, tag? }
 * @param {string} p.whatsappText    texte WhatsApp (fallback)
 * @param {Function} [p.whatsappSend] envoi WhatsApp custom (ex. avec retry) → { success }
 * @returns {Promise<{ channel: 'push'|'whatsapp'|'optout', success: boolean, raw?: object }>}
 */
export async function routeNotification({ parentId, schoolId, phone, push, whatsappText, nudge = true }) {
  const hasApp = await parentHasApp(parentId);

  // 1. App installée → push gratuit (web + natif, via sendPushToUser)
  if (push && hasApp) {
    try {
      const r = await sendPushToUser(parentId, push);
      if (r.sent > 0) return { channel: 'push', success: true, paid: false };
    } catch (e) {
      console.warn('[notificationRouter] push échoué, fallback WhatsApp:', e.message);
    }
  }

  // 2. WhatsApp sauf opt-out
  if (phone && !(await whatsappOptedOut(parentId))) {
    const free = await whatsappWindowOpen(parentId); // fenêtre 24h ouverte → gratuit
    // Nudge « installez l'app / répondez » uniquement pour les parents sans app.
    let text = whatsappText || '';
    if (nudge && !hasApp) text += nudgeFooter();
    const r = await sendText(schoolId, phone, text);
    return {
      channel: free ? 'whatsapp_free' : 'whatsapp_paid',
      success: !!r?.success,
      paid: !free,
      raw: r,
    };
  }

  // 3. Opt-out sans app → rien à envoyer (le contenu reste consultable dans l'app)
  return { channel: 'optout', success: false, paid: false };
}
