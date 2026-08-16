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

// Deux chaînes désignent-elles la même année scolaire, quel que soit le format
// slash/tiret ? ("2026/2027" == "2026-2027"). Indispensable pour comparer une
// année stockée en base (classes/finance en tiret, inscriptions en slash) au
// format d'affichage du sélecteur d'année (toujours en slash) : un simple ===
// masquerait toutes les classes de l'autre format.
export const sameYear = (a, b) => {
  const na = String(a || '').replace(/\D/g, '');
  const nb = String(b || '').replace(/\D/g, '');
  return !!na && na === nb;
};

// Première année (entier) d'une chaîne "YYYY/YYYY" ou "YYYY-YYYY".
export const firstYearOf = (year) => {
  const a = parseInt(String(year).split(/[/-]/)[0], 10);
  return Number.isNaN(a) ? null : a;
};

// Bornes calendaires complètes d'une année scolaire (septembre → août).
export const schoolYearDateRange = (year) => {
  const first = firstYearOf(year);
  if (first === null) {
    const fallback = firstYearOf(defaultYear());
    return { start: `${fallback}-09-01`, end: `${fallback + 1}-08-31` };
  }
  return { start: `${first}-09-01`, end: `${first + 1}-08-31` };
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
