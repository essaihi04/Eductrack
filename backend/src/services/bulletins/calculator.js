// ============================================================================
// Service de calcul des bulletins scolaires (système marocain)
//
// Règle officielle :
//   note_matiere = moyenne_controles * 0.75 + moyenne_activites * 0.25
//   moyenne_generale = SUM(note_matiere * coef) / SUM(coef)
//
// Sources des données :
//   - controls_plan (kind = 'control' | 'activity') : épreuves planifiées
//   - control_notes : notes des élèves
//   - controls_plan.subject_id : rattachement obligatoire à la matière
//   - subject_coefficients : coefficients par niveau / filière / matière
//   - school_year_config : bornes des semestres
// ============================================================================

import { supabaseAdmin } from '../../config/supabase.js';
import { getDefaultYearBounds } from './schoolCalendar.js';
import { canonicalSubject, collapseControlsBySlot, resolveControls } from '../controlSubjects.js';
import { activeEnrollmentMap, sameSchoolYear } from '../../utils/enrollmentScope.js';

const round2 = (n) => Math.round(n * 100) / 100;

// ─── Niveaux « إشهادية » avec examen de certification ──────────────────────
//   Pondérations officielles MEN (cf. MIGRATION_EXAMS.sql) :
//     • 2BAC : 25% CC + 25% régional (passé en 1BAC) + 50% national
//     • 1BAC : moyenne de l'examen régional (= 25% du Bac final)
//     • 3AC  : 30% CC + 30% local + 40% régional
//     • 6AP  : 50% CC + 25% local + 25% régional  [(CC×2 + local + régional)/4]
export const CERTIFICATION_LEVELS = {
  '2BAC': { exams: ['national', 'regional'], weights: { cc: 0.25, regional: 0.25, national: 0.50 } },
  '1BAC': { exams: ['regional'],             weights: { cc: 0,    regional: 1.0 } },
  '3AC':  { exams: ['regional', 'local'],    weights: { cc: 0.30, local: 0.30, regional: 0.40 } },
  '6AP':  { exams: ['regional', 'local'],    weights: { cc: 0.50, local: 0.25, regional: 0.25 } },
};

export const isExamLevel = (level) => !!CERTIFICATION_LEVELS[level];

const MENTIONS = [
  { min: 16, fr: 'Très Bien',     ar: 'حسن جدا' },
  { min: 14, fr: 'Bien',          ar: 'حسن' },
  { min: 12, fr: 'Assez Bien',    ar: 'مستحسن' },
  { min: 10, fr: 'Passable',      ar: 'مقبول' },
  { min: 0,  fr: 'Insuffisant',   ar: 'ضعيف' }
];

export const computeMention = (avg) => {
  if (avg == null) return null;
  return MENTIONS.find(m => avg >= m.min) || MENTIONS[MENTIONS.length - 1];
};

/**
 * Récupère les bornes du semestre.
 * Défauts : S1 = 1er sept → 31 jan ; S2 = 1er fév → 30 juin
 */
export const getSemesterBounds = async (schoolId, academicYear, semester) => {
  const { data: cfg } = await supabaseAdmin
    .from('school_year_config')
    .select('*')
    .eq('school_id', schoolId)
    .eq('academic_year', academicYear)
    .maybeSingle();

  if (cfg) {
    if (semester === 1 && cfg.semester_1_start && cfg.semester_1_end) {
      return { start: cfg.semester_1_start, end: cfg.semester_1_end, config: cfg };
    }
    if (semester === 2 && cfg.semester_2_start && cfg.semester_2_end) {
      return { start: cfg.semester_2_start, end: cfg.semester_2_end, config: cfg };
    }
  }

  // Défauts officiels MEN
  const def = getDefaultYearBounds(academicYear);
  if (semester === 1) {
    return { start: def.s1_start, end: def.s1_end, config: cfg };
  }
  return { start: def.s2_start, end: def.s2_end, config: cfg };
};

/**
 * Récupère les coefficients pour un niveau/filière (avec override école).
 * Retourne un Map<subject_name, { coefficient, display_order }>.
 */
