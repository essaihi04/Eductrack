/**
 * Application des modèles de frais par NIVEAU (fee_templates.level).
 *
 * Cas d'usage : en début d'année les classes n'existent pas encore — la fiche
 * d'inscription ne renseigne que le niveau (profiles.level, class_id null).
 * Un modèle de frais portant un niveau doit donc pouvoir s'appliquer :
 *   1. en masse aux élèves inscrits de ce niveau (avec ou sans classe) ;
 *   2. AUTOMATIQUEMENT à chaque nouvelle inscription/réinscription du niveau.
 *
 * Formats d'année : fee_templates/student_fee_plans = tiret « 2025-2026 »,
 * student_enrollments = slash « 2025/2026 » → variantes partout.
 */
import { supabaseAdmin } from '../config/supabase.js';
import { baseLevel } from './levelProgression.js';

const norm = (s) => String(s || '').trim().toUpperCase();

const yearVariants = (y) => {
  const s = String(y || '');
  return [...new Set([s, s.replace('/', '-'), s.replace('-', '/')])].filter(Boolean);
};

const toDashYear = (y) => String(y || '').replace('/', '-');

// Correspondance tolérante : égalité normalisée OU même niveau de base du
// référentiel (« 1BAC Sciences Math » ↔ « 1BAC »). Les libellés hors référentiel
// (ex: « CP ») ne matchent qu'à l'identique.
export const levelsMatch = (a, b) => {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ba = baseLevel(na);
  const bb = baseLevel(nb);
  return !!(ba && bb && ba === bb);
};

// Supabase plafonne chaque requête (1000 lignes par défaut) : pagination
// systématique pour ne pas tronquer silencieusement les grosses écoles.
const fetchAll = async (buildQuery) => {
  const PAGE = 1000;
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return all;
};

// Modèles ACTIFS de l'école pour l'année, portant un niveau.
export const listLevelTemplates = async (schoolId, academicYear) => {
  const rows = await fetchAll(() => {
    let q = supabaseAdmin
      .from('fee_templates')
      .select('id, name, level, academic_year, is_active, created_at')
      .in('academic_year', yearVariants(academicYear))
      .not('level', 'is', null)
      .order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    return q;
  });
  return rows.filter((t) => t.is_active !== false && norm(t.level));
};

// Meilleur modèle pour un niveau : correspondance exacte d'abord, sinon même
// niveau de base — le plus récemment créé gagne (ordre de listLevelTemplates).
export const findTemplateForLevel = (templates, level) => {
  const exact = (templates || []).find((t) => norm(t.level) === norm(level));
  if (exact) return exact;
  return (templates || []).find((t) => levelsMatch(t.level, level)) || null;
};

/**
 * Élèves inscrits (student_enrollments, hors NR) pour l'année, avec leur niveau
 * résolu : niveau de la classe si affectée, sinon profiles.level (inscription
 * « niveau seul » — le cas nouvelle année sans classes).
 */
export const listEnrolledStudentsWithLevel = async (schoolId, academicYear) => {
  const rows = await fetchAll(() => {
    let q = supabaseAdmin
      .from('student_enrollments')
      .select('student_id, class_id, status, class:classes!student_enrollments_class_id_fkey(level), student:profiles!student_enrollments_student_id_fkey(level)')
      .in('academic_year', yearVariants(academicYear))
      .neq('status', 'NR');
    if (schoolId) q = q.eq('school_id', schoolId);
    return q;
  });
  return rows.map((e) => ({
    student_id: e.student_id,
    class_id: e.class_id || null,
    level: norm(e.class?.level || e.student?.level) || null,
  }));
};

// Élèves de l'année ayant déjà un plan (tous formats d'année) → Set d'ids.
const studentsWithPlan = async (schoolId, academicYear) => {
  const rows = await fetchAll(() => {
    let q = supabaseAdmin
      .from('student_fee_plans')
      .select('student_id')
      .in('academic_year', yearVariants(academicYear));
    if (schoolId) q = q.eq('school_id', schoolId);
    return q;
  });
  return new Set(rows.map((p) => p.student_id));
};

