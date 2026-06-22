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
 * Renvoie le niveau scolaire suivant, ou null si dernier niveau (2BAC → diplômé).
 * @param {string} level code de niveau (ex: '6AP')
 * @returns {string|null}
 */
export const nextLevel = (level) => {
  if (!level) return null;
  const idx = LEVEL_ORDER.indexOf(String(level).toUpperCase());
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
  const idx = LEVEL_ORDER.indexOf(String(level || '').toUpperCase());
  return idx === LEVEL_ORDER.length - 1;
};
