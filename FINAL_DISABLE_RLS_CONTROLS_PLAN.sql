-- Désactiver RLS temporairement pour permettre l'accès
ALTER TABLE controls_plan DISABLE ROW LEVEL SECURITY;

-- Vérifier que RLS est bien désactivé
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'controls_plan';
