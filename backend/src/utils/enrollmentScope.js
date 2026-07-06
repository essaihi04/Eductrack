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

// Deux chaînes désignent-elles la même année scolaire, quel que soit le format
// (slash/tiret) ? Compare les chiffres seuls ("2026/2027" == "2026-2027").
const sameSchoolYear = (a, b) => {
  const na = String(a || '').replace(/\D/g, '');
  const nb = String(b || '').replace(/\D/g, '');
  return !!na && na === nb;
};

// Rattache un élève à l'année active — MAIS UNIQUEMENT si c'est un élève de cette
// année (sa classe courante appartient à l'année active). Ne crée jamais de
// doublon, n'écrase aucun statut, et NE fait PAS remonter un élève d'une année
// précédente non réinscrit.
//
// But : sur la page Parents (scopée par année), le parent qu'on vient de rattacher
// à un élève courant apparaît aussitôt ; les familles des élèves partis restent
// masquées. Renvoie { enrolled: bool }.
export const ensureEnrollmentIfCurrentYear = async (schoolId, studentId, classId, academicYear, createdBy = null) => {
  if (!studentId || !academicYear) return { enrolled: false };
  const variants = yearVariants(academicYear);
  try {
    // 1. Déjà une inscription (n'importe quel statut) pour cette année → rien à faire.
    const { data: existing } = await supabaseAdmin
      .from('student_enrollments')
      .select('id')
      .eq('student_id', studentId)
      .in('academic_year', variants)
      .limit(1);
    if (existing && existing.length) return { enrolled: false };

    // 2. La classe COURANTE de l'élève est-elle une classe de l'année active ?
    //    Sinon → élève d'une autre année : on ne l'inscrit pas (pas de fuite).
    if (!classId) return { enrolled: false };
    const { data: cls } = await supabaseAdmin
      .from('classes').select('academic_year').eq('id', classId).maybeSingle();
    if (!cls || !sameSchoolYear(cls.academic_year, academicYear)) return { enrolled: false };

    // 3. Inscrire (NI) pour l'année active, dans le MÊME format que la classe
    //    (cohérence base + lecture tolérante par ailleurs).
    await supabaseAdmin.from('student_enrollments').insert({
      school_id: schoolId || null,
      student_id: studentId,
      class_id: classId,
      academic_year: cls.academic_year,
      status: 'NI',
      created_by: createdBy || null,
    });
    return { enrolled: true };
  } catch (e) {
    console.error('ensureEnrollmentIfCurrentYear échoué:', e);
    return { enrolled: false };
  }
};
