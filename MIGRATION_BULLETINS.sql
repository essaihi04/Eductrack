-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : Système de bulletins scolaires officiels (Maroc)        ║
-- ║                                                                      ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor.                       ║
-- ║  Idempotent (ré-exécutable sans erreur grâce à IF NOT EXISTS).       ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── 1. Code Massar sur profiles ────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS massar_code TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_massar ON profiles(massar_code);

-- Backfill depuis les metadata auth existantes (one-shot)
UPDATE profiles p
SET massar_code = u.raw_user_meta_data->>'massar_code'
FROM auth.users u
WHERE p.id = u.id
  AND p.role = 'student'
  AND p.massar_code IS NULL
  AND u.raw_user_meta_data->>'massar_code' IS NOT NULL;

-- Backfill depuis l'email (les emails élèves sont générés comme <massar>@ecole.ma).
-- On ne touche que les codes plausibles (au moins 1 lettre + des chiffres, ou contenant
-- un chiffre — pour éviter de prendre les emails personnels classiques).
UPDATE profiles p
SET massar_code = UPPER(SPLIT_PART(p.email, '@', 1))
WHERE p.role = 'student'
  AND p.massar_code IS NULL
  AND p.email IS NOT NULL
  AND p.email LIKE '%@%'
  AND SPLIT_PART(p.email, '@', 1) ~ '[0-9]'
  AND LENGTH(SPLIT_PART(p.email, '@', 1)) <= 20;

-- ─── 2. Flag controle/activité sur controls_plan ───────────────────────
ALTER TABLE controls_plan
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'control';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='controls_plan' AND constraint_name='controls_plan_kind_check'
  ) THEN
    ALTER TABLE controls_plan ADD CONSTRAINT controls_plan_kind_check
      CHECK (kind IN ('control','activity'));
  END IF;
END $$;

-- Auto-flag des activités intégrées détectables par leur nom (one-shot)
UPDATE controls_plan
SET kind = 'activity'
WHERE kind = 'control'
  AND (
    name ~* 'الأنشطة\s*المندمجة'
    OR name ~* '\bactivit[ée]s?\s*int[ée]gr'
    OR name ~* '^\s*activit[ée]'
    OR name ~* 'نشاط\s*مدمج'
  );

-- ─── 3. Configuration administrative par année scolaire ────────────────
CREATE TABLE IF NOT EXISTS school_year_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,                 -- "2025/2026"
  academy TEXT,                                -- "Académie Régionale d'Education et de Formation"
  region TEXT,                                 -- "Casablanca-Settat"
  provincial_direction TEXT,                   -- "Province: Berrechid"
  establishment_label TEXT,                    -- override nom officiel
  director_name TEXT,
  ministry_logo_url TEXT,                      -- override logo si école veut autre
  -- Bornes des semestres (dates dans l'année calendaire fiscale)
  semester_1_start DATE,                       -- défaut = year-09-01
  semester_1_end   DATE,                       -- défaut = year+1-01-31
  semester_2_start DATE,                       -- défaut = year+1-02-01
  semester_2_end   DATE,                       -- défaut = year+1-06-30
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_syc_school_year ON school_year_config(school_id, academic_year);

-- ─── 4. Coefficients par niveau / filière / matière ────────────────────
CREATE TABLE IF NOT EXISTS subject_coefficients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,  -- NULL = défaut global
  level TEXT NOT NULL,                         -- "1AP", "1AC", "TC", "1BAC", "2BAC"
  filiere TEXT,                                -- NULL pour primaire/collège
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,                  -- "Mathématiques"
  coefficient NUMERIC(4,2) NOT NULL DEFAULT 1,
  display_order INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, level, filiere, subject_name)
);
CREATE INDEX IF NOT EXISTS idx_subj_coef_lvl_fil ON subject_coefficients(level, filiere);

