-- Script final pour corriger les permissions RLS
-- Supprime les anciennes politiques et en crée de nouvelles

-- Supprimer TOUTES les politiques existantes
DROP POLICY IF EXISTS "Admins can manage teacher subjects" ON public.teacher_subjects;
DROP POLICY IF EXISTS "Admins can manage class teachers" ON public.class_teachers;
DROP POLICY IF EXISTS "teacher_subjects_admin_policy" ON public.teacher_subjects;
DROP POLICY IF EXISTS "class_teachers_admin_policy" ON public.class_teachers;

-- Créer les nouvelles politiques
CREATE POLICY "admin_teacher_subjects" ON public.teacher_subjects
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_class_teachers" ON public.class_teachers
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
