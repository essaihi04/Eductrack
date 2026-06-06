-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : Examens de certification (Maroc) — National / Régional /  ║
-- ║  Local, pour les années « إشهادية » : 6AP, 3AC, 1BAC, 2BAC.            ║
-- ║                                                                        ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor (idempotent).            ║
-- ║                                                                        ║
-- ║  Règles officielles (MEN) implémentées :                              ║
-- ║   • 2BAC : 25% contrôle continu + 25% régional (passé en 1BAC)        ║
-- ║            + 50% national                                              ║
-- ║   • 1BAC : moyenne de l'examen régional (= 25% du Bac final)          ║
-- ║   • 3AC  : 30% contrôle continu + 30% local + 40% régional            ║
-- ║   • 6AP  : (contrôle continu ×2 + local + régional) ÷ 4               ║
-- ║            = 50% CC + 25% local + 25% régional                        ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── 1. Coefficients d'examen (par niveau / filière / type d'examen) ─────
--   exam_type : 'national' | 'regional' | 'local'
--   Pour le Bac, les coefficients d'examen DIFFÈRENT des coefficients de
--   contrôle continu (subject_coefficients). Pour collège/primaire, ils
--   reprennent généralement les coefficients du cursus.
CREATE TABLE IF NOT EXISTS exam_coefficients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,  -- NULL = défaut global MEN
  level TEXT NOT NULL,                       -- '6AP','3AC','1BAC','2BAC'
  filiere TEXT,                              -- NULL pour collège/primaire
  exam_type TEXT NOT NULL CHECK (exam_type IN ('national','regional','local')),
  subject_name TEXT NOT NULL,
  coefficient NUMERIC(4,2) NOT NULL DEFAULT 1,
  display_order INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, level, filiere, exam_type, subject_name)
);
CREATE INDEX IF NOT EXISTS idx_exam_coef_lvl ON exam_coefficients(level, filiere, exam_type);

-- ─── 2. Notes d'examen (par élève / matière / type / scénario) ──────────
--   scenario : 'real' (examen officiel passé) | 'mock' (examen blanc / simili)
CREATE TABLE IF NOT EXISTS exam_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL,
  level TEXT,
  filiere TEXT,
  subject_name TEXT NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('national','regional','local')),
  scenario TEXT NOT NULL DEFAULT 'real' CHECK (scenario IN ('real','mock')),
  note NUMERIC(5,2) CHECK (note >= 0 AND note <= 20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, academic_year, subject_name, exam_type, scenario)
);
CREATE INDEX IF NOT EXISTS idx_exam_notes_student ON exam_notes(student_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_exam_notes_class ON exam_notes(class_id, academic_year, exam_type, scenario);

-- ─── 3. Champs de certification sur les bulletins ──────────────────────
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS is_exam_level BOOLEAN DEFAULT FALSE;
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS certification_mode TEXT;       -- 'real' | 'simili'
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS cc_average NUMERIC(5,2);       -- moyenne contrôle continu (annuelle)
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS local_average NUMERIC(5,2);
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS regional_average NUMERIC(5,2);
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS national_average NUMERIC(5,2);
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS certification_average NUMERIC(5,2);
ALTER TABLE bulletins ADD COLUMN IF NOT EXISTS certification_mention TEXT;

-- Notes d'examen par matière, figées dans la ligne de bulletin
ALTER TABLE bulletin_lines ADD COLUMN IF NOT EXISTS local_note NUMERIC(5,2);
ALTER TABLE bulletin_lines ADD COLUMN IF NOT EXISTS regional_note NUMERIC(5,2);
ALTER TABLE bulletin_lines ADD COLUMN IF NOT EXISTS national_note NUMERIC(5,2);

-- ─── 4. RLS ─────────────────────────────────────────────────────────────
ALTER TABLE exam_coefficients ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All can read exam_coefficients" ON exam_coefficients;
CREATE POLICY "All can read exam_coefficients" ON exam_coefficients
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins manage exam_coefficients" ON exam_coefficients;
CREATE POLICY "Admins manage exam_coefficients" ON exam_coefficients
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin','school_admin','super_admin','direction_pedagogique'))
  );

DROP POLICY IF EXISTS "Students read own exam_notes" ON exam_notes;
CREATE POLICY "Students read own exam_notes" ON exam_notes
  FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Parents read children exam_notes" ON exam_notes;
