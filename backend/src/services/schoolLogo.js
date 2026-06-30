/**
 * Récupération du logo d'une école (uploadé par le super admin) sous forme de
 * Buffer utilisable par PDFKit (`doc.image`). Le `logo_url` pointe en général
 * vers Supabase Storage (URL publique stable) ; un chemin local hérité est
 * également pris en charge.
 *
 * PDFKit ne sait dessiner que du PNG / JPEG : si le logo est dans un autre
 * format (webp, svg…), `drawSchoolLogo` échoue silencieusement et le document
 * est simplement généré sans logo.
 *
 * Les buffers sont mis en cache (les logos changent très rarement) pour ne pas
 * retélécharger l'image à chaque génération de PDF.
 */

import fs from 'fs';
import path from 'path';

const _cache = new Map(); // logo_url -> { buf, ts }
const TTL_MS = 60 * 60 * 1000; // 1 h

/**
 * Télécharge le logo d'une école en Buffer (PNG/JPEG) à partir de son URL.
 * Retourne `null` si absent ou en cas d'échec (jamais d'exception).
 *
 * @param {string} logoUrl
 * @returns {Promise<Buffer|null>}
 */
export async function fetchSchoolLogoBuffer(logoUrl) {
  if (!logoUrl || typeof logoUrl !== 'string') return null;

  const hit = _cache.get(logoUrl);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.buf;

  let buf = null;
  try {
    if (/^https?:\/\//i.test(logoUrl)) {
      const res = await fetch(logoUrl);
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
    } else {
      // Chemin local hérité (ex. « /uploads/logos/… » servi par le backend).
      const rel = logoUrl.replace(/^\//, '');
      if (fs.existsSync(rel)) buf = fs.readFileSync(rel);
      else {
        const abs = path.resolve(process.cwd(), rel);
        if (fs.existsSync(abs)) buf = fs.readFileSync(abs);
      }
    }
  } catch (_) {
    buf = null;
  }

  _cache.set(logoUrl, { buf, ts: Date.now() });
  return buf;
}

/**
 * Dessine le logo dans un document PDFKit, en toute sécurité.
 * PDFKit lève une exception si le format n'est pas supporté : on l'absorbe pour
 * ne jamais bloquer la génération du PDF.
 *
 * @param {PDFDocument} doc
 * @param {Buffer|null} buf      buffer renvoyé par fetchSchoolLogoBuffer
 * @param {number} x
 * @param {number} y
 * @param {object} opts          options PDFKit (ex. { fit: [50, 50], align: 'center' })
 * @returns {boolean}            true si le logo a été dessiné
 */
export function drawSchoolLogo(doc, buf, x, y, opts = {}) {
  if (!buf) return false;
  try {
    doc.image(buf, x, y, opts);
    return true;
  } catch (_) {
    return false;
  }
}
