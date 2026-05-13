-- ============================================================================
-- Ajoute la localisation GPS de l'école (utilisée pour démarrer et terminer
-- chaque tournée de transport au point école).
-- ============================================================================

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS lng NUMERIC;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS address TEXT;
