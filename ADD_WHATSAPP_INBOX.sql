-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  BOÎTE DE RÉCEPTION WHATSAPP COMPLÈTE                                 ║
-- ║                                                                      ║
-- ║  Deux manques comblés :                                              ║
-- ║   1. les MÉDIAS reçus (note vocale, photo, PDF) n'étaient ni stockés  ║
-- ║      ni affichés — un parent qui envoyait un vocal parlait dans le    ║
-- ║      vide ;                                                          ║
-- ║   2. les réponses du CHATBOT n'étaient journalisées qu'à raison d'une ║
-- ║      seule par message reçu (ai_response_text). Menus, PDF, relances  ║
-- ║      et confirmations n'apparaissaient nulle part : l'école voyait    ║
-- ║      une conversation à trous.                                       ║
-- ║                                                                      ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── 1. Médias entrants ──────────────────────────────────────────────────
-- Le binaire est déposé dans le bucket PRIVÉ (uploads-private) : une note
-- vocale de parent est une donnée personnelle, elle ne doit pas être servie
-- par une URL publique devinable. La boîte de réception en fabrique une URL
-- signée à la demande.
ALTER TABLE public.whatsapp_incoming_messages
  ADD COLUMN IF NOT EXISTS media_path     TEXT,
  ADD COLUMN IF NOT EXISTS media_type     TEXT,   -- audio | image | document | video
  ADD COLUMN IF NOT EXISTS media_mimetype TEXT,
  ADD COLUMN IF NOT EXISTS media_filename TEXT;

-- ─── 2. Journal des envois sortants du chatbot ───────────────────────────
-- Volontairement SÉPARÉ de whatsapp_messages : cette dernière porte les
-- campagnes (historique, statistiques, relances). Y verser chaque réponse
-- automatique noierait l'historique de l'école sous des milliers de lignes.
CREATE TABLE IF NOT EXISTS public.whatsapp_outgoing_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  phone_e164      TEXT NOT NULL,
  parent_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body            TEXT,
  message_type    TEXT NOT NULL DEFAULT 'text',   -- text | image | document | audio | video
  media_url       TEXT,
  file_name       TEXT,
  status          TEXT NOT NULL DEFAULT 'sent',   -- sent | failed
  error_message   TEXT,
  source          TEXT NOT NULL DEFAULT 'chatbot',
  provider_msg_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lecture d'un fil : école + numéro, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_wa_outgoing_log_thread
  ON public.whatsapp_outgoing_log(school_id, phone_e164, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_outgoing_log_date
  ON public.whatsapp_outgoing_log(created_at DESC);

-- Service role uniquement (comme les autres tables WhatsApp).
ALTER TABLE public.whatsapp_outgoing_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.whatsapp_outgoing_log TO service_role;

-- ─── 3. Vérification ─────────────────────────────────────────────────────
SELECT 'colonnes medias' AS objet,
       count(*) FILTER (WHERE column_name LIKE 'media_%') AS ok
  FROM information_schema.columns
 WHERE table_name = 'whatsapp_incoming_messages'
UNION ALL
SELECT 'journal sortant', count(*)
  FROM information_schema.tables
 WHERE table_name = 'whatsapp_outgoing_log';