/**
 * Applique un modèle à tous les élèves inscrits des niveaux donnés (année),
 * en ignorant ceux ayant déjà un plan (quel qu'il soit).
 * @returns {Promise<{created: number, skipped: number}>}
 */
export const applyTemplateToLevels = async ({ schoolId, templateId, levels, academicYear, createdBy }) => {
  const wanted = [...new Set((levels || []).map(norm).filter(Boolean))];
  if (!templateId || wanted.length === 0 || !academicYear) return { created: 0, skipped: 0 };

  const students = await listEnrolledStudentsWithLevel(schoolId, academicYear);
  const seen = new Set();
  const targets = students.filter((s) => {
    if (!s.level || seen.has(s.student_id)) return false;
    seen.add(s.student_id);
    return wanted.some((w) => levelsMatch(w, s.level));
  });
  if (targets.length === 0) return { created: 0, skipped: 0 };

  const covered = await studentsWithPlan(schoolId, academicYear);
  const toCreate = targets.filter((s) => !covered.has(s.student_id));
  const skipped = targets.length - toCreate.length;
  if (toCreate.length === 0) return { created: 0, skipped };

  const dashYear = toDashYear(academicYear);
  const { error } = await supabaseAdmin.from('student_fee_plans').insert(
    toCreate.map((s) => ({
      school_id: schoolId,
      student_id: s.student_id,
      template_id: templateId,
      academic_year: dashYear,
      created_by: createdBy || null,
    }))
  );
  if (error) throw error;
  return { created: toCreate.length, skipped };
};

/**
 * Plan de frais AUTOMATIQUE d'un élève au moment de son inscription : si un
 * modèle actif existe pour son niveau (année donnée) et qu'il n'a pas déjà un
 * plan, le plan est créé à partir du modèle.
 * Ne lève JAMAIS : l'inscription ne doit pas échouer à cause de la finance.
 * `templatesCache` (objet mutable optionnel) évite de recharger les modèles à
 * chaque élève lors des traitements en masse (réinscription).
 * @returns {Promise<{applied: boolean, template?: {id: string, name: string}}>}
 */
export const autoApplyFeePlanForStudent = async ({ schoolId, studentId, level, academicYear, createdBy, templatesCache }) => {
  try {
    if (!schoolId || !studentId || !academicYear) return { applied: false };

    let lvl = norm(level);
    if (!lvl) {
      // Niveau non transmis → déduit de la classe affectée, sinon du profil.
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('level, class:classes!fk_profiles_class(level)')
        .eq('id', studentId)
        .maybeSingle();
      lvl = norm(prof?.class?.level || prof?.level);
    }
    if (!lvl) return { applied: false };

    const cacheKey = `${schoolId}|${toDashYear(academicYear)}`;
    let templates = templatesCache?.[cacheKey];
    if (!templates) {
      templates = await listLevelTemplates(schoolId, academicYear);
      if (templatesCache) templatesCache[cacheKey] = templates;
    }
    const template = findTemplateForLevel(templates, lvl);
    if (!template) return { applied: false };

    // Déjà un plan cette année (peu importe le format d'année) → on ne touche pas.
    const { data: existing } = await supabaseAdmin
      .from('student_fee_plans')
      .select('id')
      .eq('student_id', studentId)
      .in('academic_year', yearVariants(academicYear))
      .limit(1);
    if (existing && existing.length > 0) return { applied: false };

    const { error } = await supabaseAdmin.from('student_fee_plans').insert({
      school_id: schoolId,
      student_id: studentId,
      template_id: template.id,
      academic_year: toDashYear(academicYear),
      created_by: createdBy || null,
    });
    if (error) {
      console.error('[auto fee plan] insertion échouée:', error.message);
      return { applied: false };
    }
    return { applied: true, template: { id: template.id, name: template.name } };
  } catch (e) {
    console.error('[auto fee plan] erreur:', e.message);
    return { applied: false };
  }
};
