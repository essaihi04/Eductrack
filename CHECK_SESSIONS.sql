-- Vérifier quelles séances existent
SELECT 
  s.id,
  s.class_id,
  s.date,
  s.start_time,
  s.end_time,
  COUNT(st.id) as tracking_count
FROM sessions s
LEFT JOIN session_tracking st ON s.id = st.session_id
GROUP BY s.id, s.class_id, s.date, s.start_time, s.end_time
ORDER BY s.created_at DESC;

-- Vérifier les données de suivi
SELECT 
  st.id,
  st.student_id,
  st.session_id,
  st.presence,
  st.created_at,
  s.date,
  s.start_time
FROM session_tracking st
LEFT JOIN sessions s ON st.session_id = s.id
ORDER BY st.created_at DESC
LIMIT 20;
