// Progression des niveaux (miroir de backend/src/utils/levelProgression.js).
export const LEVEL_ORDER = [
  'TPS', 'PS', 'MS', 'GS',
  '1AP', '2AP', '3AP', '4AP', '5AP', '6AP',
  '1AC', '2AC', '3AC',
  'TC', '1BAC', '2BAC',
];

// Catalogue COMPLET des niveaux proposés dans les fiches d'inscription :
// niveaux de base + déclinaisons par filière au lycée (aligné sur
// SCHOOL_HIERARCHY de ClassesPage). Le niveau d'un élève est un texte libre
// en base (profiles.level) : ces libellés servent de référentiel de saisie.
export const ALL_LEVELS = [
  'TPS', 'PS', 'MS', 'GS',
  '1AP', '2AP', '3AP', '4AP', '5AP', '6AP',
  '1AC', '2AC', '3AC',
  'TC', 'TC Sciences', 'TC Lettres', 'TC Technique',
  '1BAC', '1BAC Sciences Math', '1BAC Sciences Exp', '1BAC Lettres',
  '1BAC Sciences Éco', '1BAC STE', '1BAC STM',
  '2BAC', '2BAC Sciences Math A', '2BAC Sciences Math B', '2BAC PC', '2BAC SVT',
  '2BAC Lettres', '2BAC Sciences Humaines', '2BAC Sciences Éco',
  '2BAC Sciences de Gestion', '2BAC STE', '2BAC STM',
];

// Niveau de base d'un libellé avec filière : '1BAC Sciences Math' → '1BAC',
// 'TC Technique' → 'TC'. Renvoie null si aucun niveau du référentiel ne matche.
export const baseLevel = (level) => {
  const up = String(level || '').trim().toUpperCase();
  if (!up) return null;
  if (LEVEL_ORDER.includes(up)) return up;
  return LEVEL_ORDER.find((b) => up.startsWith(`${b} `) || up.startsWith(`${b}-`)) || null;
};

// Niveau suivant, ou null si dernier niveau (2BAC → diplômé).
// Les niveaux avec filière progressent par leur niveau de base (TC Technique → 1BAC).
export const nextLevel = (level) => {
  const base = baseLevel(level);
  if (!base) return null;
  const idx = LEVEL_ORDER.indexOf(base);
  if (idx === -1 || idx === LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
};

// True si l'élève est en fin de cursus (quitte l'établissement).
export const isTerminalLevel = (level) =>
  LEVEL_ORDER.indexOf(baseLevel(level) || '') === LEVEL_ORDER.length - 1;

// Position d'un niveau pour le tri : niveau de base d'abord, puis ses filières.
const levelRank = (level) => {
  const up = String(level || '').trim().toUpperCase();
  const ia = LEVEL_ORDER.indexOf(up);
  if (ia !== -1) return ia * 2; // niveau de base pile sur son rang
  const base = baseLevel(up);
  if (base) return LEVEL_ORDER.indexOf(base) * 2 + 1; // filières juste après
  return Number.MAX_SAFE_INTEGER; // hors référentiel → à la fin
};

// Niveaux distincts (non vides) d'une liste de classes, triés selon
// LEVEL_ORDER puis alphabétiquement pour les niveaux hors référentiel.
export const distinctLevels = (classes = []) => {
  const set = new Set(
    classes.map((c) => String(c?.level || '').trim()).filter(Boolean),
  );
  return [...set].sort((a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b, 'fr'));
};

// Options du sélecteur « Niveau » des fiches d'inscription : catalogue complet
// + niveaux réellement utilisés par les classes fournies (hors référentiel),
// le tout trié selon la progression scolaire.
export const allLevelOptions = (classes = []) => {
  const known = new Set(ALL_LEVELS.map((l) => l.toUpperCase()));
  const extra = distinctLevels(classes).filter((l) => !known.has(l.toUpperCase()));
  return [...ALL_LEVELS, ...extra].sort((a, b) => levelRank(a) - levelRank(b) || a.localeCompare(b, 'fr'));
};
