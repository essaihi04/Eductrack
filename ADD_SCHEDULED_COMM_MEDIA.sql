-- ============================================================================
-- Communications planifiées : pièce jointe importée + choix du canal
-- (à exécuter dans Supabase SQL Editor, après ADD_SCHEDULED_COMM_TRACKING.sql).
--
-- - channels        : 'whatsapp' | 'push' | 'both' (défaut 'both')
-- - attachment_type : 'image' | 'document' (null = pas de pièce jointe) →
--                     permet d'envoyer une VRAIE image/PDF WhatsApp, pas un lien
-- ============================================================================

ALTER TABLE public.scheduled_communications
  ADD COLUMN IF NOT EXISTS channels TEXT NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS attachment_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_comm_channels_check'
  ) THEN
    ALTER TABLE public.scheduled_communications
      ADD CONSTRAINT scheduled_comm_channels_check
      CHECK (channels IN ('whatsapp', 'push', 'both'));
  END IF;
END $$;
