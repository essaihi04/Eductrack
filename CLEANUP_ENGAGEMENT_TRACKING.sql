-- ============================================================
-- CLEANUP_ENGAGEMENT_TRACKING.sql
--
-- Remet d'aplomb l'historique de suivi des communications, faussé par
-- l'ancien markResponded() : à CHAQUE message WhatsApp entrant (y compris une
-- simple question au chatbot), il marquait jusqu'à 50 envois des 7 derniers
-- jours comme « répondus » ET « lus » — même ceux partis en échec.
--
-- Symptôme dans l'onglet Communication > Suivi : 279 « vus » WhatsApp pour
-- seulement 75 messages réellement remis (physiquement impossible), et
-- « 267 parents ont répondu » sur 371 parents.
--
-- Le code corrigé (communicationTracking.js) n'attribue plus qu'UN envoi par
-- message entrant et trace la lecture déduite en read_channel =
-- 'whatsapp_reply'. Ce script applique la même règle au passé.
--
-- Discriminant utilisé : un VRAI accusé de lecture Meta passe par markWaAck(),
-- qui pose toujours delivered_at. Une lecture sans delivered_at est donc une
-- lecture déduite par l'ancien code.
--
-- À exécuter dans l'éditeur SQL Supabase. Idempotent.
-- ============================================================

-- ---------- 0. AVANT : photo des chiffres actuels ----------
SELECT 'avant' AS moment,
       count(*) FILTER (WHERE status = 'sent')                          AS remis,
       count(*) FILTER (WHERE delivered_at IS NOT NULL)                 AS accuses_remise,
       count(*) FILTER (WHERE read_at IS NOT NULL)                      AS vus,
       count(*) FILTER (WHERE read_at IS NOT NULL AND status <> 'sent') AS vus_sur_non_remis,
       count(*) FILTER (WHERE responded_at IS NOT NULL)                 AS repondus,
       count(DISTINCT parent_id) FILTER (WHERE responded_at IS NOT NULL) AS parents_repondeurs
FROM whatsapp_message_recipients
WHERE created_at > now() - interval '90 days';

-- ---------- 1. Requalifier les lectures DÉDUITES ----------
-- Pas de delivered_at => aucun accusé Meta n'est jamais arrivé : la lecture
-- vient du marquage automatique, pas d'un ✓✓ bleu.
UPDATE whatsapp_message_recipients
SET read_channel = 'whatsapp_reply'
WHERE read_at IS NOT NULL
  AND delivered_at IS NULL
  AND (read_channel IS NULL OR read_channel = 'whatsapp');

-- ---------- 2. Purger lectures et réponses sur des envois NON remis ----------
-- Un message en échec (ou une annonce dont le contenu n'est jamais parti) ne
-- peut être ni lu ni répondu.
UPDATE whatsapp_message_recipients
SET read_at = NULL, read_channel = NULL
WHERE status IS DISTINCT FROM 'sent'
  AND read_at IS NOT NULL
  AND read_channel IS DISTINCT FROM 'app';

UPDATE whatsapp_message_recipients
SET responded_at = NULL, response_channel = NULL
WHERE status IS DISTINCT FROM 'sent'
  AND responded_at IS NOT NULL
  AND response_channel IS DISTINCT FROM 'app';

-- ---------- 3. Dégrouper les marquages « en rafale » ----------
-- L'ancien code écrivait le MÊME horodatage sur toutes les lignes d'un parent.
-- Un message entrant = une réponse : on garde l'envoi le plus récent de chaque
-- rafale et on efface les autres.
WITH rafales AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY coalesce(parent_id::text, phone_e164), responded_at
           ORDER BY sent_at DESC NULLS LAST, created_at DESC
         ) AS rang
  FROM whatsapp_message_recipients
  WHERE responded_at IS NOT NULL
    AND response_channel IS DISTINCT FROM 'app'
)
UPDATE whatsapp_message_recipients r
SET responded_at = NULL, response_channel = NULL
FROM rafales
WHERE r.id = rafales.id AND rafales.rang > 1;

-- Idem pour les lectures déduites en rafale (même horodatage, même parent).
WITH rafales AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY coalesce(parent_id::text, phone_e164), read_at
           ORDER BY sent_at DESC NULLS LAST, created_at DESC
         ) AS rang
  FROM whatsapp_message_recipients
  WHERE read_at IS NOT NULL
    AND read_channel = 'whatsapp_reply'
)
UPDATE whatsapp_message_recipients r
SET read_at = NULL, read_channel = NULL
FROM rafales
WHERE r.id = rafales.id AND rafales.rang > 1;

-- ---------- 4. Une réponse prouve la remise ----------
UPDATE whatsapp_message_recipients
SET delivered_at = coalesce(delivered_at, responded_at)
WHERE responded_at IS NOT NULL
  AND delivered_at IS NULL
  AND status = 'sent';

-- ---------- 5. APRÈS : les mêmes chiffres, assainis ----------
SELECT 'apres' AS moment,
       count(*) FILTER (WHERE status = 'sent')                           AS remis,
       count(*) FILTER (WHERE delivered_at IS NOT NULL)                  AS accuses_remise,
       count(*) FILTER (WHERE read_at IS NOT NULL)                       AS vus,
       count(*) FILTER (WHERE read_channel = 'whatsapp_reply')           AS vus_deduits,
       count(*) FILTER (WHERE read_at IS NOT NULL AND status <> 'sent')  AS vus_sur_non_remis,
       count(*) FILTER (WHERE responded_at IS NOT NULL)                  AS repondus,
       count(DISTINCT parent_id) FILTER (WHERE responded_at IS NOT NULL) AS parents_repondeurs
FROM whatsapp_message_recipients
WHERE created_at > now() - interval '90 days';

-- Index de confort pour le tableau de bord (fenêtre glissante + agrégats)
CREATE INDEX IF NOT EXISTS idx_wa_recipients_created_status
  ON whatsapp_message_recipients (created_at DESC, status);
