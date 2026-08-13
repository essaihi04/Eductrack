/**
 * Import d'emplois du temps par IA.
 *
 * Deux étapes, jamais d'écriture sans validation humaine :
 *
 *   1. POST /analyze  — l'admin envoie N pages (photos, captures, ou pages de
 *      PDF déjà rendues en images par le navigateur, avec leur couche texte
 *      quand elle existe). Chaque page est structurée par l'IA, les pages sont
 *      fusionnées par classe, puis les libellés bruts (matière, professeur,
 *      classe) sont rapprochés des enregistrements de l'école.
 *      Rien n'est écrit en base.
 *
 *   2. POST /commit   — l'admin a relu et corrigé la grille dans l'interface ;
 *      on écrit alors l'emploi du temps de chaque classe retenue.
 *
 * Monté sur /api/admin/timetable-import.
 */
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize, getScopedClassIds } from '../middleware/auth.js';
import { memoryUpload } from '../utils/storage.js';
import { extractPage, mergePages } from '../services/timetableImport/extract.js';
import { saveClassTimetable } from '../services/timetableImport/save.js';
import {
  bestMatch, buildSlotRows, normPerson, subjectAliases, DAY_KEYS,
} from '../services/timetableImport/normalize.js';
import { hasOcr, hasTextAi } from '../services/timetableImport/aiProviders.js';

const router = express.Router();
router.use(authenticate);
router.use(authorize('admin', 'school_admin'));

const MAX_PAGES = 20;

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.query.school_id || req.body.school_id || null;
  return req.user.school_id || null;
};