export const getCoefficients = async (schoolId, level, filiere) => {
  // 1. Surcharges école
  const { data: schoolCoefs } = await supabaseAdmin
    .from('subject_coefficients')
    .select('subject_name, coefficient, display_order')
    .eq('school_id', schoolId)
    .eq('level', level)
    .eq('filiere', filiere || null);

  // 2. Défauts globaux
  const { data: globalCoefs } = await supabaseAdmin
    .from('subject_coefficients')
    .select('subject_name, coefficient, display_order')
    .is('school_id', null)
    .eq('level', level)
    .eq('filiere', filiere || null);

  const map = new Map();
  (globalCoefs || []).forEach(c => {
    const subject = canonicalSubject(c.subject_name);
    map.set(subject.label, {
      coefficient: Number(c.coefficient),
      display_order: c.display_order
    });
  });
  // Les overrides école écrasent les globaux
  (schoolCoefs || []).forEach(c => {
    const subject = canonicalSubject(c.subject_name);
    map.set(subject.label, {
      coefficient: Number(c.coefficient),
      display_order: c.display_order
    });
  });
  return map;
};

/**
 * Calcule les lignes du bulletin pour UN élève.
 * Retourne :
 *   { lines: [{ subject_id, subject_name, controls_avg, activities_avg, note_20, coefficient, weighted_note }],
 *     general_average, mention }
 *
 * Sans persistance — utilisable pour preview avant publication.
 *
 * withDetail = true → chaque ligne inclut en plus controls_detail / activities_detail :
 * la liste des épreuves individuelles [{ id, name, date, note }] triées par date
 * (note = null si l'élève n'a pas encore de note pour cette épreuve). Sert à la
 * vue « Notes d'élève » (colonnes C1, C2, C3…).
 */
