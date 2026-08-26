import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneVariants, toE164 } from './phoneVariants.js';

test('un numéro marocain est reconnu quelle que soit sa saisie', () => {
  const attendu = '+212612345678';
  for (const saisie of ['0612345678', '06 12 34 56 78', '+212612345678', '212612345678', '00212612345678', '612345678']) {
    assert.equal(toE164(saisie), attendu, saisie);
    // Les deux sens comptent : le numéro livré par WhatsApp doit retrouver la
    // saisie de l'administration, et l'inverse.
    assert.ok(phoneVariants(saisie).includes(attendu), saisie);
  }
});

test('les variantes couvrent les écritures stockées en base', () => {
  const v = phoneVariants('+212612345678');
  for (const forme of ['+212612345678', '212612345678', '0612345678', '612345678']) {
    assert.ok(v.includes(forme), forme);
  }
  assert.ok(!v.some((x) => x.startsWith('+0')));
});

test('un numéro étranger ne reçoit pas de préfixe marocain', () => {
  assert.equal(toE164('+33612345678'), '+33612345678');
  assert.ok(!phoneVariants('+33612345678').includes('+21233612345678'));
});

test('une saisie vide ne produit aucune variante', () => {
  assert.deepEqual(phoneVariants(''), []);
  assert.deepEqual(phoneVariants('néant'), []);
  assert.equal(toE164(null), '');
});
