/**
 * Le ré-empaquetage WebM → Ogg tient la note vocale de toute une école : s'il
 * casse, plus personne ne peut envoyer de vocal depuis Chrome. Ces tests
 * fabriquent un WebM minimal — celui que produit MediaRecorder, taille de
 * cluster inconnue comprise — et vérifient la boîte Ogg qui en sort.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { webmToOggOpus, isWebm } from './webmToOgg.js';

// ── Fabrication d'un WebM d'essai ─────────────────────────────────────────

/** Taille EBML sur un octet (suffit pour les petits éléments de ces tests). */
const size1 = (n) => Buffer.from([0x80 | n]);
const el = (id, payload) => Buffer.concat([Buffer.from(id), size1(payload.length), payload]);

const OPUS_HEAD = (() => {
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1; head[9] = 1;
  head.writeUInt16LE(312, 10);      // pre-skip volontairement inhabituel
  head.writeUInt32LE(48000, 12);
  return head;
})();

// TOC 0x78 : configuration 15 (hybride 20 ms), 1 trame → 960 échantillons.
const packet = (n) => Buffer.concat([Buffer.from([0x78]), Buffer.alloc(n, 0x42)]);

/** SimpleBlock : piste 1, horodatage relatif, pas de lacing. */
const simpleBlock = (frame) =>
  el([0xa3], Buffer.concat([Buffer.from([0x81, 0x00, 0x00, 0x80]), frame]));

/**
 * @param {object} opts
 * @param {boolean} opts.unknownSize cluster de taille inconnue (cas MediaRecorder)
 */
function buildWebm({ frames = 5, unknownSize = false, codec = 'A_OPUS', strayUnsized = false } = {}) {
  const trackEntry = el([0xae], Buffer.concat([
    el([0xd7], Buffer.from([0x01])),                       // TrackNumber = 1
    el([0x86], Buffer.from(codec, 'latin1')),              // CodecID
    el([0x63, 0xa2], OPUS_HEAD),                           // CodecPrivate
  ]));
  const tracks = el([0x16, 0x54, 0xae, 0x6b], trackEntry);

  const blocks = Buffer.concat(Array.from({ length: frames }, (_, i) => simpleBlock(packet(30 + i))));
  const clusterBody = Buffer.concat([el([0xe7], Buffer.from([0x00])), blocks]);
  const cluster = unknownSize
    ? Buffer.concat([Buffer.from([0x1f, 0x43, 0xb6, 0x75]), Buffer.from([0xff]), clusterBody])
    : Buffer.concat([Buffer.from([0x1f, 0x43, 0xb6, 0x75]), Buffer.from([0x40, clusterBody.length]), clusterBody]);

  // Info (0x1549A966) écrit en taille inconnue : un élément que le lecteur ne
  // connaît pas et ne peut pourtant pas sauter.
  const stray = strayUnsized
    ? Buffer.concat([Buffer.from([0x15, 0x49, 0xa9, 0x66]), Buffer.from([0xff]),
        el([0x2a, 0xd7, 0xb1], Buffer.from([0x0f, 0x42, 0x40]))])   // TimecodeScale
    : Buffer.alloc(0);
  const segmentBody = Buffer.concat([stray, tracks, cluster]);
  const segment = Buffer.concat([
    Buffer.from([0x18, 0x53, 0x80, 0x67]), Buffer.from([0xff]), segmentBody,  // taille inconnue
  ]);
  const ebmlHeader = el([0x1a, 0x45, 0xdf, 0xa3], Buffer.from([0x42, 0x86, 0x81, 0x01]));
  return Buffer.concat([ebmlHeader, segment]);
}

// ── Relecture des pages Ogg produites ─────────────────────────────────────

function readOggPages(buf) {
  const pages = [];
  let pos = 0;
  while (pos < buf.length) {
    assert.equal(buf.subarray(pos, pos + 4).toString('latin1'), 'OggS', 'page Ogg attendue');
    const segments = buf[pos + 26];
    const table = buf.subarray(pos + 27, pos + 27 + segments);
    const bodyLen = table.reduce((sum, n) => sum + n, 0);
    const headerLen = 27 + segments;
    pages.push({
      flags: buf[pos + 5],
      granule: Number(buf.readBigInt64LE(pos + 6)),
      serial: buf.readUInt32LE(pos + 14),
      seq: buf.readUInt32LE(pos + 18),
      body: buf.subarray(pos + headerLen, pos + headerLen + bodyLen),
    });
    pos += headerLen + bodyLen;
  }
  return pages;
}

