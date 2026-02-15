-- Donner les permissions nécessaires au service role pour les notifications
GRANT ALL ON notifications TO service_role;

-- Donner les permissions sur les séquences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Supprimer la politique existante si elle existe
DROP POLICY IF EXISTS "Service role can do anything" ON notifications;

-- Créer une politique pour permettre au service role de tout faire
CREATE POLICY "Service role can do anything" ON notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
