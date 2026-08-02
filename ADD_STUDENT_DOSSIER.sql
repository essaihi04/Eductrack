-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : dossier élève 360° (suivi de la crèche jusqu'au bac)     ║
-- ║                                                                        ║
-- ║  4 tables pour les données qui manquaient au conseil pédagogique :    ║
-- ║   1. diagnostic_tests        — tests diagnostiques / de positionnement ║
-- ║   2. student_observations    — remarques des profs / conseillers       ║
-- ║   3. student_family_info     — état familial et contexte de l'élève    ║
-- ║   4. student_external_records— parcours AVANT l'application            ║
-- ║      (crèche, maternelle, autres écoles : année, niveau, moyenne)      ║
-- ║                                                                        ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── 1. Tests diagnostiques (insertion unitaire OU en vrac) ──────────────
CREATE TABLE IF NOT EXISTS public.diagnostic_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  academic_year TEXT,
  label TEXT,                                  -- ex. « Positionnement septembre »
  subject_name TEXT NOT NULL,
  score NUMERIC(6,2),
  max_score NUMERIC(6,2) DEFAULT 20,
  mastery TEXT CHECK (mastery IN ('acquis','en_cours','non_acquis')),
  test_date DATE,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diag_student ON public.diagnostic_tests(student_id);
CREATE INDEX IF NOT EXISTS idx_diag_school ON public.diagnostic_tests(school_id);

-- ─── 2. Observations (profs, conseillers, administration) ────────────────
CREATE TABLE IF NOT EXISTS public.student_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name TEXT,                            -- figé (si l'auteur est supprimé)
  author_role TEXT,
  category TEXT NOT NULL DEFAULT 'pedagogique'
    CHECK (category IN ('pedagogique','comportement','orientation','famille','sante','autre')),
  content TEXT NOT NULL,
  academic_year TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obs_student ON public.student_observations(student_id);

-- ─── 3. État familial et contexte (une ligne par élève) ──────────────────
CREATE TABLE IF NOT EXISTS public.student_family_info (
  student_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  family_status TEXT,                          -- parents ensemble / divorcés / veuf(ve)…
  guardian TEXT,                               -- tuteur effectif
  siblings_count INT,
  sibling_rank INT,                            -- rang dans la fratrie
  housing TEXT,                                -- avec les parents / internat / famille…
  father_profession TEXT,
  mother_profession TEXT,
  family_support TEXT CHECK (family_support IN ('fort','moyen','faible')),
  health_notes TEXT,                           -- santé / besoins particuliers
  orientation_wish TEXT,                       -- souhait d'orientation (élève/famille)
  notes TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 4. Parcours antérieur (avant l'app : crèche → dernière école) ───────
CREATE TABLE IF NOT EXISTS public.student_external_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,                 -- ex. 2018/2019
  level TEXT,                                  -- ex. GS, 3AP, crèche
  school_name TEXT,
  general_average NUMERIC(5,2),
  mention TEXT,
  remarks TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ext_student ON public.student_external_records(student_id);

-- Le backend passe exclusivement par la clé service (bypass RLS) :
-- RLS activé sans policy publique = aucun accès direct depuis le client.
ALTER TABLE public.diagnostic_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_family_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_external_records ENABLE ROW LEVEL SECURITY;
