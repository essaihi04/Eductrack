-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : matière explicite sur les contrôles (controls_plan)      ║
-- ║                                                                      ║
-- ║  Jusqu'ici la matière d'un contrôle était DÉDUITE du professeur      ║
-- ║  (teacher_subjects, 1re matière). Quand un prof enseigne plusieurs   ║
-- ║  matières (ou import en vrac), des matières disparaissaient du       ║
-- ║  bulletin. On ajoute une correspondance directe controls_plan →      ║
-- ║  subjects, utilisée en priorité par le calcul des bulletins.         ║
-- ║                                                                      ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE controls_plan
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_controls_plan_subject ON controls_plan(subject_id);

-- Backfill : pour les contrôles existants sans matière, reprendre la 1re matière
-- du professeur (même heuristique qu'avant, mais figée une fois pour toutes).
UPDATE controls_plan cp
SET subject_id = ts.subject_id
FROM (
  SELECT DISTINCT ON (teacher_id) teacher_id, subject_id
  FROM teacher_subjects
  ORDER BY teacher_id, created_at
) ts
WHERE cp.subject_id IS NULL
  AND cp.teacher_id = ts.teacher_id;
