/**
 * Le décodage des data URL a déjà coûté une fonction entière : les notes
 * vocales de Chrome arrivaient tronquées à quelques octets parce que le type
 * `audio/webm;codecs=opus` porte un paramètre. Ces tests fixent le contrat.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDataUrl, mimeFromDataUrl } from './dataUrl.js';

const payload = Buffer.from('contenu binaire quelconque', 'utf8');
const b64 = payload.toString('base64');

test('décode une data URL simple', () => {
  assert.deepEqual(decodeDataUrl(`data:image/png;base64,${b64}`), payload);
});

test('décode un type porteur de paramètres — le cas des notes vocales', () => {
  // Ce que Chrome produit réellement : deux points-virgules, pas un.
  assert.deepEqual(decodeDataUrl(`data:audio/webm;codecs=opus;base64,${b64}`), payload);
  assert.deepEqual(decodeDataUrl(`data:audio/ogg;codecs=opus;base64,${b64}`), payload);
  assert.deepEqual(decodeDataUrl(`data:video/mp4;codecs="avc1.42E01E";base64,${b64}`), payload);
});

test('accepte un base64 nu, sans préambule', () => {
  assert.deepEqual(decodeDataUrl(b64), payload);
});

test('ne rend jamais null sur une entrée vide', () => {
  for (const vide of ['', null, undefined, '   ']) {
    assert.equal(decodeDataUrl(vide).length, 0);
  }
});

test('lit le type sans ses paramètres', () => {
  assert.equal(mimeFromDataUrl(`data:audio/webm;codecs=opus;base64,${b64}`), 'audio/webm');
  assert.equal(mimeFromDataUrl(`data:image/png;base64,${b64}`), 'image/png');
  assert.equal(mimeFromDataUrl(b64), '');
});
