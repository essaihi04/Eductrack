-- Script complet pour mettre à jour les contraintes CHECK de session_tracking
-- Ce script utilise une approche plus sûre : désactiver les contraintes, mettre à jour les données, puis recréer

-- ÉTAPE 1 : Supprimer toutes les contraintes CHECK existantes
ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_discipline_check CASCADE;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_attitude_check CASCADE;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_participation_check CASCADE;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_homework_check CASCADE;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_presence_check CASCADE;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_cahier_lesson_check CASCADE;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_cahier_documents_check CASCADE;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_cahier_readability_check CASCADE;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_work_status_check CASCADE;

-- ÉTAPE 2 : Mettre à jour toutes les données existantes

-- Mise à jour de discipline (vigilance)
UPDATE session_tracking
SET discipline = CASE
  WHEN discipline = 'vigilant' THEN 'concentre'
  WHEN discipline = 'bavarre' THEN 'moyen'
  WHEN discipline = 'perturbateur' THEN 'distrait'
  WHEN discipline = 'excellent' THEN 'concentre'
  WHEN discipline = 'good' THEN 'moyen'
  WHEN discipline = 'average' THEN 'distrait'
  WHEN discipline = 'poor' THEN 'distrait'
  ELSE discipline
END
WHERE discipline IS NOT NULL
AND discipline IN ('vigilant', 'bavarre', 'perturbateur', 'excellent', 'good', 'average', 'poor');

-- Mise à jour de attitude
UPDATE session_tracking
SET attitude = CASE
  WHEN attitude = 'excellent' THEN 'correct'
  WHEN attitude = 'very_engaged' THEN 'correct'
  WHEN attitude = 'disruptive' THEN 'perturbateur'
  WHEN attitude = 'bavarre' THEN 'bavarre'
  ELSE attitude
END
WHERE attitude IS NOT NULL
AND attitude IN ('excellent', 'very_engaged', 'disruptive', 'bavarre');

-- Mise à jour de participation
UPDATE session_tracking
SET participation = CASE
  WHEN participation = 'weak' THEN 'faible'
  WHEN participation = 'medium' THEN 'bon'
  WHEN participation = 'good' THEN 'bon'
  WHEN participation = 'excellent' THEN 'excellent'
  ELSE participation
END
WHERE participation IS NOT NULL
AND participation IN ('weak', 'medium', 'good');

-- ÉTAPE 3 : Recréer toutes les contraintes CHECK avec les nouvelles valeurs

-- Presence
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_presence_check
CHECK (presence IN ('present', 'absent', 'late', 'excused'));

-- Discipline (Vigilance) - NOUVELLES VALEURS
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_discipline_check
CHECK (discipline IS NULL OR discipline IN ('concentre', 'moyen', 'distrait'));

-- Participation - NOUVELLES VALEURS
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_participation_check
CHECK (participation IS NULL OR participation IN ('faible', 'bon', 'excellent'));

-- Attitude - NOUVELLES VALEURS
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_attitude_check
CHECK (attitude IS NULL OR attitude IN ('correct', 'bavarre', 'perturbateur'));

-- Homework
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_homework_check
CHECK (homework IS NULL OR homework IN ('done', 'partial', 'not_done'));

-- Cahier lesson
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_cahier_lesson_check
CHECK (cahier_lesson IS NULL OR cahier_lesson IN ('complete', 'partial', 'absent'));

-- Cahier documents
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_cahier_documents_check
CHECK (cahier_documents IS NULL OR cahier_documents IN ('correct', 'incomplete', 'not_glued'));

-- Cahier readability
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_cahier_readability_check
CHECK (cahier_readability IS NULL OR cahier_readability IN ('readable', 'medium', 'difficult'));

-- Work status
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_work_status_check
CHECK (work_status IS NULL OR work_status IN ('excellent', 'good', 'average', 'poor'));

-- ÉTAPE 4 : Ajouter les commentaires
COMMENT ON COLUMN session_tracking.discipline IS 'Vigilance de l''élève : concentré (🟢), moyen (🟡), distrait (🔴)';
COMMENT ON COLUMN session_tracking.attitude IS 'Attitude de l''élève : correct (✓), bavarre (💬), perturbateur (⚠️)';
COMMENT ON COLUMN session_tracking.participation IS 'Participation de l''élève : faible, bon, excellent';

-- ÉTAPE 5 : Vérifier les données mises à jour
SELECT 
  COUNT(*) as total_rows,
  COUNT(CASE WHEN discipline = 'concentre' THEN 1 END) as concentre_count,
  COUNT(CASE WHEN discipline = 'moyen' THEN 1 END) as moyen_count,
  COUNT(CASE WHEN discipline = 'distrait' THEN 1 END) as distrait_count,
  COUNT(CASE WHEN participation = 'bon' THEN 1 END) as bon_count,
  COUNT(CASE WHEN attitude = 'correct' THEN 1 END) as correct_count
FROM session_tracking;
