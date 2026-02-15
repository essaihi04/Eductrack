-- Mettre à jour TOUTES les contraintes CHECK pour la table session_tracking
-- Ce script garantit que toutes les colonnes ont les bonnes valeurs autorisées

-- ÉTAPE 1 : Mettre à jour les données existantes

-- Mise à jour de discipline (vigilance)
-- vigilant → concentre
-- bavarre → moyen
-- perturbateur → distrait
-- excellent → concentre
-- good → moyen
-- average → distrait
-- poor → distrait
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
-- excellent → correct
-- very_engaged → correct
-- disruptive → perturbateur
-- bavarre → bavarre (inchangé)
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
-- weak → faible
-- medium → bon
-- good → bon
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

-- ÉTAPE 2 : Supprimer toutes les anciennes contraintes CHECK
ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_discipline_check;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_attitude_check;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_participation_check;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_homework_check;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_presence_check;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_cahier_lesson_check;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_cahier_documents_check;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_cahier_readability_check;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_work_status_check;

-- ÉTAPE 3 : Ajouter les nouvelles contraintes CHECK

-- Presence
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_presence_check
CHECK (presence IN ('present', 'absent', 'late', 'excused'));

-- Discipline (Vigilance)
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_discipline_check
CHECK (discipline IN ('concentre', 'moyen', 'distrait'));

-- Participation
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_participation_check
CHECK (participation IN ('faible', 'bon', 'excellent'));

-- Attitude
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_attitude_check
CHECK (attitude IN ('correct', 'bavarre', 'perturbateur'));

-- Homework
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_homework_check
CHECK (homework IN ('done', 'partial', 'not_done'));

-- Cahier lesson
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_cahier_lesson_check
CHECK (cahier_lesson IN ('complete', 'partial', 'absent'));

-- Cahier documents
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_cahier_documents_check
CHECK (cahier_documents IN ('correct', 'incomplete', 'not_glued'));

-- Cahier readability
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_cahier_readability_check
CHECK (cahier_readability IN ('readable', 'medium', 'difficult'));

-- Work status
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_work_status_check
CHECK (work_status IN ('excellent', 'good', 'average', 'poor'));

-- Ajouter les commentaires
COMMENT ON COLUMN session_tracking.discipline IS 'Vigilance de l''élève : concentré (🟢), moyen (🟡), distrait (🔴)';
COMMENT ON COLUMN session_tracking.attitude IS 'Attitude de l''élève : correct (✓), bavarre (💬), perturbateur (⚠️)';
COMMENT ON COLUMN session_tracking.participation IS 'Participation de l''élève : faible, bon, excellent';
