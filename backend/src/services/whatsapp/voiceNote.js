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
 * accepté : leur flux part sans retouche. Pour les autres, on ré-empaquette —
 * sans ré-encoder, l'Opus du WebM étant déjà le codec attendu dans un conteneur
 * Ogg.
 *
 * Ce ré-empaquetage se fait d'abord en JavaScript (webmToOgg.js), pour ne rien
 * exiger du serveur : demander « apt install ffmpeg » à une école qui héberge
 * son backend sur une plateforme gérée revient à lui refuser la fonction. ffmpeg
 * ne sert plus que de filet, pour les formats exotiques.
 */

import { spawn } from 'child_process';
import { webmToOggOpus } from './webmToOgg.js';

// Formats que l'API Cloud accepte tels quels (voir doc Meta « Media »).
const NATIVE = [/^audio\/ogg/, /^audio\/mp4/, /^audio\/aac/, /^audio\/mpeg/, /^audio\/amr/];

export const isNativeAudio = (mimetype) => NATIVE.some((re) => re.test(String(mimetype || '')));

let ffmpegProbe = null;

/** ffmpeg est-il installé sur la machine ? (réellement testé, une seule fois) */
export function hasFfmpeg() {
  if (ffmpegProbe) return ffmpegProbe;
  ffmpegProbe = new Promise((resolve) => {
    try {
      const probe = spawn('ffmpeg', ['-version']);
      probe.on('error', () => resolve(false));
      probe.on('close', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
  return ffmpegProbe;
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

  const ogg = { mimetype: 'audio/ogg', fileName: 'note-vocale.ogg' };

  // Cas courant — Chrome, Edge : du WebM qui contient déjà de l'Opus. On change
  // la boîte, pas le son : instantané, sans perte, sans binaire externe.
  try {
    return { buffer: webmToOggOpus(buffer), ...ogg };
  } catch (e) {
    // Format inattendu (WebM/Vorbis, conteneur inconnu) : ffmpeg s'il est là.
    if (!(await hasFfmpeg())) throw new Error(`Format audio non pris en charge (${e.message})`);
  }

  return { buffer: await toOggOpus(buffer), ...ogg };
}
