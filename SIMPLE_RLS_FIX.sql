-- Script simple pour corriger les permissions RLS
-- Exécutez UNIQUEMENT ce script dans Supabase SQL Editor

-- Supprimer les anciennes politiques
DROP POLICY IF EXISTS "Admins can manage teacher subjects" ON public.teacher_subjects;
DROP POLICY IF EXISTS "Admins can manage class teachers" ON public.class_teachers;

-- Créer la politique pour teacher_subjects
CREATE POLICY "teacher_subjects_admin_policy" ON public.teacher_subjects
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Créer la politique pour class_teachers
CREATE POLICY "class_teachers_admin_policy" ON public.class_teachers
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
