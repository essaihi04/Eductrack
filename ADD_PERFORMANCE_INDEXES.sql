-- Index de performance sur les tables les plus lues.
--
-- Contexte : `profiles` regroupe élèves + parents + profs + admins dans une
-- seule table, et `school_id` y a été ajouté (MIGRATION_SUPER_ADMIN.sql) en
-- simple clé étrangère. Postgres n'indexe PAS automatiquement le côté
-- référençant d'une FK : toutes les listes d'élèves faisaient donc un scan
-- complet de la table. Idem pour les notifications de l'espace parent.
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- Aucune donnée modifiée, aucun risque : on ne crée que des index.

-- ---------------------------------------------------------------------------
-- 1. profiles : le filtre (school_id, role) de ~105 requêtes
-- ---------------------------------------------------------------------------
-- Couvre « tous les élèves de mon école », « tous les parents », « tous les
-- profs »… last_name en 3e position sert le tri des listes élèves sans passer
-- par un tri en mémoire.
-- Non partiel volontairement : archived_at n'est pas filtré partout, et la
-- colonne peut ne pas exister si ADD_STUDENT_ARCHIVE.sql n'a pas été exécuté.
CREATE INDEX IF NOT EXISTS idx_profiles_school_role
  ON profiles (school_id, role, last_name);

-- ---------------------------------------------------------------------------
-- 2. notifications : les 2 requêtes jouées à chaque ouverture de l'app parent
-- ---------------------------------------------------------------------------
-- GET /notifications : user_id + ORDER BY created_at DESC LIMIT 20.
CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
  ON notifications (user_id, created_at DESC);

-- GET /notifications/unread-count : user_id + read = false.
-- Index partiel : les notifications lues (la majorité avec le temps) ne sont
-- pas indexées du tout.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id)
  WHERE read = false;

-- ---------------------------------------------------------------------------
-- 3. attendance : la table qui grossit le plus vite (1 ligne/élève/jour)
-- ---------------------------------------------------------------------------
-- Les tableaux de bord filtrent école + plage de dates.
CREATE INDEX IF NOT EXISTS idx_attendance_school_date
  ON attendance (school_id, date);

-- ---------------------------------------------------------------------------
-- Vérification (optionnel) : les index doivent apparaître ici.
-- ---------------------------------------------------------------------------
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE indexname IN ('idx_profiles_school_role',
--                      'idx_notifications_user_recent',
--                      'idx_notifications_user_unread',
--                      'idx_attendance_school_date');
--
-- Contrôle du gain (avant/après) :
-- EXPLAIN ANALYZE SELECT * FROM profiles
--   WHERE school_id = '<votre-school-id>' AND role = 'student' ORDER BY last_name;
-- Attendu après : « Index Scan using idx_profiles_school_role »
-- au lieu de « Seq Scan on profiles ».
