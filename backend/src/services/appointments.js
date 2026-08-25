/**
 * Rendez-vous parents ↔ école.
 *
 * Cycle de vie (identique quel que soit le canal de départ : app ou WhatsApp) :
 *
 *   1. Le parent demande un RDV avec l'ADMINISTRATION ou avec un PROFESSEUR.
 *      → statut `en_attente`
 *      → notification au staff concerné : directeur pédagogique, responsable
 *        pédagogique DE LA CLASSE de l'enfant, et administration.
 *      → si la cible est un professeur, il est notifié lui aussi (app + WhatsApp).
 *
 *   2a. RDV administration : un membre du staff fixe l'horaire → `confirme`.
 *   2b. RDV professeur : le prof propose un créneau (app ou WhatsApp) →
 *       `propose`, puis un membre du staff l'accorde → `confirme`.
 *
 *   3. À la confirmation (ou au refus), le parent est notifié AUTOMATIQUEMENT
 *      par le canal le moins cher (push app, sinon WhatsApp) via routeNotification.
 *
 * Règle métier : la décision finale appartient TOUJOURS au staff de l'école.
 * Le professeur ne fait que proposer.
 */

import { supabaseAdmin } from '../config/supabase.js';
import { sendPushToUser } from './webPush.js';
import { sendUtility } from './whatsapp/utility.js';
import { routeNotification } from './notificationRouter.js';

// Rôles qui voient et arbitrent les demandes de rendez-vous.
export const APPOINTMENT_STAFF_ROLES = [
  'admin',
  'school_admin',
  'pedagogical_director',
  'pedagogical_manager',
];

const SELECT_FULL = `
  *,
  parent:profiles!appointment_requests_parent_id_fkey(id, first_name, last_name, phone),
  student:profiles!appointment_requests_student_id_fkey(id, first_name, last_name),
  teacher:profiles!appointment_requests_teacher_id_fkey(id, first_name, last_name, phone),
  classes(id, name, level)
`;

// ─────────────────────────────────────────────────────────────────────────
// Formatage
// ─────────────────────────────────────────────────────────────────────────

const TZ = 'Africa/Casablanca';

/** « jeudi 4 septembre 2026 à 10:30 » (heure du Maroc). */
export function formatSlot(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('fr-FR', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const time = d.toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  return `${date} à ${time}`;
}

const fullName = (p) => `${p?.first_name || ''} ${p?.last_name || ''}`.trim();

/** Libellé de la cible du rendez-vous, pour les messages. */
export function targetLabel(appt) {
  if (appt.target_type === 'teacher') {
    const name = fullName(appt.teacher);
    return name ? `le professeur ${name}` : 'un professeur';
  }
  return "l'administration";
}

// ─────────────────────────────────────────────────────────────────────────
// Destinataires
// ─────────────────────────────────────────────────────────────────────────

/**
 * Staff à prévenir pour une demande : administration + directeur pédagogique
 * de l'école, plus le(s) responsable(s) pédagogique(s) dont le périmètre
 * couvre la classe de l'enfant (classe assignée directement OU son niveau).
 *
 * @returns {Promise<Array<{id:string, role:string, phone:string|null}>>}
 */
export async function getStaffRecipients({ schoolId, classId }) {
  if (!schoolId) return [];

  const { data: leaders } = await supabaseAdmin
    .from('profiles')
    .select('id, role, phone')
    .eq('school_id', schoolId)
    .in('role', ['admin', 'school_admin', 'pedagogical_director']);

  const recipients = new Map();
  (leaders || []).forEach((p) => recipients.set(p.id, p));

  // Responsables pédagogiques : uniquement ceux qui couvrent CETTE classe.
  if (classId) {
    const { data: cls } = await supabaseAdmin
      .from('classes')
      .select('id, level')
      .eq('id', classId)
      .maybeSingle();

    const orParts = [`class_id.eq.${classId}`];
    if (cls?.level) orParts.push(`level.eq.${cls.level}`);

    const { data: scopes } = await supabaseAdmin
      .from('pedagogical_manager_scopes')
      .select('manager_id')
      .or(orParts.join(','));

    const managerIds = [...new Set((scopes || []).map((s) => s.manager_id).filter(Boolean))];
    if (managerIds.length > 0) {
      const { data: managers } = await supabaseAdmin
        .from('profiles')
        .select('id, role, phone')
        .in('id', managerIds)
        .eq('role', 'pedagogical_manager')
        .eq('school_id', schoolId);
      (managers || []).forEach((p) => recipients.set(p.id, p));
    }
  }

  return [...recipients.values()];
}

/** Notification in-app + push pour une liste d'utilisateurs (best-effort). */
async function notifyUsers(userIds, { title, message, data = null, url = null }) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await supabaseAdmin.from('notifications').insert(
      ids.map((uid) => ({ user_id: uid, title, message, type: 'appointment', data }))
    );
  } catch (e) {
    console.error('[appointments] notifications insert:', e.message);
  }
  await Promise.all(ids.map((uid) =>
    sendPushToUser(uid, { title, body: message, url: url || '/appointments', tag: 'appointment' })
      .catch(() => {})
  ));
}

