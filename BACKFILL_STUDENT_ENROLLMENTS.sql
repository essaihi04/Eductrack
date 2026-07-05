-- ============================================================================
-- BACKFILL_STUDENT_ENROLLMENTS.sql
-- ----------------------------------------------------------------------------
-- Contexte : les pages « Élèves » et « Finance » n'affichent QUE les élèves
-- ayant une ligne dans student_enrollments pour l'année active (le roster).
-- Les élèves importés/créés AVANT la mise en place de cette logique sont
-- rattachés à une classe (profiles.class_id) mais n'ont pas d'inscription →
-- ils apparaissent dans « Classes » mais sont invisibles dans « Élèves ».
--
-- Ce script crée une inscription (statut 'NI') pour chaque élève déjà rattaché
-- à une classe, dans l'année scolaire de cette classe — SANS toucher aux
-- inscriptions existantes (ON CONFLICT DO NOTHING). Idempotent : ré-exécutable
-- sans risque. À lancer une fois dans le SQL Editor de Supabase.
-- ============================================================================

INSERT INTO public.student_enrollments (school_id, student_id, class_id, academic_year, status)
SELECT p.school_id, p.id, p.class_id, c.academic_year, 'NI'
FROM public.profiles p
JOIN public.classes c ON c.id = p.class_id
WHERE p.role = 'student'
  AND p.class_id IS NOT NULL
  AND c.academic_year IS NOT NULL
ON CONFLICT (student_id, academic_year) DO NOTHING;

-- Contrôle : nombre d'inscriptions par année après backfill.
SELECT academic_year, status, COUNT(*) AS nb
FROM public.student_enrollments
GROUP BY academic_year, status
ORDER BY academic_year, status;
