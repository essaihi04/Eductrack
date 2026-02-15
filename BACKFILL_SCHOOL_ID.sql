-- Backfill school_id for sessions and session_tracking records that have NULL school_id
-- This fixes the root cause: teachers creating sessions/tracking without school_id

-- 1. Backfill sessions.school_id from the teacher's profile school_id
UPDATE sessions s
SET school_id = p.school_id
FROM profiles p
WHERE s.teacher_id = p.id
  AND s.school_id IS NULL
  AND p.school_id IS NOT NULL;

-- 2. Fallback: backfill sessions.school_id from the class's school_id
UPDATE sessions s
SET school_id = c.school_id
FROM classes c
WHERE s.class_id = c.id
  AND s.school_id IS NULL
  AND c.school_id IS NOT NULL;

-- 3. Backfill session_tracking.school_id from the session's school_id
UPDATE session_tracking st
SET school_id = s.school_id
FROM sessions s
WHERE st.session_id = s.id
  AND st.school_id IS NULL
  AND s.school_id IS NOT NULL;

-- 4. Fallback: backfill session_tracking.school_id from the student's profile school_id
UPDATE session_tracking st
SET school_id = p.school_id
FROM profiles p
WHERE st.student_id = p.id
  AND st.school_id IS NULL
  AND p.school_id IS NOT NULL;

-- Verify results
SELECT 'sessions with NULL school_id' AS check_type, COUNT(*) AS count
FROM sessions WHERE school_id IS NULL
UNION ALL
SELECT 'session_tracking with NULL school_id', COUNT(*)
FROM session_tracking WHERE school_id IS NULL
UNION ALL
SELECT 'sessions total', COUNT(*) FROM sessions
UNION ALL
SELECT 'session_tracking total', COUNT(*) FROM session_tracking;
