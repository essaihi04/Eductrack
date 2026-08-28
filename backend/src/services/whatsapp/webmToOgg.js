/**
 * Ré-empaquetage WebM/Opus → Ogg/Opus, en JavaScript pur.
 *
 * Chrome et Edge — donc la quasi-totalité des postes des écoles — ne savent
 * enregistrer qu'en **WebM**, un conteneur que l'API Cloud refuse. Mais le son
 * qu'ils y déposent est déjà de l'**Opus**, exactement le codec attendu dans un
 * conteneur Ogg. Il n'y a donc rien à ré-encoder : il suffit de sortir les
 * paquets audio de la boîte WebM et de les ranger dans une boîte Ogg.
 *
 * C'est ce que faisait ffmpeg (`-c:a copy`). Le faire ici évite d'exiger un
 * paquet système sur le serveur : une école dont le backend tourne sur une
 * plateforme gérée n'a aucun moyen d'y lancer « apt install ffmpeg ».
 *
 * Le module ne traite QUE le cas WebM/Opus sans lacing — celui que produisent
 * les navigateurs. Tout le reste lève, et l'appelant retombe sur ffmpeg s'il
 * est installé.
 */

// ── Lecture EBML (le format de boîte du WebM/Matroska) ────────────────────
//
// Un élément EBML = identifiant (vint) + taille (vint) + contenu. Les
// « masters » contiennent d'autres éléments ; les autres, des octets bruts.

const ID = {
  SEGMENT: 0x18538067, TRACKS: 0x1654ae6b, TRACK_ENTRY: 0xae, AUDIO: 0xe1,
  CLUSTER: 0x1f43b675, BLOCK_GROUP: 0xa0,
  TRACK_NUMBER: 0xd7, CODEC_ID: 0x86, CODEC_PRIVATE: 0x63a2,
  SIMPLE_BLOCK: 0xa3, BLOCK: 0xa1,
};

// Éléments dans lesquels on descend au lieu de les sauter. Les parcourir « à
// plat » de cette façon rend la taille inconnue (celle qu'écrit MediaRecorder,
// qui diffuse sans savoir où il s'arrêtera) totalement indolore.
const MASTERS = new Set([ID.SEGMENT, ID.TRACKS, ID.TRACK_ENTRY, ID.AUDIO, ID.CLUSTER, ID.BLOCK_GROUP]);

/** Identifiant d'élément : la longueur se lit dans les bits de tête, qu'on garde. */
function readId(buf, pos) {
  const first = buf[pos];
  if (first === undefined) return null;
  const len = first >= 0x80 ? 1 : first >= 0x40 ? 2 : first >= 0x20 ? 3 : first >= 0x10 ? 4 : 0;
  if (!len || pos + len > buf.length) return null;
  let value = 0;
  for (let i = 0; i < len; i++) value = value * 256 + buf[pos + i];
  return { value, next: pos + len };
}

/** Taille d'élément : même codage, mais le bit marqueur est retiré. */
function readSize(buf, pos) {
  const first = buf[pos];
  if (first === undefined) return null;
  let len = 0;
  for (let i = 0; i < 8; i++) if (first & (0x80 >> i)) { len = i + 1; break; }
  if (!len || pos + len > buf.length) return null;

  let value = first & (0xff >> len);
  let allOnes = value === (0xff >> len);
  for (let i = 1; i < len; i++) {
    const byte = buf[pos + i];
    if (byte !== 0xff) allOnes = false;
    value = value * 256 + byte;
  }
  // Taille « inconnue » (tous les bits à 1) : élément ouvert, on lit jusqu'au bout.
  return { value: allOnes ? null : value, next: pos + len };
}

const readUint = (buf) => { let v = 0; for (const b of buf) v = v * 256 + b; return v; };

/**
 * Extrait la piste Opus et ses paquets audio.
 * @returns {{ head: Buffer|null, packets: Buffer[] }}
 */
