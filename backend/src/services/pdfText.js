/**
 * Rendu de texte mixte latin + arabe pour les PDF PDFKit (grille de notes,
 * récap par contrôle…). NotoNaskhArabic n'a PAS de glyphes latins : un texte
 * mixte rendu d'un seul bloc affiche des carrés. On découpe donc le texte en
 * segments et on rend chaque segment avec la police qui lui convient.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ARABIC_FONT_PATH = path.join(__dirname, 'whatsapp', 'chatbot', 'fonts', 'NotoNaskhArabic-Regular.ttf');
export const ARABIC_FONT_NAME = 'ArabicFont';
export const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
export const ARABIC_FEATURES = ['rtla', 'rclt'];

/** Enregistre la police arabe sur un document (sans planter si elle manque). */
export function registerArabicFont(doc) {
  try { doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH); } catch (_) { /* police absente */ }
}

/** Découpe un texte en segments alternés latin / arabe. */
export function scriptRuns(text) {
  const t = String(text == null ? '' : text);
  const runs = [];
  for (const ch of t) {
    const isAr = ARABIC_RE.test(ch);
    const last = runs[runs.length - 1];
    // Les séparateurs (espaces, ·, chiffres…) suivent le segment en cours.
    if (last && (isAr === last.ar || /[\s0-9.,:/()\-]/.test(ch))) last.t += ch;
    else runs.push({ t: ch, ar: isAr });
  }
  return runs;
}

/** Largeur d'un texte mixte à une taille donnée. */
export function mixedWidth(doc, text, { fontSize = 8, latinFont = 'Helvetica' } = {}) {
  return scriptRuns(text).reduce((total, r) => {
    doc.font(r.ar ? ARABIC_FONT_NAME : latinFont).fontSize(fontSize);
    return total + doc.widthOfString(r.t, r.ar ? { features: ARABIC_FEATURES } : {});
  }, 0);
}

/**
 * Rend un texte mixte latin+arabe sur UNE ligne : chaque segment avec la bonne
 * police (latin = `latinFont`, arabe = NotoNaskh + shaping RTL).
 * Supporte align left/center/right dans la largeur donnée (pas de retour ligne).
 */
export function mixedLine(doc, text, x, y, { width, align = 'left', fontSize = 8, latinFont = 'Helvetica', color = null } = {}) {
  const runs = scriptRuns(text);
  if (!runs.length) return;
  const widths = runs.map(r => {
    doc.font(r.ar ? ARABIC_FONT_NAME : latinFont).fontSize(fontSize);
    return doc.widthOfString(r.t, r.ar ? { features: ARABIC_FEATURES } : {});
  });
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = x;
  if (width && align === 'center') cx = x + Math.max(0, (width - total) / 2);
  else if (width && align === 'right') cx = x + Math.max(0, width - total);
  runs.forEach((r, i) => {
    doc.font(r.ar ? ARABIC_FONT_NAME : latinFont).fontSize(fontSize);
    if (color) doc.fillColor(color);
    doc.text(r.t, cx, y, { lineBreak: false, ...(r.ar ? { features: ARABIC_FEATURES } : {}) });
    cx += widths[i];
  });
}
