-- Correction de la récursion infinie dans les politiques RLS
-- On simplifie les politiques pour éviter les boucles

-- 1. Supprimer toutes les politiques existantes pour control_notes
DROP POLICY IF EXISTS "Professeurs peuvent insérer des notes pour leurs contrôles" ON public.control_notes;
DROP POLICY IF EXISTS "Professeurs peuvent lire les notes de leurs contrôles" ON public.control_notes;
DROP POLICY IF EXISTS "Professeurs peuvent mettre à jour les notes de leurs contrôles" ON public.control_notes;
DROP POLICY IF EXISTS "Élèves peuvent voir leurs propres notes" ON public.control_notes;
DROP POLICY IF EXISTS "Administrateurs ont accès complet aux notes" ON public.control_notes;

-- 2. Supprimer toutes les politiques existantes pour profiles
DROP POLICY IF EXISTS "Utilisateurs peuvent lire leur propre profil" ON public.profiles;
DROP POLICY IF EXISTS "Professeurs peuvent lire les profils des élèves de leurs classes" ON public.profiles;
DROP POLICY IF EXISTS "Administrateurs peuvent lire tous les profils" ON public.profiles;

-- 3. Créer des politiques simplifiées pour control_notes sans accès à profiles
-- Politique INSERT : Utiliser directement class_teachers et controls_plan
CREATE POLICY "Professeurs peuvent insérer des notes" ON public.control_notes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Vérifier que le contrôle appartient à une classe du professeur
        EXISTS (
            SELECT 1 FROM public.controls_plan cp
            JOIN public.class_teachers ct ON cp.class_id = ct.class_id
            WHERE cp.id = control_notes.control_id 
            AND ct.teacher_id = auth.uid()
        )
    );

-- Politique SELECT : Utiliser directement class_teachers et controls_plan
CREATE POLICY "Professeurs peuvent lire les notes" ON public.control_notes
    FOR SELECT
    TO authenticated
    USING (
        -- Vérifier que le contrôle appartient à une classe du professeur
        EXISTS (
            SELECT 1 FROM public.controls_plan cp
            JOIN public.class_teachers ct ON cp.class_id = ct.class_id
            WHERE cp.id = control_notes.control_id 
            AND ct.teacher_id = auth.uid()
        )
    );

-- Politique UPDATE : Utiliser directement class_teachers et controls_plan
CREATE POLICY "Professeurs peuvent mettre à jour les notes" ON public.control_notes
    FOR UPDATE
    TO authenticated
    USING (
        -- Vérifier que le contrôle appartient à une classe du professeur
        EXISTS (
            SELECT 1 FROM public.controls_plan cp
            JOIN public.class_teachers ct ON cp.class_id = ct.class_id
            WHERE cp.id = control_notes.control_id 
            AND ct.teacher_id = auth.uid()
        )
    )
    WITH CHECK (
        -- Vérifier que le contrôle appartient à une classe du professeur
        EXISTS (
            SELECT 1 FROM public.controls_plan cp
            JOIN public.class_teachers ct ON cp.class_id = ct.class_id
            WHERE cp.id = control_notes.control_id 
            AND ct.teacher_id = auth.uid()
        )
    );

-- Politique pour les élèves : vérification directe sans récursion
CREATE POLICY "Élèves peuvent voir leurs notes" ON public.control_notes
    FOR SELECT
    TO authenticated
    USING (student_id = auth.uid());

-- Politique pour les administrateurs : vérification simple
CREATE POLICY "Administrateurs accès complet" ON public.control_notes
    FOR ALL
    TO authenticated
    USING (
        -- Vérifier admin en utilisant auth.uid() directement
        auth.uid() IN (
            SELECT id FROM public.profiles 
            WHERE role = 'admin' AND id = auth.uid()
        )
    )
    WITH CHECK (
        -- Vérifier admin en utilisant auth.uid() directement
        auth.uid() IN (
            SELECT id FROM public.profiles 
            WHERE role = 'admin' AND id = auth.uid()
        )
    );

-- 4. Donner les permissions de base
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.control_notes TO authenticated;

-- Message de confirmation
SELECT 'Politiques RLS simplifiées créées avec succès (sans récursion)' as status;
