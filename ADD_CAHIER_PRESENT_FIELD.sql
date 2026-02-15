-- Ajouter le champ cahier_present à la table session_tracking
-- Ce champ indique si l'élève a son cahier présent pendant la séance

ALTER TABLE session_tracking
ADD COLUMN IF NOT EXISTS cahier_present BOOLEAN DEFAULT FALSE;

-- Ajouter une politique RLS pour le champ cahier_present
-- Les professeurs peuvent voir et modifier ce champ pour leurs propres séances
-- Les élèves peuvent voir leur propre statut de cahier

CREATE POLICY "Students can view their own cahier status"
  ON session_tracking FOR SELECT
  USING (
    student_id = auth.uid()
  );

COMMENT ON COLUMN session_tracking.cahier_present IS 'Indique si l''élève a son cahier présent pendant la séance';
