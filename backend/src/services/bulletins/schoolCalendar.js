/**
 * Calendrier scolaire officiel marocain — défauts MEN.
 *
 * Source : Ministère de l'Éducation Nationale, du Préscolaire et des Sports
 * Calendrier officiel 2025-2026 : rentrée 8 sept 2025, fin année ~30 juin 2026.
 * Pour les autres années on applique le pattern habituel :
 *   • Semestre 1 : début septembre → mi-janvier
 *   • Semestre 2 : mi-janvier      → fin juin
 *
 * Ces dates servent de défaut quand l'admin n'a pas configuré
 * `school_year_config` pour l'année en cours.
 */

import { supabaseAdmin } from '../../config/supabase.js';

// Dates spécifiques connues (à mettre à jour chaque année si besoin).
// Format : { 'YYYY/YYYY': { s1_start, s1_end, s2_start, s2_end, year_start, year_end } }
const OFFICIAL_DATES = {
  '2025/2026': {
    year_start:  '2025-09-08', // début effectif des cours
    s1_start:    '2025-09-08',
    s1_end:      '2026-01-16', // fin du semestre 1 (typique MEN)
    s2_start:    '2026-01-19',
    s2_end:      '2026-06-26',
    year_end:    '2026-06-30',
  },
  '2024/2025': {
    year_start:  '2024-09-09',
    s1_start:    '2024-09-09',
    s1_end:      '2025-01-17',
    s2_start:    '2025-01-20',
    s2_end:      '2025-06-27',
    year_end:    '2025-06-30',
  },
};

/**
 * Retourne les bornes par défaut pour une année académique donnée.
 * Si l'année est dans OFFICIAL_DATES on l'utilise, sinon on calcule
 * dynamiquement (1er sept → 15 janv → 30 juin).
 */
export const getDefaultYearBounds = (academicYear) => {
  if (OFFICIAL_DATES[academicYear]) return OFFICIAL_DATES[academicYear];

  const startYear = parseInt(String(academicYear).split('/')[0], 10) || new Date().getFullYear();
  return {
    year_start:  `${startYear}-09-01`,
    s1_start:    `${startYear}-09-01`,
    s1_end:      `${startYear + 1}-01-31`,
    s2_start:    `${startYear + 1}-02-01`,
    s2_end:      `${startYear + 1}-06-30`,
    year_end:    `${startYear + 1}-06-30`,
  };
};

/**
 * Détermine l'année académique courante en fonction de la date.
 * Septembre → décembre = année N/N+1
 * Janvier → août       = année N-1/N
 */
export const getCurrentAcademicYear = (date = new Date()) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1..12
  if (m >= 9) return `${y}/${y + 1}`;
  return `${y - 1}/${y}`;
};

/**
 * Détermine le semestre courant (1 ou 2) en fonction de la date,
 * en utilisant la config de l'école si elle existe sinon les défauts MEN.
 *
 * @returns {Promise<{ academicYear: string, semester: 1|2, start: string, end: string,
 *                     isVacation: boolean, source: 'config'|'default' }>}
 */
export const getCurrentSemester = async (schoolId, date = new Date()) => {
  const academicYear = getCurrentAcademicYear(date);
  const isoDate = (date instanceof Date ? date : new Date(date)).toISOString().slice(0, 10);

  // 1. Config école si présente
  const { data: cfg } = await supabaseAdmin
    .from('school_year_config')
    .select('*')
    .eq('school_id', schoolId)
    .eq('academic_year', academicYear)
    .maybeSingle();

  let s1Start, s1End, s2Start, s2End;
  let source = 'default';

  if (cfg && cfg.semester_1_start && cfg.semester_1_end && cfg.semester_2_start && cfg.semester_2_end) {
    s1Start = cfg.semester_1_start; s1End = cfg.semester_1_end;
    s2Start = cfg.semester_2_start; s2End = cfg.semester_2_end;
    source = 'config';
  } else {
    const def = getDefaultYearBounds(academicYear);
    s1Start = def.s1_start; s1End = def.s1_end;
    s2Start = def.s2_start; s2End = def.s2_end;
  }

  // 2. Déduction du semestre
  let semester = 1;
  let isVacation = false;
  if (isoDate >= s1Start && isoDate <= s1End) {
    semester = 1;
  } else if (isoDate >= s2Start && isoDate <= s2End) {
    semester = 2;
  } else if (isoDate > s1End && isoDate < s2Start) {
    // Pause inter-semestre → on rattache au S2 à venir
    semester = 2;
    isVacation = true;
  } else {
    // Hors année : on rattache au plus proche
    semester = isoDate < s1Start ? 1 : 2;
    isVacation = true;
  }

  return {
    academicYear,
    semester,
    start: semester === 1 ? s1Start : s2Start,
    end:   semester === 1 ? s1End   : s2End,
    isVacation,
    source,
  };
};