-- ─── 5. Bulletins ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bulletins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL,
  semester INT NOT NULL CHECK (semester IN (1,2)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','sent')),
  general_average NUMERIC(5,2),
  general_rank INT,
  total_students_in_class INT,
  mention TEXT,                                -- TB, B, AB, P, F (calculé)
  generated_by UUID REFERENCES profiles(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  pdf_url TEXT,
  notes TEXT,                                  -- commentaire global du bulletin
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, academic_year, semester)
);
CREATE INDEX IF NOT EXISTS idx_bulletins_class_year_sem ON bulletins(class_id, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_bulletins_student ON bulletins(student_id);

-- Lignes de matière par bulletin (snapshot figé à la publication)
CREATE TABLE IF NOT EXISTS bulletin_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bulletin_id UUID NOT NULL REFERENCES bulletins(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id),
  subject_name TEXT NOT NULL,
  controls_avg NUMERIC(5,2),
  activities_avg NUMERIC(5,2),
  note_20 NUMERIC(5,2) NOT NULL,               -- = controls_avg*0.75 + activities_avg*0.25
  coefficient NUMERIC(4,2) NOT NULL,
  weighted_note NUMERIC(7,2) NOT NULL,
  rank_in_class INT,
  appreciation TEXT,                           -- override admin (priorité)
  appreciation_by_teacher TEXT,                -- saisie prof (fallback)
  display_order INT DEFAULT 100
);
CREATE INDEX IF NOT EXISTS idx_bulletin_lines_bulletin ON bulletin_lines(bulletin_id);

-- ─── 6. Appréciations indépendantes (saisie prof avant génération) ─────
-- Permet aux profs de saisir leurs appréciations indépendamment des bulletins
-- générés. Lors de la génération du bulletin, ces appréciations sont copiées
-- dans bulletin_lines.appreciation_by_teacher.
CREATE TABLE IF NOT EXISTS teacher_appreciations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id),
  subject_name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  semester INT NOT NULL CHECK (semester IN (1,2)),
  appreciation TEXT NOT NULL DEFAULT '',
  is_auto_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, subject_name, academic_year, semester)
);
CREATE INDEX IF NOT EXISTS idx_teach_appr_class_sub ON teacher_appreciations(class_id, subject_name, academic_year, semester);
CREATE INDEX IF NOT EXISTS idx_teach_appr_teacher ON teacher_appreciations(teacher_id);

-- ─── 7. RLS pour bulletins (lecture parent/student/teacher) ────────────
ALTER TABLE bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulletin_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_appreciations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_coefficients ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_year_config ENABLE ROW LEVEL SECURITY;

-- Politiques bulletins : élève voit ses bulletins publiés ; parent voit ceux de ses enfants
DROP POLICY IF EXISTS "Students can view own published bulletins" ON bulletins;
CREATE POLICY "Students can view own published bulletins" ON bulletins
  FOR SELECT USING (
    auth.uid() = student_id AND status IN ('published', 'sent')
  );

DROP POLICY IF EXISTS "Parents can view children published bulletins" ON bulletins;
CREATE POLICY "Parents can view children published bulletins" ON bulletins
  FOR SELECT USING (
    status IN ('published', 'sent')
    AND student_id IN (
      SELECT student_id FROM parent_students WHERE parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage all bulletins" ON bulletins;
CREATE POLICY "Admins can manage all bulletins" ON bulletins
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','school_admin','super_admin','direction_pedagogique','pedagogical_manager')
    )
  );

-- bulletin_lines hérite des permissions du bulletin
DROP POLICY IF EXISTS "View lines if can view bulletin" ON bulletin_lines;
CREATE POLICY "View lines if can view bulletin" ON bulletin_lines
  FOR SELECT USING (
    bulletin_id IN (SELECT id FROM bulletins)
  );

DROP POLICY IF EXISTS "Admins manage all lines" ON bulletin_lines;
CREATE POLICY "Admins manage all lines" ON bulletin_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','school_admin','super_admin','direction_pedagogique','pedagogical_manager')
    )
  );

-- Coefficients : lecture pour tous les rôles authentifiés, écriture pour admin/dir
DROP POLICY IF EXISTS "All can read coefficients" ON subject_coefficients;
CREATE POLICY "All can read coefficients" ON subject_coefficients
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage coefficients" ON subject_coefficients;
CREATE POLICY "Admins manage coefficients" ON subject_coefficients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','school_admin','super_admin','direction_pedagogique')
    )
  );

-- school_year_config : idem coefficients
DROP POLICY IF EXISTS "All can read syc" ON school_year_config;
CREATE POLICY "All can read syc" ON school_year_config
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage syc" ON school_year_config;
CREATE POLICY "Admins manage syc" ON school_year_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','school_admin','super_admin','direction_pedagogique')
    )
  );

