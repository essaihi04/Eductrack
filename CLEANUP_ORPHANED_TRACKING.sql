-- Nettoyer les données de suivi orphelines (sans séance associée)
-- Exécuter cette requête dans Supabase SQL Editor

-- Afficher d'abord les données orphelines
SELECT 
  st.id,
  st.student_id,
  st.session_id,
  st.presence,
  st.created_at,
  s.id as session_exists
FROM session_tracking st
LEFT JOIN sessions s ON st.session_id = s.id
WHERE s.id IS NULL
ORDER BY st.created_at DESC;

-- Supprimer les données orphelines
DELETE FROM session_tracking
WHERE session_id NOT IN (
  SELECT id FROM sessions
);