function parseWebm(buf) {
  let pos = 0;
  let head = null;            // CodecPrivate = l'en-tête OpusHead d'origine
  let audioTrack = null;      // numéro de la piste Opus
  let current = null;         // piste en cours de description dans Tracks
  const tracks = [];
  const packets = [];

  while (pos < buf.length) {
    const id = readId(buf, pos);
    if (!id) break;
    const size = readSize(buf, id.next);
    if (!size) break;

    const start = size.next;
    // Un élément de taille inconnue ne se saute pas : la spec ne l'autorise que
    // pour les conteneurs, dont il faut donc lire le contenu. Le sauter
    // reviendrait à filer jusqu'à la fin du fichier — et à n'y trouver aucun son.
    if (MASTERS.has(id.value) || size.value == null) {
      if (id.value === ID.TRACK_ENTRY) { current = { number: null, codec: null, priv: null }; tracks.push(current); }
      pos = start;             // on entre dedans, sans consommer le contenu
      continue;
    }

    const end = size.value == null ? buf.length : Math.min(start + size.value, buf.length);
    const body = buf.subarray(start, end);

    switch (id.value) {
      case ID.TRACK_NUMBER: if (current) current.number = readUint(body); break;
      case ID.CODEC_ID: if (current) current.codec = body.toString('latin1').replace(/\0+$/, ''); break;
      case ID.CODEC_PRIVATE: if (current) current.priv = Buffer.from(body); break;
      case ID.SIMPLE_BLOCK:
      case ID.BLOCK: {
        // La piste Opus n'est fixée qu'une fois Tracks entièrement lu, donc au
        // premier bloc rencontré.
        if (audioTrack === null) {
          const opus = tracks.find((t) => t.codec === 'A_OPUS');
          if (!opus) throw new Error('Aucune piste Opus dans cet enregistrement');
          audioTrack = opus.number;
          head = opus.priv;
        }
        const track = readSize(body, 0);                    // numéro de piste (vint)
        if (!track || track.value !== audioTrack) break;    // autre piste : ignorée
        const flags = body[track.next + 2];
        if (flags === undefined) break;
        if ((flags & 0x06) !== 0) throw new Error('Bloc WebM avec lacing (non géré)');
        const frame = body.subarray(track.next + 3, body.length);
        if (frame.length) packets.push(Buffer.from(frame));
        break;
      }
      default: break;
    }
    pos = end;
  }

  if (!packets.length) throw new Error('Aucun paquet audio trouvé dans le WebM');
  return { head, packets };
}

// ── Durée d'un paquet Opus (RFC 6716 §3.1) ───────────────────────────────
//
// Le premier octet (« TOC ») dit tout : la configuration donne la durée d'une
// trame, les deux bits de poids faible donnent le nombre de trames du paquet.
// Ces durées servent à écrire la position temporelle des pages Ogg — sans
// elles, un lecteur ne saurait pas dire combien de temps dure la note vocale.

const FRAME_MS = [
  10, 20, 40, 60, 10, 20, 40, 60, 10, 20, 40, 60,   // SILK
  10, 20, 10, 20,                                    // hybride
  2.5, 5, 10, 20, 2.5, 5, 10, 20,                    // CELT
  2.5, 5, 10, 20, 2.5, 5, 10, 20,
];

/** Nombre d'échantillons à 48 kHz que représente ce paquet. */
function opusSamples(packet) {
  if (!packet.length) return 0;
  const toc = packet[0];
  const ms = FRAME_MS[toc >> 3];
  const code = toc & 0x03;
  const frames = code === 0 ? 1 : code < 3 ? 2 : ((packet[1] ?? 1) & 0x3f) || 1;
  return Math.round(ms * 48 * frames);
}

// ── Écriture Ogg ──────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r;
  }
  return table;
})();

