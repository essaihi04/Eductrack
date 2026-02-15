-- Align the CHECK constraints on session_tracking with the values used by the app (FR + legacy EN)
BEGIN;

-- Attitude
ALTER TABLE session_tracking
  DROP CONSTRAINT IF EXISTS session_tracking_attitude_check;
ALTER TABLE session_tracking
  ADD CONSTRAINT session_tracking_attitude_check
  CHECK (attitude IS NULL OR attitude IN (
    'correct', 'perturbateur', 'excellent',
    'disruptive', 'very_engaged'
  ));

-- Participation
ALTER TABLE session_tracking
  DROP CONSTRAINT IF EXISTS session_tracking_participation_check;
ALTER TABLE session_tracking
  ADD CONSTRAINT session_tracking_participation_check
  CHECK (participation IS NULL OR participation IN (
    'weak', 'medium', 'good',
    'faible', 'excellent'
  ));

-- Discipline / vigilance
ALTER TABLE session_tracking
  DROP CONSTRAINT IF EXISTS session_tracking_discipline_check;
ALTER TABLE session_tracking
  ADD CONSTRAINT session_tracking_discipline_check
  CHECK (discipline IS NULL OR discipline IN (
    'excellent', 'good', 'average', 'poor',
    'vigilant', 'bavarre'
  ));

COMMIT;
