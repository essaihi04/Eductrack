-- Catégorisation des messages WhatsApp pour séparer les boîtes
-- par responsable (pédagogique, financier, transport)

DO $$ BEGIN
  CREATE TYPE whatsapp_category AS ENUM ('pedagogical', 'financial', 'transport', 'general');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Messages sortants
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS category whatsapp_category NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_category
  ON whatsapp_messages (school_id, category, created_at DESC);

-- Messages entrants
ALTER TABLE whatsapp_incoming_messages
  ADD COLUMN IF NOT EXISTS category whatsapp_category NOT NULL DEFAULT 'pedagogical';

CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_category
  ON whatsapp_incoming_messages (school_id, category, created_at DESC);

-- Backfill : message existants → 'general' (admin/school_admin envoyait sans catégorie)
-- Pas de modif nécessaire pour incoming (déjà 'pedagogical' par défaut)
