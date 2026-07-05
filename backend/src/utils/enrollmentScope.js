import { supabaseAdmin } from '../config/supabase.js';

// Ids des élèves ACTIFS (inscription RI/NI dans student_enrollments) pour une
// année scolaire donnée — même source de vérité que le roster finance et les
// listes élèves. Sert à scoper les listes de destinataires (WhatsApp, parents…)
// pour que les familles des élèves non réinscrits ne reçoivent plus rien.
//
// Renvoie null si aucune année n'est fournie ou si la table est absente
// (migration non appliquée) → l'appelant conserve alors sa liste complète.
// Variantes d'une année scolaire pour tolérer l'incohérence slash/tiret en base :
// "2026/2027" et "2026-2027" désignent la même année mais sont stockées tantôt
// dans un format, tantôt dans l'autre (classes vs inscriptions vs finance).
// Toujours matcher les DEUX pour ne perdre aucune ligne.
export const yearVariants = (raw) => {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4})[/-](\d{4})$/);
  if (!m) return s ? [s] : [];
  return [`${m[1]}/${m[2]}`, `${m[1]}-${m[2]}`];
};

export const activeStudentIdSet = async (schoolId, academicYear) => {
  if (!academicYear) return null;
  try {
    const variants = yearVariants(academicYear);
    let q = supabaseAdmin
      .from('student_enrollments')
      .select('student_id')
      .in('academic_year', variants.length ? variants : [academicYear])
      .neq('status', 'NR');
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) return null;
    return new Set((data || []).map((r) => r.student_id));
  } catch {
    return null;
  }
};

// Année scolaire au format slash "YYYY/YYYY" (source de vérité de student_enrollments).
// Accepte le format tiret "YYYY-YYYY" et le convertit ; repli sur l'année courante
// (rentrée en septembre) si rien n'est fourni.
export const toSlashYear = (raw) => {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4})[/-](\d{4})$/);
  if (m) return `${m[1]}/${m[2]}`;
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${y + 1}`;
};

// Garantit qu'un élève possède une inscription (student_enrollments) pour l'année
// donnée, SANS écraser un statut existant (RI/NR/NI conservé). Crée une ligne 'NI'
// uniquement si aucune inscription n'existe pour (élève, année).
//
// Sert à ALIGNER la page Parents (scopée par année via activeStudentIdSet) avec la
// page Élèves (non scopée) : quand on rattache un parent à un élève « hérité » sans
// inscription pour l'année active, cette ligne le fait apparaître côté Parents.
// Un élève marqué non réinscrit (NR) reste NR → son parent reste masqué (voulu).
export const ensureEnrollment = async (schoolId, studentId, classId, academicYear, createdBy = null) => {
  if (!studentId) return;
  const year = toSlashYear(academicYear);
  try {
    // Vérifier les DEUX formats (slash/tiret) pour ne pas créer de doublon quand
    // une inscription existe déjà sous l'autre écriture.
    const { data: existing } = await supabaseAdmin
      .from('student_enrollments')
      .select('id')
      .eq('student_id', studentId)
      .in('academic_year', yearVariants(year))
      .limit(1);
    if (existing && existing.length) return; // ne pas toucher au statut existant
    await supabaseAdmin.from('student_enrollments').insert({
      school_id: schoolId || null,
      student_id: studentId,
      class_id: classId || null,
      academic_year: year,
      status: 'NI',
      created_by: createdBy || null,
    });
  } catch (e) {
    console.error('ensureEnrollment échoué:', e);
  }
};
