-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : Wasender → Baileys (self-hosted WhatsApp)               ║
-- ║                                                                      ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor.                       ║
-- ║  Idempotent (ré-exécutable sans erreur grâce à IF NOT EXISTS).       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── 1. whatsapp_school_sessions ─────────────────────────────────────────
-- Adaptation de la table de mapping école ↔ session WhatsApp.
-- On garde wasender_session_id pour rétro-compat (dépréciée).

ALTER TABLE whatsapp_school_sessions
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'connecting', 'qr', 'connected', 'logged_out', 'banned')),
  ADD COLUMN IF NOT EXISTS warmup_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS daily_limit_override INT,
  ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'baileys'
    CHECK (provider IN ('wasender', 'baileys'));

-- school_id devrait être unique pour qu'on puisse upsert dessus
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_school_sessions_school
  ON whatsapp_school_sessions(school_id);

-- ─── 2. Quotas journaliers (warm-up + anti-ban) ──────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_quota_daily (
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  sent_count   INT  NOT NULL DEFAULT 0,
  failed_count INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, day)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_quota_daily_day
  ON whatsapp_quota_daily(day DESC);

-- ─── 3. whatsapp_message_recipients : nom de colonne agnostique ──────────
-- On ajoute provider_msg_id (nouveau) sans casser wasender_msg_id (ancien).

ALTER TABLE whatsapp_message_recipients
  ADD COLUMN IF NOT EXISTS provider_msg_id TEXT;

-- Backfill si données existantes
UPDATE whatsapp_message_recipients
SET    provider_msg_id = wasender_msg_id
WHERE  provider_msg_id IS NULL
  AND  wasender_msg_id IS NOT NULL;

-- ─── 4. whatsapp_incoming_messages : idem ───────────────────────────────

ALTER TABLE whatsapp_incoming_messages
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS jid TEXT;

UPDATE whatsapp_incoming_messages
SET    provider_message_id = wasender_message_id
WHERE  provider_message_id IS NULL
  AND  wasender_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_provider_msg_id
  ON whatsapp_incoming_messages(provider_message_id);

-- ─── 5. Logs anti-ban (optionnel, pour audit) ───────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_anti_ban_events (
  id          BIGSERIAL PRIMARY KEY,
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,    -- pause, resume, quota_exceeded, out_of_hours, banned
  reason      TEXT,
  meta        JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_anti_ban_events_school
  ON whatsapp_anti_ban_events(school_id, created_at DESC);

-- ─── 6. RLS ─────────────────────────────────────────────────────────────
-- Les nouvelles tables sont gérées par service role uniquement.

ALTER TABLE whatsapp_quota_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_anti_ban_events ENABLE ROW LEVEL SECURITY;

-- Aucune policy = aucun accès via anon/authenticated (seul service role passe).

-- ─── Fin ─────────────────────────────────────────────────────────────────
