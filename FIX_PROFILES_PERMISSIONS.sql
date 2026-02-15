-- Correction des permissions pour la table profiles
-- Les politiques RLS de control_notes ont besoin d'accéder à profiles

-- 1. Activer RLS sur la table profiles si ce n'est pas déjà fait
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Politique pour permettre aux utilisateurs authentifiés de lire leur propre profil
CREATE POLICY "Utilisateurs peuvent lire leur propre profil" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- 3. Politique pour permettre aux professeurs de lire les profils des élèves de leurs classes
CREATE POLICY "Professeurs peuvent lire les profils des élèves de leurs classes" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        -- L'utilisateur est un professeur
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'teacher'
        )
        AND
        -- Le profil est un élève d'une classe du professeur
        profiles.role = 'student'
        AND EXISTS (
            SELECT 1 FROM public.class_teachers ct
            WHERE ct.teacher_id = auth.uid()
            AND ct.class_id = profiles.class_id
        )
    );

-- 4. Politique pour permettre aux administrateurs de lire tous les profils
CREATE POLICY "Administrateurs peuvent lire tous les profils" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 5. Donner les permissions de base sur la table profiles
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- Message de confirmation
SELECT 'Permissions profiles configurées avec succès' as status;
