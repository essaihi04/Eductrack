import { supabaseAdmin } from '../config/supabase.js';

// Ids des élèves ACTIFS (inscription RI/NI dans student_enrollments) pour une
// année scolaire donnée — même source de vérité que le roster finance et les
// listes élèves. Sert à scoper les listes de destinataires (WhatsApp, parents…)
// pour que les familles des élèves non réinscrits ne reçoivent plus rien.
//
// Renvoie null si aucune année n'est fournie ou si la table est absente
// (migration non appliquée) → l'appelant conserve alors sa liste complète.
export const activeStudentIdSet = async (schoolId, academicYear) => {
  if (!academicYear) return null;
  try {
    let q = supabaseAdmin
      .from('student_enrollments')
      .select('student_id')
      .eq('academic_year', academicYear)
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
    const { data: existing } = await supabaseAdmin
      .from('student_enrollments')
      .select('id')
      .eq('student_id', studentId)
      .eq('academic_year', year)
      .maybeSingle();
    if (existing) return; // ne pas toucher au statut existant
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
