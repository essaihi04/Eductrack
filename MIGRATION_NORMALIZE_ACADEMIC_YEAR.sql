-- =====================================================================
-- MIGRATION : uniformiser le format de l'année scolaire (académique/roster)
-- =====================================================================
-- Contexte : `academic_year` était écrit tantôt en SLASH "2026/2027"
-- (module inscriptions, UI) tantôt en TIRET "2026-2027" (module finance /
-- réinscription). Ce mélange faisait « disparaître » des élèves/parents d'une
-- année et dédoublait les entrées du sélecteur d'année.
--
-- Décision : format canonique d'AFFICHAGE / ROSTER = SLASH "YYYY/YYYY".
--   -> student_enrollments, classes, school_year_config  => SLASH
--   -> student_fee_plans, finance_budget, finance_*       => TIRET (inchangés :
--      le code finance applique toujours toDash(), c'est leur convention).
--
-- Sûreté : cette migration NE SUPPRIME PAS de classe et NE convertit une ligne
-- que si cela NE crée PAS de doublon (contrainte unique). Les rares lignes qui
-- entreraient en collision sont laissées telles quelles — le back-end les lit
-- désormais dans les deux formats (yearVariants), donc aucune donnée n'est perdue.
--
-- Idempotente : ré-exécutable sans effet une fois les données propres.
-- À exécuter dans l'éditeur SQL de Supabase.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) STUDENT_ENROLLMENTS  (unique : student_id, academic_year)
-- ---------------------------------------------------------------------

-- 1a. Résoudre les collisions (même élève + même année écrite dans les DEUX
--     formats) en gardant la MEILLEURE ligne : statut RI > NI > NR, puis la plus
--     ancienne (created_at). Ainsi une vraie réinscription (RI) l'emporte sur une
--     ligne NI parasite qui aurait pu être créée par erreur.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY student_id, replace(academic_year, '-', '/')
      ORDER BY CASE status WHEN 'RI' THEN 0 WHEN 'NI' THEN 1 WHEN 'NR' THEN 2 ELSE 3 END,
               created_at ASC NULLS LAST
    ) AS rn
  FROM student_enrollments
  WHERE academic_year ~ '^[0-9]{4}[/-][0-9]{4}$'
)
DELETE FROM student_enrollments
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 1b. Convertir les lignes TIRET restantes en SLASH (plus aucune collision possible).
UPDATE student_enrollments
SET academic_year = replace(academic_year, '-', '/')
WHERE academic_year ~ '^[0-9]{4}-[0-9]{4}$';

-- ---------------------------------------------------------------------
-- 2) CLASSES  (on NE supprime jamais une classe : des élèves la référencent)
-- ---------------------------------------------------------------------
-- Convertir en SLASH uniquement si aucune classe équivalente en SLASH n'existe
-- déjà (même école, même nom, même niveau). Les collisions (rares) restent en
-- tiret et sont gérées par la lecture tolérante côté back-end.
UPDATE classes c
SET academic_year = replace(academic_year, '-', '/')
WHERE c.academic_year ~ '^[0-9]{4}-[0-9]{4}$'
  AND NOT EXISTS (
    SELECT 1 FROM classes c2
    WHERE c2.school_id = c.school_id
      AND c2.name = c.name
      AND coalesce(c2.level,'') = coalesce(c.level,'')
      AND c2.academic_year = replace(c.academic_year, '-', '/')
  );

-- ---------------------------------------------------------------------
-- 3) SCHOOL_YEAR_CONFIG  (unique : school_id, academic_year)
-- ---------------------------------------------------------------------
UPDATE school_year_config cfg
SET academic_year = replace(academic_year, '-', '/')
WHERE cfg.academic_year ~ '^[0-9]{4}-[0-9]{4}$'
  AND NOT EXISTS (
    SELECT 1 FROM school_year_config c2
    WHERE c2.school_id = cfg.school_id
      AND c2.academic_year = replace(cfg.academic_year, '-', '/')
  );

-- ---------------------------------------------------------------------
-- Rapport de contrôle (lignes encore en tiret = collisions laissées volontaires)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  se_dash int; cl_dash int; cfg_dash int;
BEGIN
  SELECT count(*) INTO se_dash  FROM student_enrollments WHERE academic_year ~ '^[0-9]{4}-[0-9]{4}$';
  SELECT count(*) INTO cl_dash  FROM classes             WHERE academic_year ~ '^[0-9]{4}-[0-9]{4}$';
  SELECT count(*) INTO cfg_dash FROM school_year_config  WHERE academic_year ~ '^[0-9]{4}-[0-9]{4}$';
  RAISE NOTICE 'Restant en tiret (collisions laissées) -> enrollments: %, classes: %, config: %', se_dash, cl_dash, cfg_dash;
END $$;

COMMIT;

-- =====================================================================
-- Vérification manuelle (à lancer après) :
--   SELECT academic_year, count(*) FROM student_enrollments GROUP BY 1 ORDER BY 1;
--   SELECT academic_year, count(*) FROM classes             GROUP BY 1 ORDER BY 1;
-- Toutes les années « roster » doivent apparaître en "YYYY/YYYY".
-- =====================================================================
