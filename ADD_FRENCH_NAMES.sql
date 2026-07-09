-- ─────────────────────────────────────────────────────────────────────────
-- Noms FRANÇAIS (latin) des élèves — recherche bilingue
-- ─────────────────────────────────────────────────────────────────────────
-- Les élèves sont importés depuis les fichiers MASSAR arabes : leur nom ARABE
-- est stocké dans first_name / last_name (nom principal affiché partout).
-- On ajoute ici le nom FRANÇAIS (latin) issu du fichier « ListEleveFR », aligné
-- par code Massar, pour permettre la recherche en arabe OU en français.
--
-- NB : on n'utilise PAS first_name_ar / last_name_ar (déjà réservés au nom
-- ARABE de la fiche d'inscription) — colonnes dédiées pour éviter tout conflit.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name_fr TEXT;   -- Prénom (latin)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name_fr  TEXT;   -- Nom (latin)

-- Index de recherche insensible à la casse (accélère les futures recherches SQL)
CREATE INDEX IF NOT EXISTS idx_profiles_first_name_fr ON profiles (lower(first_name_fr));
CREATE INDEX IF NOT EXISTS idx_profiles_last_name_fr  ON profiles (lower(last_name_fr));
