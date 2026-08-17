// Règles métier communes au dossier pédagogique. Elles restent pures pour
// pouvoir être testées sans base de données et réutilisées par d'autres écrans.

export const academicYearForDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const startYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}/${startYear + 1}`;
};

export const isBehaviorIncident = (row = {}) => {
  const discipline = String(row.discipline || '').toLowerCase();
  const attitude = String(row.attitude || '').toLowerCase();
  return row.sleeping === true
    || row.phone_use === true
    // « distrait » est un niveau de suivi pédagogique par séance, pas un
    // incident disciplinaire. Le compter gonflait artificiellement le dossier.
    || discipline === 'poor'
    || ['bavarre', 'bavard', 'perturbateur', 'disruptive'].includes(attitude);
};

export const aggregateAttendanceByYear = (rows = []) => {
  const byYear = {};
  for (const row of rows) {
    const year = academicYearForDate(row.sessions?.date);
    if (!year) continue;
    const stats = byYear[year] || (byYear[year] = {
      sessions: 0,
      absences: 0,
      incidents: 0,
      evalSum: 0,
      evalCount: 0,
    });
    stats.sessions += 1;
    if (row.presence === 'absent') stats.absences += 1;
    if (isBehaviorIncident(row)) stats.incidents += 1;
    const miniEvaluation = Number.parseFloat(row.mini_eval);
    if (!Number.isNaN(miniEvaluation)) {
      stats.evalSum += miniEvaluation;
      stats.evalCount += 1;
    }
  }

  return Object.fromEntries(Object.entries(byYear).map(([year, stats]) => [year, {
    sessions: stats.sessions,
    absences: stats.absences,
    incidents: stats.incidents,
    performance: stats.evalCount ? Math.round((stats.evalSum / stats.evalCount) * 5) : null,
  }]));
};

// Une note officielle doit être rattachée à une matière. Les anciens contrôles
// sans subject_id sont conservés en base, mais ne doivent pas devenir de fausses
// matières (« Contrôle S2 #2 ») ni influencer les moyennes du dossier.
export const normalizeOfficialControlNotes = (notes = [], classMap = {}) => {
  const controls = [];
  let unclassifiedControlNotes = 0;

  for (const row of notes) {
    if (row.note == null || Number.isNaN(Number(row.note))) continue;
    const subject = String(row.control?.subject?.name || '').trim();
    if (!subject) {
      unclassifiedControlNotes += 1;
      continue;
    }

    const cls = classMap[row.control?.class_id] || {};
    controls.push({
      note: Number(row.note),
      appreciation: row.appreciation || null,
      date: row.control?.date || null,
      subject,
      control_name: row.control?.name || null,
      class_name: cls.name || null,
      academic_year: cls.academic_year || academicYearForDate(row.control?.date),
    });
  }

  controls.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { controls, unclassifiedControlNotes };
};

// Une répartition de classe ne doit jamais faire disparaître les notes d'un
// élève. Sélectionne les notes portées par des contrôles d'une autre classe,
// uniquement dans le même contexte pédagogique (école, année, matière,
// semestre). Le contrôle et la classe source restent intacts : aucun doublon.
export const selectInheritedControlNotes = ({
  notes = [],
  controls = [],
  classes = [],
  currentClassId,
  currentSchoolId,
  academicYear,
  subjectKey,
  semester,
} = {}) => {
  const normalizeYear = (value) => String(value || '').replace(/\D/g, '');
  const yearKey = normalizeYear(academicYear);
  const controlById = new Map(controls.map((control) => [control.id, control]));
  const classById = new Map(classes.map((cls) => [cls.id, cls]));

  return notes.flatMap((note) => {
    if (note.note === null || note.note === '' || Number.isNaN(Number(note.note))) return [];
    const control = controlById.get(note.control_id);
    if (!control || !control.class_id || control.class_id === currentClassId) return [];
    const sourceClass = classById.get(control.class_id);
    if (!sourceClass) return [];
    if (currentSchoolId && sourceClass.school_id !== currentSchoolId) return [];
    if (!yearKey || normalizeYear(sourceClass.academic_year) !== yearKey) return [];
    if (!control.resolved_subject || control.resolved_subject.key !== subjectKey) return [];
    if (semester && Number(control.resolved_semester) !== Number(semester)) return [];
    return [{ note, control, sourceClass }];
  });
};
