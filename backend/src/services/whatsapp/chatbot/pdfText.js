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

const ARABIC_GLOBAL_RE = new RegExp('[' + ARABIC_CLASS + ']', 'g');

/**
 * Le texte est-il majoritairement arabe ? Sert à décider du sens de lecture
 * (droite → gauche) et de la langue des libellés d'un document.
 */
export function isArabicDominant(text) {
  const t = String(text || '');
  const arabic = (t.match(ARABIC_GLOBAL_RE) || []).length;
  const letters = (t.match(/[\p{L}]/gu) || []).length;
  return letters > 0 && arabic / letters >= 0.5;
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

// ─────────────────────────────────────────────────────────────────────────
// Mise en page bidirectionnelle (paragraphes mêlant arabe et latin)
// ─────────────────────────────────────────────────────────────────────────
//
// PDFKit ne gère pas le bidi : un texte arabe contenant des mots latins ou des
// nombres (« دفتر 150 ورقة », « قلم رصاص HB2 ») doit être découpé en segments,
// chacun écrit avec SA police, puis positionné à la main — de droite à gauche
// quand le paragraphe est arabe. On implémente donc un mini-moteur : découpe en
// mots, mesure, retour à la ligne glouton, puis placement explicite.

/** Découpe un mot en segments arabe / non-arabe. */
function splitRuns(token) {
  const runs = [];
  for (const ch of [...token]) {
    const ar = ARABIC_RE.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.ar === ar) last.text += ch;
    else runs.push({ ar, text: ch });
  }
  return runs;
}

/**
 * Regroupe les segments latins consécutifs en blocs lus de gauche à droite.
 * Chaque segment arabe reste un bloc à lui seul.
 *
 * Une espace n'est absorbée dans un bloc latin que si elle SÉPARE deux mots
 * latins (« Dictionnaire le Robert »). À la frontière avec l'arabe elle reste
 * un bloc autonome : sinon elle serait dessinée du mauvais côté du bloc et les
 * mots se touchaient (« قلم رصاصHB2 »).
 */
function groupLtrBlocks(runs) {
  const blocks = [];
  const isLatinWord = (r) => r && !r.ar && !r.space;
  let latin = null; // bloc latin en cours

  runs.forEach((run, i) => {
    if (isLatinWord(run)) {
      if (latin) latin.push(run);
      else { latin = [run]; blocks.push(latin); }
      return;
    }
    if (run.space && latin && isLatinWord(runs[i - 1]) && isLatinWord(runs[i + 1])) {
      latin.push(run); // espace interne à une séquence latine
      return;
    }
    latin = null;
    blocks.push([run]);
  });

  return blocks;
}

// En lecture droite → gauche, les caractères appariés s'inversent visuellement.
const MIRRORED = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };
const HAS_ALNUM_RE = /[\p{L}\p{N}]/u;

/**
 * Inverse les parenthèses/crochets d'un segment purement ponctuation, comme le
 * fait l'algorithme bidi : « (أزرق » doit se fermer du bon côté.
 */
function mirrorNeutrals(text) {
  if (HAS_ALNUM_RE.test(text)) return text; // segment latin réel : on n'y touche pas
  return [...text].map((c) => MIRRORED[c] || c).join('');
}

/** Largeur d'un segment dans sa police. */
function runWidth(doc, run, baseFont) {
  doc.font(run.ar ? ARABIC_FONT_NAME : baseFont);
  return doc.widthOfString(run.text, run.ar ? { features: ARABIC_FEATURES } : {});
}

/**
 * Hauteur au-dessus de la ligne de base d'une police, à une taille donnée.
 * Noto Naskh Arabic monte plus haut que Helvetica : sans compensation, les
 * chiffres latins d'une ligne arabe paraissent décalés vers le haut.
 */
function fontAscent(doc, fontName, size) {
  try {
    doc.font(fontName);
    const asc = doc._font?.ascender;
    if (typeof asc === 'number' && asc > 0) return (asc / 1000) * size;
  } catch (_) { /* police absente */ }
  return size * 0.8;
}

/**
 * Calcule les lignes d'un paragraphe : mots regroupés jusqu'à `width`, chaque
 * ligne portant ses segments et leur largeur.
 *
 * @returns {{lines: Array, lineHeight: number, height: number}}
 */
