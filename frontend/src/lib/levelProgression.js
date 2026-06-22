// Progression des niveaux (miroir de backend/src/utils/levelProgression.js).
export const LEVEL_ORDER = [
  'TPS', 'PS', 'MS', 'GS',
  '1AP', '2AP', '3AP', '4AP', '5AP', '6AP',
  '1AC', '2AC', '3AC',
  'TC', '1BAC', '2BAC',
];

// Niveau suivant, ou null si dernier niveau (2BAC → diplômé).
export const nextLevel = (level) => {
  if (!level) return null;
  const idx = LEVEL_ORDER.indexOf(String(level).toUpperCase());
  if (idx === -1 || idx === LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
};

// True si l'élève est en fin de cursus (quitte l'établissement).
export const isTerminalLevel = (level) =>
  LEVEL_ORDER.indexOf(String(level || '').toUpperCase()) === LEVEL_ORDER.length - 1;
