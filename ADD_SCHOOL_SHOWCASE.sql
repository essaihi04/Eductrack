-- ============================================================================
-- Vitrine de l'école pour le chatbot WhatsApp
--
-- 1) school_profile : informations générales d'un établissement (présentation,
--    taux de réussite, atouts, filières, contacts et réseaux sociaux).
-- 2) school_showcase_items : tout ce qui s'accompagne d'une IMAGE — cantine,
--    salles de sport, équipements (tableaux interactifs…), trophées, activités
--    parascolaires, élèves méritants — avec un titre et une légende.
--
-- Le chatbot répond avec le texte + envoie les photos de la rubrique demandée.
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Informations générales (une ligne par école)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_profile (
  school_id        uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  about            text,                          -- présentation de l'établissement
  success_rate     numeric(5,2),                  -- taux de réussite (%)
  success_rate_year text,                         -- année concernée (ex. '2025-2026')
  success_rate_note text,                         -- précision (examen, niveau…)
  advantages       text[] NOT NULL DEFAULT '{}',  -- atouts (école trilingue, petits effectifs…)
  languages        text[] NOT NULL DEFAULT '{}',  -- langues d'enseignement
  filieres         text[] NOT NULL DEFAULT '{}',  -- filières disponibles
  contact_phone    text,
  contact_whatsapp text,
  contact_email    text,
  website_url      text,
  facebook_url     text,
  instagram_url    text,
  tiktok_url       text,
  youtube_url      text,
  maps_url         text,
  updated_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2) Rubriques illustrées
--    is_published : visible par le chatbot (parents rattachés).
--    is_public    : visible AUSSI par les numéros inconnus (chatbot visiteur).
--    extra        : champs libres selon la rubrique — pour 'eleve_merite' :
--                   { student_name, grade, class_label, year }
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_showcase_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category     text NOT NULL
                 CHECK (category IN ('cantine', 'sport', 'salle', 'equipement',
                                     'trophee', 'activite', 'filiere',
                                     'eleve_merite', 'transport', 'autre')),
  title        text NOT NULL,
  description  text,
  image_url    text,                          -- URL publique (bucket uploads-public)
  storage_path text,                          -- chemin objet, pour la suppression
  extra        jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order   integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  is_public    boolean NOT NULL DEFAULT true, -- élèves méritants : mis à false par l'interface
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_showcase_school_category
  ON public.school_showcase_items(school_id, category, is_published);

-- ----------------------------------------------------------------------------
-- 3) RLS : désactivé (accès via service_role côté backend, comme les autres
--    modules du projet).
-- ----------------------------------------------------------------------------
ALTER TABLE public.school_profile         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_showcase_items  DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.school_profile        TO service_role;
GRANT ALL ON public.school_showcase_items TO service_role;
