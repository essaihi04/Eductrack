-- Corriger les permissions RLS pour control_notes afin que les élèves puissent lire leurs propres notes

-- Supprimer les politiques existantes (si elles existent)
DROP POLICY IF EXISTS "Students can view their own control notes" ON control_notes;
DROP POLICY IF EXISTS "Teachers can view control notes for their classes" ON control_notes;
DROP POLICY IF EXISTS "Admins can view all control notes" ON control_notes;
DROP POLICY IF EXISTS "Teachers can insert control notes for their classes" ON public.control_notes;
DROP POLICY IF EXISTS "Teachers can update control notes for their classes" ON public.control_notes;
DROP POLICY IF EXISTS "Professeurs peuvent insérer des notes pour leurs contrôles" ON public.control_notes;
DROP POLICY IF EXISTS "Professeurs peuvent lire les notes de leurs contrôles" ON public.control_notes;
DROP POLICY IF EXISTS "Professeurs peuvent mettre à jour les notes de leurs contrôles" ON public.control_notes;
DROP POLICY IF EXISTS "Élèves peuvent voir leurs propres notes" ON public.control_notes;
DROP POLICY IF EXISTS "Administrateurs ont accès complet aux notes" ON public.control_notes;

-- Activer RLS (si ce n'est pas déjà le cas)
ALTER TABLE public.control_notes ENABLE ROW LEVEL SECURITY;

-- Politique pour les élèves : ils peuvent voir leurs propres notes
CREATE POLICY "Students can view their own control notes" ON control_notes
FOR SELECT
USING (student_id = auth.uid());

-- Politique pour les professeurs : ils peuvent voir les notes des élèves de leurs classes
CREATE POLICY "Teachers can view control notes for their classes" ON control_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.controls_plan cp
    JOIN public.class_teachers ct ON cp.class_id = ct.class_id
    WHERE cp.id = control_notes.control_id
    AND ct.teacher_id = auth.uid()
  )
);

CREATE POLICY "Teachers can insert control notes for their classes" ON public.control_notes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'teacher'
  )
  AND EXISTS (
    SELECT 1
    FROM public.controls_plan cp
    JOIN public.class_teachers ct ON cp.class_id = ct.class_id
    WHERE cp.id = control_notes.control_id
    AND ct.teacher_id = auth.uid()
  )
);

CREATE POLICY "Teachers can update control notes for their classes" ON public.control_notes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'teacher'
  )
  AND EXISTS (
    SELECT 1
    FROM public.controls_plan cp
    JOIN public.class_teachers ct ON cp.class_id = ct.class_id
    WHERE cp.id = control_notes.control_id
    AND ct.teacher_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'teacher'
  )
  AND EXISTS (
    SELECT 1
    FROM public.controls_plan cp
    JOIN public.class_teachers ct ON cp.class_id = ct.class_id
    WHERE cp.id = control_notes.control_id
    AND ct.teacher_id = auth.uid()
  )
);

-- Politique pour les admins : ils peuvent voir toutes les notes
CREATE POLICY "Admins can view all control notes" ON control_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

-- Permissions SQL de base (indépendantes du RLS)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.control_notes TO authenticated;
GRANT ALL ON public.control_notes TO service_role;
