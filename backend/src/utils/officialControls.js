// Catalogue des contrôles continus OFFICIELS du système éducatif marocain.
//
// Cadre de référence : mémorandum ministériel 080/21 (وزارة التربية الوطنية),
// toujours appliqué dans les calendriers MEN (cf. calendrier 2025-2026) :
//   • فرضان صفيان — 2 contrôles en classe par matière et par أسدس (semestre),
//     tous cycles (primaire, collégial, qualifiant) ;
//   • فرض موحد على صعيد المؤسسة — 1 contrôle unifié établissement par أسدس,
//     SAUF au 2ᵉ semestre de l'année certifiante de chaque cycle
//     (6AP → examen provincial, 3AC → examen régional, 1BAC → régional,
//      2BAC → examen national) ;
//   • le préscolaire (TPS/PS/MS/GS) n'a pas de fards officiels.
//
// Le « Similé » (examen blanc / امتحان تجريبي) n'est pas un fard officiel :
// il est proposé en ajout rapide, surtout pour les années certifiantes.

import { baseLevel } from './levelProgression.js';

const PRESCHOOL = ['TPS', 'PS', 'MS', 'GS'];
// Années certifiantes : pas de فرض موحد au S2 (remplacé par l'examen certifiant)
const CERTIFYING = ['6AP', '3AC', '1BAC', '2BAC'];

// frac = position indicative de la date dans le semestre (0 → début, 1 → fin)
const TEMPLATES = (semester) => [
  { key: `s${semester}_f1`, type: 'official', frac: 0.35, name: `Contrôle 1 (S${semester}) · الفرض 1` },
  { key: `s${semester}_f2`, type: 'official', frac: 0.72, name: `Contrôle 2 (S${semester}) · الفرض 2` },
  { key: `s${semester}_unified`, type: 'unified', frac: 0.92, name: `Contrôle unifié (S${semester}) · الفرض الموحد` },
];

/**
 * Contrôles officiels attendus pour un niveau et un semestre donnés.
 * @param {string} level  niveau de la classe (ex : '6AP', '1BAC Sciences Exp')
 * @param {1|2} semester
 * @returns {{key:string, type:string, frac:number, name:string}[]}
 */
export const officialControlsForLevel = (level, semester) => {
  const base = baseLevel(level);
  if (!base || PRESCHOOL.includes(base)) return [];
  let list = TEMPLATES(semester);
  if (semester === 2 && CERTIFYING.includes(base)) {
    list = list.filter((c) => c.type !== 'unified');
  }
  return list;
};

/**
 * Date suggérée pour un contrôle : position `frac` entre start et end (ISO).
 * @returns {string} date au format YYYY-MM-DD
 */
export const suggestedDate = (start, end, frac) => {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  const t = s + (e - s) * Math.min(1, Math.max(0, frac));
  return new Date(t).toISOString().slice(0, 10);
};

/** Libellé par défaut d'un similé (examen blanc). */
export const SIMILE_NAME = 'Similé · امتحان تجريبي';
