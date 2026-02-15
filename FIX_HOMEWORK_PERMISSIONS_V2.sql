-- Supprimer les politiques existantes si elles existent
DROP POLICY IF EXISTS "Service role can do anything" ON homework;
DROP POLICY IF EXISTS "Service role can do anything" ON homework_students;
DROP POLICY IF EXISTS "Service role can do anything" ON homework_submissions;

-- Donner les permissions nécessaires au service role
GRANT ALL ON homework TO service_role;
GRANT ALL ON homework_students TO service_role;
GRANT ALL ON homework_submissions TO service_role;

-- Donner les permissions sur les séquences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Créer une politique pour permettre au service role de tout faire
CREATE POLICY "Service role can do anything" ON homework
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can do anything" ON homework_students
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can do anything" ON homework_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
