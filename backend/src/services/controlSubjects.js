// Résolution commune des matières de contrôles.
//
// Les imports historiques ont parfois créé des controls_plan sans subject_id.
// On ne rattache automatiquement un tel contrôle que si son professeur possède
// une seule matière dans teacher_subjects. Une affectation ambiguë reste vide et
// est signalée comme donnée à corriger, plutôt que d'inventer une matière.

const normalize = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '');

const SUBJECT_ALIASES = new Map([
  ['pc', { key: 'physique_chimie', label: 'Physique-Chimie' }],
  ['physiquechimie', { key: 'physique_chimie', label: 'Physique-Chimie' }],
  ['sciencesphysiques', { key: 'physique_chimie', label: 'Physique-Chimie' }],
  ['svt', { key: 'svt', label: 'Sciences de la vie et de la terre' }],
  ['sciences', { key: 'svt', label: 'Sciences de la vie et de la terre' }],
  ['sciencesdelavieetdelaterre', { key: 'svt', label: 'Sciences de la vie et de la terre' }],
  ['arabe', { key: 'arabe', label: 'Arabe' }],
  ['languearabe', { key: 'arabe', label: 'Arabe' }],
  ['francais', { key: 'francais', label: 'Français' }],
  ['languefrancaise', { key: 'francais', label: 'Français' }],
  ['anglais', { key: 'anglais', label: 'Anglais' }],
  ['langueanglaise', { key: 'anglais', label: 'Anglais' }],
  ['eps', { key: 'eps', label: 'Éducation physique et sportive' }],
  ['educationphysiqueetsportive', { key: 'eps', label: 'Éducation physique et sportive' }],
]);

export const canonicalSubject = (subject = {}) => {
  const rawName = typeof subject === 'string' ? subject : subject.name;
  const rawCode = typeof subject === 'string' ? '' : subject.code;
  const nameKey = normalize(rawName);
  const codeKey = normalize(rawCode);
  const alias = SUBJECT_ALIASES.get(nameKey) || SUBJECT_ALIASES.get(codeKey);
  return alias || {
    key: nameKey || codeKey,
    label: String(rawName || rawCode || '').trim(),
  };
};

export const buildSubjectCatalog = (subjects = []) => {
  const byId = new Map();
  const idsByKey = new Map();

  for (const subject of subjects) {
    if (!subject?.id) continue;
    const canonical = canonicalSubject(subject);
    const entry = { ...subject, ...canonical };
    byId.set(subject.id, entry);
    if (!idsByKey.has(entry.key)) idsByKey.set(entry.key, []);
    idsByKey.get(entry.key).push(subject.id);
  }

  return { byId, idsByKey };
};

export const buildUniqueTeacherSubjectMap = (rows = []) => {
  const all = new Map();
  for (const row of rows) {
    if (!row?.teacher_id || !row?.subject_id) continue;
    if (!all.has(row.teacher_id)) all.set(row.teacher_id, new Set());
    all.get(row.teacher_id).add(row.subject_id);
  }

  const unique = new Map();
  for (const [teacherId, subjectIds] of all.entries()) {
    if (subjectIds.size === 1) unique.set(teacherId, [...subjectIds][0]);
  }
  return unique;
};

export const resolveControlSubject = (control, catalog, uniqueTeacherSubjects = new Map()) => {
  const subjectId = control?.subject_id || uniqueTeacherSubjects.get(control?.teacher_id) || null;
  const subject = subjectId ? catalog.byId.get(subjectId) : null;
  if (!subject) return null;
  return { id: subjectId, key: subject.key, label: subject.label };
};

export const resolveControls = (controls = [], subjects = [], teacherSubjects = []) => {
  const catalog = buildSubjectCatalog(subjects);
  const uniqueTeacherSubjects = buildUniqueTeacherSubjectMap(teacherSubjects);
  return (controls || []).map((control) => ({
    ...control,
    resolved_subject: resolveControlSubject(control, catalog, uniqueTeacherSubjects),
  }));
};

export const controlsForSubject = (controls = [], selectedSubjectId, subjects = [], teacherSubjects = []) => {
  const catalog = buildSubjectCatalog(subjects);
  const selected = catalog.byId.get(selectedSubjectId);
  if (!selected) return [];
  const uniqueTeacherSubjects = buildUniqueTeacherSubjectMap(teacherSubjects);
  return (controls || [])
    .map((control) => ({
      ...control,
      resolved_subject: resolveControlSubject(control, catalog, uniqueTeacherSubjects),
    }))
    .filter((control) => control.resolved_subject?.key === selected.key);
};

export const notesForStudents = (notes = [], studentIds = []) => {
  const allowed = studentIds instanceof Set ? studentIds : new Set(studentIds);
  return (notes || []).filter((note) => allowed.has(note.student_id));
};

export const recapIdentity = (control = {}) => {
  if (control.official_key) {
    return { key: control.official_key, label: control.name };
  }

  const name = String(control.name || '').trim();
  const legacy = /contr[oô]le\s+s([12])\s*#\s*(\d+)/i.exec(name);
  if (legacy) {
    return {
      key: `s${legacy[1]}_f${legacy[2]}`,
      label: `Contrôle ${legacy[2]}`,
    };
  }

  const withoutSubjectPrefix = name.includes('—') ? name.split('—').slice(1).join('—').trim() : name;
  return {
    key: `name:${normalize(withoutSubjectPrefix)}`,
    label: withoutSubjectPrefix || name,
  };
};

// Un import historique et la grille officielle peuvent représenter le même
// rang de contrôle avec deux lignes différentes. On conserve une seule colonne,
// en privilégiant celle qui porte réellement les notes des élèves actuels.
export const collapseControlsBySlot = (controls = [], noteCounts = new Map()) => {
  const chosen = new Map();
  for (const control of controls) {
    const subjectKey = control.resolved_subject?.key || control.subject_id || 'sans_matiere';
    const slot = recapIdentity(control).key;
    const key = `${subjectKey}|${slot}`;
    const previous = chosen.get(key);
    if (!previous) {
      chosen.set(key, control);
      continue;
    }
    const previousNotes = Number(noteCounts.get(previous.id) || 0);
    const currentNotes = Number(noteCounts.get(control.id) || 0);
    if (currentNotes > previousNotes
      || (currentNotes === previousNotes && control.official_key && !previous.official_key)) {
      chosen.set(key, control);
    }
  }
  return [...chosen.values()].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
};