export const computeStudentBulletin = async ({
  studentId, classId, schoolId, academicYear, semester, _bounds, withDetail = false
}) => {
  // 1. Classe + niveau/filière
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name, level, filiere, school_id, academic_year')
    .eq('id', classId)
    .single();
  if (!cls) throw new Error('Classe introuvable');

  // 2. Bornes de la période (semestre, ou bornes annuelles si _bounds fourni)
  const { start, end } = _bounds || await getSemesterBounds(schoolId, academicYear, semester);

  // 3. Contrôles actuels de la classe sur la période.
  const { data: currentControls } = await supabaseAdmin
    .from('controls_plan')
    .select('id, class_id, name, date, teacher_id, kind, subject_id, status, semester, official_key')
    .eq('class_id', classId)
    .gte('date', start)
    .lte('date', end)
    .neq('status', 'cancelled');

  // La note appartient à l'élève. On récupère donc aussi ses notes portées par
  // un contrôle de son ancienne classe, dans la même école et la même année.
  // Les contrôles actuels vides restent présents pour conserver un bulletin
  // complet ; collapseControlsBySlot choisira la version réellement notée.
  const allStudentNotes = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('control_notes')
      .select('id, control_id, note, appreciation')
      .eq('student_id', studentId)
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    allStudentNotes.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const currentControlIds = new Set((currentControls || []).map((control) => control.id));
  const historicalControlIds = [...new Set(allStudentNotes
    .map((note) => note.control_id)
    .filter((id) => id && !currentControlIds.has(id)))];
  const historicalControls = [];
  for (let i = 0; i < historicalControlIds.length; i += 100) {
    const { data, error } = await supabaseAdmin
      .from('controls_plan')
      .select('id, class_id, name, date, teacher_id, kind, subject_id, status, semester, official_key')
      .in('id', historicalControlIds.slice(i, i + 100))
      .gte('date', start)
      .lte('date', end)
      .neq('status', 'cancelled');
    if (error) throw error;
    historicalControls.push(...(data || []));
  }
  const sourceClassIds = [...new Set(historicalControls.map((control) => control.class_id).filter(Boolean))];
  let sourceClasses = [];
  if (sourceClassIds.length) {
    const { data, error } = await supabaseAdmin
      .from('classes')
      .select('id, school_id, academic_year')
      .in('id', sourceClassIds);
    if (error) throw error;
    sourceClasses = data || [];
  }
  const allowedSourceClassIds = new Set(sourceClasses
    .filter((sourceClass) => (!schoolId || sourceClass.school_id === schoolId)
      && sameSchoolYear(sourceClass.academic_year, academicYear || cls.academic_year))
    .map((sourceClass) => sourceClass.id));
  const acceptedHistoricalControls = historicalControls
    .filter((control) => allowedSourceClassIds.has(control.class_id));
  const acceptedIds = new Set([
    ...(currentControls || []).map((control) => control.id),
    ...acceptedHistoricalControls.map((control) => control.id),
  ]);
  const controlsRaw = [...(currentControls || []), ...acceptedHistoricalControls];
  const teacherIds = [...new Set(controlsRaw.map((control) => control.teacher_id).filter(Boolean))];
  let teacherSubjects = [];
  if (teacherIds.length) {
    const { data } = await supabaseAdmin
      .from('teacher_subjects')
      .select('teacher_id, subject_id')
      .in('teacher_id', teacherIds);
    teacherSubjects = data || [];
  }

  const subjectIds = [...new Set([
    ...controlsRaw.map((control) => control.subject_id),
    ...teacherSubjects.map((row) => row.subject_id),
  ].filter(Boolean))];
  let subjectRows = [];
  if (subjectIds.length) {
    const { data } = await supabaseAdmin
      .from('subjects').select('id, name, code').in('id', subjectIds);
    subjectRows = data || [];
  }

  const controlsArr = resolveControls(controlsRaw, subjectRows, teacherSubjects);
  // 4. Notes de l'élève sur les contrôles acceptés, quelle que soit la classe
  // source de la même année scolaire.
  const notes = allStudentNotes.filter((note) => acceptedIds.has(note.control_id));

  // 5. Grouper par matière. Les anciens contrôles sans subject_id sont récupérés
  // seulement lorsque leur professeur possède une unique matière.
  // Structure : { subjectName: { subject_id, controls: [], activities: [] } }
  const buckets = {};
  const noteByControl = new Map((notes || []).map(n => [n.control_id, Number(n.note)]));
  const noteCounts = new Map((notes || []).map((note) => [note.control_id, 1]));
  const effectiveControls = collapseControlsBySlot(controlsArr, noteCounts);

  for (const ctrl of effectiveControls) {
    const subj = ctrl.resolved_subject;
    if (!subj || !subj.label) continue;
    const key = subj.label.trim();
    if (!buckets[key]) {
      buckets[key] = { subject_id: subj.id, subject_name: key, controls: [], activities: [], controlsDetail: [], activitiesDetail: [] };
    }
    if (noteByControl.has(ctrl.id)) {
      const note = noteByControl.get(ctrl.id);
      if (ctrl.kind === 'activity') buckets[key].activities.push(note);
      else buckets[key].controls.push(note);
    }
    if (withDetail) {
      // Toutes les épreuves de la période, notées ou non (note = null si absente).
      const detail = {
        id: ctrl.id, name: ctrl.name, date: ctrl.date,
        note: noteByControl.has(ctrl.id) ? noteByControl.get(ctrl.id) : null,
      };
      if (ctrl.kind === 'activity') buckets[key].activitiesDetail.push(detail);
      else buckets[key].controlsDetail.push(detail);
    }
  }

  if (withDetail) {
    // Ordre chronologique → C1 = 1re épreuve, C2 = 2e, etc.
    const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''));
    Object.values(buckets).forEach(b => {
      b.controlsDetail.sort(byDate);
      b.activitiesDetail.sort(byDate);
    });
  }

  // 7. Coefficients (référentiel : on génère une ligne par matière du niveau,
  //    même sans note, pour avoir un bulletin complet)
  const coefs = await getCoefficients(schoolId, cls.level, cls.filiere);

  // 8. Calculer note par matière (en partant des coefficients pour avoir TOUTES
  //    les matières du niveau, puis on ajoute aussi celles qui ont des notes
  //    mais ne sont pas dans le référentiel)
  const lines = [];
  const seenSubjects = new Set();

  // 8a. Matières du référentiel de coefficients
  for (const [subjName, coefEntry] of coefs.entries()) {
    seenSubjects.add(subjName);
    const b = buckets[subjName];
    const cAvg = b && b.controls.length ? b.controls.reduce((s, n) => s + n, 0) / b.controls.length : null;
    const aAvg = b && b.activities.length ? b.activities.reduce((s, n) => s + n, 0) / b.activities.length : null;

    let note20 = null;
    if (cAvg != null && aAvg != null) note20 = cAvg * 0.75 + aAvg * 0.25;
    else if (cAvg != null) note20 = cAvg;
    else if (aAvg != null) note20 = aAvg;

    lines.push({
      subject_id: b?.subject_id || coefEntry.subject_id || null,
      subject_name: subjName,
      controls_avg: cAvg != null ? round2(cAvg) : null,
      activities_avg: aAvg != null ? round2(aAvg) : null,
      note_20: note20 != null ? round2(note20) : null,
      coefficient: coefEntry.coefficient,
      weighted_note: note20 != null ? round2(note20 * coefEntry.coefficient) : null,
      display_order: coefEntry.display_order,
      ...(withDetail ? {
        controls_detail: b?.controlsDetail || [],
        activities_detail: b?.activitiesDetail || [],
      } : {})
    });
  }

  // 8b. Matières avec notes mais hors référentiel (coef par défaut = 1)
  for (const key of Object.keys(buckets)) {
    if (seenSubjects.has(key)) continue;
    const b = buckets[key];
    const cAvg = b.controls.length ? b.controls.reduce((s, n) => s + n, 0) / b.controls.length : null;
    const aAvg = b.activities.length ? b.activities.reduce((s, n) => s + n, 0) / b.activities.length : null;

    let note20 = null;
    if (cAvg != null && aAvg != null) note20 = cAvg * 0.75 + aAvg * 0.25;
    else if (cAvg != null) note20 = cAvg;
    else if (aAvg != null) note20 = aAvg;

    lines.push({
      subject_id: b.subject_id,
      subject_name: key,
      controls_avg: cAvg != null ? round2(cAvg) : null,
      activities_avg: aAvg != null ? round2(aAvg) : null,
      note_20: note20 != null ? round2(note20) : null,
      coefficient: 1,
      weighted_note: note20 != null ? round2(note20) : null,
      display_order: 999,
      ...(withDetail ? {
        controls_detail: b.controlsDetail || [],
        activities_detail: b.activitiesDetail || [],
      } : {})
    });
  }

  lines.sort((a, b) => a.display_order - b.display_order);

  // Moyenne générale : uniquement sur les matières AVEC note
  const withNote = lines.filter(l => l.note_20 != null);
  const totalCoef = withNote.reduce((s, l) => s + l.coefficient, 0);
  const totalWeighted = withNote.reduce((s, l) => s + l.weighted_note, 0);
  const generalAverage = totalCoef > 0 ? round2(totalWeighted / totalCoef) : null;

  return {
    lines,
    general_average: generalAverage,
    mention: computeMention(generalAverage),
    class: cls
  };
};

