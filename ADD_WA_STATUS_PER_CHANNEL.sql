-- ============================================================================
-- Séparer le suivi WhatsApp du suivi application
--
-- PROBLÈME
-- --------
-- whatsapp_message_recipients n'avait qu'une colonne `status` pour DEUX canaux.
-- Le job d'envoi marquait `reached = waOk || appOk` : dès que la notification
-- in-app était créée, le destinataire passait en 'sent' même si le message
-- WhatsApp n'était jamais parti.
--
-- Conséquence observée le 19/08/2026 : une campagne de 302 parents affichée
-- « 302 envoyés · 0 échec » alors que la session WhatsApp était tombée en cours
-- de route — seuls 47 parents avaient réellement reçu le WhatsApp. Une reprise
-- était impossible : tout le monde comptait comme servi.
--
-- SOLUTION
-- --------
-- `wa_status` suit le canal WhatsApp seul. La reprise d'un envoi peut alors
-- viser uniquement ceux dont le WhatsApp n'est pas parti, sans renvoyer la
-- notification in-app à ceux qui l'ont déjà (pas de doublon).
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- ============================================================================

ALTER TABLE public.whatsapp_message_recipients
  ADD COLUMN IF NOT EXISTS wa_status text;   -- NULL = pas parti | 'sent' | 'failed'

-- ── Reconstitution de l'historique ──────────────────────────────────────────
-- `provider_msg_id` n'est renseigné QUE lorsque WhatsApp a accepté le message :
-- c'est la preuve d'envoi la plus fiable dont on dispose rétroactivement.
--
-- Le EXISTS couvre le cas des parents qui partagent un téléphone : le job
-- n'envoie qu'un WhatsApp par numéro, donc le second parent n'a pas de
-- provider_msg_id alors que le message est bien arrivé sur ce numéro.
UPDATE public.whatsapp_message_recipients r
SET    wa_status = 'sent'
WHERE  r.wa_status IS NULL
  AND  r.phone_e164 IS NOT NULL
  AND  r.phone_e164 <> ''
  AND  EXISTS (
         SELECT 1 FROM public.whatsapp_message_recipients r2
         WHERE  r2.message_id = r.message_id
           AND  r2.phone_e164 = r.phone_e164
           AND  r2.provider_msg_id IS NOT NULL
           AND  r2.provider_msg_id <> ''
       );

-- Tout le reste garde wa_status NULL = « WhatsApp non parti », ce qui rend ces
-- destinataires éligibles à une reprise.

CREATE INDEX IF NOT EXISTS idx_wa_recipients_wa_status
  ON public.whatsapp_message_recipients(message_id, wa_status);

-- ── Vérification ────────────────────────────────────────────────────────────
-- Reste à envoyer sur la campagne du 19/08 :
-- SELECT wa_status, count(*)
--   FROM whatsapp_message_recipients
--  WHERE message_id = '1c8d7ede-b25a-4f03-bcf6-3cfe6c96aabb'
--  GROUP BY 1;
