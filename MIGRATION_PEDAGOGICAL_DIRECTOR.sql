-- Migration : Ajouter le rôle 'pedagogical_director' (Directeur Pédagogique)
-- Ce rôle a les mêmes droits qu'un school_admin SAUF tout ce qui est finance.

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
    'finance_manager',
    'teacher',
    'student',
    'parent'
  ));