-- teacher_appreciations : profs gèrent les leurs, admins voient tout
DROP POLICY IF EXISTS "Teachers manage own appreciations" ON teacher_appreciations;
CREATE POLICY "Teachers manage own appreciations" ON teacher_appreciations
  FOR ALL USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Admins manage all appreciations" ON teacher_appreciations;
CREATE POLICY "Admins manage all appreciations" ON teacher_appreciations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin','school_admin','super_admin','direction_pedagogique','pedagogical_manager')
    )
  );

-- ─── 8. SEED COEFFICIENTS OFFICIELS (school_id = NULL = défauts globaux) ─

-- ──────── PRIMAIRE — 1ère et 2ème AP ────────
INSERT INTO subject_coefficients (school_id, level, filiere, subject_name, coefficient, display_order) VALUES
  (NULL, '1AP', NULL, 'Arabe', 4, 10),
  (NULL, '1AP', NULL, 'Éducation islamique', 2, 20),
  (NULL, '1AP', NULL, 'Français', 2, 30),
  (NULL, '1AP', NULL, 'Mathématiques', 3, 40),
  (NULL, '1AP', NULL, 'Activité scientifique', 1, 50),
  (NULL, '1AP', NULL, 'Éducation artistique', 1, 60),
  (NULL, '1AP', NULL, 'EPS', 1, 70),
  (NULL, '2AP', NULL, 'Arabe', 4, 10),
  (NULL, '2AP', NULL, 'Éducation islamique', 2, 20),
  (NULL, '2AP', NULL, 'Français', 2, 30),
  (NULL, '2AP', NULL, 'Mathématiques', 3, 40),
  (NULL, '2AP', NULL, 'Activité scientifique', 1, 50),
  (NULL, '2AP', NULL, 'Éducation artistique', 1, 60),
  (NULL, '2AP', NULL, 'EPS', 1, 70)
ON CONFLICT (school_id, level, filiere, subject_name) DO NOTHING;

-- ──────── PRIMAIRE — 3ème à 6ème AP ────────
INSERT INTO subject_coefficients (school_id, level, filiere, subject_name, coefficient, display_order) VALUES
  (NULL, '3AP', NULL, 'Arabe', 3, 10),
  (NULL, '3AP', NULL, 'Éducation islamique', 2, 20),
  (NULL, '3AP', NULL, 'Français', 3, 30),
  (NULL, '3AP', NULL, 'Mathématiques', 3, 40),
  (NULL, '3AP', NULL, 'Activité scientifique', 2, 50),
  (NULL, '3AP', NULL, 'Sociales', 2, 55),
  (NULL, '3AP', NULL, 'Éducation artistique', 1, 60),
  (NULL, '3AP', NULL, 'EPS', 1, 70),
  (NULL, '4AP', NULL, 'Arabe', 3, 10),
  (NULL, '4AP', NULL, 'Éducation islamique', 2, 20),
  (NULL, '4AP', NULL, 'Français', 3, 30),
  (NULL, '4AP', NULL, 'Mathématiques', 3, 40),
  (NULL, '4AP', NULL, 'Activité scientifique', 2, 50),
  (NULL, '4AP', NULL, 'Sociales', 2, 55),
  (NULL, '4AP', NULL, 'Éducation artistique', 1, 60),
  (NULL, '4AP', NULL, 'EPS', 1, 70),
  (NULL, '5AP', NULL, 'Arabe', 3, 10),
  (NULL, '5AP', NULL, 'Éducation islamique', 2, 20),
  (NULL, '5AP', NULL, 'Français', 3, 30),
  (NULL, '5AP', NULL, 'Anglais', 1, 35),
  (NULL, '5AP', NULL, 'Mathématiques', 3, 40),
  (NULL, '5AP', NULL, 'Activité scientifique', 2, 50),
  (NULL, '5AP', NULL, 'Sociales', 2, 55),
  (NULL, '5AP', NULL, 'Éducation artistique', 1, 60),
  (NULL, '5AP', NULL, 'EPS', 1, 70),
  (NULL, '6AP', NULL, 'Arabe', 3, 10),
  (NULL, '6AP', NULL, 'Éducation islamique', 2, 20),
  (NULL, '6AP', NULL, 'Français', 3, 30),
  (NULL, '6AP', NULL, 'Anglais', 1, 35),
  (NULL, '6AP', NULL, 'Mathématiques', 3, 40),
  (NULL, '6AP', NULL, 'Activité scientifique', 2, 50),
  (NULL, '6AP', NULL, 'Sociales', 2, 55),
  (NULL, '6AP', NULL, 'Éducation artistique', 1, 60),
  (NULL, '6AP', NULL, 'EPS', 1, 70)
