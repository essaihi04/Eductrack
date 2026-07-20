-- Archivage des élèves : la « suppression » ne détruit plus rien.
-- L'élève est marqué archivé (profiles.archived_at), retiré de sa classe et
-- son inscription de l'année passe en NR — tout l'historique (paiements,
-- notes, absences…) est conservé et l'élève peut être restauré.
--
-- À exécuter dans l'éditeur SQL de Supabase.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

-- Index partiel : la quasi-totalité des lignes a archived_at NULL,
-- on n'indexe que les archivés (liste des archives).
CREATE INDEX IF NOT EXISTS idx_profiles_archived_at
  ON profiles (archived_at)
  WHERE archived_at IS NOT NULL;
