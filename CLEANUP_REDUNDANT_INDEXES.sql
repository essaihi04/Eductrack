-- Suppression de deux index devenus inutiles sur `notifications`.
--
-- Un index ne coûte pas qu'en espace : il est mis à jour à CHAQUE insertion.
-- Or on insère une notification par parent à chaque envoi groupé — c'est la
-- table la plus écrite en rafale de l'application.
--
-- 1. idx_notifications_user_id (user_id)
--    Redondant depuis ADD_PERFORMANCE_INDEXES.sql : idx_notifications_user_recent
--    est un composite (user_id, created_at DESC), et un index composite sert
--    déjà toutes les requêtes qui filtrent sur sa colonne de tête. L'index
--    simple ne fait plus que ralentir les écritures.
--
-- 2. idx_notifications_read (read)
--    Indexe un booléen : deux valeurs pour toute la table, donc jamais
--    sélectif — Postgres préfère de toute façon lire la table. Le seul usage
--    réel (compteur de non-lues) filtre user_id ET read, et il est désormais
--    couvert par l'index partiel idx_notifications_user_unread.
--
-- Vérifié côté code avant suppression : les 4 lectures/écritures de la table
-- filtrent toutes sur user_id ; `read` n'est jamais utilisé seul.
-- Réversible : voir les CREATE INDEX en commentaire à la fin.
--
-- À exécuter dans l'éditeur SQL de Supabase.

DROP INDEX IF EXISTS idx_notifications_user_id;
DROP INDEX IF EXISTS idx_notifications_read;

-- ---------------------------------------------------------------------------
-- Vérification : il doit rester les deux index utiles (user_recent, user_unread)
-- ---------------------------------------------------------------------------
-- SELECT indexname FROM pg_indexes WHERE tablename = 'notifications';

-- ---------------------------------------------------------------------------
-- Marche arrière, si jamais
-- ---------------------------------------------------------------------------
-- CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
-- CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
