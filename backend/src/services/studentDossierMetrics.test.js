import test from 'node:test';
import assert from 'node:assert/strict';
import {
  academicYearForDate,
  aggregateAttendanceByYear,
  isBehaviorIncident,
  normalizeOfficialControlNotes,
} from './studentDossierMetrics.js';

test('academicYearForDate suit une année scolaire de septembre à août', () => {
  assert.equal(academicYearForDate('2025-09-08'), '2025/2026');
  assert.equal(academicYearForDate('2026-06-30'), '2025/2026');
});

test('une participation faible seule ne devient pas un incident', () => {
  assert.equal(isBehaviorIncident({ participation: 'faible' }), false);
  assert.equal(isBehaviorIncident({ homework: 'not_done' }), false);
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
