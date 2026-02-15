-- Donner les permissions à service_role sur toutes les tables
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Permissions spécifiques pour les nouvelles tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_subjects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO service_role;

-- Désactiver RLS sur les tables (optionnel, mais recommandé pour les tables de liaison)
ALTER TABLE public.teacher_subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers DISABLE ROW LEVEL SECURITY;
