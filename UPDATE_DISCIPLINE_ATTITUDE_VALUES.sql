-- Mettre à jour les contraintes CHECK pour discipline et attitude
-- Discipline (Vigilance) : concentré, moyen, distrait
-- Attitude : correct, bavarre, perturbateur

-- ÉTAPE 1 : Mettre à jour les données existantes pour respecter les nouvelles contraintes

-- Mise à jour de discipline (vigilance)
-- vigilant → concentré
-- bavarre → moyen
-- perturbateur → distrait
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
-- correct → correct (inchangé)
-- disruptive → perturbateur
-- perturbateur → perturbateur (inchangé)
-- very_engaged → correct
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

-- ÉTAPE 2 : Supprimer les anciennes contraintes CHECK
ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_discipline_check;

ALTER TABLE session_tracking
DROP CONSTRAINT IF EXISTS session_tracking_attitude_check;

-- ÉTAPE 3 : Ajouter les nouvelles contraintes CHECK pour discipline (vigilance)
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_discipline_check
CHECK (discipline IN ('concentre', 'moyen', 'distrait'));

-- ÉTAPE 4 : Ajouter les nouvelles contraintes CHECK pour attitude
ALTER TABLE session_tracking
ADD CONSTRAINT session_tracking_attitude_check
CHECK (attitude IN ('correct', 'bavarre', 'perturbateur'));

COMMENT ON COLUMN session_tracking.discipline IS 'Vigilance de l''élève : concentré (🟢), moyen (🟡), distrait (🔴)';
COMMENT ON COLUMN session_tracking.attitude IS 'Attitude de l''élève : correct (✓), bavarre (💬), perturbateur (⚠️)';
