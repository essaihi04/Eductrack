/**
 * Petits utilitaires de texte partagés par les chatbots (parent, enseignant).
 */

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXT_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Convertit les chiffres arabes-indic (٠-٩) et persans (۰-۹) en chiffres ASCII.
 * Ex: "١" → "1", "٢" → "2".
 */
export function normalizeDigits(text) {
  if (!text) return '';
  return String(text)
    .replace(/[٠-٩]/g, (c) => ARABIC_INDIC.indexOf(c).toString())
    .replace(/[۰-۹]/g, (c) => EXT_ARABIC_INDIC.indexOf(c).toString());
}
