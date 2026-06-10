/**
 * En-tête officiel d'établissement, partagé par tous les documents générés
 * (bulletins, emploi du temps, rapports…).
 *
 * Source de vérité : school_year_config (renseigné automatiquement à l'import
 * des listes d'élèves Massar) + table schools en repli.
 */

import { supabaseAdmin } from '../config/supabase.js';

/**
 * @param {string} schoolId
 * @param {string} [academicYear]  "2025/2026"
 * @returns {Promise<{
 *   academy, provincial_direction, region, establishment, director_name,
 *   academic_year, school, config
 * }>}
 */
export async function getEstablishmentConfig(schoolId, academicYear) {
  let config = null;
  let school = null;

  if (schoolId) {
    const { data } = await supabaseAdmin
      .from('schools')
      .select('id, name, address, phone')
      .eq('id', schoolId)
      .single();
    school = data || null;
  }

  if (schoolId && academicYear) {
    const { data } = await supabaseAdmin
      .from('school_year_config')
      .select('*')
      .eq('school_id', schoolId)
      .eq('academic_year', academicYear)
      .maybeSingle();
    config = data || null;
  }

  return {
    academy:              config?.academy || '',
    provincial_direction: config?.provincial_direction || '',
    region:               config?.region || '',
    establishment:        config?.establishment_label || school?.name || '',
    director_name:        config?.director_name || '',
    academic_year:        academicYear || '',
    school:               school || {},
    config:               config || {},
  };
}
