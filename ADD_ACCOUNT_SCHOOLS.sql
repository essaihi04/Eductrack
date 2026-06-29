-- ============================================================
-- account_schools : ensemble des écoles qu'un compte (admin) peut piloter.
-- Permet « deux écoles sur un même compte » (ex: primaire + lycée).
-- profiles.school_id reste le pointeur « école active courante ».
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, school_id)
);

CREATE INDEX IF NOT EXISTS idx_account_schools_user ON public.account_schools(user_id);
CREATE INDEX IF NOT EXISTS idx_account_schools_school ON public.account_schools(school_id);

-- Backfill : chaque admin existant a accès à son école courante.
INSERT INTO public.account_schools (user_id, school_id)
SELECT id, school_id FROM public.profiles
WHERE role IN ('admin', 'school_admin', 'pedagogical_director')
  AND school_id IS NOT NULL
ON CONFLICT (user_id, school_id) DO NOTHING;
