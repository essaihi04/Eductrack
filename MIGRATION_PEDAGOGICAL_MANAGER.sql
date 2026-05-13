-- Migration : Ajouter le rôle 'pedagogical_manager' (Responsable Pédagogique)
-- Mêmes droits que pedagogical_director MAIS restreints aux classes/niveaux assignés.
-- Géré par : admin, school_admin, pedagogical_director.

-- 1) Étendre la contrainte CHECK sur profiles.role
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'super_admin',
    'admin',
    'school_admin',
    'pedagogical_director',
    'pedagogical_manager',
    'finance_manager',
    'teacher',
    'student',
    'parent'
  ));

-- 2) Table d'assignation des classes/niveaux à un responsable pédagogique
CREATE TABLE IF NOT EXISTS public.pedagogical_manager_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  level TEXT, -- niveau libre (ex: "Primaire", "Collège", "Lycée", "1er Bac")
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pms_scope_one_or_other CHECK (
    (class_id IS NOT NULL AND level IS NULL) OR
    (class_id IS NULL AND level IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pms_manager ON public.pedagogical_manager_scopes(manager_id);
CREATE INDEX IF NOT EXISTS idx_pms_class ON public.pedagogical_manager_scopes(class_id);
CREATE INDEX IF NOT EXISTS idx_pms_level ON public.pedagogical_manager_scopes(level);

-- Évite les doublons exacts
CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_manager_class
  ON public.pedagogical_manager_scopes(manager_id, class_id)
  WHERE class_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pms_manager_level
  ON public.pedagogical_manager_scopes(manager_id, level)
  WHERE level IS NOT NULL;
