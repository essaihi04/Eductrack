/**
 * Routes pour le système de bulletins scolaires.
 *
 * Sections :
 *   - Configuration année scolaire (admin)
 *   - Coefficients (admin CRUD, lecture publique)
 *   - Génération / publication / envoi bulletins (admin)
 *   - Appréciations (teacher)
 *   - Consultation (parent / student)
 */

import { Router } from 'express';
import multer from 'multer';
import { supabaseAdmin } from '../config/supabase.js';
import {
  uploadBuffer,
  removeObject,
  BUCKET_PUBLIC,
  normalizeLogoToPng,
  logoPathFromPublicUrl,
} from '../utils/storage.js';
import {
  authenticate,
  authorize,
  requireSchoolAdmin,
  getScopedClassIds
} from '../middleware/auth.js';
import {
  computeStudentBulletin,
  computeClassBulletins,
  getSemesterBounds,
  getCoefficients,
  computeMention,
  computeCertification,
  getExamCoefficients,
  CERTIFICATION_LEVELS,
  isExamLevel
} from '../services/bulletins/calculator.js';
import { generateBulletinPdf } from '../services/bulletins/bulletinPdf.js';
import { getEstablishmentConfig } from '../services/establishmentHeader.js';
import { getDefaultYearBounds, getCurrentSemester, getCurrentAcademicYear } from '../services/bulletins/schoolCalendar.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Middleware : toutes les routes nécessitent une authentification
// ─────────────────────────────────────────────────────────────────────────────
router.use(authenticate);

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(
      (file.originalname.match(/\.[^.]+$/)?.[0] || '').toLowerCase()
    );
    cb(ok ? null : new Error('Type non autorisé. Acceptés : JPG, PNG, GIF, SVG, WebP'), ok);
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// 0. LOGO DE L'ÉCOLE (admin) — affiché dans tous les PDF
// ═══════════════════════════════════════════════════════════════════════════

