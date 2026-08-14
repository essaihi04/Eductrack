-- ============================================================================
-- Contrôle des données communiquées par le chatbot WhatsApp aux parents
--
-- 1) chatbot_capabilities   : un interrupteur par type de donnée, par école.
--    Ligne ABSENTE = comportement par défaut (défini dans le code, tout est
--    activé aujourd'hui) → aucune régression tant que l'admin ne touche à rien.
--
-- 2) chatbot_custom_entries : contenus ajoutés par l'administration (texte,
--    image, PDF). Chaque entrée peut être exposée de trois façons, combinables :
--      - show_in_menu : nouvelle ligne dans un menu du chatbot
--      - keywords     : envoi automatique dès qu'un parent écrit un mot-clé
--      - use_for_ai   : le texte alimente les réponses en question libre
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Interrupteurs par donnée
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_capabilities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  capability_id  text NOT NULL,             -- ex. 'finance.balance' (référentiel dans capabilities.js)
  is_enabled     boolean NOT NULL DEFAULT true,
  updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_capabilities_unique UNIQUE (school_id, capability_id)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_capabilities_school
  ON public.chatbot_capabilities(school_id);

-- ----------------------------------------------------------------------------
-- 2) Contenus ajoutés par l'administration
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chatbot_custom_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  title          text NOT NULL,             -- libellé affiché dans le menu
  body_text      text,                      -- message envoyé / connaissance IA

  media_type     text CHECK (media_type IN ('image', 'document')),
  media_url      text,                      -- URL publique du fichier
  storage_path   text,                      -- chemin objet dans le bucket public
  file_name      text,

  -- Exposition
  show_in_menu   boolean NOT NULL DEFAULT true,
  menu_id        text NOT NULL DEFAULT 'schoollife'
                   CHECK (menu_id IN ('main', 'pedagogy', 'finance', 'schoollife', 'account')),
  emoji          text NOT NULL DEFAULT '📌',
  keywords       text[] NOT NULL DEFAULT '{}',   -- déclencheurs en question libre
  use_for_ai     boolean NOT NULL DEFAULT false, -- alimente le contexte du LLM

  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Une entrée vide n'a aucun sens : il faut au moins un texte ou un fichier.
  CONSTRAINT chatbot_custom_entries_has_content
    CHECK (body_text IS NOT NULL OR media_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_custom_entries_school
  ON public.chatbot_custom_entries(school_id, is_active, menu_id, sort_order);

-- ----------------------------------------------------------------------------
-- 3) Accès (le backend utilise la service role ; RLS désactivé comme les
--    autres tables d'administration du projet)
-- ----------------------------------------------------------------------------
ALTER TABLE public.chatbot_capabilities   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_custom_entries DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.chatbot_capabilities   TO service_role;
GRANT ALL ON public.chatbot_custom_entries TO service_role;
