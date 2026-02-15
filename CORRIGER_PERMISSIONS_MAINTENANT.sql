-- URGENT: Corriger les permissions pour toutes les tables de suivi pédagogique

-- Donner les permissions à service_role sur le schéma
GRANT USAGE ON SCHEMA public TO service_role;

-- Permissions pour les tables existantes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_subjects TO service_role;

-- Permissions pour les nouvelles tables de suivi pédagogique
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_tracking TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mini_assessments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_competencies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_plan TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competencies TO service_role;

-- Permissions sur les séquences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Désactiver RLS sur les tables de suivi (optionnel mais recommandé)
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_tracking DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.mini_assessments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_competencies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_plan DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.competencies DISABLE ROW LEVEL SECURITY;

-- Vérifier que les permissions sont appliquées
SELECT 
  table_name,
  COUNT(*) as permission_count
FROM information_schema.role_table_grants 
WHERE grantee = 'service_role' 
AND table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
