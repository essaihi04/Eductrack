-- ============================================================================
-- Suppression d'un parent : ne plus être bloqué par l'historique WhatsApp.
--
-- PROBLÈME : whatsapp_message_recipients.parent_id (et whatsapp_incoming_messages
-- .parent_id) référencent profiles(id) SANS clause ON DELETE. Dès qu'un parent
-- avait reçu ou envoyé un message WhatsApp, la suppression de son profil était
-- refusée par PostgreSQL. Or l'API supprimait d'abord ses liens élèves : l'élève
-- se retrouvait sans parent, tandis que le parent restait en base avec son
-- numéro — et le chatbot continuait donc à le reconnaître.
--
-- CORRECTIF : passer ces clés étrangères en ON DELETE SET NULL. L'historique des
-- messages est conservé (utile pour les statistiques d'envoi), simplement
-- détaché du parent supprimé.
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- ============================================================================

DO $$
DECLARE
  target   text;
  con_name text;
BEGIN
  FOREACH target IN ARRAY ARRAY['whatsapp_message_recipients', 'whatsapp_incoming_messages']
  LOOP
    -- Table absente sur certains déploiements : on passe.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target
    ) THEN
      RAISE NOTICE 'Table %.% absente, ignorée', 'public', target;
      CONTINUE;
    END IF;

    -- Nom de contrainte retrouvé dynamiquement (il varie selon l'historique
    -- des migrations) : toute FK de la colonne parent_id vers profiles.
    SELECT tc.constraint_name INTO con_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = target
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'parent_id'
    LIMIT 1;

    IF con_name IS NULL THEN
      RAISE NOTICE 'Aucune FK parent_id sur %, rien à faire', target;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', target, con_name);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (parent_id) '
      || 'REFERENCES public.profiles(id) ON DELETE SET NULL',
      target, con_name
    );
    RAISE NOTICE 'FK % de % passée en ON DELETE SET NULL', con_name, target;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Diagnostic : parents restés en base après une suppression bloquée (aucun
-- élève rattaché). Ce sont eux que le chatbot reconnaissait encore. Vérifiez la
-- liste, puis supprimez-les depuis la page Parents de l'application.
-- ----------------------------------------------------------------------------
SELECT p.id,
       p.first_name,
       p.last_name,
       p.phone,
       p.school_id,
       p.created_at
FROM public.profiles p
LEFT JOIN public.parent_students ps ON ps.parent_id = p.id
WHERE p.role = 'parent'
  AND ps.parent_id IS NULL
ORDER BY p.created_at DESC;

-- ----------------------------------------------------------------------------
-- Nettoyage (OPTIONNEL) : supprime les profils parents sans aucun élève.
--
-- ⚠️ RELISEZ D'ABORD la liste ci-dessus : un parent tout juste créé et pas
-- encore rattaché à son enfant y figure aussi, et serait supprimé. Retirez du
-- résultat ceux à conserver, ou ciblez précisément par id avec la variante
-- commentée en fin de bloc.
--
-- Le code chatbot n'a PAS besoin de ce nettoyage : un parent sans élève est
-- désormais traité comme un numéro inconnu (aucune réponse). Ce bloc ne sert
-- qu'à faire le ménage dans la liste des parents de l'application.
--
-- Décommentez pour exécuter :
-- ----------------------------------------------------------------------------
-- WITH orphans AS (
--   SELECT p.id
--   FROM public.profiles p
--   LEFT JOIN public.parent_students ps ON ps.parent_id = p.id
--   WHERE p.role = 'parent' AND ps.parent_id IS NULL
-- )
-- DELETE FROM public.profiles
-- WHERE id IN (SELECT id FROM orphans)
-- RETURNING id, first_name, last_name, phone;

-- Variante ciblée, à préférer si la liste contient des parents à garder :
-- DELETE FROM public.profiles
-- WHERE role = 'parent'
--   AND id IN ('collez-ici-les-uuid', 'un-par-un')
-- RETURNING id, first_name, last_name, phone;
--
-- NB : les comptes de connexion (auth.users) correspondants ne sont pas
-- supprimés par ces requêtes. Passer par le bouton Supprimer de la page Parents
-- s'en charge, en plus des contacts et des liens.
