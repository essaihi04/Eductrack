-- Supprimer les données de suivi orphelines (sans séance associée)
DELETE FROM session_tracking
WHERE session_id NOT IN (
  SELECT id FROM sessions WHERE id IS NOT NULL
);
