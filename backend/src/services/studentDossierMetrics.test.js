import test from 'node:test';
import assert from 'node:assert/strict';
import {
  academicYearForDate,
  aggregateAttendanceByYear,
  isBehaviorIncident,
  mergeInheritedNotesIntoGrid,
  normalizeOfficialControlNotes,
  selectInheritedControlNotes,
} from './studentDossierMetrics.js';
import {
  canonicalSubject,
  collapseControlsBySlot,
  controlsForSubject,
  notesForStudents,
  recapIdentity,
  resolveControls,
} from './controlSubjects.js';

test('academicYearForDate suit une année scolaire de septembre à août', () => {
  assert.equal(academicYearForDate('2025-09-08'), '2025/2026');
  assert.equal(academicYearForDate('2026-06-30'), '2025/2026');
});

test('une participation faible seule ne devient pas un incident', () => {
  assert.equal(isBehaviorIncident({ participation: 'faible' }), false);
  assert.equal(isBehaviorIncident({ homework: 'not_done' }), false);
  assert.equal(isBehaviorIncident({ discipline: 'distrait' }), false);
  assert.equal(isBehaviorIncident({ phone_use: true }), true);
  assert.equal(isBehaviorIncident({ attitude: 'perturbateur' }), true);
});

test('les absences et incidents sont agrégés sans gonfler la participation faible', () => {
  const result = aggregateAttendanceByYear([
    { presence: 'absent', participation: 'faible', mini_eval: '12', sessions: { date: '2026-02-02' } },
    { presence: 'present', phone_use: true, mini_eval: '16', sessions: { date: '2026-02-03' } },
  ]);
  assert.deepEqual(result['2025/2026'], { sessions: 2, absences: 1, incidents: 1, performance: 70 });
});

test('les contrôles sans matière sont signalés et exclus des notes officielles', () => {
  const result = normalizeOfficialControlNotes([
    { note: 13, control: { name: 'Contrôle S2 #2', class_id: 'c1', subject: null } },
    { note: 15, control: { name: 'Devoir 1', class_id: 'c1', date: '2026-02-10', subject: { name: 'Mathématiques' } } },
  ], { c1: { name: '5AP', academic_year: '2025/2026' } });

  assert.equal(result.unclassifiedControlNotes, 1);
  assert.equal(result.controls.length, 1);
  assert.equal(result.controls[0].subject, 'Mathématiques');
});

test('les alias de matières sont réunis sous une matière canonique', () => {
  assert.deepEqual(canonicalSubject('PC'), { key: 'physique_chimie', label: 'Physique-Chimie' });
  assert.deepEqual(canonicalSubject('Physique Chimie'), { key: 'physique_chimie', label: 'Physique-Chimie' });
  assert.deepEqual(canonicalSubject('Sciences'), { key: 'svt', label: 'Sciences de la vie et de la terre' });
});

test('un ancien contrôle reçoit la matière unique de son professeur', () => {
  const subjects = [
    { id: 'math', name: 'Mathématiques', code: 'MATH' },
    { id: 'pc', name: 'PC', code: 'PC_OLD' },
    { id: 'physics', name: 'Physique Chimie', code: 'PC' },
  ];
  const teacherSubjects = [
    { teacher_id: 't-math', subject_id: 'math' },
    { teacher_id: 't-multi', subject_id: 'pc' },
    { teacher_id: 't-multi', subject_id: 'math' },
  ];
  const controls = resolveControls([
    { id: 'legacy', teacher_id: 't-math', subject_id: null },
    { id: 'ambiguous', teacher_id: 't-multi', subject_id: null },
  ], subjects, teacherSubjects);

  assert.equal(controls[0].resolved_subject.id, 'math');
  assert.equal(controls[1].resolved_subject, null);

  const physicsControls = controlsForSubject([
    { id: 'c1', subject_id: 'pc' },
    { id: 'c2', subject_id: 'physics' },
  ], 'physics', subjects, []);
  assert.deepEqual(physicsControls.map((control) => control.id), ['c1', 'c2']);
});

