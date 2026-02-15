-- Table pour lier les devoirs aux séances de suivi
CREATE TABLE IF NOT EXISTS homework_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID REFERENCES homework(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(homework_id, session_id)
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_homework_sessions_homework_id ON homework_sessions(homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_sessions_session_id ON homework_sessions(session_id);

-- RLS Policies
ALTER TABLE homework_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les profs peuvent voir les devoirs liés à leurs séances"
  ON homework_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = homework_sessions.session_id
      AND EXISTS (
        SELECT 1 FROM class_teachers
        WHERE class_teachers.class_id = sessions.class_id
        AND class_teachers.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "Les profs peuvent lier des devoirs à leurs séances"
  ON homework_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = homework_sessions.session_id
      AND EXISTS (
        SELECT 1 FROM class_teachers
        WHERE class_teachers.class_id = sessions.class_id
        AND class_teachers.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "Les profs peuvent supprimer les liens de leurs séances"
  ON homework_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = homework_sessions.session_id
      AND EXISTS (
        SELECT 1 FROM class_teachers
        WHERE class_teachers.class_id = sessions.class_id
        AND class_teachers.teacher_id = auth.uid()
      )
    )
  );

-- Permissions pour le service role
GRANT ALL ON homework_sessions TO service_role;

DROP POLICY IF EXISTS "Service role can do anything" ON homework_sessions;

CREATE POLICY "Service role can do anything" ON homework_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