ON CONFLICT (school_id, level, filiere, subject_name) DO NOTHING;

-- ──────── COLLÈGE — 1AC, 2AC, 3AC ────────
INSERT INTO subject_coefficients (school_id, level, filiere, subject_name, coefficient, display_order) VALUES
  (NULL, '1AC', NULL, 'Arabe', 3, 10),
  (NULL, '1AC', NULL, 'Mathématiques', 3, 20),
  (NULL, '1AC', NULL, 'Français', 3, 30),
  (NULL, '1AC', NULL, 'PC', 2, 40),
  (NULL, '1AC', NULL, 'SVT', 2, 50),
  (NULL, '1AC', NULL, 'Sociales', 2, 60),
  (NULL, '1AC', NULL, 'Éducation islamique', 2, 70),
  (NULL, '1AC', NULL, 'Anglais', 2, 80),
  (NULL, '1AC', NULL, 'Informatique', 1, 90),
  (NULL, '1AC', NULL, 'Arts plastiques', 1, 100),
  (NULL, '1AC', NULL, 'Éducation musicale', 1, 110),
  (NULL, '1AC', NULL, 'EPS', 1, 120),

  (NULL, '2AC', NULL, 'Arabe', 3, 10),
  (NULL, '2AC', NULL, 'Mathématiques', 3, 20),
  (NULL, '2AC', NULL, 'Français', 3, 30),
  (NULL, '2AC', NULL, 'PC', 2, 40),
  (NULL, '2AC', NULL, 'SVT', 2, 50),
  (NULL, '2AC', NULL, 'Sociales', 2, 60),
  (NULL, '2AC', NULL, 'Éducation islamique', 2, 70),
  (NULL, '2AC', NULL, 'Anglais', 2, 80),
  (NULL, '2AC', NULL, 'Informatique', 1, 90),
  (NULL, '2AC', NULL, 'Arts plastiques', 1, 100),
  (NULL, '2AC', NULL, 'Éducation musicale', 1, 110),
  (NULL, '2AC', NULL, 'EPS', 1, 120),

  (NULL, '3AC', NULL, 'Arabe', 3, 10),
  (NULL, '3AC', NULL, 'Mathématiques', 3, 20),
  (NULL, '3AC', NULL, 'Français', 3, 30),
  (NULL, '3AC', NULL, 'PC', 2, 40),
  (NULL, '3AC', NULL, 'SVT', 2, 50),
  (NULL, '3AC', NULL, 'Sociales', 2, 60),
  (NULL, '3AC', NULL, 'Éducation islamique', 2, 70),
  (NULL, '3AC', NULL, 'Anglais', 2, 80),
  (NULL, '3AC', NULL, 'Informatique', 1, 90),
  (NULL, '3AC', NULL, 'Arts plastiques', 1, 100),
  (NULL, '3AC', NULL, 'Éducation musicale', 1, 110),
  (NULL, '3AC', NULL, 'EPS', 1, 120)
ON CONFLICT (school_id, level, filiere, subject_name) DO NOTHING;

