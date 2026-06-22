import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireSchoolAdmin } from '../middleware/auth.js';
import { nextLevel, isTerminalLevel } from '../utils/levelProgression.js';

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

// Reconduit le plan de frais d'un élève d'une année à l'autre (format finance = tiret).
// Renvoie true si un plan a été créé.
const carryFeePlanForStudent = async (schoolId, sid, fromYear, toYear, userId) => {
  const { data: prevPlan } = await supabaseAdmin
    .from('student_fee_plans')
    .select('template_id')
    .eq('student_id', sid)
    .eq('academic_year', toDash(fromYear))
    .maybeSingle();
  if (!prevPlan?.template_id) return false;
  const { data: exists } = await supabaseAdmin
    .from('student_fee_plans')
    .select('id')
    .eq('student_id', sid)
    .eq('academic_year', toDash(toYear))
    .maybeSingle();
  if (exists) return false;
  const { error } = await supabaseAdmin
    .from('student_fee_plans')
    .insert({ school_id: schoolId, student_id: sid, template_id: prevPlan.template_id, academic_year: toDash(toYear), created_by: userId });
  return !error;
};

// Transforme le nom d'une classe en remplaçant le code de niveau (ex: "1AC-3" → "2AC-3").
const promoteClassName = (name, oldLevel, newLevel) => {
  if (!name) return `${newLevel}`;
  if (oldLevel && name.toUpperCase().includes(oldLevel.toUpperCase())) {
    return name.replace(new RegExp(oldLevel, 'i'), newLevel);
  }
  return name; // pas de code de niveau dans le nom → conservé tel quel
};

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

      // Reconduction du plan de frais.
      if (carryFeePlan) {
        const done = await carryFeePlanForStudent(schoolId, sid, from_year, to_year, req.user.id);
        if (done) feePlansCopied += 1;
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

// --- POST /api/enrollments/auto-reinscription ------------------------------
// Processus complet en un clic : crée automatiquement les classes de l'année
// suivante (clonées + niveau promu) et y réinscrit tous les élèves.
// body: { from_year, options?: { carryFeePlan } }
router.post('/auto-reinscription', requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { from_year } = req.body;
    if (!schoolId) return res.status(400).json({ error: 'school_id requis' });
    if (!from_year) return res.status(400).json({ error: 'from_year requis' });
    const to_year = nextYearStr(from_year);
    const carryFee = req.body.options?.carryFeePlan !== false;

    // 1) Classes de l'année source.
    const { data: srcClasses } = await supabaseAdmin
      .from('classes')
      .select('id, name, level, school_type, filiere, academic_year')
      .eq('school_id', schoolId)
      .eq('academic_year', from_year);

    // 2) Classes déjà existantes pour l'année cible (idempotence).
    const { data: dstExisting } = await supabaseAdmin
      .from('classes')
      .select('id, name, level, filiere')
      .eq('school_id', schoolId)
      .eq('academic_year', to_year);
    const findDst = (name, level, filiere) =>
      (dstExisting || []).find((c) => c.level === level && (c.filiere || '') === (filiere || '') && c.name === name)
      || (dstExisting || []).find((c) => c.level === level && (c.filiere || '') === (filiere || ''));

    // Map classe source → classe cible (créée si nécessaire). Les niveaux terminaux
    // (2BAC) n'ont pas de classe suivante : les élèves seront diplômés (NR).
    const classMap = new Map();
    let classesCreated = 0;
    for (const sc of srcClasses || []) {
      if (isTerminalLevel(sc.level)) continue;
      const newLevel = nextLevel(sc.level);
      if (!newLevel) continue;
      let dst = findDst(promoteClassName(sc.name, sc.level, newLevel), newLevel, sc.filiere);
      if (!dst) {
        const { data: created, error: cErr } = await supabaseAdmin
          .from('classes')
          .insert({
            name: promoteClassName(sc.name, sc.level, newLevel),
            level: newLevel,
            school_type: sc.school_type || null,
            filiere: sc.filiere || null,
            academic_year: to_year,
            school_id: schoolId,
          })
          .select()
          .single();
        if (cErr || !created) continue;
        dst = created;
        dstExisting.push(created);
        classesCreated += 1;
      }
      classMap.set(sc.id, dst.id);
    }

    // 3) Élèves actifs de l'année source.
    const { data: roster } = await supabaseAdmin
      .from('student_enrollments')
      .select('student_id, class_id, status')
      .eq('school_id', schoolId)
      .eq('academic_year', from_year);
    const srcLevelByClass = new Map((srcClasses || []).map((c) => [c.id, c.level]));

    let reinscrits = 0;
    let nonReinscrits = 0;
    let feePlansCopied = 0;
    for (const e of (roster || []).filter((r) => r.status !== 'NR')) {
      const sid = e.student_id;
      const srcLevel = srcLevelByClass.get(e.class_id);
      const newClassId = classMap.get(e.class_id);

      // Pas de classe cible (niveau terminal ou classe non clonée) → non réinscrit.
      if (!newClassId || isTerminalLevel(srcLevel)) {
        await supabaseAdmin.from('student_enrollments').upsert({
          school_id: schoolId, student_id: sid, class_id: null, academic_year: to_year,
          status: 'NR', previous_class_id: e.class_id, created_by: req.user.id,
        }, { onConflict: 'student_id,academic_year' });
        nonReinscrits += 1;
        continue;
      }

      const { error: enrErr } = await supabaseAdmin.from('student_enrollments').upsert({
        school_id: schoolId, student_id: sid, class_id: newClassId, academic_year: to_year,
        status: 'RI', previous_class_id: e.class_id, created_by: req.user.id,
      }, { onConflict: 'student_id,academic_year' });
      if (enrErr) continue;
      await supabaseAdmin.from('profiles').update({ class_id: newClassId }).eq('id', sid);
      if (carryFee && await carryFeePlanForStudent(schoolId, sid, from_year, to_year, req.user.id)) feePlansCopied += 1;
      reinscrits += 1;
    }

    res.json({ success: true, to_year, classes_created: classesCreated, reinscrits, non_reinscrits: nonReinscrits, fee_plans_copied: feePlansCopied });
  } catch (e) {
    console.error('POST /enrollments/auto-reinscription:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// --- POST /api/enrollments/reset -------------------------------------------
// Réinitialise la réinscription d'une année : remet chaque élève dans sa classe
// précédente, supprime les inscriptions et plans de frais de l'année.
// (Les classes vides éventuellement créées sont conservées et réutilisées au
//  prochain « Tout réinscrire » — pour les supprimer, passez par la page Classes.)
// body: { year }
router.post('/reset', requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { year } = req.body;
    if (!schoolId) return res.status(400).json({ error: 'school_id requis' });
    if (!year) return res.status(400).json({ error: 'year requis' });

    const { data: enrollments } = await supabaseAdmin
      .from('student_enrollments')
      .select('student_id, class_id, previous_class_id')
      .eq('school_id', schoolId)
      .eq('academic_year', year);

    // Remettre la classe courante du profil à la classe précédente (si elle pointe
    // encore vers la classe de l'année réinitialisée).
    let reverted = 0;
    for (const e of enrollments || []) {
      const { data: prof } = await supabaseAdmin
        .from('profiles').select('class_id').eq('id', e.student_id).maybeSingle();
      if (prof && e.class_id && prof.class_id === e.class_id) {
        await supabaseAdmin.from('profiles').update({ class_id: e.previous_class_id || null }).eq('id', e.student_id);
        reverted += 1;
      }
    }

    // Supprimer les plans de frais et les inscriptions de l'année.
    await supabaseAdmin.from('student_fee_plans').delete().eq('school_id', schoolId).eq('academic_year', toDash(year));
    const { error: delErr } = await supabaseAdmin
      .from('student_enrollments').delete().eq('school_id', schoolId).eq('academic_year', year);
    if (delErr) throw delErr;

    res.json({ success: true, year, reverted, deleted: (enrollments || []).length });
  } catch (e) {
    console.error('POST /enrollments/reset:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

export default router;
