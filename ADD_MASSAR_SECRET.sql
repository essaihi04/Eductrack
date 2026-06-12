-- =============================================================================
-- Code secret Massar (الرمز السري) sur les élèves
-- =============================================================================
-- Le fichier officiel Massar « InfoEleve » (export_InfoEleve_*.xlsx) fournit, par
-- classe, le code Massar (رقم التلميذ) ET le code secret (الرمز السري) de chaque
-- élève. On stocke ce code secret pour pouvoir le distribuer aux parents
-- (WhatsApp + chatbot). massar_code existe déjà (MIGRATION_BULLETINS.sql).
--
-- Migration additive et idempotente : sûre à rejouer.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS massar_secret text;