-- ──────── TRONC COMMUN ────────
INSERT INTO subject_coefficients (school_id, level, filiere, subject_name, coefficient, display_order) VALUES
  -- TC Sciences
  (NULL, 'TC', 'tc_sciences', 'Mathématiques', 4, 10),
  (NULL, 'TC', 'tc_sciences', 'PC', 4, 20),
  (NULL, 'TC', 'tc_sciences', 'SVT', 4, 30),
  (NULL, 'TC', 'tc_sciences', 'Français', 3, 40),
  (NULL, 'TC', 'tc_sciences', 'Anglais', 3, 50),
  (NULL, 'TC', 'tc_sciences', 'Arabe', 2, 60),
  (NULL, 'TC', 'tc_sciences', 'Histoire-Géographie', 2, 70),
  (NULL, 'TC', 'tc_sciences', 'Éducation islamique', 2, 80),
  (NULL, 'TC', 'tc_sciences', 'Philosophie', 2, 90),
  (NULL, 'TC', 'tc_sciences', 'Informatique', 2, 100),
  (NULL, 'TC', 'tc_sciences', 'EPS', 2, 110),

  -- TC Tech
  (NULL, 'TC', 'tc_tech', 'Mathématiques', 4, 10),
  (NULL, 'TC', 'tc_tech', 'PC', 4, 20),
  (NULL, 'TC', 'tc_tech', 'Sciences de l''ingénieur', 4, 30),
  (NULL, 'TC', 'tc_tech', 'Français', 3, 40),
  (NULL, 'TC', 'tc_tech', 'Anglais', 3, 50),
  (NULL, 'TC', 'tc_tech', 'Informatique', 3, 55),
  (NULL, 'TC', 'tc_tech', 'Arabe', 2, 60),
  (NULL, 'TC', 'tc_tech', 'Histoire-Géographie', 2, 70),
  (NULL, 'TC', 'tc_tech', 'Éducation islamique', 2, 80),
  (NULL, 'TC', 'tc_tech', 'Philosophie', 2, 90),
  (NULL, 'TC', 'tc_tech', 'EPS', 2, 110),

  -- TC Lettres
  (NULL, 'TC', 'tc_lettres', 'Arabe', 4, 10),
  (NULL, 'TC', 'tc_lettres', 'Français', 4, 20),
  (NULL, 'TC', 'tc_lettres', 'Histoire-Géographie', 4, 30),
  (NULL, 'TC', 'tc_lettres', 'Anglais', 3, 40),
  (NULL, 'TC', 'tc_lettres', 'Mathématiques', 2, 50),
  (NULL, 'TC', 'tc_lettres', 'SVT', 2, 60),
  (NULL, 'TC', 'tc_lettres', 'Philosophie', 2, 70),
  (NULL, 'TC', 'tc_lettres', 'Éducation islamique', 2, 80),
  (NULL, 'TC', 'tc_lettres', 'Informatique', 2, 90),
  (NULL, 'TC', 'tc_lettres', 'Culture artistique', 2, 95),
  (NULL, 'TC', 'tc_lettres', 'EPS', 2, 100)
ON CONFLICT (school_id, level, filiere, subject_name) DO NOTHING;

