import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireSchoolAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// --- Helpers ---------------------------------------------------------------

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.query.school_id || req.body.school_id || null;
  return req.user.school_id || null;
};

// Année scolaire courante au format slash "YYYY/YYYY" (rentrée en septembre).
const currentYear = () => {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${y + 1}`;
};

// Extrait la 1ʳᵉ année d'une chaîne "YYYY/YYYY" ou "YYYY-YYYY".
const firstYearOf = (year) => {
  const a = parseInt(String(year).split(/[/\-]/)[0], 10);
  return Number.isNaN(a) ? null : a;
};

const nextYearStr = (year) => {
  const a = firstYearOf(year);
  return a === null ? null : `${a + 1}/${a + 2}`;
};

const prevYearStr = (year) => {
  const a = firstYearOf(year);
  return a === null ? null : `${a - 1}/${a}`;
};

// Format finance (student_fee_plans, finance_budget) = tiret "YYYY-YYYY".
const toDash = (year) => String(year || '').replace('/', '-');

// --- GET /api/enrollments/school-years -------------------------------------
// Liste des années scolaires connues de l'école + année courante + année suivante.
router.get('/school-years', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const years = new Set();

    const [classesRes, enrollRes, configRes] = await Promise.all([
      schoolId
        ? supabaseAdmin.from('classes').select('academic_year').eq('school_id', schoolId)
        : supabaseAdmin.from('classes').select('academic_year'),
      schoolId
        ? supabaseAdmin.from('student_enrollments').select('academic_year').eq('school_id', schoolId)
        : supabaseAdmin.from('student_enrollments').select('academic_year'),
      schoolId
        ? supabaseAdmin.from('school_year_config').select('academic_year').eq('school_id', schoolId)
        : { data: [] },
    ]);

    (classesRes.data || []).forEach((r) => r.academic_year && years.add(r.academic_year));
    (enrollRes.data || []).forEach((r) => r.academic_year && years.add(r.academic_year));
    (configRes.data || []).forEach((r) => r.academic_year && years.add(r.academic_year));

    const cur = currentYear();
    years.add(cur);
    years.add(nextYearStr(cur)); // permet de préparer la réinscription de l'année prochaine

    // Tri décroissant par 1ʳᵉ année.
    const sorted = Array.from(years).sort((a, b) => (firstYearOf(b) || 0) - (firstYearOf(a) || 0));

    res.json({ years: sorted, current: cur });
  } catch (e) {
    console.error('GET /enrollments/school-years:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// --- GET /api/enrollments/funnel?academic_year= ----------------------------
// Entonnoir d'inscription pour une année : total, réinscrits, nouveaux, non réinscrits.
router.get('/funnel', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const year = req.query.academic_year;
    if (!year) return res.status(400).json({ error: 'academic_year requis' });
    const prev = prevYearStr(year);

    const [{ data: cur }, { data: prevRows }] = await Promise.all([
      supabaseAdmin.from('student_enrollments').select('student_id, status')
        .eq('school_id', schoolId).eq('academic_year', year),
      supabaseAdmin.from('student_enrollments').select('student_id, status')
        .eq('school_id', schoolId).eq('academic_year', prev),
    ]);

    const active = (cur || []).filter((e) => e.status !== 'NR');
    const total = active.length;
    const ri = active.filter((e) => e.status === 'RI').length;
    const ni = active.filter((e) => e.status === 'NI').length;

    const activeIds = new Set(active.map((e) => e.student_id));
    const prevActive = (prevRows || []).filter((e) => e.status !== 'NR');
    const nr = prevActive.filter((e) => !activeIds.has(e.student_id)).length;

    res.json({ academic_year: year, total, ri, ni, nr });
  } catch (e) {
    console.error('GET /enrollments/funnel:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// --- GET /api/enrollments?academic_year=&class_id= -------------------------
// Roster d'une année (avec statut RI/NI/NR + classe et niveau).
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const year = req.query.academic_year;
    if (!year) return res.status(400).json({ error: 'academic_year requis' });

    let q = supabaseAdmin
      .from('student_enrollments')
      .select(`
        id, status, academic_year, class_id, previous_class_id,
        student:profiles!student_enrollments_student_id_fkey(id, first_name, last_name, massar_code, avatar, avatar_url),
        class:classes!student_enrollments_class_id_fkey(id, name, level, filiere)
      `)
      .eq('school_id', schoolId)
      .eq('academic_year', year);

    if (req.query.class_id) q = q.eq('class_id', req.query.class_id);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('GET /enrollments:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// --- POST /api/enrollments/reinscription -----------------------------------
// Promeut une liste d'élèves de from_year vers to_year.
// body: { from_year, to_year, mappings:[{student_id, new_class_id, status}], options:{ carryFeePlan, keepMassar } }
router.post('/reinscription', requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { from_year, to_year, mappings, options = {} } = req.body;
    if (!schoolId) return res.status(400).json({ error: 'school_id requis' });
    if (!from_year || !to_year) return res.status(400).json({ error: 'from_year et to_year requis' });
    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({ error: 'mappings[] requis' });
    }
    const carryFeePlan = options.carryFeePlan !== false; // par défaut on reconduit

    // Classe d'origine de chaque élève (année source).
    const { data: fromEnrollments } = await supabaseAdmin
      .from('student_enrollments')
      .select('student_id, class_id')
      .eq('school_id', schoolId)
      .eq('academic_year', from_year);
    const fromClassByStudent = new Map((fromEnrollments || []).map((e) => [e.student_id, e.class_id]));

    let reinscrits = 0;
    let nonReinscrits = 0;
    let feePlansCopied = 0;
    const errors = [];

    for (const m of mappings) {
      const sid = m.student_id;
      if (!sid) continue;
      const prevClassId = fromClassByStudent.get(sid) || null;

      if (m.status === 'NR') {
        // Non réinscrit : trace l'intention sans modifier la classe courante du profil.
        const { error } = await supabaseAdmin
          .from('student_enrollments')
          .upsert({
            school_id: schoolId,
            student_id: sid,
            class_id: null,
            academic_year: to_year,
            status: 'NR',
            previous_class_id: prevClassId,
            created_by: req.user.id,
          }, { onConflict: 'student_id,academic_year' });
        if (error) { errors.push({ student_id: sid, error: error.message }); continue; }
        nonReinscrits += 1;
        continue;
      }

      // Réinscription (RI) — nécessite une classe cible.
      if (!m.new_class_id) { errors.push({ student_id: sid, error: 'new_class_id manquant' }); continue; }

      const { error: enrErr } = await supabaseAdmin
        .from('student_enrollments')
        .upsert({
          school_id: schoolId,
          student_id: sid,
          class_id: m.new_class_id,
          academic_year: to_year,
          status: 'RI',
          previous_class_id: prevClassId,
          created_by: req.user.id,
        }, { onConflict: 'student_id,academic_year' });
      if (enrErr) { errors.push({ student_id: sid, error: enrErr.message }); continue; }

      // La classe courante du profil suit la nouvelle inscription.
      // (Les liens parent_students et le code Massar sont indépendants de l'année → préservés.)
      await supabaseAdmin.from('profiles').update({ class_id: m.new_class_id }).eq('id', sid);

      // Reconduction du plan de frais (format finance = tiret).
      if (carryFeePlan) {
        const { data: prevPlan } = await supabaseAdmin
          .from('student_fee_plans')
          .select('template_id')
          .eq('student_id', sid)
          .eq('academic_year', toDash(from_year))
          .maybeSingle();
        if (prevPlan?.template_id) {
          const { data: exists } = await supabaseAdmin
            .from('student_fee_plans')
            .select('id')
            .eq('student_id', sid)
            .eq('academic_year', toDash(to_year))
            .maybeSingle();
          if (!exists) {
            const { error: feeErr } = await supabaseAdmin
              .from('student_fee_plans')
              .insert({
                school_id: schoolId,
                student_id: sid,
                template_id: prevPlan.template_id,
                academic_year: toDash(to_year),
                created_by: req.user.id,
              });
            if (!feeErr) feePlansCopied += 1;
          }
        }
      }

      reinscrits += 1;
    }

    res.json({
      success: true,
      reinscrits,
      non_reinscrits: nonReinscrits,
      fee_plans_copied: feePlansCopied,
      errors,
    });
  } catch (e) {
    console.error('POST /enrollments/reinscription:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

export default router;
