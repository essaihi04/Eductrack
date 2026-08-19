// Envoi WhatsApp de masse, exécuté comme job (services/jobs) et REPRENABLE.
//
// Tout l'état nécessaire est en base : la boucle se reconstruit entièrement à
// partir de `whatsapp_messages` et `whatsapp_message_recipients`. Le job ne
// transporte donc qu'un message_id, et une reprise après redémarrage repart
// exactement où l'envoi s'était arrêté — les destinataires déjà servis
// (status = 'sent') sont ignorés.
//
// C'est ce qui manquait avant : la boucle vivait en mémoire du process, et un
// `pm2 restart` en cours d'envoi (un envoi de 300 parents dure plus d'une heure
// à cause des délais anti-ban) perdait tout le reste sans que personne ne le
// sache.

import { supabaseAdmin } from '../../config/supabase.js';
import { sendPushToUser } from '../webPush.js';
import { isSessionReady, sendUnified } from './sendHelpers.js';

export const WHATSAPP_BULK_SEND = 'whatsapp_bulk_send';

/**
 * Refus temporaire d'envoi (hors plage horaire, session en pause anti-ban).
 * Interrompt le job sans marquer les destinataires restants en échec : la
 * reprise repart exactement là où l'envoi s'est arrêté.
 */
class SendSuspended extends Error {}