/**
 * Calcule TOUTE la classe pour pouvoir établir les rangs.
 * Retourne : { classBulletins: [{ studentId, lines, general_average }],
 *              classAverage, classRanking: Map<studentId, rank>,
 *              subjectRankings: Map<subjectName, Map<studentId, rank>> }
 */
export const computeClassBulletins = async ({ classId, schoolId, academicYear, semester }) => {
  // 1. Effectif de cette classe pour l'année demandée. Le profil peut déjà
  // pointer vers une autre répartition ou l'année suivante.
  const enrollmentMap = await activeEnrollmentMap(schoolId, academicYear);
  const enrolledStudentIds = enrollmentMap
    ? [...enrollmentMap.entries()]
      .filter(([, enrollment]) => enrollment.class_id === classId)
      .map(([studentId]) => studentId)
    : null;
  let students = [];
  if (enrolledStudentIds === null || enrolledStudentIds.length > 0) {
    let studentsQuery = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, massar_code')
      .eq('role', 'student');
    studentsQuery = enrolledStudentIds === null
      ? studentsQuery.eq('class_id', classId)
      : studentsQuery.in('id', enrolledStudentIds);
    const { data, error } = await studentsQuery;
    if (error) throw error;
    students = data || [];
  }

  if (students.length === 0) return { classBulletins: [] };

  // 2. Calcul individuel pour chaque élève (boucle séquentielle = simple ; OK
  //    pour 30 élèves)
  const classBulletins = [];
  for (const s of students) {
    const r = await computeStudentBulletin({
      studentId: s.id, classId, schoolId, academicYear, semester
    });
    classBulletins.push({ student: s, ...r });
  }

  // 3. Ranking général
  const sortedGeneral = [...classBulletins]
    .filter(b => b.general_average != null)
    .sort((a, b) => b.general_average - a.general_average);

  const classRanking = new Map();
  let prevAvg = null, prevRank = 0;
  sortedGeneral.forEach((b, idx) => {
    const rank = b.general_average === prevAvg ? prevRank : idx + 1;
    classRanking.set(b.student.id, rank);
    prevAvg = b.general_average;
    prevRank = rank;
  });

  // 4. Ranking par matière
  const subjectRankings = new Map();
  const allSubjects = new Set();
  classBulletins.forEach(b => b.lines.forEach(l => allSubjects.add(l.subject_name)));

  for (const subj of allSubjects) {
    const subRows = classBulletins
      .map(b => ({ studentId: b.student.id, line: b.lines.find(l => l.subject_name === subj) }))
      .filter(r => r.line)
      .sort((a, b) => b.line.note_20 - a.line.note_20);

    const ranks = new Map();
    let pAvg = null, pRk = 0;
    subRows.forEach((r, idx) => {
      const rk = r.line.note_20 === pAvg ? pRk : idx + 1;
      ranks.set(r.studentId, rk);
      pAvg = r.line.note_20; pRk = rk;
    });
    subjectRankings.set(subj, ranks);
  }

  // 5. Moyenne de classe
  const classAverage = sortedGeneral.length
    ? round2(sortedGeneral.reduce((s, b) => s + b.general_average, 0) / sortedGeneral.length)
    : null;

  return {
    classBulletins,
    classAverage,
    classRanking,
    subjectRankings,
    totalStudents: students.length
  };
};