-- ──────── 1ÈRE BAC ────────
INSERT INTO subject_coefficients (school_id, level, filiere, subject_name, coefficient, display_order) VALUES
  -- 1BAC Sciences Expérimentales
  (NULL, '1BAC', 'sciences_exp', 'Mathématiques', 7, 10),
  (NULL, '1BAC', 'sciences_exp', 'PC', 5, 20),
  (NULL, '1BAC', 'sciences_exp', 'SVT', 5, 30),
  (NULL, '1BAC', 'sciences_exp', 'Français', 4, 40),
  (NULL, '1BAC', 'sciences_exp', 'Anglais', 2, 50),
  (NULL, '1BAC', 'sciences_exp', 'Arabe', 2, 60),
  (NULL, '1BAC', 'sciences_exp', 'Histoire-Géographie', 2, 70),
  (NULL, '1BAC', 'sciences_exp', 'Philosophie', 2, 80),
  (NULL, '1BAC', 'sciences_exp', 'Éducation islamique', 2, 90),
  (NULL, '1BAC', 'sciences_exp', 'EPS', 1, 100),

  -- 1BAC Sciences Math
  (NULL, '1BAC', 'sciences_math', 'Mathématiques', 9, 10),
  (NULL, '1BAC', 'sciences_math', 'PC', 7, 20),
  (NULL, '1BAC', 'sciences_math', 'SVT', 3, 30),
  (NULL, '1BAC', 'sciences_math', 'Informatique', 3, 35),
  (NULL, '1BAC', 'sciences_math', 'Français', 4, 40),
  (NULL, '1BAC', 'sciences_math', 'Anglais', 2, 50),
  (NULL, '1BAC', 'sciences_math', 'Arabe', 2, 60),
  (NULL, '1BAC', 'sciences_math', 'Histoire-Géographie', 2, 70),
  (NULL, '1BAC', 'sciences_math', 'Philosophie', 2, 80),
  (NULL, '1BAC', 'sciences_math', 'Éducation islamique', 2, 90),
  (NULL, '1BAC', 'sciences_math', 'EPS', 1, 100),

  -- 1BAC Sciences Économiques
  (NULL, '1BAC', 'sciences_eco', 'Économie générale', 6, 10),
  (NULL, '1BAC', 'sciences_eco', 'Mathématiques', 6, 20),
  (NULL, '1BAC', 'sciences_eco', 'Français', 4, 30),
  (NULL, '1BAC', 'sciences_eco', 'Histoire-Géographie', 4, 35),
  (NULL, '1BAC', 'sciences_eco', 'Arabe', 3, 40),
  (NULL, '1BAC', 'sciences_eco', 'Comptabilité', 2, 50),
  (NULL, '1BAC', 'sciences_eco', 'Anglais', 2, 60),
  (NULL, '1BAC', 'sciences_eco', 'Philosophie', 2, 70),
  (NULL, '1BAC', 'sciences_eco', 'Éducation islamique', 2, 80),
  (NULL, '1BAC', 'sciences_eco', 'EPS', 1, 90),

  -- 1BAC Lettres et Sciences Humaines
  (NULL, '1BAC', 'lettres', 'Arabe', 4, 10),
  (NULL, '1BAC', 'lettres', 'Français', 4, 20),
  (NULL, '1BAC', 'lettres', 'Histoire-Géographie', 4, 30),
  (NULL, '1BAC', 'lettres', 'Philosophie', 4, 40),
  (NULL, '1BAC', 'lettres', 'Anglais', 3, 50),
  (NULL, '1BAC', 'lettres', 'Éducation islamique', 2, 60),
  (NULL, '1BAC', 'lettres', 'Mathématiques', 1, 70),
  (NULL, '1BAC', 'lettres', 'EPS', 1, 80)
ON CONFLICT (school_id, level, filiere, subject_name) DO NOTHING;

