import { supabaseAdmin } from '../config/supabase.js';
import { yearVariants } from './enrollmentScope.js';

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

// Archive un élève à la place de la suppression : profil conservé (archived_at),
// détaché de sa classe (disparaît des listes prof/notes/absences), inscription
// de l'année passée en NR (disparaît du roster finance, des listes parents…).
// La classe est mémorisée dans previous_class_id pour la restauration.
export const archiveStudent = async ({ studentId, academicYear = null }) => {
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

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ archived_at: new Date().toISOString(), class_id: null })
    .eq('id', studentId);
  if (error) throw isMissingColumn(error) ? missingMigrationError() : error;
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

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ archived_at: null, ...(classId ? { class_id: classId } : {}) })
    .eq('id', studentId);
  if (error) throw isMissingColumn(error) ? missingMigrationError() : error;
  return { classId };
};
