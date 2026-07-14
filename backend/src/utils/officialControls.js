// Catalogue des contrôles continus OFFICIELS du système éducatif marocain,
// différencié par cycle (aligné sur les mémos MEN d'évaluation et la
// pratique Massar) :
//
//   • PRIMAIRE (1AP–6AP) : l'année est découpée en 4 étapes (مراحل), un فرض
//     à la fin de chaque étape → 2 fards par matière et par أسدس (semestre).
//     Pas de note d'activités dans Massar au primaire.
//   • COLLÈGE (1AC–3AC) : فروض محروسة + note الأنشطة المندمجة (activités
//     intégrées = 1/3 de la moyenne selon les mémos d'évaluation du cycle).
//     → 3 fards + 1 note Activités par matière et par semestre.
//   • LYCÉE QUALIFIANT (TC, 1BAC, 2BAC — mémo 142) : « فرضان كتابيان
//     محروسان في كل أسدس » minimum + الأنشطة المندمجة = 25 % de la moyenne ;
//     les matières à fort volume horaire des filières scientifiques passent
//     3 fards (pratique Massar) → 3 fards + 1 note Activités (le fard non
//     utilisé peut être supprimé d'un clic, il reste non publié).
//   • PRÉSCOLAIRE (TPS/PS/MS/GS) : pas de fards officiels.
//
// Ces colonnes sont créées AUTOMATIQUEMENT à l'ouverture de la grille de
// saisie (idempotent via official_key). Le « Similé » (examen blanc /
// امتحان تجريبي) n'est pas un fard officiel : proposé en ajout manuel.

import { baseLevel } from './levelProgression.js';

const PRESCHOOL = ['TPS', 'PS', 'MS', 'GS'];
const PRIMARY = ['1AP', '2AP', '3AP', '4AP', '5AP', '6AP'];

// frac = position indicative de la date dans le semestre (0 → début, 1 → fin)
const FARD = (semester, n, frac) => ({
  key: `s${semester}_f${n}`, type: 'official', frac, name: `Contrôle ${n} · الفرض ${n}`,
});
const ACTIVITIES = (semester) => ({
  key: `s${semester}_act`, type: 'official', frac: 0.95, name: 'Activités · الأنشطة',
});

/**
 * Contrôles officiels attendus pour un niveau et un semestre donnés.
 * Primaire : 2 fards. Collège & lycée : 3 fards + note d'activités.
 * @param {string} level  niveau de la classe (ex : '6AP', '1BAC Sciences Exp')
 * @param {1|2} semester
 * @returns {{key:string, type:string, frac:number, name:string}[]}
 */
export const officialControlsForLevel = (level, semester) => {
  const base = baseLevel(level);
  if (!base || PRESCHOOL.includes(base)) return [];
  if (PRIMARY.includes(base)) {
    // 2 étapes (مرحلة) par semestre → فرض المرحلة 1 et 2
    return [FARD(semester, 1, 0.40), FARD(semester, 2, 0.85)];
  }
  // Collège + lycée qualifiant : 3 fards + activités intégrées
  return [
    FARD(semester, 1, 0.30),
    FARD(semester, 2, 0.55),
    FARD(semester, 3, 0.80),
    ACTIVITIES(semester),
  ];
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
