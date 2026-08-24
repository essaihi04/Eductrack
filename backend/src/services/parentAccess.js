import { supabaseAdmin } from '../config/supabase.js';

// Source unique pour les contrôles d'accès parent → enfant. Les deux espaces
// (tableau parent et assistant) doivent résoudre exactement le même lien.
export async function findParentChildLink(parentId, childId) {
  if (!parentId || !childId) return null;
  const { data, error } = await supabaseAdmin
    .from('parent_students')
    .select('student_id, relationship')
    .eq('parent_id', parentId)
    .eq('student_id', childId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function listParentChildren(parentId) {
  const { data, error } = await supabaseAdmin
    .from('parent_students')
    .select(`
      relationship,
      student:profiles!parent_students_student_id_fkey(
        id, first_name, last_name, avatar_url, class_id,
        classes:classes!fk_profiles_class(id, name, level)
      )
    `)
    .eq('parent_id', parentId);
  if (error) throw error;

  return (data || [])
    .filter((row) => row.student)
    .map((row) => ({
      id: row.student.id,
      first_name: row.student.first_name,
      last_name: row.student.last_name,
      avatar_url: row.student.avatar_url,
      relationship: row.relationship,
      class: row.student.classes
        ? {
            id: row.student.classes.id,
            name: row.student.classes.name,
            level: row.student.classes.level,
          }
        : null,
    }));
}

export async function loadParentChild(parentId, childId) {
  const link = await findParentChildLink(parentId, childId);
  if (!link) return null;

  // Le nom explicite de la FK est indispensable : profiles et classes ont
  // plusieurs relations. `classes(name)` seul provoque PGRST201 et faisait
  // croire à tort que l'enfant n'était pas rattaché.
  const { data: student, error } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, email, class_id, school_id, massar_code, massar_secret, classes:classes!fk_profiles_class(id, name, level)')
    .eq('id', childId)
    .single();
  if (error) throw error;

  return {
    ...student,
    relationship: link.relationship,
    class_name: student.classes?.name || null,
  };
}