export async function runBulkSend({ message_id: messageId }, ctx = {}) {
  const touch = ctx.touch || (async () => {});

  const { data: msg, error: msgError } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('id, school_id, message_type, content, media_url, file_name, channels, total_recipients')
    .eq('id', messageId)
    .single();

  if (msgError || !msg) throw new Error(`Message ${messageId} introuvable`);

  const schoolId = msg.school_id;
  const messageType = msg.message_type || 'text';
  const message = msg.content;
  const mediaUrl = msg.media_url;
  const fileName = msg.file_name;
  const channels = msg.channels || 'whatsapp';
  const wantWa = channels !== 'push';
  const wantPush = channels !== 'whatsapp';

  const { data: allRecipients, error: recError } = await supabaseAdmin
    .from('whatsapp_message_recipients')
    .select('id, parent_id, phone_e164, status')
    .eq('message_id', messageId);

  if (recError) throw recError;

  // Reprise : on ne rejoue que ce qui n'est pas déjà parti.
  const done = (allRecipients || []).filter((r) => r.status === 'sent');
  const todo = (allRecipients || []).filter((r) => r.status !== 'sent');

  if (todo.length === 0) {
    await finalize(messageId, done.length, 0, allRecipients?.length || 0);
    return { sent: done.length, failed: 0, resumed: true };
  }

  // Session tombée → on laisse le job réessayer plus tard plutôt que de marquer
  // tout le monde en échec.
  if (wantWa && !(await isSessionReady(schoolId))) {
    throw new Error('Session WhatsApp non connectée — nouvelle tentative plus tard');
  }

  let schoolName = 'votre école';
  if (wantPush && schoolId) {
    const { data: school } = await supabaseAdmin.from('schools').select('name').eq('id', schoolId).maybeSingle();
    if (school?.name) schoolName = school.name;
  }

  // Corps de la notification in-app (le média est joint en lien cliquable)
  const notifTitle = `📣 ${schoolName}`;
  let notifBody = message || (messageType === 'image' ? '📷 Image' : '📎 Document');
  if (mediaUrl) notifBody += `\n📎 ${fileName || 'Pièce jointe'} : ${mediaUrl}`;

  // Un même numéro partagé par 2 parents ne reçoit qu'UN WhatsApp, mais chaque
  // parent garde sa notification in-app. Amorcé avec les numéros déjà servis
  // pour qu'une reprise n'envoie pas de doublon.
  const waSentPhones = new Set(done.map((r) => r.phone_e164).filter(Boolean));

  let sentCount = done.length;
  let failedCount = 0;

  for (const recipient of todo) {
    const patch = {};
    let waOk = false;
    let appOk = false;
    let errorMsg = null;

    // 1. Canal app : notification in-app (lisible même sans push) + push
    if (wantPush && recipient.parent_id) {
      try {
        const { data: notif, error: notifErr } = await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: recipient.parent_id,
            type: 'message',
            title: notifTitle,
            message: notifBody,
            data: { hub_message_id: messageId, media_url: mediaUrl || null, file_name: fileName || null, message_type: messageType }
          })
          .select('id')
          .single();
        if (notifErr) throw notifErr;
        patch.notification_id = notif.id;
        appOk = true;
        const pushRes = await sendPushToUser(recipient.parent_id, {
          title: notifTitle,
          body: (message || notifBody).slice(0, 140),
          url: '/parent/notifications',
          tag: `comm-msg-${messageId}`,
          // Pièce jointe image → grande image dans la notification (sinon logo école)
          image: messageType === 'image' && mediaUrl ? mediaUrl : undefined
        });
        patch.push_status = pushRes.sent > 0 ? 'sent' : 'no_subscription';
      } catch (pushErr) {
        patch.push_status = 'failed';
        errorMsg = `App: ${pushErr.message || 'erreur'}`;
      }
    }

    // 2. Canal WhatsApp
    if (wantWa && recipient.phone_e164) {
      if (waSentPhones.has(recipient.phone_e164)) {
        waOk = true; // déjà envoyé à ce numéro (parents partageant un téléphone)
      } else {
        try {
          const result = await sendUnified(schoolId, recipient.phone_e164, { messageType, message, mediaUrl, fileName });
          if (result.success) {
            waOk = true;
            waSentPhones.add(recipient.phone_e164);
            patch.provider_msg_id = String(result.data?.msgId || '');
          } else if (result.reason === 'out_of_hours' || result.reason === 'paused') {
            // Refus temporaire, pas un échec du destinataire : avec l'envoi par
            // vagues une campagne s'étale sur plusieurs heures et franchit la
            // limite de 23 h ou tombe sur une pause anti-ban. Les marquer en
            // échec les priverait définitivement du message. On interrompt : le
            // job reprendra, et les destinataires déjà servis sont ignorés.
            throw new SendSuspended(`Envoi suspendu (${result.reason}) — reprise automatique`);
          } else {
            errorMsg = [errorMsg, result.message || 'Erreur WhatsApp'].filter(Boolean).join(' | ');
          }
        } catch (sendErr) {
          // Une suspension n'est pas une erreur du destinataire : elle doit
          // remonter au job, pas être consignée comme un échec d'envoi.
          if (sendErr instanceof SendSuspended) throw sendErr;
          errorMsg = [errorMsg, sendErr.message || 'Erreur réseau'].filter(Boolean).join(' | ');
        }
      }
    }

    const reached = waOk || appOk;
    if (reached) sentCount++; else failedCount++;
    patch.status = reached ? 'sent' : 'failed';
    if (reached) patch.sent_at = new Date().toISOString();
    if (errorMsg) patch.error_message = errorMsg;

    await supabaseAdmin.from('whatsapp_message_recipients').update(patch).eq('id', recipient.id);

    await supabaseAdmin
      .from('whatsapp_messages')
      .update({ sent_count: sentCount, failed_count: failedCount, updated_at: new Date().toISOString() })
      .eq('id', messageId);

    // Prolonge le bail du job : un envoi dure bien plus longtemps que le bail
    // par défaut, sans ça il serait considéré orphelin et repris en double.
    await touch({ sent: sentCount, failed: failedCount, total: allRecipients.length });
    // Pas besoin de waitWasenderInterval : sendText/sendImage intègrent déjà le délai humain anti-ban.
  }

  await finalize(messageId, sentCount, failedCount, allRecipients.length);
  return { sent: sentCount, failed: failedCount };
}

async function finalize(messageId, sentCount, failedCount, total) {
  await supabaseAdmin
    .from('whatsapp_messages')
    .update({
      // total > 0 : sans ce garde, un message sans destinataire (0 === 0)
      // serait marqué en échec.
      status: total > 0 && failedCount === total ? 'failed' : 'completed',
      sent_count: sentCount,
      failed_count: failedCount,
      updated_at: new Date().toISOString()
    })
    .eq('id', messageId);
}
