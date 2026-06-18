/**
 * Routeur de notifications — choisit le canal le moins cher qui atteint le parent.
 *
 * Priorité :
 *   1. Le parent a l'app (abonnement push actif) → PUSH (gratuit)
 *   2. Sinon, et pas d'opt-out WhatsApp           → WhatsApp (payant / Baileys)
 *   3. Sinon (opt-out + pas d'app)                → rien (dispo à l'ouverture de l'app)
 *
 * « A l'app »      = au moins une ligne dans push_subscriptions (user_id = parent_id).
 * « Opt-out WA »   = parent_contacts.consent_status = 'opted_out' (canal whatsapp).
 */

import { supabaseAdmin } from '../config/supabase.js';
import { sendPushToUser, isPushConfigured } from './webPush.js';
import { sendText } from './whatsapp/index.js';

/** Le parent a-t-il installé l'app (abonnement push actif) ? */
export async function parentHasApp(parentId) {
  if (!isPushConfigured() || !parentId) return false;
  const { data } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', parentId)
    .limit(1);
  return !!(data && data.length);
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
export async function routeNotification({ parentId, schoolId, phone, push, whatsappText, whatsappSend }) {
  // 1. App installée → push gratuit
  if (push && await parentHasApp(parentId)) {
    try {
      const r = await sendPushToUser(parentId, push);
      if (r.sent > 0) return { channel: 'push', success: true };
    } catch (e) {
      console.warn('[notificationRouter] push échoué, fallback WhatsApp:', e.message);
    }
  }

  // 2. WhatsApp sauf opt-out
  if (phone && !(await whatsappOptedOut(parentId))) {
    const r = whatsappSend
      ? await whatsappSend()
      : await sendText(schoolId, phone, whatsappText);
    return { channel: 'whatsapp', success: !!r?.success, raw: r };
  }

  // 3. Opt-out sans app → rien à envoyer (le contenu reste consultable dans l'app)
  return { channel: 'optout', success: false };
}
