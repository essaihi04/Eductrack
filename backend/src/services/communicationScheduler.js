/**
 * Planificateur de communications admin (docs, événements, annonces).
 *
 * Cron chaque minute → envoie les communications dont scheduled_at est échu.
 * Canal choisi par l'admin (comm.channels) : 'push' (app), 'whatsapp' ou 'both'.
 *   - app      : notification in-app + push web
 *   - whatsapp : texte, ou VRAIE pièce jointe (image/PDF) si un fichier a été
 *                importé (comm.attachment_type), sauf opt-out
 * Écrit dans whatsapp_messages / whatsapp_message_recipients → suivi unifié
 * (historique, « qui a vu / répondu », dashboard).
 */

import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { whatsappOptedOut } from './notificationRouter.js';
import { activeStudentIdSet } from '../utils/enrollmentScope.js';
import { sendText, sendImage, sendDocument } from './whatsapp/index.js';
import { sendPushToUser } from './webPush.js';

// Année scolaire courante au format slash "YYYY/YYYY" (rentrée en septembre).
const currentSchoolYear = () => {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${y + 1}`;
};

const TYPE_PREFIX = {
  urgent: '🔴 *URGENT* — ',
  deadline: '🟠 ',
  normal: '',
};

function formatDateFr(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Construit le texte d'une communication.
 * @param {object} comm
 * @param {boolean} withLink  inclure le lien du document en texte
 *   (true pour push/app et pour les pièces jointes « lien seul » ;
 *    false quand le fichier part en VRAIE pièce jointe WhatsApp → le lien
 *    ferait doublon avec l'image/PDF joint).
 */
function buildMessage(comm, withLink = true) {
  const lines = [];
  lines.push(`${TYPE_PREFIX[comm.type] || ''}*${comm.title}*`);
  if (comm.body) { lines.push(''); lines.push(comm.body); }
  if (comm.type === 'deadline' && comm.deadline_date) {
    lines.push('');
    lines.push(`📅 *Date limite : ${formatDateFr(comm.deadline_date)}*`);
  }
  if (comm.attachment_url && withLink) {
    lines.push('');
    lines.push(`📎 ${comm.attachment_name || 'Document'} : ${comm.attachment_url}`);
  }
  return lines.join('\n');
}

/** Numéro WhatsApp principal pour une liste de parents (Map parent_id → phone). */
async function phonesForParents(ids) {
  const phoneByParent = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: contacts } = await supabaseAdmin
      .from('parent_contacts')
      .select('parent_id, phone_e164, is_primary')
      .in('parent_id', chunk)
      .eq('channel', 'whatsapp')
      .order('is_primary', { ascending: false });
    (contacts || []).forEach((c) => {
      if (!phoneByParent.has(c.parent_id)) phoneByParent.set(c.parent_id, c.phone_e164);
    });
  }
  return phoneByParent;
}

/** Résout la liste des parents ciblés { parent_id, phone } pour une école. */
async function resolveTargetParents(schoolId, target) {
  // 0. Ciblage direct de parents (sélection manuelle dans l'UI)
  if (Array.isArray(target?.parent_ids) && target.parent_ids.length) {
    const ids = [...new Set(target.parent_ids)];
    const phoneByParent = await phonesForParents(ids);
    return ids.map((pid) => ({ parent_id: pid, phone: phoneByParent.get(pid) || null }));
  }

  // 1. Élèves de l'école (filtrés par classes si fourni)
  let q = supabaseAdmin
    .from('profiles')
    .select('id, class_id')
    .eq('role', 'student')
    .eq('school_id', schoolId);
  const classIds = Array.isArray(target?.class_ids) ? target.class_ids : null;
  if (classIds && classIds.length) q = q.in('class_id', classIds);
  const { data: students } = await q;

  // Seuls les élèves inscrits (RI/NI) dans l'année scolaire courante : les
  // familles des élèves non réinscrits ne reçoivent plus les communications.
  const activeIds = await activeStudentIdSet(schoolId, currentSchoolYear());
  const scoped = activeIds ? (students || []).filter((s) => activeIds.has(s.id)) : (students || []);
  const studentIds = scoped.map((s) => s.id);
  if (!studentIds.length) return [];

  // 2. parent_students → parent_ids (par lots pour éviter les URLs trop longues)
  const parentIds = new Set();
  for (let i = 0; i < studentIds.length; i += 200) {
    const chunk = studentIds.slice(i, i + 200);
    const { data: links } = await supabaseAdmin
      .from('parent_students')
      .select('parent_id')
      .in('student_id', chunk);
    (links || []).forEach((l) => parentIds.add(l.parent_id));
  }
  if (!parentIds.size) return [];

  // 3. Numéro WhatsApp principal par parent
  const ids = [...parentIds];
  const phoneByParent = await phonesForParents(ids);
  return ids.map((pid) => ({ parent_id: pid, phone: phoneByParent.get(pid) || null }));
}

/**
 * Crée la ligne whatsapp_messages + les destinataires pour le tracking unifié
 * (historique, détail « qui a vu / répondu », dashboard). Best-effort : si la
 * migration ADD_SCHEDULED_COMM_TRACKING n'est pas appliquée, l'envoi continue
 * sans tracking (retourne null).
 */
async function createTrackingLog(comm, parents, text) {
  try {
    const { data: msgLog, error } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        school_id: comm.school_id,
        sent_by: comm.created_by,
        message_type: 'text',
        content: text,
        media_url: comm.attachment_url || null,
        file_name: comm.attachment_name || null,
        recipient_filter: { scheduled: true, communication_id: comm.id, ...(comm.target || {}) },
        total_recipients: parents.length,
        status: 'sending',
        category: comm.category || 'general',
        channels: ['whatsapp', 'push', 'both'].includes(comm.channels) ? comm.channels : 'both',
      })
      .select('id')
      .single();
    if (error) throw error;

    const { data: rows, error: rErr } = await supabaseAdmin
      .from('whatsapp_message_recipients')
      .insert(parents.map((p) => ({
        message_id: msgLog.id,
        parent_id: p.parent_id,
        phone_e164: p.phone || '',
        status: 'pending',
      })))
      .select('id, parent_id');
    if (rErr) throw rErr;

    // Lie la communication planifiée au message (colonne de la migration
    // ADD_SCHEDULED_COMM_TRACKING — ignorée si absente).
    await supabaseAdmin
      .from('scheduled_communications')
      .update({ message_id: msgLog.id })
      .eq('id', comm.id);

    return {
      messageId: msgLog.id,
      rowIdByParent: new Map((rows || []).map((r) => [r.parent_id, r.id])),
    };
  } catch (e) {
    console.warn('[commScheduler] tracking indisponible (migration manquante ?):', e.message);
    return null;
  }
}

/** Envoie une communication (appelé par le cron ou « envoyer maintenant »). */
export async function sendCommunication(comm) {
  await supabaseAdmin
    .from('scheduled_communications')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', comm.id);

  const parents = await resolveTargetParents(comm.school_id, comm.target || {});

  // Canaux demandés (défaut : les deux, pour la portée maximale)
  const channels = ['whatsapp', 'push', 'both'].includes(comm.channels) ? comm.channels : 'both';
  const wantWa = channels !== 'push';
  const wantPush = channels !== 'whatsapp';
  const isImage = comm.attachment_type === 'image' && comm.attachment_url;
  const isDoc = comm.attachment_type === 'document' && comm.attachment_url;
  const hasRealAttachment = isImage || isDoc;

  // Texte WhatsApp : sans le lien si le fichier part en vraie pièce jointe
  // (sinon doublon image/PDF + lien) ; push : toujours avec le lien.
  const waText = buildMessage(comm, !hasRealAttachment);
  const pushBody = comm.body
    ? comm.body.slice(0, 120)
    : (comm.type === 'deadline' && comm.deadline_date ? `Date limite : ${formatDateFr(comm.deadline_date)}` : 'Nouvelle communication');
  const pushNotifBody = comm.attachment_url
    ? `${pushBody}\n📎 ${comm.attachment_name || 'Pièce jointe'} : ${comm.attachment_url}`
    : pushBody;

  // Tracking unifié : mêmes tables que les envois directs
  const tracking = await createTrackingLog(comm, parents, buildMessage(comm, true));

  const notifTitle = `${TYPE_PREFIX[comm.type] ? '⚠️ ' : '📣 '}${comm.title}`;

  let sent = 0, failed = 0;
  for (const p of parents) {
    const rowId = tracking?.rowIdByParent?.get(p.parent_id);
    const patch = {};
    let waOk = false, appOk = false, errorMsg = null;

    // 1. Canal app : notification in-app (lisible même sans push) + push
    if (wantPush && p.parent_id) {
      try {
        const { data: notif, error: notifErr } = await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: p.parent_id,
            type: 'message',
            title: notifTitle,
            message: pushNotifBody,
            data: {
              hub_message_id: tracking?.messageId || null,
              communication_id: comm.id,
              media_url: comm.attachment_url || null,
              file_name: comm.attachment_name || null,
            },
          })
          .select('id')
          .single();
        if (notifErr) throw notifErr;
        patch.notification_id = notif.id;
        appOk = true;
        const pr = await sendPushToUser(p.parent_id, {
          title: notifTitle,
          body: pushBody,
          url: '/parent/notifications',
          tag: `comm-${comm.id}`,
        });
        patch.push_status = pr.sent > 0 ? 'sent' : 'no_subscription';
      } catch (e) {
        patch.push_status = 'failed';
        errorMsg = `App: ${e.message || 'erreur'}`;
      }
    }

    // 2. Canal WhatsApp (sauf opt-out) : vraie pièce jointe si fichier importé
    if (wantWa && p.phone) {
      try {
        if (await whatsappOptedOut(p.parent_id)) {
          errorMsg = [errorMsg, 'Opt-out WhatsApp (STOP)'].filter(Boolean).join(' | ');
        } else {
          let r;
          if (isImage) r = await sendImage(comm.school_id, p.phone, comm.attachment_url, waText);
          else if (isDoc) r = await sendDocument(comm.school_id, p.phone, comm.attachment_url, comm.attachment_name || 'document.pdf', waText);
          else r = await sendText(comm.school_id, p.phone, waText);
          if (r?.success) {
            waOk = true;
            if (r.data?.msgId) patch.provider_msg_id = String(r.data.msgId);
          } else {
            errorMsg = [errorMsg, r?.message || 'Échec WhatsApp'].filter(Boolean).join(' | ');
          }
        }
      } catch (e) {
        errorMsg = [errorMsg, e.message || 'Erreur réseau'].filter(Boolean).join(' | ');
      }
    }

    const reached = waOk || appOk;
    if (reached) sent++; else failed++;
    patch.status = reached ? 'sent' : 'failed';
    if (reached) patch.sent_at = new Date().toISOString();
    if (errorMsg) patch.error_message = errorMsg;

    if (rowId) {
      await supabaseAdmin.from('whatsapp_message_recipients').update(patch).eq('id', rowId);
    }

    if (tracking) {
      await supabaseAdmin
        .from('whatsapp_messages')
        .update({ sent_count: sent, failed_count: failed, updated_at: new Date().toISOString() })
        .eq('id', tracking.messageId);
    }
  }

  await supabaseAdmin
    .from('scheduled_communications')
    .update({
      status: failed && !sent ? 'failed' : 'sent',
      sent_count: sent,
      failed_count: failed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', comm.id);

  if (tracking) {
    await supabaseAdmin
      .from('whatsapp_messages')
      .update({
        status: failed === parents.length && parents.length > 0 ? 'failed' : 'completed',
        sent_count: sent,
        failed_count: failed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tracking.messageId);
  }

  return { sent, failed, total: parents.length };
}

let cronJob = null;

export function startCommunicationScheduler() {
  cronJob = cron.schedule('* * * * *', async () => {
    try {
      const { data: due } = await supabaseAdmin
        .from('scheduled_communications')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_at', new Date().toISOString())
        .limit(20);
      if (!due?.length) return;
      for (const comm of due) {
        try {
          const r = await sendCommunication(comm);
          console.log(`[commScheduler] "${comm.title}" → sent=${r.sent} failed=${r.failed}/${r.total}`);
        } catch (e) {
          console.error(`[commScheduler] envoi ${comm.id}:`, e.message);
          await supabaseAdmin
            .from('scheduled_communications')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', comm.id);
        }
      }
    } catch (e) {
      console.error('[commScheduler] cron error:', e.message);
    }
  });
  console.log('[commScheduler] Planificateur de communications démarré.');
}

export function stopCommunicationScheduler() {
  if (cronJob) { cronJob.stop(); cronJob = null; }
}
