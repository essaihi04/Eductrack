-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : champs élève issus du fichier officiel Massar             ║
-- ║  (لائحة التلاميذ) — genre et lieu de naissance.                        ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor (idempotent).            ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT;        -- 'M' | 'F'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_place TEXT;   -- مكان الازدياد

-- (date_of_birth existe déjà ; massar_code ajouté par MIGRATION_BULLETINS.sql)