/**
 * WhatsApp best-effort vers un membre du personnel (jamais bloquant).
 * La fenêtre 24 h s'applique au personnel comme aux parents : hors fenêtre,
 * on bascule sur le template générique (objet dérivé du texte).
 */
async function staffWhatsApp(schoolId, phone, text) {
  if (!phone) return;
  try {
    await sendUtility(schoolId, phone, { text, template: 'information' });
  } catch (e) {
    console.error('[appointments] WhatsApp staff:', e.message);
  }
}

/** Ajoute une ligne au journal du rendez-vous (best-effort). */
async function logEvent(appointmentId, { actorId = null, actorRole = null, action, details = null }) {
  try {
    await supabaseAdmin.from('appointment_events').insert({
      appointment_id: appointmentId,
      actor_id: actorId,
      actor_role: actorRole,
      action,
      details,
    });
  } catch (e) {
    console.error('[appointments] logEvent:', e.message);
  }
}

/** Recharge un rendez-vous avec toutes ses jointures. */
export async function getAppointment(id) {
  const { data } = await supabaseAdmin
    .from('appointment_requests')
    .select(SELECT_FULL)
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Création de la demande (parent — app ou WhatsApp)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Enregistre une demande de rendez-vous et prévient le staff (+ le professeur
 * si la demande le vise).
 *
 * @param {object} p
 * @param {string} p.parentId
 * @param {string} p.schoolId
 * @param {string} [p.studentId]      enfant concerné (détermine la classe)
 * @param {'administration'|'teacher'} p.targetType
 * @param {string} [p.teacherId]      obligatoire si targetType = 'teacher'
 * @param {string} p.subject          objet du rendez-vous
 * @param {string} [p.message]
 * @param {string} [p.preferredSlot]  souhait du parent, texte libre
 * @param {'app'|'whatsapp'} [p.source]
 */
export async function createAppointment({
  parentId, schoolId, studentId = null, targetType = 'administration',
  teacherId = null, subject, message = null, preferredSlot = null, source = 'app',
}) {
  if (!parentId || !schoolId) throw new Error('parentId et schoolId requis');
  if (!subject || !String(subject).trim()) throw new Error("L'objet du rendez-vous est requis");
  if (targetType === 'teacher' && !teacherId) throw new Error('Professeur requis pour un rendez-vous avec un professeur');

  // Classe + année scolaire déduites de l'enfant.
  let classId = null;
  let academicYear = null;
  if (studentId) {
    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('class_id, classes:classes!fk_profiles_class(id, academic_year)')
      .eq('id', studentId)
      .maybeSingle();
    classId = student?.class_id || null;
    academicYear = student?.classes?.academic_year || null;
  }

  const { data: appt, error } = await supabaseAdmin
    .from('appointment_requests')
    .insert({
      school_id: schoolId,
      academic_year: academicYear,
      parent_id: parentId,
      student_id: studentId,
      class_id: classId,
      target_type: targetType,
      teacher_id: targetType === 'teacher' ? teacherId : null,
      subject: String(subject).trim().slice(0, 300),
      message: message ? String(message).trim().slice(0, 2000) : null,
      preferred_slot: preferredSlot ? String(preferredSlot).trim().slice(0, 300) : null,
      status: 'en_attente',
      source,
    })
    .select(SELECT_FULL)
    .single();
  if (error) throw error;

  await logEvent(appt.id, { actorId: parentId, actorRole: 'parent', action: 'created', details: { source } });
  notifyNewRequest(appt).catch((e) => console.error('[appointments] notifyNewRequest:', e.message));
  return appt;
}

/** Prévient le staff (et le professeur ciblé) d'une nouvelle demande. */
async function notifyNewRequest(appt) {
  const parentName = fullName(appt.parent) || 'Un parent';
  const childName = fullName(appt.student);
  const className = appt.classes?.name;
  const cible = appt.target_type === 'teacher'
    ? `avec ${targetLabel(appt)}`
    : "avec l'administration";

  // --- Staff (in-app + push) ---
  const staff = await getStaffRecipients({ schoolId: appt.school_id, classId: appt.class_id });
  const title = `📅 Demande de rendez-vous ${cible}`;
  const body = [
    `${parentName}${childName ? ` (parent de ${childName}${className ? ` — ${className}` : ''})` : ''}`,
    `Objet : ${appt.subject}`,
    appt.preferred_slot ? `Souhait : ${appt.preferred_slot}` : null,
  ].filter(Boolean).join('\n');

  await notifyUsers(staff.map((s) => s.id), {
    title,
    message: body,
    data: { kind: 'appointment', appointment_id: appt.id, status: appt.status },
    url: '/appointments',
  });

  // --- Professeur ciblé (in-app + push + WhatsApp) ---
  if (appt.target_type === 'teacher' && appt.teacher_id) {
    await notifyUsers([appt.teacher_id], {
      title: '📅 Un parent demande à vous rencontrer',
      message: body,
      data: { kind: 'appointment', appointment_id: appt.id, status: appt.status },
      url: '/teacher/appointments',
    });

    const waText = [
      `📅 *Demande de rendez-vous*`,
      '',
      `👤 Parent : *${parentName}*`,
      childName ? `👶 Élève : *${childName}*${className ? ` (${className})` : ''}` : null,
      `📝 Objet : *${appt.subject}*`,
      appt.message ? `💬 ${appt.message}` : null,
      appt.preferred_slot ? `🕐 Souhait du parent : ${appt.preferred_slot}` : null,
      '',
      `━━━━━━━━━━━━━━━`,
      `Répondez à ce message avec la *date et l'heure* qui vous conviennent.`,
      `_Exemples : « jeudi 10h », « 12/09 à 15h30 », « demain 9h »._`,
      `Pour refuser, répondez *NON*.`,
      '',
      `_Votre proposition sera validée par l'administration avant d'être envoyée au parent._`,
    ].filter(Boolean).join('\n');
    await staffWhatsApp(appt.school_id, appt.teacher?.phone, waText);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Le professeur propose un créneau (app ou WhatsApp)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Le professeur propose une date. Le rendez-vous passe en `propose` et le
 * staff est prévenu : c'est lui qui accordera.
 *
 * @param {object} p
 * @param {object} p.appointment  rendez-vous complet (jointures chargées)
 * @param {string} p.teacherId
 * @param {string} p.proposedAt   ISO
 * @param {string} [p.note]
 */
export async function proposeSlot({ appointment, teacherId, proposedAt, note = null }) {
  const { data: updated, error } = await supabaseAdmin
    .from('appointment_requests')
    .update({
      status: 'propose',
      proposed_at: proposedAt,
      proposed_note: note,
      proposed_by: teacherId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointment.id)
    .select(SELECT_FULL)
    .single();
  if (error) throw error;

  await logEvent(updated.id, {
    actorId: teacherId, actorRole: 'teacher', action: 'proposed', details: { proposed_at: proposedAt, note },
  });

  const teacherName = fullName(updated.teacher) || 'Le professeur';
  const parentName = fullName(updated.parent) || 'un parent';
  const staff = await getStaffRecipients({ schoolId: updated.school_id, classId: updated.class_id });
  await notifyUsers(staff.map((s) => s.id), {
    title: '📅 Créneau proposé par un professeur',
    message: `${teacherName} propose le ${formatSlot(proposedAt)} pour le rendez-vous demandé par ${parentName}.\nÀ valider pour informer le parent.`,
    data: { kind: 'appointment', appointment_id: updated.id, status: 'propose' },
    url: '/appointments',
  });

  return updated;
}

/**
 * Le professeur se déclare indisponible. La demande RESTE en attente : c'est au
 * staff de reprendre la main (proposer un autre créneau, réorienter, refuser).
 */
export async function markTeacherUnavailable({ appointment, teacherId, message = null }) {
  const note = `Professeur indisponible${message ? ` : ${String(message).slice(0, 200)}` : ''}`;
  const { data: updated, error } = await supabaseAdmin
    .from('appointment_requests')
    .update({ proposed_note: note, proposed_by: teacherId, updated_at: new Date().toISOString() })
    .eq('id', appointment.id)
    .select(SELECT_FULL)
    .single();
  if (error) throw error;

  await logEvent(updated.id, {
    actorId: teacherId, actorRole: 'teacher', action: 'declined',
    details: { by: 'teacher', message },
  });

  const staff = await getStaffRecipients({ schoolId: updated.school_id, classId: updated.class_id });
  await notifyUsers(staff.map((s) => s.id), {
    title: '📅 Professeur indisponible',
    message: `${fullName(updated.teacher) || 'Le professeur'} ne peut pas recevoir ${fullName(updated.parent) || 'ce parent'} (« ${updated.subject} »).\nÀ reprendre : proposer un autre créneau ou réorienter.`,
    data: { kind: 'appointment', appointment_id: updated.id, status: updated.status },
    url: '/appointments',
  });

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────
// 3) Le staff accorde / refuse — le parent est notifié automatiquement
// ─────────────────────────────────────────────────────────────────────────

/**
 * Le staff fixe (ou valide) l'horaire → statut `confirme`, puis notification
 * automatique au parent (push app sinon WhatsApp) et au professeur concerné.
 */
export async function confirmAppointment({
  appointment, staffUser, scheduledAt, durationMinutes = 30, location = null, note = null,
}) {
  if (!scheduledAt) throw new Error('Date et heure du rendez-vous requises');

  const { data: updated, error } = await supabaseAdmin
    .from('appointment_requests')
    .update({
      status: 'confirme',
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes || 30,
      location: location || null,
      decision_note: note || null,
      decided_by: staffUser.id,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointment.id)
    .select(SELECT_FULL)
    .single();
  if (error) throw error;

  await logEvent(updated.id, {
    actorId: staffUser.id, actorRole: staffUser.role, action: 'confirmed',
    details: { scheduled_at: scheduledAt, location, note },
  });

  const channel = await notifyParentConfirmed(updated);

  // Le professeur est informé du créneau finalement retenu.
  if (updated.target_type === 'teacher' && updated.teacher_id) {
    const parentName = fullName(updated.parent) || 'un parent';
    await notifyUsers([updated.teacher_id], {
      title: '✅ Rendez-vous confirmé',
      message: `Rendez-vous avec ${parentName} le ${formatSlot(scheduledAt)}${location ? ` — ${location}` : ''}.`,
      data: { kind: 'appointment', appointment_id: updated.id, status: 'confirme' },
      url: '/teacher/appointments',
    });
    await staffWhatsApp(updated.school_id, updated.teacher?.phone, [
      `✅ *Rendez-vous confirmé*`,
      '',
      `👤 Parent : *${parentName}*`,
      `📅 ${formatSlot(scheduledAt)}`,
      location ? `📍 ${location}` : null,
      `📝 Objet : ${updated.subject}`,
    ].filter(Boolean).join('\n'));
  }

  return { appointment: updated, channel };
}

/** Notification du parent : rendez-vous accordé. */
async function notifyParentConfirmed(appt) {
  const childName = fullName(appt.student);
  const slot = formatSlot(appt.scheduled_at);
  const avec = targetLabel(appt);

  const waText = [
    `✅ *Votre rendez-vous est confirmé*`,
    '',
    `📅 ${slot}`,
    `👤 Avec : ${avec}`,
    appt.location ? `📍 Lieu : ${appt.location}` : null,
    childName ? `👶 Élève : ${childName}` : null,
    `📝 Objet : ${appt.subject}`,
    appt.decision_note ? `\n💬 ${appt.decision_note}` : null,
    '',
    `_Merci de vous présenter à l'heure. En cas d'empêchement, prévenez l'établissement._`,
  ].filter(Boolean).join('\n');

  const res = await routeNotification({
    parentId: appt.parent_id,
    schoolId: appt.school_id,
    phone: appt.parent?.phone || null,
    push: {
      title: '✅ Rendez-vous confirmé',
      body: `${slot} — avec ${avec}`,
      url: '/parent/appointments',
      tag: 'appointment',
    },
    whatsappText: waText,
    // Hors fenêtre 24 h, le texte ci-dessus (multi-lignes) ne passe pas :
    // on retombe sur le template utilitaire à paramètres courts.
    template: 'rendezVous',
    templateParams: [appt.subject, slot, avec],
  }).catch((e) => {
    console.error('[appointments] notifyParentConfirmed:', e.message);
    return { channel: 'error', success: false };
  });

  // Notification in-app persistante (consultable même si le push a échoué).
  await notifyUsers([appt.parent_id], {
    title: '✅ Rendez-vous confirmé',
    message: `${slot} — avec ${avec}${appt.location ? ` (${appt.location})` : ''}`,
    data: { kind: 'appointment', appointment_id: appt.id, status: 'confirme' },
    url: '/parent/appointments',
  });

  await supabaseAdmin
    .from('appointment_requests')
    .update({ parent_notified_at: new Date().toISOString(), parent_notify_channel: res.channel })
    .eq('id', appt.id);

  return res.channel;
}

/** Le staff refuse la demande → le parent est prévenu avec le motif. */
export async function declineAppointment({ appointment, staffUser, note = null }) {
  const { data: updated, error } = await supabaseAdmin
    .from('appointment_requests')
    .update({
      status: 'refuse',
      decision_note: note || null,
      decided_by: staffUser.id,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointment.id)
    .select(SELECT_FULL)
    .single();
  if (error) throw error;

  await logEvent(updated.id, { actorId: staffUser.id, actorRole: staffUser.role, action: 'declined', details: { note } });

  const waText = [
    `📅 *Votre demande de rendez-vous*`,
    '',
    `Objet : *${updated.subject}*`,
    '',
    `❌ L'établissement ne peut pas donner suite pour le moment.`,
    note ? `💬 Motif : ${note}` : null,
    '',
    `_Vous pouvez refaire une demande ou contacter directement l'établissement._`,
  ].filter(Boolean).join('\n');

  const res = await routeNotification({
    parentId: updated.parent_id,
    schoolId: updated.school_id,
    phone: updated.parent?.phone || null,
    push: {
      title: '📅 Demande de rendez-vous',
      body: `Non retenue${note ? ` — ${note}` : ''}`,
      url: '/parent/appointments',
      tag: 'appointment',
    },
    whatsappText: waText,
    // Un refus ne rentre pas dans le template « rendez-vous confirmé » :
    // on passe par le template générique, qui invite le parent à répondre
    // (sa réponse rouvre la fenêtre 24 h et permet d'expliquer en texte libre).
    template: 'information',
    templateParams: [`votre demande de rendez-vous « ${updated.subject} »`],
  }).catch(() => ({ channel: 'error' }));

  await notifyUsers([updated.parent_id], {
    title: '📅 Demande de rendez-vous non retenue',
    message: note || `Votre demande « ${updated.subject} » n'a pas pu être acceptée.`,
    data: { kind: 'appointment', appointment_id: updated.id, status: 'refuse' },
    url: '/parent/appointments',
  });

  await supabaseAdmin
    .from('appointment_requests')
    .update({ parent_notified_at: new Date().toISOString(), parent_notify_channel: res.channel })
    .eq('id', updated.id);

  if (updated.target_type === 'teacher' && updated.teacher_id) {
    await notifyUsers([updated.teacher_id], {
      title: '📅 Rendez-vous annulé par l\'administration',
      message: `La demande de ${fullName(updated.parent) || 'ce parent'} n'a pas été retenue.`,
      data: { kind: 'appointment', appointment_id: updated.id, status: 'refuse' },
      url: '/teacher/appointments',
    });
  }

  return updated;
}

/** Annulation (par le parent lui-même ou par le staff). */
export async function cancelAppointment({ appointment, actor, note = null }) {
  const { data: updated, error } = await supabaseAdmin
    .from('appointment_requests')
    .update({
      status: 'annule',
      decision_note: note || appointment.decision_note || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointment.id)
    .select(SELECT_FULL)
    .single();
  if (error) throw error;

  await logEvent(updated.id, { actorId: actor.id, actorRole: actor.role, action: 'cancelled', details: { note } });

  const byParent = actor.id === updated.parent_id;
  if (byParent) {
    // Prévenir le staff (et le prof) que le parent s'est désisté.
    const staff = await getStaffRecipients({ schoolId: updated.school_id, classId: updated.class_id });
    const targets = staff.map((s) => s.id);
    if (updated.teacher_id) targets.push(updated.teacher_id);
    await notifyUsers(targets, {
      title: '📅 Rendez-vous annulé par le parent',
      message: `${fullName(updated.parent) || 'Le parent'} a annulé : « ${updated.subject} »`,
      data: { kind: 'appointment', appointment_id: updated.id, status: 'annule' },
      url: '/appointments',
    });
  } else {
    await notifyUsers([updated.parent_id], {
      title: '📅 Rendez-vous annulé',
      message: note || `Le rendez-vous « ${updated.subject} » a été annulé par l'établissement.`,
      data: { kind: 'appointment', appointment_id: updated.id, status: 'annule' },
      url: '/parent/appointments',
    });
  }

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────────────────

/**
 * Liste des rendez-vous visibles par un membre du staff.
 * Le responsable pédagogique ne voit que les classes de son périmètre
 * (`scopedClassIds` = null → aucune restriction).
 */
export async function listForStaff({ schoolId, scopedClassIds = null, status = null }) {
  let q = supabaseAdmin
    .from('appointment_requests')
    .select(SELECT_FULL)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(300);
  if (status) q = q.eq('status', status);
  if (scopedClassIds !== null) {
    if (scopedClassIds.length === 0) return [];
    q = q.in('class_id', scopedClassIds);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Rendez-vous demandés par un parent. */
export async function listForParent(parentId) {
  const { data, error } = await supabaseAdmin
    .from('appointment_requests')
    .select(SELECT_FULL)
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

/** Rendez-vous adressés à un professeur. */
export async function listForTeacher(teacherId) {
  const { data, error } = await supabaseAdmin
    .from('appointment_requests')
    .select(SELECT_FULL)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

/** Professeurs de la classe d'un élève (choix proposé au parent). */
export async function listClassTeachers(classId) {
  if (!classId) return [];
  const { data: links } = await supabaseAdmin
    .from('class_teachers')
    .select('teacher_id, profiles:teacher_id(id, first_name, last_name, role)')
    .eq('class_id', classId);

  const teachers = (links || [])
    .map((l) => l.profiles)
    .filter((p) => p && p.role === 'teacher');
  if (teachers.length === 0) return [];

  // Matière(s) enseignée(s) — utile pour que le parent identifie le bon prof.
  const { data: subs } = await supabaseAdmin
    .from('teacher_subjects')
    .select('teacher_id, subjects(name)')
    .in('teacher_id', teachers.map((t) => t.id));

  const byTeacher = new Map();
  (subs || []).forEach((s) => {
    const name = s.subjects?.name;
    if (!name) return;
    if (!byTeacher.has(s.teacher_id)) byTeacher.set(s.teacher_id, []);
    byTeacher.get(s.teacher_id).push(name);
  });

  return teachers.map((t) => ({
    id: t.id,
    first_name: t.first_name,
    last_name: t.last_name,
    name: fullName(t),
    subjects: byTeacher.get(t.id) || [],
  }));
}
