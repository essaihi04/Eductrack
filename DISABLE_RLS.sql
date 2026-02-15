-- Désactiver RLS sur les tables (la clé de service contournera RLS de toute façon)
ALTER TABLE public.teacher_subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers DISABLE ROW LEVEL SECURITY;