// GET /school-logo  → logo actuel (uploadé par le super admin ou l'admin)
router.get('/school-logo', requireSchoolAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('schools')
      .select('id, name, logo_url')
      .eq('id', req.user.school_id)
      .single();
    if (error) throw error;
    res.json({ name: data?.name || '', logo_url: data?.logo_url || null });
  } catch (e) {
    console.error('Erreur lecture logo école:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /school-logo  → l'admin upload le logo de son école (converti en PNG)
router.post('/school-logo', requireSchoolAdmin, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier envoyé' });
    const schoolId = req.user.school_id;

    // Supprime l'ancien logo du stockage si présent
    const { data: oldSchool } = await supabaseAdmin
      .from('schools').select('logo_url').eq('id', schoolId).single();
    if (oldSchool?.logo_url) {
      const oldPath = logoPathFromPublicUrl(oldSchool.logo_url);
      if (oldPath) await removeObject(BUCKET_PUBLIC, oldPath);
    }

    const file = await normalizeLogoToPng(req.file);
    const { publicUrl: logoUrl } = await uploadBuffer({ bucket: BUCKET_PUBLIC, folder: 'logos', file, prefix: 'logo' });

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .update({ logo_url: logoUrl })
      .eq('id', schoolId)
      .select('id, name, logo_url')
      .single();
    if (error) throw error;

    res.json({ school, logo_url: logoUrl });
  } catch (e) {
    console.error('Erreur upload logo école (admin):', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONFIGURATION ANNÉE SCOLAIRE (admin / direction_pedagogique)
// ═══════════════════════════════════════════════════════════════════════════

// GET /config/:academicYear  → retourne la config OU les défauts MEN officiels
router.get('/config/:academicYear', requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const { academicYear } = req.params;
    const { data, error } = await supabaseAdmin
      .from('school_year_config')
      .select('*')
      .eq('school_id', schoolId)
      .eq('academic_year', academicYear)
      .maybeSingle();
    if (error) throw error;

    const def = getDefaultYearBounds(academicYear);
    // Si rien en base → renvoie les défauts officiels MEN (pas encore persistés)
    if (!data) {
      return res.json({
        academic_year:   academicYear,
        year_start:      def.year_start,
        year_end:        def.year_end,
        semester_1_start: def.s1_start,
        semester_1_end:   def.s1_end,
        semester_2_start: def.s2_start,
        semester_2_end:   def.s2_end,
        is_default: true
      });
    }
    // Si des champs manquent → on complète avec les défauts officiels
    res.json({
      ...data,
      semester_1_start: data.semester_1_start || def.s1_start,
      semester_1_end:   data.semester_1_end   || def.s1_end,
      semester_2_start: data.semester_2_start || def.s2_start,
      semester_2_end:   data.semester_2_end   || def.s2_end,
      year_start:       data.year_start       || def.year_start,
      year_end:         data.year_end         || def.year_end,
      is_default: false
    });
  } catch (e) {
    console.error('[Bulletins] config GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /establishment?academic_year=2025/2026  → en-tête officiel pour tout
//   document généré (accessible à tout utilisateur authentifié : profs inclus).
router.get('/establishment', async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const academicYear = req.query.academic_year || getCurrentAcademicYear();
    const data = await getEstablishmentConfig(schoolId, academicYear);
    res.json(data);
  } catch (e) {
    console.error('[Bulletins] establishment error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /current-semester  → semestre en cours d'après la date du jour
router.get('/current-semester', async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const result = await getCurrentSemester(schoolId);
    res.json(result);
  } catch (e) {
    console.error('[Bulletins] current-semester error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /years  → liste de toutes les années académiques (configs + bulletins existants)
//               + l'année courante calculée. Sert à alimenter le sélecteur d'année.
router.get('/years', async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const [bull, cfg] = await Promise.all([
      supabaseAdmin.from('bulletins').select('academic_year').eq('school_id', schoolId),
      supabaseAdmin.from('school_year_config').select('academic_year').eq('school_id', schoolId),
    ]);
    const set = new Set();
    (bull.data || []).forEach(r => r.academic_year && set.add(r.academic_year));
    (cfg.data || []).forEach(r => r.academic_year && set.add(r.academic_year));
    set.add(getCurrentAcademicYear());
    const years = [...set].sort().reverse(); // plus récent en premier
    res.json({ years, current: getCurrentAcademicYear() });
  } catch (e) {
    console.error('[Bulletins] years error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /config/:academicYear  (upsert)
router.put('/config/:academicYear', requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const { academicYear } = req.params;
    const payload = {
      school_id: schoolId,
      academic_year: academicYear,
      ...req.body,
      updated_at: new Date().toISOString()
    };
    delete payload.id;
    delete payload.created_at;

    const { data, error } = await supabaseAdmin
      .from('school_year_config')
      .upsert(payload, { onConflict: 'school_id,academic_year' })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[Bulletins] config PUT error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. COEFFICIENTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /coefficients?level=TC&filiere=tc_sciences
router.get('/coefficients', async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const { level, filiere } = req.query;
    if (!level) return res.status(400).json({ error: 'level requis' });

    let query = supabaseAdmin
      .from('subject_coefficients')
      .select('*')
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .eq('level', level);

    if (filiere) query = query.eq('filiere', filiere);
    else query = query.is('filiere', null);

    query = query.order('display_order');
    const { data, error } = await query;
    if (error) throw error;

    // Merge : school overrides > global
    const map = new Map();
    (data || []).forEach(c => {
      const existing = map.get(c.subject_name);
      if (!existing || (c.school_id && !existing.school_id)) {
        map.set(c.subject_name, c);
      }
    });
    res.json([...map.values()]);
  } catch (e) {
    console.error('[Bulletins] coefficients GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /coefficients (bulk upsert pour une école)
router.put('/coefficients', requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const { level, filiere, coefficients } = req.body;
    if (!level || !Array.isArray(coefficients)) {
      return res.status(400).json({ error: 'level + coefficients[] requis' });
    }

    const rows = coefficients.map((c, idx) => ({
      school_id: schoolId,
      level,
      filiere: filiere || null,
      subject_name: c.subject_name,
      coefficient: c.coefficient,
      display_order: c.display_order ?? (idx + 1) * 10,
      subject_id: c.subject_id || null
    }));

    const { data, error } = await supabaseAdmin
      .from('subject_coefficients')
      .upsert(rows, { onConflict: 'school_id,level,filiere,subject_name' })
      .select();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[Bulletins] coefficients PUT error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /coefficients/:id
router.delete('/coefficients/:id', requireSchoolAdmin, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('subject_coefficients')
      .delete()
      .eq('id', req.params.id)
      .eq('school_id', req.user.school_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /coefficients/seed — re-seed les défauts globaux pour un niveau/filière
router.post('/coefficients/seed', requireSchoolAdmin, async (req, res) => {
  try {
    const { level, filiere } = req.body;
    if (!level) return res.status(400).json({ error: 'level requis' });

    const { data: globals } = await supabaseAdmin
      .from('subject_coefficients')
      .select('*')
      .is('school_id', null)
      .eq('level', level)
      .eq('filiere', filiere || null);

    if (!globals || globals.length === 0) {
      return res.json({ message: 'Aucun défaut global trouvé pour ce niveau/filière', seeded: 0 });
    }

    const schoolId = req.user.school_id;
    const rows = globals.map(g => ({
      school_id: schoolId,
      level: g.level,
      filiere: g.filiere,
      subject_name: g.subject_name,
      coefficient: g.coefficient,
      display_order: g.display_order,
      subject_id: g.subject_id
    }));

    const { data, error } = await supabaseAdmin
      .from('subject_coefficients')
      .upsert(rows, { onConflict: 'school_id,level,filiere,subject_name' })
      .select();
    if (error) throw error;
    res.json({ seeded: data.length, data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2bis. EXAMENS DE CERTIFICATION (national / régional / local)
// ═══════════════════════════════════════════════════════════════════════════

// GET /exam-levels — config des niveaux de certification (pondérations + examens)
router.get('/exam-levels', async (req, res) => {
  res.json(CERTIFICATION_LEVELS);
});

// GET /exam-coefficients?level=2BAC&filiere=svt&exam_type=national
router.get('/exam-coefficients', async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const { level, filiere, exam_type } = req.query;
    if (!level || !exam_type) return res.status(400).json({ error: 'level + exam_type requis' });
    const map = await getExamCoefficients(schoolId, level, filiere || null, exam_type);
    const rows = [...map.entries()].map(([subject_name, v]) => ({
      subject_name, coefficient: v.coefficient, display_order: v.display_order
    })).sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
    res.json(rows);
  } catch (e) {
    console.error('[Bulletins] exam-coefficients GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /exam-coefficients (bulk upsert pour une école)
router.put('/exam-coefficients', requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const { level, filiere, exam_type, coefficients } = req.body;
    if (!level || !exam_type || !Array.isArray(coefficients)) {
      return res.status(400).json({ error: 'level + exam_type + coefficients[] requis' });
    }
    const rows = coefficients.map((c, idx) => ({
      school_id: schoolId,
      level,
      filiere: filiere || null,
      exam_type,
      subject_name: c.subject_name,
      coefficient: Number(c.coefficient),
      display_order: c.display_order ?? (idx + 1) * 10
    }));
    const { data, error } = await supabaseAdmin
      .from('exam_coefficients')
      .upsert(rows, { onConflict: 'school_id,level,filiere,exam_type,subject_name' })
      .select();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[Bulletins] exam-coefficients PUT error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /exam-notes?class_id=...&academic_year=...&scenario=real
router.get('/exam-notes', requireSchoolAdmin, async (req, res) => {
  try {
    const { class_id, academic_year, scenario } = req.query;
    if (!class_id || !academic_year) return res.status(400).json({ error: 'class_id + academic_year requis' });
    let q = supabaseAdmin
      .from('exam_notes')
      .select('*')
      .eq('class_id', class_id)
      .eq('academic_year', academic_year)
      .eq('school_id', req.user.school_id);
    if (scenario) q = q.eq('scenario', scenario);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /exam-notes (bulk upsert — alimenté par l'import Excel parsé côté client)
//   body : { class_id, academic_year, exam_type, scenario, notes: [{ student_id, subject_name, note }] }
router.put('/exam-notes', requireSchoolAdmin, async (req, res) => {
  try {
    const schoolId = req.user.school_id;
    const { class_id, academic_year, exam_type, scenario, notes } = req.body;
    if (!class_id || !academic_year || !exam_type || !scenario || !Array.isArray(notes)) {
      return res.status(400).json({ error: 'class_id, academic_year, exam_type, scenario, notes[] requis' });
    }
    if (!['national', 'regional', 'local'].includes(exam_type)) {
      return res.status(400).json({ error: 'exam_type invalide' });
    }
    if (!['real', 'mock'].includes(scenario)) {
      return res.status(400).json({ error: 'scenario invalide' });
    }

    // Niveau / filière de la classe (pour traçabilité)
    const { data: cls } = await supabaseAdmin
      .from('classes').select('level, filiere').eq('id', class_id).single();

    const rows = notes
      .filter(n => n.student_id && n.subject_name && n.note != null && n.note !== '')
      .map(n => ({
        school_id: schoolId,
        student_id: n.student_id,
        class_id,
        academic_year,
        level: cls?.level || null,
        filiere: cls?.filiere || null,
        subject_name: String(n.subject_name).trim(),
        exam_type,
        scenario,
        note: Number(n.note),
        updated_at: new Date().toISOString()
      }))
      .filter(n => !Number.isNaN(n.note) && n.note >= 0 && n.note <= 20);

    if (rows.length === 0) return res.json({ saved: 0, data: [] });

    const { data, error } = await supabaseAdmin
      .from('exam_notes')
      .upsert(rows, { onConflict: 'student_id,academic_year,subject_name,exam_type,scenario' })
      .select();
    if (error) throw error;
    res.json({ saved: data.length, data });
  } catch (e) {
    console.error('[Bulletins] exam-notes PUT error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /exam-notes/:id
router.delete('/exam-notes/:id', requireSchoolAdmin, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('exam_notes').delete()
      .eq('id', req.params.id).eq('school_id', req.user.school_id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /certification/preview — calcule la certification d'un élève (sans persister)
//   body : { student_id, class_id, academic_year, mode }
router.post('/certification/preview', requireSchoolAdmin, async (req, res) => {
  try {
    const { student_id, class_id, academic_year, mode } = req.body;
    const result = await computeCertification({
      studentId: student_id, classId: class_id, schoolId: req.user.school_id,
      academicYear: academic_year, mode: mode === 'simili' ? 'simili' : 'real'
    });
    if (!result) return res.status(400).json({ error: 'Ce niveau n\'est pas une année de certification' });
    res.json(result);
  } catch (e) {
    console.error('[Bulletins] certification preview error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. APPRÉCIATIONS PROFESSEUR
// ═══════════════════════════════════════════════════════════════════════════

// GET /appreciations?class_id=...&academic_year=...&semester=...
router.get('/appreciations', async (req, res) => {
  try {
    const { class_id, academic_year, semester } = req.query;
    if (!class_id || !academic_year || !semester) {
      return res.status(400).json({ error: 'class_id, academic_year, semester requis' });
    }

    let query = supabaseAdmin
      .from('teacher_appreciations')
      .select('*')
      .eq('class_id', class_id)
      .eq('academic_year', academic_year)
      .eq('semester', Number(semester));

    // Si prof, ne voir que les siennes
    if (req.user.role === 'teacher') {
      query = query.eq('teacher_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /appreciations (bulk upsert)
router.put('/appreciations', authorize('teacher', 'admin', 'school_admin'), async (req, res) => {
  try {
    const { appreciations } = req.body;
    if (!Array.isArray(appreciations)) return res.status(400).json({ error: 'appreciations[] requis' });

    const rows = appreciations.map(a => ({
      school_id: req.user.school_id,
      teacher_id: req.user.role === 'teacher' ? req.user.id : (a.teacher_id || req.user.id),
      student_id: a.student_id,
      class_id: a.class_id,
      subject_id: a.subject_id || null,
      subject_name: a.subject_name,
      academic_year: a.academic_year,
      semester: Number(a.semester),
      appreciation: a.appreciation || '',
      is_auto_generated: a.is_auto_generated || false,
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabaseAdmin
      .from('teacher_appreciations')
      .upsert(rows, { onConflict: 'student_id,subject_name,academic_year,semester' })
      .select();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /appreciations/auto-generate — génère automatiquement les appréciations
router.post('/appreciations/auto-generate', authorize('teacher', 'admin', 'school_admin'), async (req, res) => {
  try {
    const { class_id, academic_year, semester, subject_name } = req.body;
    if (!class_id || !academic_year || !semester || !subject_name) {
      return res.status(400).json({ error: 'class_id, academic_year, semester, subject_name requis' });
    }

    // Récupérer les élèves de la classe
    const { data: students } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('class_id', class_id)
      .eq('role', 'student');

    if (!students || students.length === 0) return res.json({ generated: 0 });

    const schoolId = req.user.school_id;
    const { start, end } = await getSemesterBounds(schoolId, academic_year, Number(semester));

    // Récupérer les contrôles pour la matière (via teacher_subjects)
    const { data: teacherSubjs } = await supabaseAdmin
      .from('teacher_subjects')
      .select('teacher_id, subjects(name)')
      .eq('subjects.name', subject_name);

    const teacherIds = (teacherSubjs || []).map(t => t.teacher_id);
    if (teacherIds.length === 0) return res.json({ generated: 0, message: 'Aucun prof trouvé pour cette matière' });

    const { data: controls } = await supabaseAdmin
      .from('controls_plan')
      .select('id, kind')
      .eq('class_id', class_id)
      .in('teacher_id', teacherIds)
      .gte('date', start)
      .lte('date', end);

    const controlIds = (controls || []).map(c => c.id);
    if (controlIds.length === 0) return res.json({ generated: 0, message: 'Aucun contrôle trouvé' });

    // Récupérer toutes les notes
    const { data: allNotes } = await supabaseAdmin
      .from('control_notes')
      .select('student_id, control_id, note')
      .in('control_id', controlIds);

    const controlKindMap = new Map((controls || []).map(c => [c.id, c.kind]));

    // Calculer la moyenne par élève et générer l'appréciation
    const rows = [];
    for (const s of students) {
      const studentNotes = (allNotes || []).filter(n => n.student_id === s.id);
      const ctrlNotes = studentNotes.filter(n => controlKindMap.get(n.control_id) !== 'activity').map(n => Number(n.note));
      const actNotes = studentNotes.filter(n => controlKindMap.get(n.control_id) === 'activity').map(n => Number(n.note));

      const ctrlAvg = ctrlNotes.length ? ctrlNotes.reduce((a, b) => a + b, 0) / ctrlNotes.length : null;
      const actAvg = actNotes.length ? actNotes.reduce((a, b) => a + b, 0) / actNotes.length : null;

      let avg = null;
      if (ctrlAvg != null && actAvg != null) avg = ctrlAvg * 0.75 + actAvg * 0.25;
      else if (ctrlAvg != null) avg = ctrlAvg;
      else if (actAvg != null) avg = actAvg;

      let appreciation = '';
      if (avg == null) appreciation = 'Pas de notes';
      else if (avg >= 16) appreciation = 'Excellent travail';
      else if (avg >= 14) appreciation = 'Bon travail';
      else if (avg >= 12) appreciation = 'Travail assez bien';
      else if (avg >= 10) appreciation = 'Travail passable, peut mieux faire';
      else if (avg >= 8) appreciation = 'Travail insuffisant, efforts nécessaires';
      else appreciation = 'Travail très insuffisant, doit travailler davantage';

      rows.push({
        school_id: schoolId,
        teacher_id: req.user.role === 'teacher' ? req.user.id : teacherIds[0],
        student_id: s.id,
        class_id,
        subject_name,
        academic_year,
        semester: Number(semester),
        appreciation,
        is_auto_generated: true,
        updated_at: new Date().toISOString()
      });
    }

    const { data, error } = await supabaseAdmin
      .from('teacher_appreciations')
      .upsert(rows, { onConflict: 'student_id,subject_name,academic_year,semester' })
      .select();
    if (error) throw error;
    res.json({ generated: data.length, data });
  } catch (e) {
    console.error('[Bulletins] auto-generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. GÉNÉRATION / PUBLICATION / ENVOI BULLETINS (admin)
// ═══════════════════════════════════════════════════════════════════════════

// POST /generate — génère (ou régénère) les bulletins pour une classe entière
router.post('/generate', requireSchoolAdmin, async (req, res) => {
  try {
    const { class_id, academic_year, semester, mode } = req.body;
    if (!class_id || !academic_year || !semester) {
      return res.status(400).json({ error: 'class_id, academic_year, semester requis' });
    }

    const schoolId = req.user.school_id;
    const sem = Number(semester);
    const certMode = mode === 'simili' ? 'simili' : 'real';

    // Scoping (pedagogical_manager ne peut générer que ses classes)
    const scopedIds = await getScopedClassIds(req);
    if (scopedIds !== null && !scopedIds.includes(class_id)) {
      return res.status(403).json({ error: 'Classe hors de votre périmètre' });
    }

    // Niveau de la classe → détermine s'il s'agit d'une année de certification
    const { data: genCls } = await supabaseAdmin
      .from('classes').select('level, filiere').eq('id', class_id).single();
    const examLevel = genCls && isExamLevel(genCls.level);

    // Calculer toute la classe
    const result = await computeClassBulletins({ classId: class_id, schoolId, academicYear: academic_year, semester: sem });
    if (!result.classBulletins || result.classBulletins.length === 0) {
      return res.json({ message: 'Aucun élève ou aucune note dans cette classe', bulletins: [] });
    }

    // Récupérer appréciations existantes
    const { data: allAppreciations } = await supabaseAdmin
      .from('teacher_appreciations')
      .select('student_id, subject_name, appreciation')
      .eq('class_id', class_id)
      .eq('academic_year', academic_year)
      .eq('semester', sem);

    const apprMap = new Map();
    (allAppreciations || []).forEach(a => {
      apprMap.set(`${a.student_id}__${a.subject_name}`, a.appreciation);
    });

    // Upsert les bulletins + lignes
    const bulletins = [];
    for (const b of result.classBulletins) {
      const rank = result.classRanking.get(b.student.id);
      const mention = computeMention(b.general_average);

      // Certification annuelle (niveaux إشهادية : 6AP/3AC/1BAC/2BAC)
      let cert = null;
      if (examLevel) {
        try {
          cert = await computeCertification({
            studentId: b.student.id, classId: class_id, schoolId,
            academicYear: academic_year, mode: certMode
          });
        } catch (e) { console.error('[Bulletins] certification error:', e.message); }
      }

      // Upsert bulletin
      const { data: bulletin, error: bErr } = await supabaseAdmin
        .from('bulletins')
        .upsert({
          school_id: schoolId,
          student_id: b.student.id,
          class_id: class_id,
          academic_year,
          semester: sem,
          general_average: b.general_average,
          general_rank: rank || null,
          total_students_in_class: result.totalStudents,
          mention: mention ? mention.fr : null,
          generated_by: req.user.id,
          generated_at: new Date().toISOString(),
          status: 'draft',
          is_exam_level: !!examLevel,
          certification_mode: cert ? certMode : null,
          cc_average: cert ? cert.cc_average : null,
          local_average: cert ? (cert.local?.average ?? null) : null,
          regional_average: cert ? (cert.regional?.average ?? null) : null,
          national_average: cert ? (cert.national?.average ?? null) : null,
          certification_average: cert ? cert.certification_average : null,
          certification_mention: cert?.mention ? cert.mention.fr : null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'student_id,academic_year,semester' })
        .select()
        .single();
      if (bErr) { console.error('[Bulletins] upsert bulletin error:', bErr.message); continue; }

      // Map des notes d'examen par matière (pour figer dans bulletin_lines)
      const examNoteBySubject = new Map();
      if (cert) {
        for (const et of ['local', 'regional', 'national']) {
          (cert[et]?.breakdown || []).forEach(r => {
            const cur = examNoteBySubject.get(r.subject_name) || {};
            cur[et] = r.note;
            examNoteBySubject.set(r.subject_name, cur);
          });
        }
      }

      // Supprimer anciennes lignes puis insérer les nouvelles
      await supabaseAdmin.from('bulletin_lines').delete().eq('bulletin_id', bulletin.id);

      const lineRows = b.lines.map(l => {
        const subjRanks = result.subjectRankings.get(l.subject_name);
        const ex = examNoteBySubject.get(l.subject_name) || {};
        return {
          bulletin_id: bulletin.id,
          subject_id: l.subject_id || null,
          subject_name: l.subject_name,
          controls_avg: l.controls_avg,
          activities_avg: l.activities_avg,
          note_20: l.note_20,
          coefficient: l.coefficient,
          weighted_note: l.weighted_note,
          rank_in_class: subjRanks ? (subjRanks.get(b.student.id) || null) : null,
          appreciation: apprMap.get(`${b.student.id}__${l.subject_name}`) || null,
          local_note: ex.local ?? null,
          regional_note: ex.regional ?? null,
          national_note: ex.national ?? null,
          display_order: l.display_order
        };
      });

      if (lineRows.length > 0) {
        const { error: lErr } = await supabaseAdmin.from('bulletin_lines').insert(lineRows);
        if (lErr) console.error('[Bulletins] insert lines error:', lErr.message);
      }

      bulletins.push({ ...bulletin, lines: lineRows, student: b.student });
    }

    res.json({
      generated: bulletins.length,
      classAverage: result.classAverage,
      totalStudents: result.totalStudents,
      bulletins
    });
  } catch (e) {
    console.error('[Bulletins] generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /publish — publie les bulletins d'une classe (draft → published)
router.post('/publish', requireSchoolAdmin, async (req, res) => {
  try {
    const { class_id, academic_year, semester } = req.body;
    const { data, error } = await supabaseAdmin
      .from('bulletins')
      .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('class_id', class_id)
      .eq('academic_year', academic_year)
      .eq('semester', Number(semester))
      .eq('school_id', req.user.school_id)
      .eq('status', 'draft')
      .select();
    if (error) throw error;
    res.json({ published: (data || []).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /class/:classId?academic_year=...&semester=...
router.get('/class/:classId', requireSchoolAdmin, async (req, res) => {
  try {
    const { classId } = req.params;
    const { academic_year, semester } = req.query;

    let query = supabaseAdmin
      .from('bulletins')
      .select(`
        *,
        profiles!bulletins_student_id_fkey(id, first_name, last_name, massar_code),
        bulletin_lines(*)
      `)
      .eq('class_id', classId)
      .eq('school_id', req.user.school_id);

    if (academic_year) query = query.eq('academic_year', academic_year);
    if (semester) query = query.eq('semester', Number(semester));

    query = query.order('general_rank', { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /pdf/:bulletinId — génère et renvoie le PDF d'un bulletin
router.get('/pdf/:bulletinId', async (req, res) => {
  try {
    const { bulletinId } = req.params;

    // Charger le bulletin + lignes
    const { data: bulletin, error } = await supabaseAdmin
      .from('bulletins')
      .select(`
        *,
        profiles!bulletins_student_id_fkey(id, first_name, last_name, massar_code),
        bulletin_lines(*),
        classes!bulletins_class_id_fkey(id, name, level, filiere, school_id)
      `)
      .eq('id', bulletinId)
      .single();
    if (error || !bulletin) return res.status(404).json({ error: 'Bulletin introuvable' });

    // Vérifier l'accès
    const user = req.user;
    const isAdmin = ['admin', 'school_admin', 'super_admin', 'pedagogical_director', 'pedagogical_manager', 'direction_pedagogique'].includes(user.role);
    const isOwnStudent = user.role === 'student' && user.id === bulletin.student_id && bulletin.status !== 'draft';
    let isParent = false;
    if (user.role === 'parent' && bulletin.status !== 'draft') {
      const { data: rel } = await supabaseAdmin
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', user.id)
        .eq('student_id', bulletin.student_id)
        .maybeSingle();
      isParent = !!rel;
    }
    if (!isAdmin && !isOwnStudent && !isParent) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Config année scolaire + école
    const { data: config } = await supabaseAdmin
      .from('school_year_config')
      .select('*')
      .eq('school_id', bulletin.school_id)
      .eq('academic_year', bulletin.academic_year)
      .maybeSingle();

    const { data: school } = await supabaseAdmin
      .from('schools')
      .select('id, name, address, phone')
      .eq('id', bulletin.school_id)
      .single();

    // Classe average (from all bulletins of this class)
    const { data: allBulletins } = await supabaseAdmin
      .from('bulletins')
      .select('general_average')
      .eq('class_id', bulletin.class_id)
      .eq('academic_year', bulletin.academic_year)
      .eq('semester', bulletin.semester);
    const validAvgs = (allBulletins || []).filter(b => b.general_average != null).map(b => Number(b.general_average));
    const classAverage = validAvgs.length ? (validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length) : null;

    const lines = (bulletin.bulletin_lines || []).sort((a, b) => (a.display_order || 999) - (b.display_order || 999));

    // Certification recalculée en direct selon le mode demandé (?mode=real|simili)
    let certification = null;
    if (bulletin.is_exam_level) {
      const certMode = req.query.mode === 'simili' ? 'simili'
        : (req.query.mode === 'real' ? 'real' : (bulletin.certification_mode || 'real'));
      try {
        certification = await computeCertification({
          studentId: bulletin.student_id, classId: bulletin.class_id,
          schoolId: bulletin.school_id, academicYear: bulletin.academic_year, mode: certMode
        });
      } catch (_) {}
    }

    const pdfBuffer = await generateBulletinPdf({
      student: bulletin.profiles || {},
      cls: bulletin.classes || {},
      lines,
      generalAverage: bulletin.general_average,
      generalRank: bulletin.general_rank,
      totalStudents: bulletin.total_students_in_class,
      classAverage: classAverage != null ? Math.round(classAverage * 100) / 100 : null,
      config: config || {},
      school: school || {},
      academicYear: bulletin.academic_year,
      semester: bulletin.semester,
      notes: bulletin.notes,
      certification
    });

    const rawName = `${bulletin.profiles?.last_name || ''}_${bulletin.profiles?.first_name || ''}`.replace(/\s+/g, '_');
    // ASCII-safe pour filename (header HTTP ne supporte que ASCII), nom complet en filename*
    const asciiName = rawName.replace(/[^\x20-\x7E]/g, '').replace(/[^a-zA-Z0-9_\-]/g, '') || 'eleve';
    const fullName = encodeURIComponent(rawName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `inline; filename="bulletin_${asciiName}_S${bulletin.semester}.pdf"; filename*=UTF-8''bulletin_${fullName}_S${bulletin.semester}.pdf`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[Bulletins] pdf error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /preview — preview PDF sans persister (pour un élève)
router.post('/preview', requireSchoolAdmin, async (req, res) => {
  try {
    const { student_id, class_id, academic_year, semester, mode } = req.body;
    const schoolId = req.user.school_id;
    const sem = Number(semester);

    const result = await computeStudentBulletin({ studentId: student_id, classId: class_id, schoolId, academicYear: academic_year, semester: sem });

    // Certification (si niveau إشهادية)
    let certification = null;
    try {
      certification = await computeCertification({
        studentId: student_id, classId: class_id, schoolId,
        academicYear: academic_year, mode: mode === 'simili' ? 'simili' : 'real'
      });
    } catch (_) {}

    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, massar_code')
      .eq('id', student_id)
      .single();

    const { data: config } = await supabaseAdmin
      .from('school_year_config')
      .select('*')
      .eq('school_id', schoolId)
      .eq('academic_year', academic_year)
      .maybeSingle();

    const { data: school } = await supabaseAdmin
      .from('schools')
      .select('id, name, address, phone')
      .eq('id', schoolId)
      .single();

    const pdfBuffer = await generateBulletinPdf({
      student: student || {},
      cls: result.class || {},
      lines: result.lines,
      generalAverage: result.general_average,
      generalRank: null,
      totalStudents: null,
      classAverage: null,
      config: config || {},
      school: school || {},
      academicYear: academic_year,
      semester: sem,
      certification
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="bulletin_preview.pdf"');
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[Bulletins] preview error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CONSULTATION PARENT / STUDENT
// ═══════════════════════════════════════════════════════════════════════════

// GET /my — bulletins publiés de l'élève connecté
router.get('/my', authorize('student'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bulletins')
      .select(`*, bulletin_lines(*)`)
      .eq('student_id', req.user.id)
      .in('status', ['published', 'sent'])
      .order('academic_year', { ascending: false })
      .order('semester', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /children/:childId — bulletins publiés d'un enfant (parent)
router.get('/children/:childId', authorize('parent'), async (req, res) => {
  try {
    const { childId } = req.params;
    // Vérifier la relation parent-enfant
    const { data: rel } = await supabaseAdmin
      .from('parent_students')
      .select('student_id')
      .eq('parent_id', req.user.id)
      .eq('student_id', childId)
      .maybeSingle();
    if (!rel) return res.status(403).json({ error: 'Accès refusé' });

    const { data, error } = await supabaseAdmin
      .from('bulletins')
      .select(`*, bulletin_lines(*)`)
      .eq('student_id', childId)
      .in('status', ['published', 'sent'])
      .order('academic_year', { ascending: false })
      .order('semester', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. ENVOI WHATSAPP (admin)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/send-whatsapp', requireSchoolAdmin, async (req, res) => {
  try {
    const { bulletin_ids } = req.body;
    if (!Array.isArray(bulletin_ids) || bulletin_ids.length === 0) {
      return res.status(400).json({ error: 'bulletin_ids[] requis' });
    }

    // Import dynamique pour éviter une dépendance circulaire
    const { sendDocument, getStatus } = await import('../services/whatsapp/index.js');

    const schoolId = req.user.school_id;
    const status = await getStatus(schoolId);
    if (!status?.connected) {
      return res.status(400).json({ error: 'Session WhatsApp non connectée' });
    }

    let sent = 0, errors = [];

    for (const bulletinId of bulletin_ids) {
      try {
        // Charger bulletin
        const { data: bulletin } = await supabaseAdmin
          .from('bulletins')
          .select(`
            *,
            profiles!bulletins_student_id_fkey(id, first_name, last_name, massar_code)
          `)
          .eq('id', bulletinId)
          .eq('school_id', schoolId)
          .single();
        if (!bulletin) { errors.push({ bulletinId, error: 'introuvable' }); continue; }

        // Trouver le parent
        const { data: parentLinks } = await supabaseAdmin
          .from('parent_students')
          .select('parent_id, profiles!parent_students_parent_id_fkey(phone)')
          .eq('student_id', bulletin.student_id);

        const parentPhone = parentLinks?.[0]?.profiles?.phone;
        if (!parentPhone) { errors.push({ bulletinId, error: 'pas de téléphone parent' }); continue; }

        // Générer le PDF (réutilise la route /pdf logic)
        // Pour simplifier, on fait un fetch interne — ou on génère directement
        const { data: config } = await supabaseAdmin
          .from('school_year_config')
          .select('*')
          .eq('school_id', schoolId)
          .eq('academic_year', bulletin.academic_year)
          .maybeSingle();

        const { data: school } = await supabaseAdmin
          .from('schools')
          .select('id, name, address, phone')
          .eq('id', schoolId)
          .single();

        const { data: lines } = await supabaseAdmin
          .from('bulletin_lines')
          .select('*')
          .eq('bulletin_id', bulletinId)
          .order('display_order');

        const { data: cls } = await supabaseAdmin
          .from('classes')
          .select('id, name, level, filiere')
          .eq('id', bulletin.class_id)
          .single();

        const pdfBuffer = await generateBulletinPdf({
          student: bulletin.profiles || {},
          cls: cls || {},
          lines: lines || [],
          generalAverage: bulletin.general_average,
          generalRank: bulletin.general_rank,
          totalStudents: bulletin.total_students_in_class,
          classAverage: null,
          config: config || {},
          school: school || {},
          academicYear: bulletin.academic_year,
          semester: bulletin.semester,
          notes: bulletin.notes
        });

        const jid = parentPhone.replace(/^0/, '212').replace(/^\+/, '') + '@s.whatsapp.net';
        const studentName = `${bulletin.profiles?.first_name || ''} ${bulletin.profiles?.last_name || ''}`;
        await sendDocument(schoolId, jid, pdfBuffer, `bulletin_${studentName.replace(/\s+/g, '_')}_S${bulletin.semester}.pdf`,
          `📄 Bulletin scolaire de ${studentName} — Semestre ${bulletin.semester}`);

        // Mettre à jour le statut
        await supabaseAdmin.from('bulletins').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', bulletinId);
        sent++;
      } catch (err) {
        errors.push({ bulletinId, error: err.message });
      }
    }

    res.json({ sent, errors });
  } catch (e) {
    console.error('[Bulletins] send-whatsapp error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
