-- Migration: Ajouter les colonnes manquantes à session_tracking
-- Cette migration ajoute les champs pour les 6 blocs de suivi

ALTER TABLE session_tracking
ADD COLUMN IF NOT EXISTS homework TEXT CHECK (homework IN ('done', 'partial', 'not_done')),
ADD COLUMN IF NOT EXISTS participation TEXT CHECK (
  participation IN (
    'weak', 'medium', 'good',         -- legacy EN values
    'faible', 'excellent'             -- UI (FR) values
  )
),
ADD COLUMN IF NOT EXISTS attitude TEXT CHECK (
  attitude IN (
    'correct', 'perturbateur', 'excellent', -- UI (FR) values
    'disruptive', 'very_engaged'            -- legacy EN values
  )
),
ADD COLUMN IF NOT EXISTS comment TEXT,
ADD COLUMN IF NOT EXISTS cahier_lesson TEXT CHECK (cahier_lesson IN ('complete', 'partial', 'absent')),
ADD COLUMN IF NOT EXISTS cahier_documents TEXT CHECK (cahier_documents IN ('correct', 'incomplete', 'not_glued')),
ADD COLUMN IF NOT EXISTS cahier_readability TEXT CHECK (cahier_readability IN ('readable', 'medium', 'difficult'));