-- ──────── 2ÈME BAC ────────
INSERT INTO subject_coefficients (school_id, level, filiere, subject_name, coefficient, display_order) VALUES
  -- 2BAC SVT
  (NULL, '2BAC', 'svt', 'SVT', 7, 10),
  (NULL, '2BAC', 'svt', 'PC', 5, 20),
  (NULL, '2BAC', 'svt', 'Mathématiques', 3, 30),
  (NULL, '2BAC', 'svt', 'Français', 3, 40),
  (NULL, '2BAC', 'svt', 'Anglais', 2, 50),
  (NULL, '2BAC', 'svt', 'Arabe', 2, 60),
  (NULL, '2BAC', 'svt', 'Philosophie', 2, 70),
  (NULL, '2BAC', 'svt', 'Éducation islamique', 2, 80),
  (NULL, '2BAC', 'svt', 'EPS', 1, 90),

  -- 2BAC PC
  (NULL, '2BAC', 'pc', 'Mathématiques', 7, 10),
  (NULL, '2BAC', 'pc', 'PC', 7, 20),
  (NULL, '2BAC', 'pc', 'SVT', 3, 30),
  (NULL, '2BAC', 'pc', 'Français', 3, 40),
  (NULL, '2BAC', 'pc', 'Anglais', 2, 50),
  (NULL, '2BAC', 'pc', 'Arabe', 2, 60),
  (NULL, '2BAC', 'pc', 'Philosophie', 2, 70),
  (NULL, '2BAC', 'pc', 'Éducation islamique', 2, 80),
  (NULL, '2BAC', 'pc', 'EPS', 1, 90),

  -- 2BAC Sciences Math A
  (NULL, '2BAC', 'sciences_math_a', 'Mathématiques', 9, 10),
  (NULL, '2BAC', 'sciences_math_a', 'PC', 7, 20),
  (NULL, '2BAC', 'sciences_math_a', 'Informatique', 3, 30),
  (NULL, '2BAC', 'sciences_math_a', 'Français', 3, 40),
  (NULL, '2BAC', 'sciences_math_a', 'Anglais', 2, 50),
  (NULL, '2BAC', 'sciences_math_a', 'Arabe', 2, 60),
  (NULL, '2BAC', 'sciences_math_a', 'SVT', 1, 65),
  (NULL, '2BAC', 'sciences_math_a', 'Philosophie', 2, 70),
  (NULL, '2BAC', 'sciences_math_a', 'Éducation islamique', 2, 80),
  (NULL, '2BAC', 'sciences_math_a', 'EPS', 1, 90),

  -- 2BAC Sciences Math B
  (NULL, '2BAC', 'sciences_math_b', 'Mathématiques', 9, 10),
  (NULL, '2BAC', 'sciences_math_b', 'PC', 7, 20),
  (NULL, '2BAC', 'sciences_math_b', 'Informatique', 5, 30),
  (NULL, '2BAC', 'sciences_math_b', 'Français', 3, 40),
  (NULL, '2BAC', 'sciences_math_b', 'Anglais', 2, 50),
  (NULL, '2BAC', 'sciences_math_b', 'Arabe', 2, 60),
  (NULL, '2BAC', 'sciences_math_b', 'SVT', 1, 65),
  (NULL, '2BAC', 'sciences_math_b', 'Philosophie', 2, 70),
  (NULL, '2BAC', 'sciences_math_b', 'Éducation islamique', 2, 80),
  (NULL, '2BAC', 'sciences_math_b', 'EPS', 1, 90),

  -- 2BAC Sciences Économiques
  (NULL, '2BAC', 'eco', 'Économie générale', 6, 10),
  (NULL, '2BAC', 'eco', 'Mathématiques', 4, 20),
  (NULL, '2BAC', 'eco', 'Comptabilité', 4, 30),
  (NULL, '2BAC', 'eco', 'Statistiques', 4, 35),
  (NULL, '2BAC', 'eco', 'Histoire-Géographie', 4, 40),
  (NULL, '2BAC', 'eco', 'Français', 3, 50),
  (NULL, '2BAC', 'eco', 'Anglais', 2, 60),
  (NULL, '2BAC', 'eco', 'Arabe', 2, 70),
  (NULL, '2BAC', 'eco', 'Philosophie', 2, 80),
  (NULL, '2BAC', 'eco', 'Éducation islamique', 2, 90),
  (NULL, '2BAC', 'eco', 'EPS', 1, 100),

  -- 2BAC Lettres
  (NULL, '2BAC', 'lettres', 'Arabe', 4, 10),
  (NULL, '2BAC', 'lettres', 'Philosophie', 4, 20),
  (NULL, '2BAC', 'lettres', 'Histoire-Géographie', 4, 30),
  (NULL, '2BAC', 'lettres', 'Français', 4, 40),
  (NULL, '2BAC', 'lettres', 'Anglais', 3, 50),
  (NULL, '2BAC', 'lettres', 'Éducation islamique', 2, 60),
  (NULL, '2BAC', 'lettres', 'Mathématiques', 1, 70),
  (NULL, '2BAC', 'lettres', 'EPS', 1, 80),

  -- 2BAC Sciences Humaines
  (NULL, '2BAC', 'sciences_humaines', 'Sciences humaines', 4, 10),
  (NULL, '2BAC', 'sciences_humaines', 'Histoire-Géographie', 4, 20),
  (NULL, '2BAC', 'sciences_humaines', 'Philosophie', 4, 30),
  (NULL, '2BAC', 'sciences_humaines', 'Arabe', 4, 40),
  (NULL, '2BAC', 'sciences_humaines', 'Français', 4, 50),
  (NULL, '2BAC', 'sciences_humaines', 'Anglais', 3, 60),
  (NULL, '2BAC', 'sciences_humaines', 'Éducation islamique', 2, 70),
  (NULL, '2BAC', 'sciences_humaines', 'EPS', 1, 80)
ON CONFLICT (school_id, level, filiere, subject_name) DO NOTHING;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Migration terminée. Vérifiez en SQL :                               ║
-- ║    SELECT level, filiere, COUNT(*) FROM subject_coefficients         ║
-- ║      WHERE school_id IS NULL                                          ║
-- ║      GROUP BY level, filiere ORDER BY level, filiere;                ║
-- ╚══════════════════════════════════════════════════════════════════════╝
