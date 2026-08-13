/**
 * Écriture de l'emploi du temps d'une classe.
 *
 * Partagé entre la saisie manuelle (PUT /admin/classes/:id/timetable) et
 * l'import IA, pour que les deux chemins produisent exactement le même état :
 * remplacement complet des créneaux + rattachement automatique des professeurs
 * placés dans la grille à la classe (class_teachers).
 */
import { supabaseAdmin } from '../../config/supabase.js';

const SELECT_WITH_JOINS =
  '*, subject:subjects(id, name, code), teacher:profiles!class_timetable_teacher_id_fkey(id, first_name, last_name)';

/**
 * Remplace l'intégralité de l'emploi du temps d'une classe.
 * `slots` : [{ day_of_week, slot_order, start_time, end_time, subject_id, teacher_id, room }]
 * Renvoie les créneaux créés, joints aux matières et professeurs.
 */
export async function saveClassTimetable({ classId, schoolId, slots }) {
  const { error: deleteError } = await supabaseAdmin
    .from('class_timetable')
    .delete()
    .eq('class_id', classId);
  if (deleteError) throw deleteError;

  if (!slots || slots.length === 0) return [];

  const rows = slots.map((slot, idx) => ({
    class_id: classId,
    day_of_week: slot.day_of_week,
    slot_order: slot.slot_order ?? idx + 1,
    start_time: slot.start_time,
    end_time: slot.end_time,
    subject_id: slot.subject_id || null,
    teacher_id: slot.teacher_id || null,
    room: slot.room || null,
    school_id: schoolId,
  }));

  const { data, error: insertError } = await supabaseAdmin
    .from('class_timetable')
    .insert(rows)
    .select(SELECT_WITH_JOINS);
  if (insertError) throw insertError;

  await attachTeachersToClass(classId, rows);

  return data || [];
}

/**
 * Tout professeur placé dans l'emploi du temps est rattaché à la classe s'il ne
 * l'est pas déjà — il apparaît alors dans la fiche classe, le périmètre et le
 * calcul des heures. Un échec ici ne doit pas annuler l'enregistrement.
 */
async function attachTeachersToClass(classId, rows) {
  try {
    const teacherIds = [...new Set(rows.map((r) => r.teacher_id).filter(Boolean))];
    if (teacherIds.length === 0) return;

    const { data: existing } = await supabaseAdmin
      .from('class_teachers')
      .select('teacher_id')
      .eq('class_id', classId);

    const have = new Set((existing || []).map((r) => r.teacher_id));
    const toAdd = teacherIds
      .filter((id) => !have.has(id))
      .map((teacher_id) => ({ class_id: classId, teacher_id }));

    if (toAdd.length > 0) await supabaseAdmin.from('class_teachers').insert(toAdd);
  } catch (e) {
    console.warn('Auto-assign class_teachers (timetable):', e.message);
  }
}
