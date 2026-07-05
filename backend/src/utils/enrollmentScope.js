import { supabaseAdmin } from '../config/supabase.js';

// Variantes d'une année scolaire pour tolérer l'incohérence slash/tiret en base :
// "2026/2027" et "2026-2027" désignent la même année mais sont stockées tantôt
// dans un format, tantôt dans l'autre (classes/finance en tiret, inscriptions en
// slash). Toujours matcher les DEUX pour ne perdre — ni ajouter — aucune ligne.
export const yearVariants = (raw) => {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4})[/-](\d{4})$/);
  if (!m) return s ? [s] : [];
  return [`${m[1]}/${m[2]}`, `${m[1]}-${m[2]}`];
};

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
