-- Ajouter le champ writing à la table session_tracking
-- Ce champ permet de suivre si l'élève a écrit pendant la séance

ALTER TABLE session_tracking
ADD COLUMN IF NOT EXISTS writing BOOLEAN DEFAULT FALSE;

-- Ajouter une politique RLS pour le champ writing
-- Les professeurs peuvent voir et modifier ce champ pour leurs propres séances
-- Les élèves peuvent voir leur propre champ writing

CREATE POLICY "Students can view their own writing status"
  ON session_tracking FOR SELECT
  USING (
    student_id = auth.uid()
  );

COMMENT ON COLUMN session_tracking.writing IS 'Indique si l''élève a écrit pendant la séance';
