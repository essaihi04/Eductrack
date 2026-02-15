-- Création de la table control_notes pour stocker les notes des contrôles
-- Cette table permet d'associer des notes à des élèves pour un contrôle spécifique

CREATE TABLE IF NOT EXISTS public.control_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    control_id UUID NOT NULL REFERENCES public.controls_plan(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    note DECIMAL(5,2) NOT NULL CHECK (note >= 0 AND note <= 20),
    appreciation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(control_id, student_id)
);

-- Index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_control_notes_control_id ON public.control_notes(control_id);
CREATE INDEX IF NOT EXISTS idx_control_notes_student_id ON public.control_notes(student_id);

-- Commentaire explicatif
-- La table control_notes stocke les notes des élèves pour chaque contrôle
-- Chaque élève ne peut avoir qu'une seule note par contrôle (contrainte UNIQUE)
-- Les notes sont des décimaux entre 0 et 20
-- Les appréciations sont optionnelles (TEXT)
-- La création et la mise à jour sont automatiquement horodatées