export function layoutMixedParagraph(doc, text, { width, size = 10, lineGap = 1.5 } = {}) {
  const baseFont = doc._font?.name || 'Helvetica';
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  doc.fontSize(size);

  // Hauteur de ligne : la police arabe monte plus haut que la latine.
  let lineHeight = doc.currentLineHeight();
  if (hasArabic(t)) {
    try {
      doc.font(ARABIC_FONT_NAME);
      lineHeight = Math.max(lineHeight, doc.currentLineHeight());
    } catch (_) { /* police arabe absente */ }
    doc.font(baseFont);
  }
  lineHeight += lineGap;

  if (!t) return { lines: [], lineHeight, height: 0 };

  const spaceWidth = (() => { doc.font(baseFont); return doc.widthOfString(' '); })();
  const words = t.split(' ');
  const lines = [];
  let current = { runs: [], width: 0 };

  for (const word of words) {
    const runs = splitRuns(word).map((r) => ({ ...r, width: runWidth(doc, r, baseFont) }));
    const wordWidth = runs.reduce((s, r) => s + r.width, 0);
    const needed = current.runs.length === 0 ? wordWidth : current.width + spaceWidth + wordWidth;

    // Tolérance de 1 pt : sans elle, un texte dimensionné exactement à sa
    // largeur mesurée (pastilles, badges) passait à la ligne à cause des
    // arrondis de mesure.
    if (current.runs.length > 0 && needed > width + 1) {
      lines.push(current);
      current = { runs, width: wordWidth };
    } else {
      if (current.runs.length > 0) {
        current.runs.push({ ar: false, space: true, text: ' ', width: spaceWidth });
        current.width += spaceWidth;
      }
      current.runs.push(...runs);
      current.width += wordWidth;
    }
  }
  if (current.runs.length > 0) lines.push(current);

  doc.font(baseFont);
  return { lines, lineHeight, height: lines.length * lineHeight };
}

/** Hauteur qu'occuperait un paragraphe mixte, sans l'écrire. */
export function mixedParagraphHeight(doc, text, opts) {
  return layoutMixedParagraph(doc, text, opts).height;
}

/**
 * Largeur d'un texte mixte sur une seule ligne, chaque segment mesuré dans SA
 * police. Indispensable pour dimensionner une pastille autour d'un libellé
 * arabe : `doc.widthOfString` seul mesurerait tout en police latine.
 */
export function mixedTextWidth(doc, text, { size = 10 } = {}) {
  const baseFont = doc._font?.name || 'Helvetica';
  doc.fontSize(size);
  const width = splitRuns(String(text == null ? '' : text))
    .reduce((sum, run) => sum + runWidth(doc, run, baseFont), 0);
  doc.font(baseFont);
  return width;
}

/**
 * Écrit un paragraphe pouvant mêler arabe et latin, avec retour à la ligne.
 *
 * @param {object} p
 * @param {number} p.x, p.y     coin haut-gauche de la zone de texte
 * @param {number} p.width      largeur disponible
 * @param {number} [p.size]     taille de police
 * @param {'left'|'right'|'center'} [p.align]
 * @param {boolean} [p.rtl]     sens de lecture : segments placés de droite à
 *                              gauche (ordre visuel arabe correct)
 * @returns {number} hauteur écrite
 */
export function drawMixedParagraph(doc, text, {
  x, y, width, size = 10, align = 'left', rtl = false, lineGap = 1.5, maxLines = 0,
} = {}) {
  const baseFont = doc._font?.name || 'Helvetica';
  const { lines, lineHeight } = layoutMixedParagraph(doc, text, { width, size, lineGap });
  const visible = maxLines > 0 ? lines.slice(0, maxLines) : lines;
  doc.fontSize(size);

  // Alignement des lignes de base entre police latine et police arabe.
  const baseAscent = fontAscent(doc, baseFont, size);
  const arabicAscent = fontAscent(doc, ARABIC_FONT_NAME, size);
  const maxAscent = Math.max(baseAscent, arabicAscent);
  const baselineShift = (run) => maxAscent - (run.ar ? arabicAscent : baseAscent);
  doc.font(baseFont).fontSize(size);

  visible.forEach((line, i) => {
    const slack = Math.max(0, width - line.width);
    const startX = align === 'right' ? x + slack : align === 'center' ? x + slack / 2 : x;
    const lineY = y + i * lineHeight;

    if (rtl) {
      // Ordre visuel arabe : le premier segment du texte s'affiche le plus à
      // droite, les suivants se placent vers la gauche. Les segments latins
      // CONSÉCUTIFS (« +212 522 000 000 », « Dictionnaire le Robert ») forment
      // un bloc placé d'un seul tenant et lu de gauche à droite à l'intérieur —
      // sinon leurs mots apparaîtraient inversés.
      let right = startX + line.width;
      for (const block of groupLtrBlocks(line.runs)) {
        const blockWidth = block.reduce((s, r) => s + r.width, 0);
        let left = right - blockWidth;
        for (const run of block) {
          doc.font(run.ar ? ARABIC_FONT_NAME : baseFont);
          doc.text(run.ar ? run.text : mirrorNeutrals(run.text), left, lineY + baselineShift(run), {
            lineBreak: false,
            ...(run.ar ? { features: ARABIC_FEATURES } : {}),
          });
          left += run.width;
        }
        right -= blockWidth;
      }
    } else {
      let left = startX;
      for (const run of line.runs) {
        doc.font(run.ar ? ARABIC_FONT_NAME : baseFont);
        doc.text(run.text, left, lineY + baselineShift(run), {
          lineBreak: false,
          ...(run.ar ? { features: ARABIC_FEATURES } : {}),
        });
        left += run.width;
      }
    }
  });

  doc.font(baseFont);
  return visible.length * lineHeight;
}
