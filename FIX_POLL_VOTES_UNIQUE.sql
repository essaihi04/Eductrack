-- Corrige les doublons de votes et garantit un seul vote par (sondage, parent).
-- À exécuter une fois dans Supabase (SQL Editor).

-- 1) Supprimer les doublons en gardant le vote le plus récent par (poll_id, user_id)
DELETE FROM public.poll_votes pv
USING public.poll_votes dup
WHERE pv.poll_id = dup.poll_id
  AND pv.user_id = dup.user_id
  AND pv.created_at < dup.created_at;

-- 2) (Re)créer la contrainte d'unicité si elle n'existe pas déjà
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'poll_votes_poll_id_user_id_key'
  ) THEN
    ALTER TABLE public.poll_votes
      ADD CONSTRAINT poll_votes_poll_id_user_id_key UNIQUE (poll_id, user_id);
  END IF;
END $$;