// ════════════════════════════════════════════════════════════════════════════
//  EXAMENS DE CERTIFICATION (national / régional / local)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Bornes de l'année scolaire complète (S1 début → S2 fin).
 * Sert au calcul du contrôle continu ANNUEL (les deux semestres).
 */
export const getYearBounds = async (schoolId, academicYear) => {
  const { data: cfg } = await supabaseAdmin
    .from('school_year_config')
    .select('semester_1_start, semester_2_end, year_start, year_end')
    .eq('school_id', schoolId)
    .eq('academic_year', academicYear)
    .maybeSingle();

  const def = getDefaultYearBounds(academicYear);
  const start = cfg?.year_start || cfg?.semester_1_start || def.s1_start;
  const end   = cfg?.year_end   || cfg?.semester_2_end   || def.s2_end;
  return { start, end };
};

/**
 * Coefficients d'examen (national/régional/local) pour un niveau/filière.
 * Retourne Map<subject_name, { coefficient, display_order }>.
 * Surcharges école > défauts globaux MEN.
 */
export const getExamCoefficients = async (schoolId, level, filiere, examType) => {
  const base = supabaseAdmin
    .from('exam_coefficients')
    .select('subject_name, coefficient, display_order, school_id')
    .eq('level', level)
    .eq('exam_type', examType);

  const q = filiere ? base.eq('filiere', filiere) : base.is('filiere', null);

  const { data } = await q.or(`school_id.eq.${schoolId},school_id.is.null`);
  const map = new Map();
  // Globaux d'abord, puis surcharges école (qui écrasent)
  (data || []).filter(c => !c.school_id).forEach(c =>
    map.set(c.subject_name.trim(), { coefficient: Number(c.coefficient), display_order: c.display_order }));
  (data || []).filter(c => c.school_id).forEach(c =>
    map.set(c.subject_name.trim(), { coefficient: Number(c.coefficient), display_order: c.display_order }));
  return map;
};

/**
 * Résout les notes d'examen d'un élève pour une année, selon le mode.
 *   - mode 'real'   : uniquement scénario 'real'
 *   - mode 'simili' : 'real' si présent, sinon 'mock' (examen blanc)
 * Retourne Map<examType, Map<subject_name, note>>.
 */
