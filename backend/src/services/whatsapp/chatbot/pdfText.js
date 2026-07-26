/**
 * Helpers d'écriture PDFKit compatibles arabe, partagés par les PDF du chatbot
 * (factures, fournitures scolaires…).
 *
 * La police Noto Naskh Arabic est embarquée et les features OpenType `rtla` +
 * `rclt` sont activées pour que fontkit (utilisé en interne par pdfkit) applique
 * le shaping et l'ordre RTL.
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ARABIC_FONT_PATH = path.join(__dirname, 'fonts', 'NotoNaskhArabic-Regular.ttf');
export const ARABIC_FONT_NAME = 'ArabicFont';

// Plages Unicode arabe (lettres + ponctuation), construites depuis leurs
// codepoints pour ne pas embarquer de caractères invisibles dans la source.
const ARABIC_RANGES = [[0x0600, 0x06FF], [0x0750, 0x077F], [0x08A0, 0x08FF], [0xFB50, 0xFDFF], [0xFE70, 0xFEFF]];
const ARABIC_CLASS = ARABIC_RANGES.map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('');

export const ARABIC_RE = new RegExp('[' + ARABIC_CLASS + ']');

export function hasArabic(text) {
  return ARABIC_RE.test(String(text || ''));
}

// OpenType features qui activent le shaping arabe correct dans fontkit :
// 'rtla' = right-to-left alternates, 'rclt' = required contextual alternates.
const ARABIC_FEATURES = ['rtla', 'rclt'];

/** Enregistre la police arabe dans un document (sans faire échouer la génération). */
export function registerArabicFont(doc) {
  try {
    doc.registerFont(ARABIC_FONT_NAME, ARABIC_FONT_PATH);
    return true;
  } catch (e) {
    console.warn('[pdfText] Police arabe non chargée:', e.message);
    return false;
  }
}

/**
 * Wrapper qui choisit la police selon le contenu et écrit dans le PDF.
 * Conserve la signature de doc.text() en y ajoutant la sélection auto.
 */
export function smartText(doc, text, x, y, options = {}) {
  const t = String(text == null ? '' : text);
  const useArabic = hasArabic(t);
  const previousFont = doc._font?.name || 'Helvetica';
  if (useArabic) {
    doc.font(ARABIC_FONT_NAME);
  }
  const finalOptions = useArabic
    ? { ...options, features: [...(options.features || []), ...ARABIC_FEATURES] }
    : options;
  if (x !== undefined && y !== undefined) {
    doc.text(t, x, y, finalOptions);
  } else {
    doc.text(t, finalOptions);
  }
  if (useArabic) {
    // Retour à la police précédente pour ne pas affecter les écritures suivantes
    try { doc.font(previousFont); } catch (_) { doc.font('Helvetica'); }
  }
}

/**
 * Rend une chaîne qui MÉLANGE arabe et latin (ex. « nom arabe — Classe »).
 * Contrairement à smartText, chaque segment est écrit avec SA police : les
 * lettres arabes en Noto Naskh, le reste (latin/chiffres/ponctuation) dans la
 * police de base. Sinon, forcer tout le texte en police arabe affiche des
 * carrés (.notdef) là où la police arabe n'a pas de glyphe latin.
 * Réservé aux en-têtes simples (pas de gestion width/ellipsis).
 */
export function smartMixedText(doc, text, x, y, options = {}) {
  const t = String(text == null ? '' : text);
  const baseFont = doc._font?.name || 'Helvetica';
  if (!hasArabic(t)) {
    // Aucun arabe : un seul appel, police de base.
    if (x !== undefined && y !== undefined) doc.text(t, x, y, options);
    else doc.text(t, options);
    return;
  }
  // Découpe en segments consécutifs arabe / non-arabe. Les espaces sont
  // toujours rendus dans la police de base : PDFKit supprime les espaces en fin
  // de segment arabe `continued`, ce qui collait les mots (« مدارسvia »).
  const runs = [];
  for (const ch of [...t]) {
    const isAr = /\s/.test(ch) ? false : ARABIC_RE.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.ar === isAr) last.text += ch;
    else runs.push({ ar: isAr, text: ch });
  }
  runs.forEach((run, i) => {
    const isLast = i === runs.length - 1;
    doc.font(run.ar ? ARABIC_FONT_NAME : baseFont);
    const opt = { ...options, continued: !isLast };
    if (run.ar) opt.features = [...(options.features || []), ...ARABIC_FEATURES];
    if (i === 0 && x !== undefined && y !== undefined) doc.text(run.text, x, y, opt);
    else doc.text(run.text, opt);
  });
  try { doc.font(baseFont); } catch (_) { doc.font('Helvetica'); }
}
