import { supabaseAdmin } from '../config/supabase.js';
import { yearVariants } from './enrollmentScope.js';
import { invalidateProfileCache } from './authToken.js';

// Année scolaire courante (format slash). Sept→déc = année en cours,
// janv→août = année précédente. Même règle que les routes admin.
const currentSchoolYear = () => {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${y + 1}`;
};

// La colonne profiles.archived_at vient de ADD_STUDENT_ARCHIVE.sql — si la
// migration n'a pas été exécutée, on renvoie un message actionnable plutôt
// qu'une erreur PostgREST cryptique.
const isMissingColumn = (error) =>
  error && (error.code === 'PGRST204' || error.code === '42703') &&
  String(error.message || '').includes('archived_at');

const missingMigrationError = () =>
  new Error("Colonne 'archived_at' absente : exécutez la migration ADD_STUDENT_ARCHIVE.sql dans Supabase.");

// Ids des élèves archivés d'une école, pour retirer les archivés des listes qui
// balayent toute l'école (destinataires WhatsApp, rapports, vie scolaire…).
// Les listes par classe n'en ont pas besoin : l'archivage détache la classe.
//
// Renvoie null si la colonne n'existe pas encore (migration non exécutée) →
// l'appelant garde alors sa liste complète au lieu de planter.
export const archivedStudentIdSet = async (schoolId) => {
  try {
    let q = supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'student')
      .not('archived_at', 'is', null);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) return null;
    return new Set((data || []).map((r) => r.id));
  } catch {
    return null;
  }
};

// Marqueur d'annulation posé par l'archivage : permet à la restauration de
// ne ré-activer QUE ce que l'archivage a annulé (pas les annulations manuelles).
const ARCHIVE_CANCEL_REASON = 'Élève archivé';

// Annule (sans supprimer) toutes les factures et tous les paiements de l'élève :
// les lignes restent visibles partout (caisse, encaissements, rapports) mais
// marquées « annulé », donc exclues des totaux qui ne comptent que le confirmé.
const cancelStudentFinance = async (studentId, userId = null) => {
  const now = new Date().toISOString();
  try {
    // Paiements d'abord (un éventuel trigger recalcule la facture), factures ensuite.
    await supabaseAdmin
      .from('payments')
      .update({ status: 'cancelled', cancelled_at: now, cancelled_by: userId, cancellation_reason: ARCHIVE_CANCEL_REASON })
      .eq('student_id', studentId)
      .neq('status', 'cancelled');
    await supabaseAdmin
      .from('invoices')
      .update({ status: 'cancelled', cancelled_at: now, cancelled_by: userId, cancellation_reason: ARCHIVE_CANCEL_REASON, updated_at: now })
      .eq('student_id', studentId)
      .neq('status', 'cancelled');
  } catch (_) { /* module finance absent → non bloquant */ }
};

// Ré-active les factures/paiements annulés par l'archivage, puis recalcule le
// payé et le statut de chaque facture à partir des paiements confirmés.
const restoreStudentFinance = async (studentId) => {
  try {
    const { data: invs } = await supabaseAdmin
      .from('invoices')
      .select('id, total, due_date')
      .eq('student_id', studentId)
      .eq('status', 'cancelled')
      .eq('cancellation_reason', ARCHIVE_CANCEL_REASON);

    await supabaseAdmin
      .from('payments')
      .update({ status: 'confirmed', cancelled_at: null, cancelled_by: null, cancellation_reason: null })
      .eq('student_id', studentId)
      .eq('status', 'cancelled')
      .eq('cancellation_reason', ARCHIVE_CANCEL_REASON);

    const today = new Date().toISOString().split('T')[0];
    for (const inv of invs || []) {
      const { data: pays } = await supabaseAdmin
        .from('payments')
        .select('amount')
        .eq('invoice_id', inv.id)
        .eq('status', 'confirmed');
      const paid = (pays || []).reduce((s, p) => s + Number(p.amount || 0), 0);
      const total = Number(inv.total || 0);
      const status = total > 0 && paid >= total
        ? 'paid'
        : paid > 0
          ? 'partial'
          : (inv.due_date && inv.due_date < today ? 'overdue' : 'issued');
      await supabaseAdmin
        .from('invoices')
        .update({ status, amount_paid: paid, cancelled_at: null, cancelled_by: null, cancellation_reason: null, updated_at: new Date().toISOString() })
        .eq('id', inv.id);
    }
  } catch (_) { /* module finance absent → non bloquant */ }
};

// Archive un élève à la place de la suppression : profil conservé (archived_at),
// détaché de sa classe (disparaît des listes prof/notes/absences), inscription
// de l'année passée en NR (disparaît du roster finance, des listes parents…).
// La classe est mémorisée dans previous_class_id pour la restauration.
export const archiveStudent = async ({ studentId, academicYear = null, userId = null }) => {
  const year = academicYear || currentSchoolYear();

  const { data: profile, error: pErr } = await supabaseAdmin
    .from('profiles')
    .select('id, class_id')
    .eq('id', studentId)
    .single();
  if (pErr) throw pErr;

  try {
    const { data: rows } = await supabaseAdmin
      .from('student_enrollments')
      .select('id, class_id, previous_class_id')
      .eq('student_id', studentId)
      .in('academic_year', yearVariants(year));
    for (const r of rows || []) {
      await supabaseAdmin
        .from('student_enrollments')
        .update({
          status: 'NR',
          previous_class_id: r.class_id || r.previous_class_id || profile.class_id || null,
          class_id: null,
        })
        .eq('id', r.id);
    }
  } catch (_) { /* table absente (migration multi-année non appliquée) → non bloquant */ }

  // Finance : factures + paiements de l'élève conservés mais marqués « annulé »
  // (caisse, encaissements et rapports les excluent de leurs totaux).
  await cancelStudentFinance(studentId, userId);

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ archived_at: new Date().toISOString(), class_id: null })
    .eq('id', studentId);
  if (error) throw isMissingColumn(error) ? missingMigrationError() : error;
  // Le profil est en cache côté middleware : sans ça, un élève archivé
  // garderait son accès jusqu'à expiration du cache.
  invalidateProfileCache(studentId);
};

// Restaure un élève archivé : archived_at effacé, classe et inscription (NI)
// récupérées depuis previous_class_id quand elles existent encore.
export const restoreStudent = async ({ studentId, academicYear = null }) => {
  const year = academicYear || currentSchoolYear();

  let classId = null;
  try {
    const { data: rows } = await supabaseAdmin
      .from('student_enrollments')
      .select('id, previous_class_id')
      .eq('student_id', studentId)
      .in('academic_year', yearVariants(year))
      .eq('status', 'NR');
    for (const r of rows || []) {
      classId = classId || r.previous_class_id || null;
      await supabaseAdmin
        .from('student_enrollments')
        .update({ status: 'NI', class_id: r.previous_class_id || null, previous_class_id: null })
        .eq('id', r.id);
    }
  } catch (_) { /* table absente → non bloquant */ }

  // Finance : ré-active ce que l'archivage avait annulé (marqueur dédié),
  // sans toucher aux annulations manuelles antérieures.
  await restoreStudentFinance(studentId);

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ archived_at: null, ...(classId ? { class_id: classId } : {}) })
    .eq('id', studentId);
  if (error) throw isMissingColumn(error) ? missingMigrationError() : error;
  invalidateProfileCache(studentId);
  return { classId };
};
