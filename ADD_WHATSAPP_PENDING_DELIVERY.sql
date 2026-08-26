-- ═══════════════════════════════════════════════════════════════════════════
-- LIVRAISON DIFFÉRÉE WHATSAPP
--
-- Hors fenêtre de service de 24 h, Meta n'accepte qu'un template : le contenu
-- réel (identifiants de connexion, message du hub de communication, PDF…)
-- était jusqu'ici PERDU. Il est désormais stocké ici puis livré dès que le
-- destinataire écrit — sa réponse rouvre la fenêtre.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS whatsapp_pending_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID REFERENCES schools(id) ON DELETE CASCADE,
  phone_e164    TEXT NOT NULL,
  message_type  TEXT NOT NULL DEFAULT 'text',   -- text | image | document
  body_text     TEXT DEFAULT '',
  media_url     TEXT,
  file_name     TEXT,
  kind          TEXT DEFAULT 'generic',         -- teacher_credentials, broadcast…
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '72 hours',
  delivered_at  TIMESTAMPTZ
);

-- Le seul accès en lecture est « ce qui attend ce numéro » : un index partiel
-- suffit et reste minuscule (les lignes livrées en sortent).
CREATE INDEX IF NOT EXISTS idx_wa_pending_phone
  ON whatsapp_pending_messages (phone_e164, created_at)
  WHERE delivered_at IS NULL;

ALTER TABLE whatsapp_pending_messages DISABLE ROW LEVEL SECURITY;

-- Purge des contenus périmés ou livrés depuis plus d'une semaine.
DELETE FROM whatsapp_pending_messages
 WHERE (delivered_at IS NULL AND expires_at < NOW())
    OR (delivered_at IS NOT NULL AND delivered_at < NOW() - INTERVAL '7 days');
