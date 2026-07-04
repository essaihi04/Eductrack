-- ============================================================================
-- Hub Communication unifié (WhatsApp + Push in-app)
-- À exécuter dans Supabase SQL Editor.
--
-- 1. whatsapp_messages.channels : canal(aux) choisi(s) à l'envoi
--    ('whatsapp' | 'push' | 'both') — les anciens envois restent 'whatsapp'.
-- 2. whatsapp_message_recipients : suivi par destinataire et par canal
--    - push_status / notification_id : envoi app (ligne notifications liée)
--    - delivered_at / read_at / read_channel : accusés (Baileys ✓✓, Cloud API,
--      ou lecture de la notification dans l'app)
--    - responded_at / response_channel : le parent a répondu (WhatsApp entrant)
-- ============================================================================

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS channels TEXT NOT NULL DEFAULT 'whatsapp';

-- Garde-fou sur les valeurs possibles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_messages_channels_check'
  ) THEN
    ALTER TABLE public.whatsapp_messages
      ADD CONSTRAINT whatsapp_messages_channels_check
      CHECK (channels IN ('whatsapp', 'push', 'both'));
  END IF;
END $$;

ALTER TABLE public.whatsapp_message_recipients
  ADD COLUMN IF NOT EXISTS push_status TEXT,              -- sent | no_subscription | failed | NULL (canal non utilisé)
  ADD COLUMN IF NOT EXISTS notification_id UUID,          -- ligne notifications créée pour ce destinataire
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,      -- ✓✓ WhatsApp (remis)
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,           -- vu (WhatsApp ✓✓ bleu OU notification lue dans l'app)
  ADD COLUMN IF NOT EXISTS read_channel TEXT,             -- 'whatsapp' | 'app'
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,      -- le parent a répondu
  ADD COLUMN IF NOT EXISTS response_channel TEXT;         -- 'whatsapp' (seul canal de réponse actuel)

-- Index pour les mises à jour d'accusés et les agrégations du dashboard
CREATE INDEX IF NOT EXISTS idx_wa_recipients_provider_msg_id
  ON public.whatsapp_message_recipients(provider_msg_id)
  WHERE provider_msg_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_recipients_notification_id
  ON public.whatsapp_message_recipients(notification_id)
  WHERE notification_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_recipients_parent_created
  ON public.whatsapp_message_recipients(parent_id, created_at DESC);