/** Classes visibles par l'utilisateur (respecte le périmètre des rôles délégués). */
async function loadClasses(req, schoolId) {
  let query = supabaseAdmin.from('classes').select('id, name, level, academic_year');
  if (schoolId) query = query.eq('school_id', schoolId);

  const scopedIds = await getScopedClassIds(req);
  if (scopedIds !== null) {
    if (scopedIds.length === 0) return [];
    query = query.in('id', scopedIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function loadSubjects(schoolId) {
  let query = supabaseAdmin.from('subjects').select('id, name, code');
  if (schoolId) query = query.eq('school_id', schoolId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function loadTeachers(schoolId) {
  let query = supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, first_name_ar, last_name_ar')
    .eq('role', 'teacher');
  if (schoolId) query = query.eq('school_id', schoolId);
  const { data, error } = await query;
  if (error) {
    // Les colonnes arabes n'existent pas sur toutes les installations.
    let fallback = supabaseAdmin.from('profiles').select('id, first_name, last_name').eq('role', 'teacher');
    if (schoolId) fallback = fallback.eq('school_id', schoolId);
    const { data: basic, error: basicErr } = await fallback;
    if (basicErr) throw basicErr;
    return basic || [];
  }
  return data || [];
}

// Le nom et le code de la matière, plus ses équivalents dans l'autre langue :
// une école qui saisit « Mathématiques » doit reconnaître « الرياضيات ».
const subjectCandidates = (subjects) =>
  subjects.map((s) => ({ id: s.id, labels: [s.name, s.code, ...subjectAliases(s.name)] }));

const teacherCandidates = (teachers) =>
  teachers.map((t) => {
    const first = t.first_name || '';
    const last = t.last_name || '';
    const firstAr = t.first_name_ar || '';
    const lastAr = t.last_name_ar || '';
    return {
      id: t.id,
      labels: [
        `${first} ${last}`, `${last} ${first}`, last, first,
        firstAr && lastAr ? `${firstAr} ${lastAr}` : '',
        firstAr && lastAr ? `${lastAr} ${firstAr}` : '',
        lastAr,
      ].filter(Boolean),
    };
  });

const classCandidates = (classes) =>
  classes.map((c) => ({ id: c.id, labels: [c.name, [c.level, c.name].filter(Boolean).join(' ')] }));

// ── 1) ANALYSE ────────────────────────────────────────────────────────────

const pageUpload = memoryUpload(25);

router.post('/analyze', pageUpload.array('files', MAX_PAGES), async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier reçu' });
    }

    // Métadonnées alignées sur l'ordre des fichiers : { name, text, source }.
    let meta = [];
    try {
      meta = JSON.parse(req.body.meta || '[]');
    } catch (_) {
      meta = [];
    }

    const pages = files.map((f, i) => ({
      name: meta[i]?.name || f.originalname || `page-${i + 1}`,
      mimeType: f.mimetype || 'image/png',
      buffer: f.buffer,
      text: meta[i]?.text || '',
      source: meta[i]?.source || 'image',
    }));

    // DeepSeek structure le texte : sans lui, rien n'est possible.
    // Mistral n'intervient que sur les pages sans couche texte.
    if (!hasTextAi()) {
      return res.status(400).json({
        error: 'Import IA indisponible : DEEPSEEK_API_KEY non configurée sur le serveur.',
      });
    }

    // Les pages sont traitées en séquence : un emploi du temps fait quelques
    // pages, et cela évite de saturer le quota du fournisseur IA.
    const pageResults = [];
    for (const page of pages) {
      const result = await extractPage(page);
      pageResults.push({ name: page.name, ...result });
    }

    const [classes, subjects, teachers] = await Promise.all([
      loadClasses(req, schoolId),
      loadSubjects(schoolId),
      loadTeachers(schoolId),
    ]);

    const subjPool = subjectCandidates(subjects);
    const teachPool = teacherCandidates(teachers);
    const classPool = classCandidates(classes);

    const groups = mergePages(pageResults).map((group, idx) => {
      const classHit = group.detected_class_name
        ? bestMatch(group.detected_class_name, classPool)
        : { id: null, score: 0, status: 'unmatched' };

      const { rows, indexOf } = buildSlotRows(group.slots);

      const slots = group.slots.map((s) => {
        const subjHit = bestMatch(s.subject_raw, subjPool);
        const teachHit = s.teacher_raw
          ? bestMatch(normPerson(s.teacher_raw), teachPool)
          : { id: null, score: 0, status: 'empty' };

        const rowIdx = indexOf(s.start_time, s.end_time || s.start_time);

        return {
          day_of_week: s.day_of_week,
          slot_order: rowIdx + 1,
          start_time: s.start_time,
          end_time: s.end_time || rows[rowIdx]?.end_time || s.start_time,
          room: s.room,
          subject_raw: s.subject_raw,
          subject_id: subjHit.id,
          subject_status: subjHit.status,
          subject_score: Number(subjHit.score.toFixed(2)),
          teacher_raw: s.teacher_raw,
          teacher_id: teachHit.id,
          teacher_status: teachHit.status,
          teacher_score: Number((teachHit.score || 0).toFixed(2)),
        };
      });

      // Libellés de matières jamais reconnus : proposés à la création en un clic.
      const unknownSubjects = [...new Set(
        slots.filter((s) => !s.subject_id).map((s) => s.subject_raw),
      )];
      const unknownTeachers = [...new Set(
        slots.filter((s) => s.teacher_raw && !s.teacher_id).map((s) => s.teacher_raw),
      )];

      return {
        temp_id: `grp_${idx}`,
        detected_class_name: group.detected_class_name,
        class_id: classHit.id,
        class_status: classHit.status,
        class_score: Number(classHit.score.toFixed(2)),
        pages: group.pages,
        time_rows: rows,
        slots,
        unknown_subjects: unknownSubjects,
        unknown_teachers: unknownTeachers,
      };
    });

    res.json({
      groups,
      pages: pageResults.map((p) => ({ name: p.name, method: p.method, error: p.error || null, found: p.timetables.length })),
      reference: { classes, subjects, teachers },
      days: DAY_KEYS,
      warnings: pageResults.filter((p) => p.error).map((p) => `${p.name} : ${p.error}`),
    });
  } catch (error) {
    console.error('Erreur analyse import emploi du temps:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ── 2) CRÉATION DES MATIÈRES MANQUANTES ───────────────────────────────────

/**
 * `subjects.code` est NOT NULL et unique par école : on dérive un code lisible
 * du nom (« Physique-Chimie » → PHYSIQUECHI) et on le suffixe si nécessaire.
 * Les noms en arabe ne produisent aucune lettre latine → repli sur MAT1, MAT2…
 */
function buildSubjectCode(name, taken) {
  const base = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10) || 'MAT';

  let code = base;
  let i = 1;
  while (taken.has(code)) {
    const suffix = String(++i);
    code = base.slice(0, Math.max(1, 10 - suffix.length)) + suffix;
  }
  taken.add(code);
  return code;
}

router.post('/subjects', async (req, res) => {
  try {
    const { names } = req.body;
    const schoolId = getSchoolId(req);
    if (!Array.isArray(names) || names.length === 0) {
      return res.status(400).json({ error: 'names doit être un tableau non vide' });
    }

    const existing = await loadSubjects(schoolId);
    const taken = new Set(existing.map((s) => (s.code || '').toUpperCase()).filter(Boolean));
    const existingNames = new Set(existing.map((s) => (s.name || '').trim().toLowerCase()));

    const rows = names
      .map((n) => String(n || '').trim())
      .filter((n) => n && !existingNames.has(n.toLowerCase()))
      .slice(0, 60)
      .map((name) => ({ name, code: buildSubjectCode(name, taken), school_id: schoolId }));

    if (rows.length === 0) return res.status(200).json([]);

    const { data, error } = await supabaseAdmin.from('subjects').insert(rows).select();
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (error) {
    console.error('Erreur création matières (import):', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ── 3) VALIDATION ─────────────────────────────────────────────────────────

router.post('/commit', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { imports } = req.body;

    if (!Array.isArray(imports) || imports.length === 0) {
      return res.status(400).json({ error: 'imports doit être un tableau non vide' });
    }

    // Aucune écriture hors du périmètre de l'utilisateur.
    const allowed = new Set((await loadClasses(req, schoolId)).map((c) => c.id));

    const results = [];
    for (const item of imports) {
      const classId = item?.class_id;
      if (!classId || !allowed.has(classId)) {
        results.push({ class_id: classId || null, ok: false, error: 'Classe inconnue ou hors périmètre' });
        continue;
      }

      // Seuls les créneaux ayant une matière résolue sont écrits : la table
      // n'a pas de sens avec un cours sans matière, et l'admin a eu l'occasion
      // de compléter ou de supprimer les lignes en attente.
      // La table impose UNIQUE(class_id, day_of_week, slot_order) : deux
      // créneaux d'un même jour ramenés sur la même ligne de grille (documents
      // aux horaires irréguliers) feraient échouer tout l'enregistrement. On
      // ne garde alors que le premier et on le signale.
      const seen = new Set();
      const skipped = [];
      const slots = (item.slots || [])
        .filter((s) => s.subject_id && DAY_KEYS.includes(s.day_of_week) && s.start_time && s.end_time)
        .filter((s) => {
          const key = `${s.day_of_week}_${s.slot_order}`;
          if (seen.has(key)) { skipped.push(`${s.day_of_week} ${s.start_time}`); return false; }
          seen.add(key);
          return true;
        })
        .map((s) => ({
          day_of_week: s.day_of_week,
          slot_order: s.slot_order,
          start_time: s.start_time,
          end_time: s.end_time,
          subject_id: s.subject_id,
          teacher_id: s.teacher_id || null,
          room: s.room || null,
        }));

      try {
        const saved = await saveClassTimetable({ classId, schoolId, slots });
        results.push({ class_id: classId, ok: true, slots: saved.length, skipped });
      } catch (e) {
        console.error('Erreur commit emploi du temps', classId, e);
        results.push({ class_id: classId, ok: false, error: e.message });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Erreur commit import emploi du temps:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// ── État de la configuration IA (affiché dans l'interface) ────────────────

router.get('/status', (req, res) => {
  res.json({
    text_ai: hasTextAi(), // DeepSeek — structuration
    ocr_ai: hasOcr(), // Mistral OCR — pages images / PDF scannés
    max_pages: MAX_PAGES,
  });
});

export default router;
