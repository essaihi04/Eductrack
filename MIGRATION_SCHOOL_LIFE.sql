-- ============================================================================
-- MIGRATION : Vie scolaire (Parascolaire, Maternelle, Objets perdus,
--             Sondages, Signalements) — SANS module paiement.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) MODULE PARASCOLAIRE : activités / clubs / sorties + inscriptions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.extracurricular_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  category        text NOT NULL DEFAULT 'activite'
                    CHECK (category IN ('club', 'sortie', 'evenement', 'activite', 'atelier')),
  location        text,
  start_date      timestamptz,
  end_date        timestamptz,
  photo_url       text,
  target_level    text,                                   -- niveau ciblé (optionnel)
  class_id        uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  capacity        integer,                                 -- places (NULL = illimité)
  is_published    boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extra_activities_school ON public.extracurricular_activities(school_id);
CREATE INDEX IF NOT EXISTS idx_extra_activities_class ON public.extracurricular_activities(class_id);

CREATE TABLE IF NOT EXISTS public.activity_registrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id     uuid NOT NULL REFERENCES public.extracurricular_activities(id) ON DELETE CASCADE,
  student_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  registered_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'inscrit'
                    CHECK (status IN ('inscrit', 'liste_attente', 'annule')),
  note            text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (activity_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_reg_activity ON public.activity_registrations(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_reg_student ON public.activity_registrations(student_id);

-- ----------------------------------------------------------------------------
-- 2) MODULE MATERNELLE : cahier de vie (posts d'activités de classe + photos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.classroom_feed_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id        uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  author_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title           text,
  content         text,
  media_urls      jsonb NOT NULL DEFAULT '[]'::jsonb,      -- liste d'URLs de photos
  activity_date   date,
  is_published    boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_posts_school ON public.classroom_feed_posts(school_id);
CREATE INDEX IF NOT EXISTS idx_feed_posts_class ON public.classroom_feed_posts(class_id);

-- ----------------------------------------------------------------------------
-- 3) MODULE OBJETS PERDUS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lost_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  photo_url       text,
  location_found  text,
  found_date      date,
  status          text NOT NULL DEFAULT 'trouve'
                    CHECK (status IN ('trouve', 'reclame', 'rendu')),
  reported_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lost_items_school ON public.lost_items(school_id);
CREATE INDEX IF NOT EXISTS idx_lost_items_status ON public.lost_items(status);

-- ----------------------------------------------------------------------------
-- 4) MODULE SONDAGES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.polls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  question        text NOT NULL,
  description     text,
  options         jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{ "id": "o1", "label": "Oui" }, ...]
  target_audience text NOT NULL DEFAULT 'parents'
                    CHECK (target_audience IN ('parents', 'tous', 'profs')),
  class_id        uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  is_active       boolean NOT NULL DEFAULT true,
  is_anonymous    boolean NOT NULL DEFAULT false,
  closes_at       timestamptz,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_polls_school ON public.polls(school_id);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id         uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_id       text NOT NULL,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes(poll_id);

-- ----------------------------------------------------------------------------
-- 5) MODULE SIGNALEMENTS (responsable pédagogique peut signaler un problème)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.issue_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  reported_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category        text NOT NULL DEFAULT 'autre'
                    CHECK (category IN ('pedagogique', 'discipline', 'materiel', 'securite', 'sante', 'autre')),
  title           text NOT NULL,
  description     text,
  priority        text NOT NULL DEFAULT 'normale'
                    CHECK (priority IN ('basse', 'normale', 'haute', 'urgente')),
  status          text NOT NULL DEFAULT 'ouvert'
                    CHECK (status IN ('ouvert', 'en_cours', 'resolu', 'ferme')),
  class_id        uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  related_student uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note text,
  assigned_to     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_issue_reports_school ON public.issue_reports(school_id);
CREATE INDEX IF NOT EXISTS idx_issue_reports_status ON public.issue_reports(status);

-- ----------------------------------------------------------------------------
-- 6) NIVEAU MATERNELLE : étendre le check de classes.school_type (si présent)
--    Le niveau maternelle utilise les codes PS / MS / GS (Petite/Moyenne/Grande
--    Section). Aucune contrainte stricte sur classes.level dans le schéma actuel.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'classes' AND column_name = 'school_type'
  ) THEN
    BEGIN
      ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_school_type_check;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 7) RLS : désactivé (accès via service_role côté backend, comme les autres
--    modules du projet).
-- ----------------------------------------------------------------------------
ALTER TABLE public.extracurricular_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_registrations      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_feed_posts        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lost_items                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls                       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_reports               DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.extracurricular_activities TO service_role;
GRANT ALL ON public.activity_registrations      TO service_role;
GRANT ALL ON public.classroom_feed_posts         TO service_role;
GRANT ALL ON public.lost_items                   TO service_role;
GRANT ALL ON public.polls                        TO service_role;
GRANT ALL ON public.poll_votes                   TO service_role;
GRANT ALL ON public.issue_reports                TO service_role;