/** CRC d'Ogg : polynôme 0x04C11DB7, sans réflexion ni valeur initiale. */
function oggCrc(buf) {
  let crc = 0;
  for (const byte of buf) crc = (crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff];
  return crc >>> 0;
}

/**
 * Une page Ogg : en-tête, table de découpe, contenu.
 * Les paquets tiennent entiers dans la page — on n'en coupe jamais un en deux.
 */
function oggPage({ packets, serial, seq, granule, flags }) {
  const lacing = [];
  for (const packet of packets) {
    let left = packet.length;
    while (left >= 255) { lacing.push(255); left -= 255; }
    lacing.push(left);                     // la valeur < 255 termine le paquet
  }

  const header = Buffer.alloc(27 + lacing.length);
  header.write('OggS', 0, 'latin1');
  header[4] = 0;                            // version
  header[5] = flags;                        // 2 = début de flux, 4 = fin
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(seq, 18);
  header.writeUInt32LE(0, 22);              // CRC : calculé une fois la page complète
  header[26] = lacing.length;
  Buffer.from(lacing).copy(header, 27);

  const page = Buffer.concat([header, ...packets]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

/** En-tête OpusHead de secours, si le WebM n'en portait pas. */
function defaultOpusHead(channels = 1) {
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1;                              // version
  head[9] = channels;
  head.writeUInt16LE(3840, 10);             // pre-skip (80 ms, valeur usuelle)
  head.writeUInt32LE(48000, 12);            // fréquence d'origine
  head.writeInt16LE(0, 16);                 // gain
  head[18] = 0;                             // canaux non mappés
  return head;
}

function opusTags() {
  const vendor = Buffer.from('bousole', 'utf8');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0, 'latin1');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.length); // aucun commentaire
  return tags;
}

/**
 * Convertit un enregistrement WebM/Opus en Ogg/Opus.
 *
 * @param {Buffer} buffer enregistrement brut du navigateur
 * @returns {Buffer} flux Ogg/Opus prêt pour l'API Cloud
 * @throws si le contenu n'est pas de l'Opus en WebM (l'appelant essaiera ffmpeg)
 */
export function webmToOggOpus(buffer) {
  const { head, packets } = parseWebm(buffer);
  const opusHead = head && head.length >= 19 && head.subarray(0, 8).toString('latin1') === 'OpusHead'
    ? head
    : defaultOpusHead();
  const preSkip = opusHead.readUInt16LE(10);

  const serial = Math.floor(Math.random() * 0xfffffffe) + 1;
  const pages = [
    oggPage({ packets: [opusHead], serial, seq: 0, granule: 0, flags: 2 }),
    oggPage({ packets: [opusTags()], serial, seq: 1, granule: 0, flags: 0 }),
  ];

  // Les paquets sont regroupés par page, une page par quart de seconde environ,
  // comme le font les encodeurs usuels. La position (granule) d'une page est le
  // nombre d'échantillons décodés à la fin de celle-ci.
  let seq = 2;
  let granule = preSkip;
  let batch = [];
  let batchSegments = 0;
  let batchSamples = 0;

  const flush = (last) => {
    if (!batch.length) return;
    granule += batchSamples;
    pages.push(oggPage({ packets: batch, serial, seq: seq++, granule, flags: last ? 4 : 0 }));
    batch = []; batchSegments = 0; batchSamples = 0;
  };

  for (const packet of packets) {
    const segments = Math.floor(packet.length / 255) + 1;
    // Une page Ogg ne peut porter que 255 valeurs dans sa table de découpe.
    if (batch.length && (batchSegments + segments > 255 || batchSamples >= 12000)) flush(false);
    batch.push(packet);
    batchSegments += segments;
    batchSamples += opusSamples(packet);
  }
  flush(true);

  return Buffer.concat(pages);
}

/** L'enregistrement est-il un WebM ? (signature EBML) */
export function isWebm(buffer) {
  return buffer.length > 4 && buffer.readUInt32BE(0) === 0x1a45dfa3;
}
