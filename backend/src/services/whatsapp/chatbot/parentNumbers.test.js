/**
 * Le numéro saisi par un parent est la clé d'accès aux notes, aux absences et
 * aux factures de ses enfants : une normalisation ratée rattache le mauvais
 * téléphone. Ces tests couvrent les cinq façons dont les parents de MARCEL
 * ARNAUD écrivent un numéro marocain, clavier arabe compris.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { toE164 } from './parentNumbers.js';

test('les écritures marocaines usuelles donnent le même E.164', () => {
  for (const saisie of [
    '0612345678',
    '06 12 34 56 78',
    '06-12-34-56-78',
    '+212612345678',
    '212612345678',
    '00212612345678',
    '612345678',
    '٠٦١٢٣٤٥٦٧٨',            // clavier arabe
  ]) {
    assert.equal(toE164(saisie), '+212612345678', `saisie: ${saisie}`);
  }
});

test('un numéro étranger garde son indicatif', () => {
  assert.equal(toE164('0033612345678'), '+33612345678');
  assert.equal(toE164('+33612345678'), '+33612345678');
});

test('ce qui n\'est pas un numéro est refusé', () => {
  for (const saisie of ['', '   ', 'abc', '06123', 'menu', '1', '📱', null, undefined]) {
    assert.equal(toE164(saisie), null, `saisie: ${JSON.stringify(saisie)}`);
  }
});
