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
//   - teacher_subjects : permet de déduire la matière (controls_plan n'a pas
//     subject_id ; on utilise le teacher_id pour retrouver la matière)
//   - subject_coefficients : coefficients par niveau / filière / matière
//   - school_year_config : bornes des semestres
// ============================================================================

import { supabaseAdmin } from '../../config/supabase.js';
import { getDefaultYearBounds } from './schoolCalendar.js';

const round2 = (n) => Math.round(n * 100) / 100;

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
  (globalCoefs || []).forEach(c => map.set(c.subject_name.trim(), {
    coefficient: Number(c.coefficient),
    display_order: c.display_order
  }));
  // Les overrides école écrasent les globaux
  (schoolCoefs || []).forEach(c => map.set(c.subject_name.trim(), {
    coefficient: Number(c.coefficient),
    display_order: c.display_order
  }));
  return map;
};

/**
 * Récupère la matière enseignée par un professeur (1er match).
 * controls_plan n'a pas de subject_id → on infère via teacher_subjects.
 */
const getTeacherSubjectsMap = async (teacherIds) => {
  if (!teacherIds.length) return new Map();
  const { data } = await supabaseAdmin
    .from('teacher_subjects')
    .select('teacher_id, subjects(id, name)')
    .in('teacher_id', teacherIds);
  const map = new Map();
  (data || []).forEach(row => {
    if (!map.has(row.teacher_id)) {
      map.set(row.teacher_id, { id: row.subjects?.id, name: row.subjects?.name });
    }
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
 */
export const computeStudentBulletin = async ({
  studentId, classId, schoolId, academicYear, semester
}) => {
  // 1. Classe + niveau/filière
  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name, level, filiere, school_id')
    .eq('id', classId)
    .single();
  if (!cls) throw new Error('Classe introuvable');

  // 2. Bornes du semestre
  const { start, end } = await getSemesterBounds(schoolId, academicYear, semester);

  // 3. Tous les controls_plan de la classe sur la période
  const { data: controls } = await supabaseAdmin
    .from('controls_plan')
    .select('id, name, date, teacher_id, kind')
    .eq('class_id', classId)
    .gte('date', start)
    .lte('date', end);

  const controlsArr = controls || [];
  const controlIds = controlsArr.map(c => c.id);
  const teacherIds = [...new Set(controlsArr.map(c => c.teacher_id).filter(Boolean))];

  // 4. Notes de l'élève sur ces contrôles
  let notes = [];
  if (controlIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('control_notes')
      .select('control_id, note, appreciation')
      .eq('student_id', studentId)
      .in('control_id', controlIds);
    notes = data || [];
  }

  // 5. Mapping teacher → subject
  const teacherSubjMap = await getTeacherSubjectsMap(teacherIds);

  // 6. Grouper par matière
  // Structure : { subjectName: { subject_id, controls: [], activities: [] } }
  const buckets = {};
  const noteByControl = new Map((notes || []).map(n => [n.control_id, Number(n.note)]));

  for (const ctrl of controlsArr) {
    const subj = teacherSubjMap.get(ctrl.teacher_id);
    if (!subj || !subj.name) continue;
    const key = subj.name.trim();
    if (!buckets[key]) {
      buckets[key] = { subject_id: subj.id, subject_name: key, controls: [], activities: [] };
    }
    if (noteByControl.has(ctrl.id)) {
      const note = noteByControl.get(ctrl.id);
      if (ctrl.kind === 'activity') buckets[key].activities.push(note);
      else buckets[key].controls.push(note);
    }
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
      display_order: coefEntry.display_order
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
      display_order: 999
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
  // 1. Tous les élèves de la classe
  const { data: students } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, massar_code')
    .eq('class_id', classId)
    .eq('role', 'student');

  if (!students || students.length === 0) return { classBulletins: [] };

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
