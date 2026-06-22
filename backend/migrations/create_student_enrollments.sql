-- ===========================================================================
-- Table student_enrollments : historique d'inscription des élèves par année.
-- À exécuter dans l'éditeur SQL Supabase (comme les autres migrations).
-- Source de vérité de la réinscription (statuts RI / NI / NR).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL,                       -- format slash "YYYY/YYYY"
  status TEXT NOT NULL DEFAULT 'NI' CHECK (status IN ('RI', 'NI', 'NR')),
  previous_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_student_enrollments_school  ON public.student_enrollments(school_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_student ON public.student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_class   ON public.student_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_year    ON public.student_enrollments(academic_year);

-- Backfill : une inscription pour chaque élève déjà rattaché à une classe.
-- Aucun historique antérieur connu → status 'NI' (première inscription enregistrée).
INSERT INTO public.student_enrollments (school_id, student_id, class_id, academic_year, status)
SELECT p.school_id, p.id, p.class_id, c.academic_year, 'NI'
FROM public.profiles p
JOIN public.classes c ON c.id = p.class_id
WHERE p.role = 'student'
  AND p.class_id IS NOT NULL
  AND c.academic_year IS NOT NULL
ON CONFLICT (student_id, academic_year) DO NOTHING;
