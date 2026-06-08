-- Système d'approbation : éléments créés par les profs validés par
-- admin / directeur pédagogique / responsable pédagogique (par classe).
-- À exécuter une fois dans Supabase (SQL Editor).

-- 1) Réglages par école : quels types d'éléments exigent une approbation
CREATE TABLE IF NOT EXISTS public.approval_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  element_type     text NOT NULL,   -- signalement | activity | feed | lost_item | grade | homework | control
  requires_approval boolean NOT NULL DEFAULT false,
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (school_id, element_type)
);
CREATE INDEX IF NOT EXISTS idx_approval_settings_school ON public.approval_settings(school_id);

-- 2) Demandes d'approbation
CREATE TABLE IF NOT EXISTS public.approval_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  element_type  text NOT NULL,
  element_id    uuid NOT NULL,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  title         text,
  requested_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,
  reason        text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_school ON public.approval_requests(school_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON public.approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_class ON public.approval_requests(class_id);

ALTER TABLE public.approval_settings  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests  DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.approval_settings TO service_role;
GRANT ALL ON public.approval_requests TO service_role;

-- 3) Colonnes "publié" pour les modules qui n'en avaient pas
ALTER TABLE public.lost_items   ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
ALTER TABLE public.issue_reports ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;
