import { supabaseAdmin } from '../config/supabase.js';
import { sendWhatsAppResponse } from './whatsappChatbot.js';

// Types d'éléments soumis (potentiellement) à approbation
export const ELEMENT_TYPES = {
  signalement: 'Signalements',
  activity: 'Activités parascolaires',
  feed: 'Cahier de vie',
  lost_item: 'Objets perdus',
  grade: 'Notes / Mini-évaluations',
  homework: 'Devoirs',
  control: 'Contrôles',
};

/** Un type d'élément exige-t-il une approbation dans cette école ? */
export async function requiresApproval(schoolId, elementType) {
  if (!schoolId) return false;
  const { data } = await supabaseAdmin
    .from('approval_settings')
    .select('requires_approval')
    .eq('school_id', schoolId)
    .eq('element_type', elementType)
    .maybeSingle();
  return data?.requires_approval === true;
}

/**
 * Réviseurs d'une demande : directeur(s) pédagogique(s) de l'école +
 * responsable(s) pédagogique(s) couvrant la classe concernée.
 */
export async function resolveReviewers(schoolId, classId) {
  const result = { directors: [], managers: [] };
  if (!schoolId) return result;

  // Directeurs pédagogiques (portée globale école)
  const { data: directors } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, phone')
    .eq('school_id', schoolId)
    .eq('role', 'pedagogical_director');
  result.directors = directors || [];

  if (!classId) return result;

  // Niveau de la classe (pour matcher les scopes par niveau)
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, level')
    .eq('id', classId)
    .maybeSingle();

  const { data: scopes } = await supabaseAdmin
    .from('pedagogical_manager_scopes')
    .select('manager_id, class_id, level');
  const managerIds = [...new Set((scopes || [])
    .filter((s) => s.class_id === classId || (cls?.level && s.level === cls.level))
    .map((s) => s.manager_id))];

  if (managerIds.length > 0) {
    const { data: managers } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, phone')
      .in('id', managerIds)
      .eq('role', 'pedagogical_manager');
    result.managers = managers || [];
  }
  return result;
}

/** Classes couvertes par un responsable pédagogique (pour filtrer sa boîte). */
export async function managerClassIds(managerId) {
  const { data: scopes } = await supabaseAdmin
    .from('pedagogical_manager_scopes')
    .select('class_id, level')
    .eq('manager_id', managerId);
  const classIds = (scopes || []).map((s) => s.class_id).filter(Boolean);
  const levels = (scopes || []).map((s) => s.level).filter(Boolean);
  if (levels.length > 0) {
    const { data: cls } = await supabaseAdmin.from('classes').select('id, level');
    (cls || []).forEach((c) => { if (levels.includes(c.level)) classIds.push(c.id); });
  }
  return [...new Set(classIds)];
}

async function notifyInApp(userIds, payload) {
  if (!userIds || userIds.length === 0) return;
  const rows = userIds.map((uid) => ({ user_id: uid, ...payload }));
  try { await supabaseAdmin.from('notifications').insert(rows); }
  catch (e) { console.error('[approvals] notifyInApp:', e.message); }
}

async function sendWa(people, message, schoolId, event) {
  for (const p of people) {
    if (!p.phone) continue;
    const e164 = p.phone.startsWith('+') ? p.phone : `+${p.phone}`;
    try {
      await sendWhatsAppResponse(e164, message, schoolId, {
        category: 'pedagogical',
        // Notification proactive vers le PERSONNEL : la fenêtre 24 h s'applique
        // aussi à lui. L'objet du template est dérivé du texte du message.
        template: 'information',
        recipientFilter: { event },
      });
    } catch (e) { console.error('[approvals] WhatsApp:', e.message); }
  }
}

/** Statistiques des demandes en attente (optionnellement filtrées par classes). */
export async function pendingStats(schoolId, classIds = null) {
  let q = supabaseAdmin
    .from('approval_requests')
    .select('element_type', { count: 'exact' })
    .eq('school_id', schoolId)
    .eq('status', 'pending');
  if (Array.isArray(classIds)) q = q.in('class_id', classIds.length ? classIds : ['00000000-0000-0000-0000-000000000000']);
  const { data } = await q;
  const byType = {};
  for (const r of data || []) byType[r.element_type] = (byType[r.element_type] || 0) + 1;
  return { total: (data || []).length, by_type: byType };
}

/**
 * Crée une demande d'approbation et notifie directeur(s) + responsable(s).
 * Retourne la demande créée (ou null si échec).
 */
export async function createApprovalRequest({ schoolId, elementType, elementId, classId, title, requestedBy, requesterName }) {
  const { data: reqRow, error } = await supabaseAdmin
    .from('approval_requests')
    .insert({ school_id: schoolId, element_type: elementType, element_id: elementId, class_id: classId || null, title: title || null, requested_by: requestedBy || null })
    .select()
    .single();
  if (error) { console.error('[approvals] create request:', error.message); return null; }

  try {
    const { directors, managers } = await resolveReviewers(schoolId, classId);
    const reviewers = [...directors, ...managers];
    const typeLabel = ELEMENT_TYPES[elementType] || elementType;
    const msg = `🔔 *Approbation requise*\n\n*${typeLabel}*${title ? `\n${title}` : ''}${requesterName ? `\n👤 Par : ${requesterName}` : ''}\n\nMerci de valider ou refuser dans l'application (onglet Approbations).`;
    await sendWa(reviewers, msg, schoolId, 'approval_request');
    await notifyInApp(reviewers.map((r) => r.id), {
      title: `Approbation : ${typeLabel}`,
      message: title || typeLabel,
      type: 'message',
      data: { kind: 'approval_request', request_id: reqRow.id, element_type: elementType },
    });
  } catch (e) {
    console.error('[approvals] notify reviewers:', e.message);
  }
  return reqRow;
}

/**
 * Enregistre une décision (approved/rejected), notifie directeur(s) +
 * responsable(s) avec le reste à traiter. Retourne la demande mise à jour.
 */
export async function reviewRequest({ requestId, decision, reviewerId, reviewerName, reason }) {
  const status = decision === 'approved' ? 'approved' : 'rejected';
  const { data: updated, error } = await supabaseAdmin
    .from('approval_requests')
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), reason: reason || null })
    .eq('id', requestId)
    .eq('status', 'pending') // évite la double décision
    .select()
    .single();
  if (error || !updated) return null;

  try {
    const { directors, managers } = await resolveReviewers(updated.school_id, updated.class_id);
    const reviewers = [...directors, ...managers];
    const stats = await pendingStats(updated.school_id);
    const typeLabel = ELEMENT_TYPES[updated.element_type] || updated.element_type;
    const verb = status === 'approved' ? '✅ Approuvé' : '❌ Refusé';
    let msg = `${verb}\n\n*${typeLabel}*${updated.title ? `\n${updated.title}` : ''}${reviewerName ? `\n👤 Par : ${reviewerName}` : ''}`;
    if (reason) msg += `\n📝 Motif : ${reason}`;
    msg += `\n\n📊 Restant à traiter : *${stats.total}*`;
    await sendWa(reviewers, msg, updated.school_id, 'approval_decision');
    await notifyInApp(reviewers.map((r) => r.id), {
      title: `${verb} : ${typeLabel}`,
      message: `${updated.title || typeLabel} — reste ${stats.total} à traiter`,
      type: 'message',
      data: { kind: 'approval_decision', request_id: updated.id, status },
    });
  } catch (e) {
    console.error('[approvals] notify decision:', e.message);
  }
  return updated;
}
