-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : suppression de Baileys — l'API Cloud officielle de Meta  ║
-- ║  devient le SEUL provider WhatsApp.                                  ║
-- ║                                                                      ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── 1. Statuts de session ───────────────────────────────────────────────
-- L'ancienne contrainte (MIGRATION_BAILEYS.sql) n'autorisait que les états du
-- socket Baileys : 'qr', 'logged_out', 'banned'… et surtout PAS
-- 'pending_verification', qui est l'état d'un numéro Cloud API entre l'envoi
-- du code de vérification et sa saisie. Sans ce correctif, l'onboarding
-- Cloud (POST /cloud/add-number) échoue à l'écriture.
ALTER TABLE whatsapp_school_sessions
  DROP CONSTRAINT IF EXISTS whatsapp_school_sessions_status_check;
ALTER TABLE whatsapp_school_sessions
  ADD CONSTRAINT whatsapp_school_sessions_status_check
  CHECK (status IN ('disconnected', 'pending_verification', 'connected'));

-- Les états propres à Baileys n'existent plus : on les ramène à 'disconnected'.
UPDATE whatsapp_school_sessions
   SET status = 'disconnected'
 WHERE status IS NULL
    OR status NOT IN ('disconnected', 'pending_verification', 'connected');

-- ─── 2. Provider unique ──────────────────────────────────────────────────
-- La colonne est conservée (lisibilité des exports SQL) mais n'est plus lue
-- par le code : une école est joignable dès qu'elle a un phone_number_id.
ALTER TABLE whatsapp_school_sessions
  DROP CONSTRAINT IF EXISTS whatsapp_school_sessions_provider_check;
ALTER TABLE whatsapp_school_sessions
  ALTER COLUMN provider SET DEFAULT 'cloud';
UPDATE whatsapp_school_sessions SET provider = 'cloud';
ALTER TABLE whatsapp_school_sessions
  ADD CONSTRAINT whatsapp_school_sessions_provider_check
  CHECK (provider = 'cloud');

-- Une école sans phone_number_id ne peut plus rien envoyer : on le signale.
SELECT s.name AS ecole_sans_numero_cloud
  FROM whatsapp_school_sessions w
  JOIN schools s ON s.id = w.school_id
 WHERE w.phone_number_id IS NULL;

-- ─── 3. Vestiges de l'anti-ban (DESTRUCTIF — suppression définitive) ─────
-- ⚠️ Ces DROP sont IRRÉVERSIBLES : les données de quotas et l'historique des
--    pauses anti-ban sont perdus. C'est voulu — ces objets ne servaient qu'à
--    Baileys (montée en charge, pauses, cache « ce numéro existe-t-il sur
--    WhatsApp ? ») et plus aucune ligne de code ne les lit ni ne les écrit
--    depuis la suppression des règles d'envoi héritées (2026-08-24).
--
--    Créés par : MIGRATION_BAILEYS.sql (§2 et §5) et ADD_WHATSAPP_NUMBER_CHECKS.sql.

DROP TABLE IF EXISTS whatsapp_quota_daily;
DROP TABLE IF EXISTS whatsapp_anti_ban_events;
DROP TABLE IF EXISTS whatsapp_number_checks;

ALTER TABLE whatsapp_school_sessions
  DROP COLUMN IF EXISTS warmup_started_at,
  DROP COLUMN IF EXISTS daily_limit_override,
  DROP COLUMN IF EXISTS wasender_session_id;

-- ─── 4. Vérification ─────────────────────────────────────────────────────
SELECT school_id, provider, phone_number, phone_number_id, status
  FROM whatsapp_school_sessions
 ORDER BY status;