CREATE POLICY "Parents read children exam_notes" ON exam_notes
  FOR SELECT USING (
    student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage exam_notes" ON exam_notes;
CREATE POLICY "Admins manage exam_notes" ON exam_notes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin','school_admin','super_admin','direction_pedagogique','pedagogical_manager'))
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 5. SEED DES COEFFICIENTS OFFICIELS (school_id = NULL = défauts globaux)
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────── 2BAC — EXAMEN NATIONAL ───────────────────
INSERT INTO exam_coefficients (school_id, level, filiere, exam_type, subject_name, coefficient, display_order) VALUES
  -- SVT
  (NULL,'2BAC','svt','national','SVT',7,10),
  (NULL,'2BAC','svt','national','PC',5,20),
  (NULL,'2BAC','svt','national','Mathématiques',3,30),
  (NULL,'2BAC','svt','national','Philosophie',2,40),
  (NULL,'2BAC','svt','national','Anglais',2,50),
  -- PC
  (NULL,'2BAC','pc','national','Mathématiques',7,10),
  (NULL,'2BAC','pc','national','PC',7,20),
  (NULL,'2BAC','pc','national','SVT',5,30),
  (NULL,'2BAC','pc','national','Philosophie',2,40),
  (NULL,'2BAC','pc','national','Anglais',2,50),
  -- Sciences Math A
  (NULL,'2BAC','sciences_math_a','national','Mathématiques',9,10),
  (NULL,'2BAC','sciences_math_a','national','PC',7,20),
  (NULL,'2BAC','sciences_math_a','national','SVT',3,30),
  (NULL,'2BAC','sciences_math_a','national','Philosophie',2,40),
  (NULL,'2BAC','sciences_math_a','national','Anglais',2,50),
  -- Sciences Math B
  (NULL,'2BAC','sciences_math_b','national','Mathématiques',9,10),
  (NULL,'2BAC','sciences_math_b','national','PC',7,20),
  (NULL,'2BAC','sciences_math_b','national','Sciences de l''ingénieur',3,30),
  (NULL,'2BAC','sciences_math_b','national','Philosophie',2,40),
  (NULL,'2BAC','sciences_math_b','national','Anglais',2,50),
  -- Économie
  (NULL,'2BAC','eco','national','Économie générale',6,10),
  (NULL,'2BAC','eco','national','Comptabilité',4,20),
  (NULL,'2BAC','eco','national','Mathématiques',4,30),
  (NULL,'2BAC','eco','national','Économie et organisation administrative',3,40),
  (NULL,'2BAC','eco','national','Philosophie',2,50),
  (NULL,'2BAC','eco','national','Anglais',2,60),
  -- Lettres
  (NULL,'2BAC','lettres','national','Arabe',4,10),
  (NULL,'2BAC','lettres','national','Anglais',4,20),
  (NULL,'2BAC','lettres','national','Histoire-Géographie',3,30),
  (NULL,'2BAC','lettres','national','Philosophie',3,40),
  -- Sciences Humaines
  (NULL,'2BAC','sciences_humaines','national','Histoire-Géographie',4,10),
  (NULL,'2BAC','sciences_humaines','national','Philosophie',4,20),
  (NULL,'2BAC','sciences_humaines','national','Arabe',3,30),
  (NULL,'2BAC','sciences_humaines','national','Anglais',3,40)
ON CONFLICT (school_id, level, filiere, exam_type, subject_name) DO NOTHING;

-- ─────────────────── 2BAC — EXAMEN RÉGIONAL (passé en 1BAC) ───────────────────
INSERT INTO exam_coefficients (school_id, level, filiere, exam_type, subject_name, coefficient, display_order) VALUES
  -- Branches scientifiques (svt, pc, sciences_math_a, sciences_math_b)
  (NULL,'2BAC','svt','regional','Français',4,10),
  (NULL,'2BAC','svt','regional','Arabe',2,20),
  (NULL,'2BAC','svt','regional','Éducation islamique',2,30),
  (NULL,'2BAC','svt','regional','Histoire-Géographie',2,40),
  (NULL,'2BAC','pc','regional','Français',4,10),
  (NULL,'2BAC','pc','regional','Arabe',2,20),
  (NULL,'2BAC','pc','regional','Éducation islamique',2,30),
  (NULL,'2BAC','pc','regional','Histoire-Géographie',2,40),
  (NULL,'2BAC','sciences_math_a','regional','Français',4,10),
  (NULL,'2BAC','sciences_math_a','regional','Arabe',2,20),
  (NULL,'2BAC','sciences_math_a','regional','Éducation islamique',2,30),
  (NULL,'2BAC','sciences_math_a','regional','Histoire-Géographie',2,40),
  (NULL,'2BAC','sciences_math_b','regional','Français',4,10),
  (NULL,'2BAC','sciences_math_b','regional','Arabe',2,20),
  (NULL,'2BAC','sciences_math_b','regional','Éducation islamique',2,30),
  (NULL,'2BAC','sciences_math_b','regional','Histoire-Géographie',2,40),
  -- Économie
  (NULL,'2BAC','eco','regional','Français',3,10),
  (NULL,'2BAC','eco','regional','Histoire-Géographie',3,20),
  (NULL,'2BAC','eco','regional','Arabe',2,30),
  (NULL,'2BAC','eco','regional','Éducation islamique',2,40),
  (NULL,'2BAC','eco','regional','Droit',1,50),
  (NULL,'2BAC','eco','regional','Informatique de gestion',1,60),
  -- Lettres
  (NULL,'2BAC','lettres','regional','Français',4,10),
  (NULL,'2BAC','lettres','regional','Éducation islamique',2,20),
  (NULL,'2BAC','lettres','regional','Mathématiques',1,30),
  -- Sciences Humaines
  (NULL,'2BAC','sciences_humaines','regional','Français',4,10),
  (NULL,'2BAC','sciences_humaines','regional','Éducation islamique',2,20),
  (NULL,'2BAC','sciences_humaines','regional','Mathématiques',1,30)
ON CONFLICT (school_id, level, filiere, exam_type, subject_name) DO NOTHING;

-- ─────────────────── 1BAC — EXAMEN RÉGIONAL ───────────────────
INSERT INTO exam_coefficients (school_id, level, filiere, exam_type, subject_name, coefficient, display_order) VALUES
  -- Sciences Expérimentales
  (NULL,'1BAC','sciences_exp','regional','Français',4,10),
  (NULL,'1BAC','sciences_exp','regional','Arabe',2,20),
  (NULL,'1BAC','sciences_exp','regional','Éducation islamique',2,30),
  (NULL,'1BAC','sciences_exp','regional','Histoire-Géographie',2,40),
  -- Sciences Math
  (NULL,'1BAC','sciences_math','regional','Français',4,10),
  (NULL,'1BAC','sciences_math','regional','Arabe',2,20),
  (NULL,'1BAC','sciences_math','regional','Éducation islamique',2,30),
  (NULL,'1BAC','sciences_math','regional','Histoire-Géographie',2,40),
  -- Sciences Économiques
  (NULL,'1BAC','sciences_eco','regional','Français',3,10),
  (NULL,'1BAC','sciences_eco','regional','Histoire-Géographie',3,20),
  (NULL,'1BAC','sciences_eco','regional','Arabe',2,30),
  (NULL,'1BAC','sciences_eco','regional','Éducation islamique',2,40),
  (NULL,'1BAC','sciences_eco','regional','Droit',1,50),
  (NULL,'1BAC','sciences_eco','regional','Informatique de gestion',1,60),
  -- Lettres
  (NULL,'1BAC','lettres','regional','Français',4,10),
  (NULL,'1BAC','lettres','regional','Éducation islamique',2,20),
  (NULL,'1BAC','lettres','regional','Mathématiques',1,30)
ON CONFLICT (school_id, level, filiere, exam_type, subject_name) DO NOTHING;

-- ─────────────────── 3AC — RÉGIONAL + LOCAL ───────────────────
-- Matières examinées (coefficients = coefficients du cursus collège).
DO $$
DECLARE et TEXT;
BEGIN
  FOREACH et IN ARRAY ARRAY['regional','local'] LOOP
    INSERT INTO exam_coefficients (school_id, level, filiere, exam_type, subject_name, coefficient, display_order) VALUES
      (NULL,'3AC',NULL,et,'Arabe',3,10),
      (NULL,'3AC',NULL,et,'Mathématiques',3,20),
      (NULL,'3AC',NULL,et,'Français',3,30),
      (NULL,'3AC',NULL,et,'PC',2,40),
      (NULL,'3AC',NULL,et,'SVT',2,50),
      (NULL,'3AC',NULL,et,'Sociales',2,60),
      (NULL,'3AC',NULL,et,'Éducation islamique',2,70),
      (NULL,'3AC',NULL,et,'Anglais',2,80)
    ON CONFLICT (school_id, level, filiere, exam_type, subject_name) DO NOTHING;
  END LOOP;
END $$;

-- ─────────────────── 6AP — RÉGIONAL (provincial) + LOCAL (établissement) ───────────────────
DO $$
DECLARE et TEXT;
BEGIN
  FOREACH et IN ARRAY ARRAY['regional','local'] LOOP
    INSERT INTO exam_coefficients (school_id, level, filiere, exam_type, subject_name, coefficient, display_order) VALUES
      (NULL,'6AP',NULL,et,'Arabe',3,10),
      (NULL,'6AP',NULL,et,'Français',3,20),
      (NULL,'6AP',NULL,et,'Mathématiques',3,30),
      (NULL,'6AP',NULL,et,'Activité scientifique',2,40),
      (NULL,'6AP',NULL,et,'Sociales',2,50),
      (NULL,'6AP',NULL,et,'Éducation islamique',2,60),
      (NULL,'6AP',NULL,et,'Anglais',1,70)
    ON CONFLICT (school_id, level, filiere, exam_type, subject_name) DO NOTHING;
  END LOOP;
END $$;

-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  Migration terminée. Vérification :                                  ║
-- ║   SELECT level, filiere, exam_type, COUNT(*)                          ║
-- ║     FROM exam_coefficients WHERE school_id IS NULL                    ║
-- ║     GROUP BY level, filiere, exam_type ORDER BY level, filiere;       ║
-- ╚══════════════════════════════════════════════════════════════════════╝
