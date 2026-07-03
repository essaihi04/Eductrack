/**
 * Planificateur de communications admin (docs, événements, annonces).
 *
 * Cron chaque minute → envoie les communications dont scheduled_at est échu.
 * Chaque parent ciblé est routé par notificationRouter :
 *   app → push gratuit ; sinon WhatsApp (gratuit si fenêtre 24h, sinon payant).
 * Le nudge « installez l'app / répondez » est ajouté automatiquement par le
 * routeur pour les parents sans app.
 */

import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase.js';
import { routeNotification } from './notificationRouter.js';
import { activeStudentIdSet } from '../utils/enrollmentScope.js';

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

/** Construit le texte WhatsApp/push d'une communication. */
function buildMessage(comm) {
  const lines = [];
  lines.push(`${TYPE_PREFIX[comm.type] || ''}*${comm.title}*`);
  if (comm.body) { lines.push(''); lines.push(comm.body); }
  if (comm.type === 'deadline' && comm.deadline_date) {
    lines.push('');
    lines.push(`📅 *Date limite : ${formatDateFr(comm.deadline_date)}*`);
  }
  if (comm.attachment_url) {
    lines.push('');
    lines.push(`📎 ${comm.attachment_name || 'Document'} : ${comm.attachment_url}`);
  }
  return lines.join('\n');
}

/** Résout la liste des parents ciblés { parent_id, phone } pour une école. */
async function resolveTargetParents(schoolId, target) {
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

  return ids.map((pid) => ({ parent_id: pid, phone: phoneByParent.get(pid) || null }));
}

/** Envoie une communication (appelé par le cron ou « envoyer maintenant »). */
export async function sendCommunication(comm) {
  await supabaseAdmin
    .from('scheduled_communications')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', comm.id);

  const parents = await resolveTargetParents(comm.school_id, comm.target || {});
  const text = buildMessage(comm);
  const pushBody = comm.body
    ? comm.body.slice(0, 120)
    : (comm.type === 'deadline' && comm.deadline_date ? `Date limite : ${formatDateFr(comm.deadline_date)}` : 'Nouvelle communication');

  let sent = 0, failed = 0;
  for (const p of parents) {
    try {
      const routed = await routeNotification({
        parentId: p.parent_id,
        schoolId: comm.school_id,
        phone: p.phone,
        push: {
          title: `${TYPE_PREFIX[comm.type] ? '⚠️ ' : ''}${comm.title}`,
          body: pushBody,
          url: comm.attachment_url || '/parent',
          tag: `comm-${comm.id}`,
        },
        whatsappText: text,
      });
      if (routed.success) sent++;
      else if (routed.channel !== 'optout') failed++;
    } catch (e) {
      failed++;
      console.error(`[commScheduler] parent ${p.parent_id}:`, e.message);
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
