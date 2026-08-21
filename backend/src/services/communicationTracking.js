/**
 * Tracking des communications parents (WhatsApp + push in-app).
 *
 * Alimente les colonnes de suivi de whatsapp_message_recipients :
 *   - delivered_at / read_at ('whatsapp')  ← accusés de l'API Cloud (✓✓)
 *   - read_at ('app')                      ← notification in-app marquée lue
 *   - responded_at ('whatsapp')            ← message entrant du parent
 *
 * Toutes les fonctions sont best-effort : une erreur de tracking ne doit
 * jamais casser l'envoi/réception du message lui-même.
 */

import { supabaseAdmin } from '../config/supabase.js';

// Fenêtre pendant laquelle un message entrant compte comme « réponse »
// à un envoi précédent.
const RESPONSE_WINDOW_DAYS = 7;

/**
 * Accusé WhatsApp pour un message sortant (statuts du webhook Cloud API ou
 * webhook statuses de la Cloud API).
 * @param {string} providerMsgId  id du message chez le provider
 * @param {'delivered'|'read'} kind
 */
export async function markWaAck(providerMsgId, kind) {
  if (!providerMsgId) return;
  try {
    const now = new Date().toISOString();
    const { data: rows } = await supabaseAdmin
      .from('whatsapp_message_recipients')
      .select('id, delivered_at, read_at')
      .eq('provider_msg_id', String(providerMsgId))
      .limit(5);
    if (!rows?.length) return; // pas un message du hub (chatbot, rapport…)

    for (const row of rows) {
      const patch = {};
      if (!row.delivered_at) patch.delivered_at = now;
      if (kind === 'read' && !row.read_at) {
        patch.read_at = now;
        patch.read_channel = 'whatsapp';
      }
      if (Object.keys(patch).length) {
        await supabaseAdmin.from('whatsapp_message_recipients').update(patch).eq('id', row.id);
      }
    }
  } catch (e) {
    console.error('[commTracking] markWaAck:', e.message);
  }
}

/**
 * Le parent a envoyé un message WhatsApp → marque « répondu » (et « lu »)
 * ses envois récents encore sans réponse.
 * @param {{ parentId?: string, phone?: string }} p
 */
export async function markResponded({ parentId, phone }) {
  if (!parentId && !phone) return;
  try {
    const since = new Date(Date.now() - RESPONSE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();
    let q = supabaseAdmin
      .from('whatsapp_message_recipients')
      .select('id, read_at')
      .is('responded_at', null)
      .gte('created_at', since)
      .limit(50);
    q = parentId ? q.eq('parent_id', parentId) : q.eq('phone_e164', phone);
    const { data: rows } = await q;
    if (!rows?.length) return;

    const now = new Date().toISOString();
    const ids = rows.map((r) => r.id);
    await supabaseAdmin
      .from('whatsapp_message_recipients')
      .update({ responded_at: now, response_channel: 'whatsapp' })
      .in('id', ids);
    // Répondre implique avoir vu le message
    const unreadIds = rows.filter((r) => !r.read_at).map((r) => r.id);
    if (unreadIds.length) {
      await supabaseAdmin
        .from('whatsapp_message_recipients')
        .update({ read_at: now, read_channel: 'whatsapp' })
        .in('id', unreadIds);
    }
  } catch (e) {
    console.error('[commTracking] markResponded:', e.message);
  }
}

/**
 * Des notifications in-app viennent d'être marquées lues → propage la lecture
 * aux destinataires de communications liés (canal 'app').
 * @param {string[]} notificationIds
 */
export async function markNotificationsRead(notificationIds) {
  const ids = (notificationIds || []).filter(Boolean);
  if (!ids.length) return;
  try {
    await supabaseAdmin
      .from('whatsapp_message_recipients')
      .update({ read_at: new Date().toISOString(), read_channel: 'app' })
      .in('notification_id', ids)
      .is('read_at', null);
  } catch (e) {
    console.error('[commTracking] markNotificationsRead:', e.message);
  }
}