test('les notes hors effectif courant ne gonflent pas les compteurs', () => {
  const notes = [
    { student_id: 'current', note: 14 },
    { student_id: 'old', note: 12 },
  ];
  assert.deepEqual(notesForStudents(notes, ['current']), [{ student_id: 'current', note: 14 }]);
});

test('les anciens noms de contrôles sont regroupés par rang', () => {
  assert.deepEqual(
    recapIdentity({ name: 'Mathématiques — Contrôle S2 #2' }),
    { key: 's2_f2', label: 'Contrôle 2' },
  );
  assert.equal(recapIdentity({ name: 'Français — Contrôle S2 #2' }).key, 's2_f2');
});

test('une colonne historique notée remplace son doublon officiel vide', () => {
  const controls = [
    { id: 'official', official_key: 's2_f2', subject_id: 'math', resolved_subject: { key: 'math' }, date: '2026-04-01' },
    { id: 'legacy', name: 'Mathématiques — Contrôle S2 #2', subject_id: 'math', resolved_subject: { key: 'math' }, date: '2026-03-01' },
  ];
  const collapsed = collapseControlsBySlot(controls, new Map([['legacy', 20]]));
  assert.deepEqual(collapsed.map((control) => control.id), ['legacy']);
});

test('les notes suivent l’élève après une nouvelle répartition de classe', () => {
  const result = selectInheritedControlNotes({
    notes: [
      { control_id: 'old-math', student_id: 'student-1', note: 15 },
      { control_id: 'old-fr', student_id: 'student-1', note: 12 },
      { control_id: 'previous-year', student_id: 'student-1', note: 18 },
      { control_id: 'current-math', student_id: 'student-1', note: 14 },
    ],
    controls: [
      { id: 'old-math', class_id: 'demo', resolved_subject: { key: 'mathematiques' }, resolved_semester: 1 },
      { id: 'old-fr', class_id: 'demo', resolved_subject: { key: 'francais' }, resolved_semester: 1 },
      { id: 'previous-year', class_id: 'old-year', resolved_subject: { key: 'mathematiques' }, resolved_semester: 1 },
      { id: 'current-math', class_id: 'test-1', resolved_subject: { key: 'mathematiques' }, resolved_semester: 1 },
    ],
    classes: [
      { id: 'demo', school_id: 'school', academic_year: '2025/2026' },
      { id: 'old-year', school_id: 'school', academic_year: '2024/2025' },
    ],
    currentClassId: 'test-1',
    currentSchoolId: 'school',
    academicYear: '2025-2026',
    subjectKey: 'mathematiques',
    semester: 1,
  });

  assert.deepEqual(result.map(({ note }) => note.control_id), ['old-math']);
});

test('les notes reprises remplissent les colonnes actuelles et créent le rang manquant', () => {
  const merged = mergeInheritedNotesIntoGrid({
    controls: [
      { id: 'new-f1', grid_slot_key: 's2_f1', name: 'Contrôle 1', date: '2026-03-23' },
      { id: 'new-f2', grid_slot_key: 's2_f2', name: 'Contrôle 2', date: '2026-06-02' },
    ],
    notes: [{ control_id: 'new-f1', student_id: 'already-current', note: 17 }],
    inheritedNotes: [
      { student_id: 'moved', note: 14, slot_key: 's2_f1', source_control_id: 'old-f1', control_name: 'Contrôle 1', control_date: '2026-03-01' },
      { student_id: 'moved', note: 16, slot_key: 's2_f3', source_control_id: 'old-f3', control_name: 'Contrôle 3', control_date: '2026-06-20' },
    ],
    classId: 'new-class',
    subjectId: 'math',
    semester: 2,
  });

  assert.equal(merged.convertedNotesCount, 2);
  assert.equal(merged.notes.find(note => note.student_id === 'moved' && note.note === 14).control_id, 'new-f1');
  assert.equal(merged.controls.some(control => control.converted && control.grid_slot_key === 's2_f3'), true);
  assert.deepEqual(merged.controls.map(control => control.grid_slot_key), ['s2_f1', 's2_f2', 's2_f3']);
});
