/**
 * Notes vocales enregistrées depuis l'application (micro du PC ou du téléphone).
 *
 * Le nœud du problème : les navigateurs et WhatsApp ne parlent pas le même
 * format. `MediaRecorder` produit du **WebM/Opus** sur Chrome et Edge — soit la
 * grande majorité des postes — alors que l'API Cloud n'accepte que
 * ogg/opus, mp4/aac, mpeg, amr et aac. Envoyer le WebM tel quel se solde par un
 * refus de Meta.
 *
 * Firefox (ogg/opus) et Safari (mp4/aac) enregistrent déjà dans un format
 * accepté : leur flux part sans retouche. Pour les autres, on ré-encapsule avec
 * ffmpeg — sans ré-encoder quand c'est possible, l'Opus du WebM étant déjà le
 * codec attendu dans un conteneur Ogg.
 */

import { spawn } from 'child_process';

// Formats que l'API Cloud accepte tels quels (voir doc Meta « Media »).
const NATIVE = [/^audio\/ogg/, /^audio\/mp4/, /^audio\/aac/, /^audio\/mpeg/, /^audio\/amr/];

export const isNativeAudio = (mimetype) => NATIVE.some((re) => re.test(String(mimetype || '')));

let ffmpegChecked = false;
let ffmpegAvailable = false;

/** ffmpeg est-il installé sur la machine ? (testé une seule fois) */
export function hasFfmpeg() {
  if (ffmpegChecked) return ffmpegAvailable;
  ffmpegChecked = true;
  try {
    const probe = spawn('ffmpeg', ['-version']);
    probe.on('error', () => { ffmpegAvailable = false; });
    // Le résultat n'est pas attendu ici : la première conversion tranchera.
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

/**
 * Ré-encapsule un enregistrement navigateur en Ogg/Opus.
 *
 * `-c:a copy` d'abord : le flux Opus du WebM est recopié tel quel dans un
 * conteneur Ogg, sans perte ni temps de calcul. Si le codec source n'est pas
 * de l'Opus (cas rare), on ré-encode.
 *
 * @returns {Promise<Buffer>}
 */
export function toOggOpus(buffer, { reencode = false } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      ...(reencode ? ['-c:a', 'libopus', '-b:a', '32k'] : ['-c:a', 'copy']),
      '-f', 'ogg', 'pipe:1',
    ];

    let ff;
    try {
      ff = spawn('ffmpeg', args);
    } catch (e) {
      return reject(new Error('ffmpeg introuvable'));
    }

    const out = [];
    let err = '';
    ff.stdout.on('data', (c) => out.push(c));
    ff.stderr.on('data', (c) => { err += c.toString(); });
    ff.on('error', () => reject(new Error('ffmpeg introuvable')));
    ff.on('close', (code) => {
      if (code === 0 && out.length) return resolve(Buffer.concat(out));
      // Copie impossible (codec source différent) → une seule reprise, en ré-encodant.
      if (!reencode) {
        return toOggOpus(buffer, { reencode: true }).then(resolve).catch(reject);
      }
      reject(new Error(err.split('\n').filter(Boolean).pop() || `ffmpeg a échoué (code ${code})`));
    });

    ff.stdin.on('error', () => { /* flux fermé par ffmpeg : géré par 'close' */ });
    ff.stdin.end(buffer);
  });
}

/**
 * Prépare un enregistrement pour l'envoi WhatsApp.
 * @returns {Promise<{buffer: Buffer, mimetype: string, fileName: string}>}
 */
export async function prepareVoiceNote(buffer, mimetype) {
  if (isNativeAudio(mimetype)) {
    const ext = /ogg/.test(mimetype) ? 'ogg' : /mp4|aac/.test(mimetype) ? 'm4a' : /mpeg/.test(mimetype) ? 'mp3' : 'amr';
    return { buffer, mimetype: String(mimetype).split(';')[0], fileName: `note-vocale.${ext}` };
  }
  const converted = await toOggOpus(buffer);
  return { buffer: converted, mimetype: 'audio/ogg', fileName: 'note-vocale.ogg' };
}
