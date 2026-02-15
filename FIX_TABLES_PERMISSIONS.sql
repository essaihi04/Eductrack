-- Donner les permissions nécessaires pour les tables utilisées dans les politiques RLS
-- Les politiques de control_notes ont besoin d'accéder à controls_plan et class_teachers

-- 1. Permissions pour la table controls_plan
GRANT SELECT ON public.controls_plan TO authenticated;

-- 2. Permissions pour la table class_teachers  
GRANT SELECT ON public.class_teachers TO authenticated;

-- 3. Permissions pour la table profiles (pour la politique admin)
GRANT SELECT ON public.profiles TO authenticated;

-- 4. Activer RLS sur controls_plan si ce n'est pas déjà fait
ALTER TABLE public.controls_plan ENABLE ROW LEVEL SECURITY;

-- 5. Politique simple pour controls_plan (permettre aux professeurs de voir leurs contrôles)
CREATE POLICY "Professeurs peuvent voir leurs contrôles" ON public.controls_plan
    FOR SELECT
    TO authenticated
    USING (
        teacher_id = auth.uid()
    );

-- 6. Politique pour administrateurs sur controls_plan
CREATE POLICY "Administrateurs peuvent voir tous les contrôles" ON public.controls_plan
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() IN (
            SELECT id FROM public.profiles 
            WHERE role = 'admin' AND id = auth.uid()
        )
    );

-- 7. Activer RLS sur class_teachers si ce n'est pas déjà fait
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

-- 8. Politique simple pour class_teachers (permettre aux professeurs de voir leurs classes)
CREATE POLICY "Professeurs peuvent voir leurs classes" ON public.class_teachers
    FOR SELECT
    TO authenticated
    USING (
        teacher_id = auth.uid()
    );

-- 9. Politique pour administrateurs sur class_teachers
CREATE POLICY "Administrateurs peuvent voir toutes les classes" ON public.class_teachers
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() IN (
            SELECT id FROM public.profiles 
            WHERE role = 'admin' AND id = auth.uid()
        )
    );

-- 10. S'assurer que le schéma public est accessible
GRANT USAGE ON SCHEMA public TO authenticated;

-- Message de confirmation
SELECT 'Permissions pour controls_plan et class_teachers configurées' as status;
