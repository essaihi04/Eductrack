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

// Écoles que le compte peut piloter, résolues au niveau ÉCOLE (pas au niveau
// compte) : école active ∪ écoles associées par le super admin à N'IMPORTE QUEL
// admin de l'école active.
//
// Pourquoi niveau école et pas niveau user : le super admin rattache une école
// associée à un COMPTE admin précis (account_schools.user_id). Si une école a
// plusieurs admins et que le rattachement a été fait sur un autre compte que
// celui connecté, la réinscription inter-écoles ne voyait rien. On agrège donc
// les liens de tous les admins de l'école active → l'association vaut pour toute
// l'école, quel que soit l'admin connecté.
const getAllowedSchoolIds = async (req) => {
  const ids = new Set();
  const activeSchool = getSchoolId(req) || req.user.school_id;
  if (activeSchool) ids.add(activeSchool);

  // 1) Liens directs du compte connecté.
  const { data: own } = await supabaseAdmin
    .from('account_schools').select('school_id').eq('user_id', req.user.id);
  (own || []).forEach((r) => r.school_id && ids.add(r.school_id));

  // 2) Liens créés pour tout autre admin de la même école active.
  if (activeSchool) {
    const { data: peers } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('school_id', activeSchool)
      .in('role', ['school_admin', 'pedagogical_director', 'pedagogical_manager']);
    const peerIds = (peers || []).map((p) => p.id).filter((id) => id !== req.user.id);
    if (peerIds.length) {
      const { data: peerLinks } = await supabaseAdmin
        .from('account_schools').select('school_id').in('user_id', peerIds);
      (peerLinks || []).forEach((r) => r.school_id && ids.add(r.school_id));
    }
  }
  return Array.from(ids);
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
        id, status, academic_year, student_id, class_id, previous_class_id,
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

// --- GET /api/enrollments/cross-school/search?q= ---------------------------
// Recherche d'élèves dans les AUTRES écoles du compte (pour réinscription
// inter-établissements, ex: trouver un 6AP du primaire depuis le lycée).
router.get('/cross-school/search', async (req, res) => {
  try {
    const activeSchool = getSchoolId(req);
    const q = (req.query.q || '').trim();
    const level = (req.query.level || '').trim().toUpperCase();

    const allowed = await getAllowedSchoolIds(req);
    const otherSchools = allowed.filter((id) => id !== activeSchool);
    if (otherSchools.length === 0) return res.json([]);

    // On liste les élèves des établissements associés (parcours par défaut).
    // Le filtre par niveau est appliqué côté serveur en JS (robuste, sans
    // dépendre d'un filtre PostgREST sur ressource imbriquée).
    let query = supabaseAdmin
      .from('profiles')
      .select(`
        id, first_name, last_name, massar_code, avatar, avatar_url, school_id,
        class:classes!fk_profiles_class(id, name, level, filiere),
        school:schools(id, name)
      `)
      .eq('role', 'student')
      .in('school_id', otherSchools)
      .order('last_name', { ascending: true })
      .limit(level ? 800 : 120);

    if (q) {
      const pattern = `%${q}%`;
      query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},massar_code.ilike.${pattern}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    let rows = data || [];
    if (level) rows = rows.filter((s) => (s.class?.level || '').toUpperCase() === level);
    const results = rows.slice(0, 120).map((s) => ({
      ...s,
      current_level: s.class?.level || null,
      suggested_level: nextLevel(s.class?.level),
    }));
    res.json(results);
  } catch (e) {
    console.error('GET /enrollments/cross-school/search:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// --- GET /api/enrollments/cross-school/levels ------------------------------
// Niveaux RÉELS présents chez les élèves des établissements associés.
// Permet de remplir le menu déroulant avec les vrais codes (ex: 6APG, 3APIC)
// plutôt qu'une liste standard figée — sinon le filtre ne correspond à rien.
router.get('/cross-school/levels', async (req, res) => {
  try {
    const activeSchool = getSchoolId(req);
    const allowed = await getAllowedSchoolIds(req);
    const otherSchools = allowed.filter((id) => id !== activeSchool);
    if (otherSchools.length === 0) return res.json({ levels: [] });

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('class:classes!fk_profiles_class(level)')
      .eq('role', 'student')
      .in('school_id', otherSchools)
      .limit(3000);
    if (error) throw error;

    const set = new Set();
    (data || []).forEach((s) => { const l = s.class?.level; if (l) set.add(l); });
    res.json({ levels: Array.from(set).sort() });
  } catch (e) {
    console.error('GET /enrollments/cross-school/levels:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// --- POST /api/enrollments/reinscribe --------------------------------------
// Réinscrit un élève dans l'école active pour l'année cible, promu au niveau
// suivant (ou un niveau choisi), SANS créer de classe (sauf si une classe
// existante est explicitement fournie).
//   - élève de la PROPRE école active   → statut RI (réinscrit)
//   - élève d'une école ASSOCIÉE        → déménagement vers l'école active (NI)
// Parents et code Massar (indépendants de l'école) sont conservés.
// body: { student_id, academic_year?, target_class_id?, target_level? }
router.post('/reinscribe', requireSchoolAdmin, async (req, res) => {
  try {
    const activeSchool = getSchoolId(req);
    if (!activeSchool) return res.status(400).json({ error: 'school_id requis' });
    const { student_id, target_class_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id requis' });

    // Année cible = celle envoyée par le front (année active), sinon année courante.
    const year = req.body.academic_year || currentYear();

    // 1) L'élève doit appartenir à une école autorisée du compte (propre ou associée).
    const allowed = await getAllowedSchoolIds(req);
    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('id, school_id, class_id, class:classes!fk_profiles_class(id, level, filiere)')
      .eq('id', student_id)
      .eq('role', 'student')
      .single();
    if (!student) return res.status(404).json({ error: 'Élève introuvable' });
    if (!allowed.includes(student.school_id)) {
      return res.status(403).json({ error: 'Cet élève n’appartient pas à un établissement de votre compte' });
    }

    const isCrossSchool = student.school_id !== activeSchool;
    const status = isCrossSchool ? 'NI' : 'RI';

    // 2) Niveau cible : explicite, sinon promotion automatique (6AP → 1AC).
    const srcLevel = student.class?.level || null;
    const targetLevel = (req.body.target_level || nextLevel(srcLevel) || srcLevel || '').toUpperCase();
    if (!targetLevel) return res.status(400).json({ error: 'Impossible de déterminer le niveau cible' });

    // 3) Classe cible : uniquement si une classe existante est choisie ; sinon
    //    niveau seul (class_id null) — l'admin affectera la classe plus tard.
    const classId = target_class_id || null;

    // 4) Mise à jour du profil : école active (si déménagement), classe et niveau.
    const prevClassId = student.class_id || null;
    const { error: updErr } = await supabaseAdmin
      .from('profiles')
      .update({ school_id: activeSchool, class_id: classId, level: targetLevel })
      .eq('id', student_id);
    if (updErr) throw updErr;

    // 5) Inscription pour l'année cible dans l'école active.
    const { error: enrErr } = await supabaseAdmin
      .from('student_enrollments')
      .upsert({
        school_id: activeSchool,
        student_id,
        class_id: classId,
        academic_year: year,
        status,
        previous_class_id: prevClassId,
        created_by: req.user.id,
      }, { onConflict: 'student_id,academic_year' });
    if (enrErr) throw enrErr;

    res.json({ success: true, student_id, class_id: classId, level: targetLevel, academic_year: year, status, cross_school: isCrossSchool });
  } catch (e) {
    console.error('POST /enrollments/reinscribe:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// --- POST /api/enrollments/cross-school/reinscribe-level -------------------
// Réinscrit EN MASSE tous les élèves d'un niveau donné d'un établissement
// associé vers l'école active (déménagement), promus au niveau suivant.
// Ex : tous les 6AP du primaire → 1AC au collège, en un clic.
// body: { source_level, academic_year?, target_level? }
router.post('/cross-school/reinscribe-level', requireSchoolAdmin, async (req, res) => {
  try {
    const activeSchool = getSchoolId(req);
    if (!activeSchool) return res.status(400).json({ error: 'school_id requis' });
    const sourceLevel = (req.body.source_level || '').trim().toUpperCase();
    if (!sourceLevel) return res.status(400).json({ error: 'source_level requis' });

    const allowed = await getAllowedSchoolIds(req);
    const otherSchools = allowed.filter((id) => id !== activeSchool);
    if (otherSchools.length === 0) return res.status(400).json({ error: 'Aucun établissement associé' });

    const year = req.body.academic_year || currentYear();
    const targetLevel = (req.body.target_level || nextLevel(sourceLevel) || sourceLevel || '').toUpperCase();

    // Élèves du niveau source dans les établissements associés.
    const { data: students, error } = await supabaseAdmin
      .from('profiles')
      .select('id, school_id, class_id, class:classes!fk_profiles_class(id, level)')
      .eq('role', 'student')
      .in('school_id', otherSchools)
      .limit(1000);
    if (error) throw error;

    const matching = (students || []).filter((s) => (s.class?.level || '').toUpperCase() === sourceLevel);

    let count = 0;
    const errors = [];
    for (const s of matching) {
      const prevClassId = s.class_id || null;
      const { error: updErr } = await supabaseAdmin
        .from('profiles')
        .update({ school_id: activeSchool, class_id: null, level: targetLevel })
        .eq('id', s.id);
      if (updErr) { errors.push({ student_id: s.id, error: updErr.message }); continue; }
      const { error: enrErr } = await supabaseAdmin
        .from('student_enrollments')
        .upsert({
          school_id: activeSchool,
          student_id: s.id,
          class_id: null,
          academic_year: year,
          status: 'NI',
          previous_class_id: prevClassId,
          created_by: req.user.id,
        }, { onConflict: 'student_id,academic_year' });
      if (enrErr) { errors.push({ student_id: s.id, error: enrErr.message }); continue; }
      count += 1;
    }

    res.json({ success: true, count, source_level: sourceLevel, target_level: targetLevel, academic_year: year, errors });
  } catch (e) {
    console.error('POST /enrollments/cross-school/reinscribe-level:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

export default router;
