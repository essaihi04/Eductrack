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
