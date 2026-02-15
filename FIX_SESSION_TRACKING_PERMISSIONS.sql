-- Donner les permissions à service_role pour les tables de suivi pédagogique

GRANT USAGE ON SCHEMA public TO service_role;

-- Permissions pour sessions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO service_role;

-- Permissions pour session_tracking
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_tracking TO service_role;

-- Permissions pour mini_assessments
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mini_assessments TO service_role;

-- Permissions pour assessment_competencies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_competencies TO service_role;

-- Permissions pour lesson_plan
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_plan TO service_role;

-- Permissions pour competencies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competencies TO service_role;

-- Permissions sur les séquences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Vérifier que les permissions sont appliquées
SELECT table_name, privilege 
FROM information_schema.role_table_grants 
WHERE grantee = 'service_role' 
AND table_name IN ('sessions', 'session_tracking', 'mini_assessments', 'assessment_competencies', 'lesson_plan', 'competencies')
ORDER BY table_name, privilege;