export const getResolvedExamNotes = async (studentId, academicYear, mode) => {
  const { data } = await supabaseAdmin
    .from('exam_notes')
    .select('subject_name, exam_type, scenario, note')
    .eq('student_id', studentId)
    .eq('academic_year', academicYear);

  const out = new Map(); // examType -> Map(subject -> { real, mock })
  (data || []).forEach(r => {
    if (r.note == null) return;
    if (!out.has(r.exam_type)) out.set(r.exam_type, new Map());
    const sub = out.get(r.exam_type);
    const key = r.subject_name.trim();
    const cur = sub.get(key) || {};
    cur[r.scenario] = Number(r.note);
    sub.set(key, cur);
  });

  // Résolution selon le mode
  const resolved = new Map();
  for (const [examType, sub] of out.entries()) {
    const m = new Map();
    for (const [subject, vals] of sub.entries()) {
      const note = mode === 'simili'
        ? (vals.real != null ? vals.real : vals.mock)
        : vals.real;
      if (note != null) m.set(subject, note);
    }
    if (m.size) resolved.set(examType, m);
  }
  return resolved;
};

/**
 * Moyenne pondérée d'un examen = Σ(note×coef)/Σ(coef) sur les matières notées.
 * Retourne { average, breakdown: [{ subject_name, note, coefficient }] }.
 */
const weightedExamAverage = (coefMap, noteMap) => {
  const breakdown = [];
  let totW = 0, totN = 0;
  for (const [subject, { coefficient, display_order }] of coefMap.entries()) {
    const note = noteMap.get(subject);
    if (note == null) { breakdown.push({ subject_name: subject, note: null, coefficient, display_order }); continue; }
    totW += coefficient;
    totN += note * coefficient;
    breakdown.push({ subject_name: subject, note: round2(note), coefficient, display_order });
  }
  breakdown.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
  return { average: totW > 0 ? round2(totN / totW) : null, breakdown };
};

/**
 * Calcule la moyenne de certification annuelle d'un élève.
 *
 * @param {string} mode  'real' | 'simili'
 * @returns {Promise<null | {
 *   mode, level, filiere,
 *   cc_average, local: {average,breakdown}, regional: {...}, national: {...},
 *   certification_average, mention, components: {cc,local,regional,national},
 *   complete: boolean
 * }>}  (null si le niveau n'est pas une année de certification)
 */
export const computeCertification = async ({ studentId, classId, schoolId, academicYear, mode = 'real' }) => {
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, level, filiere')
    .eq('id', classId)
    .single();
  if (!cls) throw new Error('Classe introuvable');

  const conf = CERTIFICATION_LEVELS[cls.level];
  if (!conf) return null; // pas une année de certification

  // 1. Contrôle continu ANNUEL (les deux semestres)
  const { start, end } = await getYearBounds(schoolId, academicYear);
  const ccBulletin = await computeStudentBulletin({
    studentId, classId, schoolId, academicYear, semester: null, _bounds: { start, end }
  });
  const ccAverage = ccBulletin.general_average; // déjà pondéré par coefficients du cursus

  // 2. Moyennes des examens (selon le mode)
  const resolvedNotes = await getResolvedExamNotes(studentId, academicYear, mode);
  const examResults = {};
  for (const examType of conf.exams) {
    const coefMap = await getExamCoefficients(schoolId, cls.level, cls.filiere, examType);
    const noteMap = resolvedNotes.get(examType) || new Map();
    examResults[examType] = weightedExamAverage(coefMap, noteMap);
  }

  // 3. Combinaison pondérée (renormalisée sur les composantes disponibles)
  const components = {
    cc:       conf.weights.cc       ? { weight: conf.weights.cc,       value: ccAverage } : null,
    local:    conf.weights.local    ? { weight: conf.weights.local,    value: examResults.local?.average ?? null } : null,
    regional: conf.weights.regional ? { weight: conf.weights.regional, value: examResults.regional?.average ?? null } : null,
    national: conf.weights.national ? { weight: conf.weights.national, value: examResults.national?.average ?? null } : null,
  };

  let sumW = 0, sumWN = 0, present = 0, expected = 0;
  for (const c of Object.values(components)) {
    if (!c) continue;
    expected++;
    if (c.value != null) { sumW += c.weight; sumWN += c.weight * c.value; present++; }
  }
  const certificationAverage = sumW > 0 ? round2(sumWN / sumW) : null;

  return {
    mode,
    level: cls.level,
    filiere: cls.filiere,
    cc_average: ccAverage,
    cc_lines: ccBulletin.lines,
    local: examResults.local || null,
    regional: examResults.regional || null,
    national: examResults.national || null,
    certification_average: certificationAverage,
    mention: computeMention(certificationAverage),
    components,
    complete: present === expected && expected > 0,
  };
};
