-- ============================================================================
-- Base de connaissances du chatbot WhatsApp (documents généraux de l'école)
--
-- L'admin importe un PDF (ex. liste des fournitures scolaires de TOUS les
-- niveaux). Le backend en extrait le texte, le découpe PAR NIVEAU via l'IA et
-- stocke chaque section. Quand un parent pose une question sur les fournitures
-- d'un niveau, le chatbot régénère un PDF propre (logo + nom de l'école) qui ne
-- contient QUE le niveau demandé.
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Document source importé par l'administration
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title          text NOT NULL,
  category       text NOT NULL DEFAULT 'fournitures'
                   CHECK (category IN ('fournitures', 'reglement', 'calendrier',
                                       'inscription', 'cantine', 'transport', 'autre')),
  academic_year  text,                       -- ex. '2025-2026' (NULL = intemporel)
  description    text,
  file_name      text,                       -- nom du PDF d'origine
  file_url       text,                       -- URL publique du PDF source
  storage_path   text,                       -- chemin objet dans le bucket public
  source_text    text,                       -- texte brut extrait du PDF
  status         text NOT NULL DEFAULT 'processing'
                   CHECK (status IN ('processing', 'ready', 'error')),
  error_message  text,
  is_active      boolean NOT NULL DEFAULT true,   -- false = invisible pour le chatbot
  uploaded_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_documents_school
  ON public.chatbot_documents(school_id, category, is_active);

-- ----------------------------------------------------------------------------
-- 2) Sections du document, une par NIVEAU scolaire
--    content = { groups: [{ title, items: [{ label, quantity, note }] }],
--                notes: [texte…] }
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_document_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES public.chatbot_documents(id) ON DELETE CASCADE,
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  level_code   text,                          -- référentiel : 1AP, 2AC, TC… (NULL si inconnu)
  level_label  text NOT NULL,                 -- libellé tel qu'écrit dans le PDF
  aliases      text[] NOT NULL DEFAULT '{}',  -- autres écritures (FR / AR / darija)
  content      jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_text     text,                          -- extrait brut correspondant au niveau
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_sections_document
  ON public.chatbot_document_sections(document_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sections_school_level
  ON public.chatbot_document_sections(school_id, level_code);

-- ----------------------------------------------------------------------------
-- 3) Chatbot « visiteur » : répondre aux numéros NON rattachés à un parent.
--    Désactivé par défaut. Quand il est activé, un inconnu qui écrit à l'école
--    reçoit uniquement les informations générales issues des documents importés
--    (jamais de données d'élève : notes, absences, paiements, identité).
-- ----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_school_sessions
  ADD COLUMN IF NOT EXISTS public_chatbot_enabled boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- 4) RLS : désactivé (accès via service_role côté backend, comme les autres
--    modules du projet).
-- ----------------------------------------------------------------------------
ALTER TABLE public.chatbot_documents         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_document_sections DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.chatbot_documents         TO service_role;
GRANT ALL ON public.chatbot_document_sections TO service_role;
