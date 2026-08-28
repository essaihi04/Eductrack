-- ============================================================================
-- Boîte de réception WhatsApp : écouter les vocaux ENVOYÉS, et masquer un
-- message du fil.
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- ============================================================================

-- ─── 1. Vocaux envoyés par l'école ───────────────────────────────────────
-- Jusqu'ici la note vocale partait vers Meta sans jamais être conservée :
-- l'école voyait « note-vocale.ogg » dans le fil, sans pouvoir la réécouter.
-- Le binaire est désormais déposé dans le bucket PRIVÉ — c'est la voix d'un
-- membre du personnel parlant d'un enfant, elle n'a rien à faire derrière une
-- URL devinable. On garde donc le CHEMIN, pas une URL : le fil en demande un
-- lien signé d'une heure au moment de l'ouvrir, comme pour les vocaux reçus.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_path TEXT;

-- ─── 2. Messages masqués ─────────────────────────────────────────────────
-- « Supprimer » ne détruit rien, comme pour les élèves : la ligne d'origine
-- reste en place et le message disparaît du fil. Ce choix n'est pas cosmétique.
--
--   • Les statistiques d'engagement (vu / répondu, taux de lecture) se
--     calculent sur whatsapp_message_recipients : effacer une ligne fausserait
--     des chiffres déjà publiés à l'école.
--   • La déduplication des messages entrants s'appuie sur
--     provider_message_id : une ligne effacée serait réinjectée telle quelle
--     si Meta rejoue son webhook.
--
-- Une table à part plutôt qu'une colonne par table : le fil est assemblé
-- depuis QUATRE sources (campagnes, entrants, réponses du chatbot, journal des
-- notifications) et chacune numérote ses messages à sa façon. On masque donc
-- sur la clé que la boîte de réception affiche, quelle que soit son origine :
--   <uuid>        → destinataire d'une campagne ou d'un envoi direct
--   in-<uuid>     → message reçu d'un parent
--   bot-<uuid>    → réponse automatique du chatbot
--   bot-log-<uuid>→ notification ou réponse journalisée
CREATE TABLE IF NOT EXISTS public.whatsapp_hidden_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  message_key TEXT NOT NULL,
  phone_e164  TEXT,
  hidden_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  hidden_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, message_key)
);

-- Lecture d'un fil : on charge d'un coup les clés masquées de l'école.
CREATE INDEX IF NOT EXISTS idx_wa_hidden_school
  ON public.whatsapp_hidden_messages(school_id);

-- Service role uniquement (comme les autres tables WhatsApp).
ALTER TABLE public.whatsapp_hidden_messages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.whatsapp_hidden_messages TO service_role;

-- ─── 3. Vérification ─────────────────────────────────────────────────────
SELECT 'colonne media_path' AS objet,
       count(*) AS ok
  FROM information_schema.columns
 WHERE table_name = 'whatsapp_messages' AND column_name = 'media_path'
UNION ALL
SELECT 'table messages masques',
       count(*)
  FROM information_schema.tables
 WHERE table_name = 'whatsapp_hidden_messages';
