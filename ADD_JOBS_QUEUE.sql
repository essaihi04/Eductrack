-- File d'attente de travaux (jobs), persistée en base.
--
-- Problème résolu : les traitements longs (envoi WhatsApp de masse, imports,
-- IA, PDF) tournaient en mémoire du process Node après avoir répondu au client.
-- Tout `pm2 restart` (donc tout déploiement) les coupait net, sans reprise et
-- sans que personne ne le sache.
--
-- Pas de Redis : Postgres suffit ici. La file sert à la persistance et à la
-- reprise après coupure, pas au découplage — le worker tourne dans le process
-- web.
--
-- À exécuter UNE FOIS dans Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),

  -- Clé de sérialisation : deux jobs de même clé ne tournent JAMAIS en même
  -- temps. Indispensable pour WhatsApp — deux campagnes simultanées sur la
  -- même école doubleraient la cadence d'envoi et feraient bannir le numéro.
  lock_key TEXT NOT NULL,

  school_id UUID,
  created_by UUID,

  -- attempts est incrémenté AU MOMENT de la prise du job, pas à la fin : un job
  -- qui fait planter le process consomme donc un essai et ne peut pas boucler
  -- indéfiniment au redémarrage.
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,

  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Bail : un job 'running' dont le bail a expiré est considéré orphelin
  -- (process tué) et repasse en 'pending'. Le worker prolonge le bail
  -- régulièrement tant qu'il travaille.
  lease_until TIMESTAMPTZ,

  progress JSONB,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Index partiels : seules les lignes en attente / en cours sont interrogées en
-- boucle. Les jobs terminés (la grande majorité avec le temps) ne sont pas
-- indexés du tout.
CREATE INDEX IF NOT EXISTS idx_jobs_claim
  ON jobs (run_after)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_jobs_lease
  ON jobs (lease_until)
  WHERE status = 'running';

CREATE INDEX IF NOT EXISTS idx_jobs_school
  ON jobs (school_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- Prise d'un job, atomique
-- ---------------------------------------------------------------------------
-- FOR UPDATE SKIP LOCKED : deux workers (ou deux ticks qui se chevauchent) ne
-- peuvent pas prendre le même job. p_exclude_keys reçoit les lock_key déjà en
-- cours d'exécution dans ce process.
CREATE OR REPLACE FUNCTION claim_job(
  p_exclude_keys TEXT[] DEFAULT '{}',
  p_lease_seconds INT DEFAULT 300
)
RETURNS SETOF jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
    FROM jobs
   WHERE status = 'pending'
     AND run_after <= NOW()
     AND NOT (lock_key = ANY(p_exclude_keys))
   ORDER BY run_after
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE jobs
     SET status = 'running',
         attempts = attempts + 1,
         lease_until = NOW() + make_interval(secs => p_lease_seconds),
         updated_at = NOW()
   WHERE id = v_id
  RETURNING *;
END;
$$;

-- Appelée uniquement par le backend (service_role).
REVOKE ALL ON FUNCTION claim_job(TEXT[], INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_job(TEXT[], INT) TO service_role;


-- ---------------------------------------------------------------------------
-- Vérification
-- ---------------------------------------------------------------------------
-- SELECT type, status, attempts, progress, last_error, created_at
--   FROM jobs ORDER BY created_at DESC LIMIT 20;
--
-- Jobs bloqués (process tué, en attente de reprise) :
-- SELECT * FROM jobs WHERE status = 'running' AND lease_until < NOW();
