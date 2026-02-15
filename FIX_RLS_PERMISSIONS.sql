-- Script pour corriger les permissions RLS sur les tables manquantes
-- Exécutez ce script dans la Supabase SQL Editor

-- Activer RLS sur les tables
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques existantes (si elles existent)
DROP POLICY IF EXISTS "Admins can manage teacher subjects" ON public.teacher_subjects;
DROP POLICY IF EXISTS "Admins can manage class teachers" ON public.class_teachers;

-- Politiques RLS pour teacher_subjects - Admins peuvent tout faire
CREATE POLICY "Admins can manage teacher subjects" ON public.teacher_subjects
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Politiques RLS pour class_teachers - Admins peuvent tout faire
CREATE POLICY "Admins can manage class teachers" ON public.class_teachers
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Vérification des politiques créées
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('teacher_subjects', 'class_teachers');
