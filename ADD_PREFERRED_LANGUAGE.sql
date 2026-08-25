-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Langue préférée du compte — partagée entre l'app et WhatsApp         ║
-- ╠══════════════════════════════════════════════════════════════════════╣
-- ║  Le sélecteur de langue de l'app ne mémorisait le choix qu'en         ║
-- ║  localStorage : le serveur l'ignorait, donc les notifications         ║
-- ║  WhatsApp partaient toujours dans la langue devinée du dernier        ║
-- ║  message entrant (et en français pour un parent n'ayant jamais        ║
-- ║  écrit). Cette colonne rend le choix explicite et durable.            ║
-- ║                                                                       ║
-- ║  NULL = aucun choix explicite → le code retombe sur la détection      ║
-- ║  automatique, puis sur le français. On ne force donc rien pour les    ║
-- ║  comptes existants.                                                   ║
-- ║                                                                       ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_language_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_preferred_language_check
  CHECK (preferred_language IS NULL OR preferred_language IN ('fr', 'ar'));

-- Lookup par langue (statistiques d'usage, ciblage d'une communication).
CREATE INDEX IF NOT EXISTS idx_profiles_preferred_language
  ON profiles(preferred_language)
  WHERE preferred_language IS NOT NULL;

-- Vérification
SELECT preferred_language, COUNT(*) AS comptes
  FROM profiles
 GROUP BY preferred_language
 ORDER BY comptes DESC;
