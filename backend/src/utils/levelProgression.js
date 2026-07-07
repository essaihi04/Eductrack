// Progression des niveaux du système éducatif marocain.
// Ordre linéaire utilisé pour proposer le niveau suivant lors de la réinscription.
// Aligné sur SCHOOL_HIERARCHY de frontend/src/pages/admin/ClassesPage.jsx.
export const LEVEL_ORDER = [
  'TPS', 'PS', 'MS', 'GS',
  '1AP', '2AP', '3AP', '4AP', '5AP', '6AP',
  '1AC', '2AC', '3AC',
  'TC', '1BAC', '2BAC',
];

/**
 * Niveau de base d'un libellé avec filière : '1BAC Sciences Math' → '1BAC',
 * 'TC Technique' → 'TC'. Renvoie null si aucun niveau du référentiel ne matche.
 * @param {string} level
 * @returns {string|null}
 */
export const baseLevel = (level) => {
  const up = String(level || '').trim().toUpperCase();
  if (!up) return null;
  if (LEVEL_ORDER.includes(up)) return up;
  return LEVEL_ORDER.find((b) => up.startsWith(`${b} `) || up.startsWith(`${b}-`)) || null;
};

/**
 * Renvoie le niveau scolaire suivant, ou null si dernier niveau (2BAC → diplômé).
 * Les niveaux avec filière progressent par leur niveau de base (TC Technique → 1BAC).
 * @param {string} level code de niveau (ex: '6AP', '1BAC Sciences Math')
 * @returns {string|null}
 */
export const nextLevel = (level) => {
  const base = baseLevel(level);
  if (!base) return null;
  const idx = LEVEL_ORDER.indexOf(base);
  if (idx === -1) return null;
  if (idx === LEVEL_ORDER.length - 1) return null; // dernier niveau, pas de suite
  return LEVEL_ORDER[idx + 1];
};

/**
 * Indique si un niveau est le dernier du cursus (l'élève quitte l'établissement).
 * @param {string} level
 * @returns {boolean}
 */
export const isTerminalLevel = (level) => {
  const idx = LEVEL_ORDER.indexOf(baseLevel(level) || '');
  return idx === LEVEL_ORDER.length - 1;
};