// ── Tests ─────────────────────────────────────────────────────────────────

test('reconnaît la signature WebM', () => {
  assert.equal(isWebm(buildWebm()), true);
  assert.equal(isWebm(Buffer.from('OggS....')), false);
});

test('produit un Ogg dont les deux premières pages sont les en-têtes Opus', () => {
  const pages = readOggPages(webmToOggOpus(buildWebm()));
  assert.ok(pages.length >= 3, 'en-têtes + au moins une page audio');
  assert.equal(pages[0].body.subarray(0, 8).toString('latin1'), 'OpusHead');
  assert.equal(pages[0].flags, 2, 'la première page ouvre le flux');
  assert.equal(pages[1].body.subarray(0, 8).toString('latin1'), 'OpusTags');
  assert.equal(pages.at(-1).flags, 4, 'la dernière page ferme le flux');
});

test("conserve l'en-tête Opus d'origine plutôt qu'un en-tête générique", () => {
  const [first] = readOggPages(webmToOggOpus(buildWebm()));
  assert.equal(first.body.readUInt16LE(10), 312, 'le pre-skip du navigateur est repris tel quel');
});

test('numérote les pages et garde un même flux', () => {
  const pages = readOggPages(webmToOggOpus(buildWebm({ frames: 12 })));
  const serials = new Set(pages.map((p) => p.serial));
  assert.equal(serials.size, 1, 'un seul flux logique');
  assert.deepEqual(pages.map((p) => p.seq), pages.map((_, i) => i));
});

test('compte le temps écoulé : 20 ms par paquet, après le pre-skip', () => {
  const frames = 12;
  const pages = readOggPages(webmToOggOpus(buildWebm({ frames })));
  assert.equal(pages.at(-1).granule, 312 + frames * 960);
});

test('lit un cluster de taille inconnue, comme en produit MediaRecorder', () => {
  const known = webmToOggOpus(buildWebm({ frames: 7, unknownSize: false }));
  const unknown = webmToOggOpus(buildWebm({ frames: 7, unknownSize: true }));
  // Les flux ne diffèrent que par leur numéro de série, tiré au hasard.
  assert.equal(unknown.length, known.length);
  assert.equal(readOggPages(unknown).at(-1).granule, readOggPages(known).at(-1).granule);
});

test('refuse ce qui n\'est pas de l\'Opus, pour laisser sa chance à ffmpeg', () => {
  assert.throws(() => webmToOggOpus(buildWebm({ codec: 'A_VORBIS' })), /Opus/);
  assert.throws(() => webmToOggOpus(Buffer.from('pas un fichier audio')), /./);
});

test('traverse un conteneur inconnu de taille inconnue sans perdre le son', () => {
  // Sauter un tel élément consommerait tout le reste du fichier : le son
  // disparaîtrait et l'erreur accuserait à tort le navigateur.
  const pages = readOggPages(webmToOggOpus(buildWebm({ frames: 6, strayUnsized: true })));
  assert.equal(pages.at(-1).granule, 312 + 6 * 960);
});

test('recalcule un CRC valide sur chaque page', () => {
  const out = webmToOggOpus(buildWebm({ frames: 4 }));
  // Le CRC couvre la page entière, son propre champ mis à zéro : on le vérifie
  // en le remettant à zéro et en comparant.
  let pos = 0;
  let checked = 0;
  while (pos < out.length) {
    const segments = out[pos + 26];
    const len = 27 + segments + out.subarray(pos + 27, pos + 27 + segments).reduce((s, n) => s + n, 0);
    const page = Buffer.from(out.subarray(pos, pos + len));
    const stored = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    let crc = 0;
    for (const byte of page) {
      let r = crc ^ (byte << 24);
      for (let i = 0; i < 8; i++) r = (r & 0x80000000) ? (r << 1) ^ 0x04c11db7 : r << 1;
      crc = r;
    }
    assert.equal(crc >>> 0, stored, `CRC de la page ${checked}`);
    checked += 1;
    pos += len;
  }
  assert.ok(checked >= 3);
});
