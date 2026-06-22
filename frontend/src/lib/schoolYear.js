// Utilitaires année scolaire — centralise la logique dupliquée dans plusieurs pages.

// Année scolaire courante au format slash "YYYY/YYYY" (rentrée en septembre).
export const defaultYear = () => {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${y + 1}`;
};

// Convertit "YYYY/YYYY" -> "YYYY-YYYY" (format utilisé par le module finance).
export const toDashYear = (year) => String(year || '').replace('/', '-');

// Convertit "YYYY-YYYY" -> "YYYY/YYYY".
export const toSlashYear = (year) => String(year || '').replace('-', '/');

// Première année (entier) d'une chaîne "YYYY/YYYY" ou "YYYY-YYYY".
export const firstYearOf = (year) => {
  const a = parseInt(String(year).split(/[/\-]/)[0], 10);
  return Number.isNaN(a) ? null : a;
};

// Année suivante au format slash.
export const nextYearStr = (year) => {
  const a = firstYearOf(year);
  return a === null ? null : `${a + 1}/${a + 2}`;
};

// Année précédente au format slash.
export const prevYearStr = (year) => {
  const a = firstYearOf(year);
  return a === null ? null : `${a - 1}/${a}`;
};
