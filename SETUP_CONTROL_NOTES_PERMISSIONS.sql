-- Configuration des permissions RLS (Row Level Security) pour la table control_notes
-- Ce script active le RLS et définit les politiques d'accès appropriées

-- 1. Activer RLS sur la table control_notes
ALTER TABLE public.control_notes ENABLE ROW LEVEL SECURITY;

-- 2. Politique pour permettre aux professeurs d'insérer des notes
-- Un professeur peut insérer des notes uniquement pour les contrôles de ses propres classes
CREATE POLICY "Professeurs peuvent insérer des notes pour leurs contrôles" ON public.control_notes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Vérifier que l'utilisateur est un professeur
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'teacher'
        )
        AND
        -- Vérifier que le contrôle appartient à une classe du professeur
        EXISTS (
            SELECT 1 FROM public.controls_plan cp
            JOIN public.class_teachers ct ON cp.class_id = ct.class_id
            WHERE cp.id = control_notes.control_id 
            AND ct.teacher_id = auth.uid()
        )
    );

-- 3. Politique pour permettre aux professeurs de lire les notes
-- Un professeur peut voir uniquement les notes des contrôles de ses classes
CREATE POLICY "Professeurs peuvent lire les notes de leurs contrôles" ON public.control_notes
    FOR SELECT
    TO authenticated
    USING (
        -- Vérifier que l'utilisateur est un professeur
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'teacher'
        )
        AND
        -- Vérifier que le contrôle appartient à une classe du professeur
        EXISTS (
            SELECT 1 FROM public.controls_plan cp
            JOIN public.class_teachers ct ON cp.class_id = ct.class_id
            WHERE cp.id = control_notes.control_id 
            AND ct.teacher_id = auth.uid()
        )
    );

-- 4. Politique pour permettre aux professeurs de mettre à jour les notes
-- Un professeur peut modifier uniquement les notes des contrôles de ses classes
CREATE POLICY "Professeurs peuvent mettre à jour les notes de leurs contrôles" ON public.control_notes
    FOR UPDATE
    TO authenticated
    USING (
        -- Vérifier que l'utilisateur est un professeur
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'teacher'
        )
        AND
        -- Vérifier que le contrôle appartient à une classe du professeur
        EXISTS (
            SELECT 1 FROM public.controls_plan cp
            JOIN public.class_teachers ct ON cp.class_id = ct.class_id
            WHERE cp.id = control_notes.control_id 
            AND ct.teacher_id = auth.uid()
        )
    )
    WITH CHECK (
        -- Vérifier que l'utilisateur est un professeur
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'teacher'
        )
        AND
        -- Vérifier que le contrôle appartient à une classe du professeur
        EXISTS (
            SELECT 1 FROM public.controls_plan cp
            JOIN public.class_teachers ct ON cp.class_id = ct.class_id
            WHERE cp.id = control_notes.control_id 
            AND ct.teacher_id = auth.uid()
        )
    );

-- 5. Politique pour permettre aux élèves de voir leurs propres notes
CREATE POLICY "Élèves peuvent voir leurs propres notes" ON public.control_notes
    FOR SELECT
    TO authenticated
    USING (
        -- Vérifier que l'utilisateur est un élève et que la note lui appartient
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'student'
            AND profiles.id = control_notes.student_id
        )
    );

-- 6. Politique pour permettre aux administrateurs de tout faire
CREATE POLICY "Administrateurs ont accès complet aux notes" ON public.control_notes
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 7. Donner les permissions de base sur la table (nécessaire pour RLS)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.control_notes TO authenticated;
GRANT SELECT ON public.control_notes TO anon;

-- Message de confirmation
SELECT 'Permissions RLS configurées avec succès pour la table control_notes' as status;
