-- ============================================================================
-- Relances : personnalisation, formulations multiples, planification
--
-- Trois manques constatés en production sur le bouton « Renvoyer ce message ».
--
-- 1. La relance envoyait un texte RIGOUREUSEMENT identique à tout le monde,
--    alors que les communications planifiées savaient déjà nommer le parent.
--    N messages identiques d'affilée = signal de spam.
--
-- 2. Relancer une SECONDE fois reciblait les parents déjà servis par la
--    première relance : les critères se lisent sur le message D'ORIGINE, dont
--    les destinataires n'étaient jamais mis à jour par la relance. D'où
--    `resend_of`, qui permet de répercuter l'envoi sur la ligne d'origine.
--
-- 3. Aucune planification : la relance partait immédiatement, dans une boucle
--    vivant en mémoire du process — un redémarrage en cours l'interrompait
--    sans reprise possible. Elle passe désormais par la file de travaux.
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- ============================================================================

ALTER TABLE public.whatsapp_messages
  -- Salutation nominative en tête du texte WhatsApp
  ADD COLUMN IF NOT EXISTS personalize   boolean NOT NULL DEFAULT false,
  -- Reformulations de sens identique, distribuées en alternance.
  -- Générées UNE fois à la création : le job les rejoue telles quelles, donc
  -- une reprise après coupure ne refait pas appel à l'IA et reste cohérente.
  ADD COLUMN IF NOT EXISTS variants      jsonb,
  -- Envoi différé (NULL = immédiat)
  ADD COLUMN IF NOT EXISTS scheduled_at  timestamptz,
  -- Message d'origine quand celui-ci est une relance
  ADD COLUMN IF NOT EXISTS resend_of     uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_resend_of
  ON public.whatsapp_messages(resend_of) WHERE resend_of IS NOT NULL;

-- Reconstitue le lien pour les relances déjà faites (l'information était
-- rangée dans recipient_filter).
UPDATE public.whatsapp_messages
SET    resend_of = (recipient_filter->>'resend_of')::uuid
WHERE  resend_of IS NULL
  AND  recipient_filter->>'resend_of' IS NOT NULL;

-- ── Vérification ────────────────────────────────────────────────────────────
-- SELECT id, resend_of, personalize, scheduled_at,
--        jsonb_array_length(COALESCE(variants,'[]'::jsonb)) AS nb_versions
--   FROM whatsapp_messages ORDER BY created_at DESC LIMIT 10;
