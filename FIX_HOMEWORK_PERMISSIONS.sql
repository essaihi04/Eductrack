-- Donner les permissions nécessaires au service role
GRANT ALL ON homework TO service_role;
GRANT ALL ON homework_students TO service_role;
GRANT ALL ON homework_submissions TO service_role;

-- Donner les permissions sur les séquences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Désactiver RLS pour le service role
ALTER TABLE homework FORCE ROW LEVEL SECURITY;
ALTER TABLE homework_students FORCE ROW LEVEL SECURITY;
ALTER TABLE homework_submissions FORCE ROW LEVEL SECURITY;

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
