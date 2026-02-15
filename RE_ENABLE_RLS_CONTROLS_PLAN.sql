-- Réactiver RLS sur controls_plan avec les politiques correctes

-- 1. Réactiver RLS
ALTER TABLE controls_plan ENABLE ROW LEVEL SECURITY;

-- 2. Supprimer toutes les politiques existantes
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON controls_plan;
DROP POLICY IF EXISTS "Enable insert for teachers" ON controls_plan;
DROP POLICY IF EXISTS "Enable insert for admins" ON controls_plan;
DROP POLICY IF EXISTS "Enable update for own controls" ON controls_plan;
DROP POLICY IF EXISTS "Enable update for admins" ON controls_plan;
DROP POLICY IF EXISTS "Enable delete for own controls" ON controls_plan;
DROP POLICY IF EXISTS "Enable delete for admins" ON controls_plan;

-- 3. Créer des politiques RLS simples et permissives

-- Politique SELECT : Permettre à tous les utilisateurs authentifiés de voir les contrôles
CREATE POLICY "Enable read access for authenticated users" ON controls_plan FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Politique INSERT : Permettre à tous les utilisateurs authentifiés de créer des contrôles
CREATE POLICY "Enable insert for authenticated users" ON controls_plan FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Politique UPDATE : Permettre à tous les utilisateurs authentifiés de modifier les contrôles
CREATE POLICY "Enable update for authenticated users" ON controls_plan FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Politique DELETE : Permettre à tous les utilisateurs authentifiés de supprimer les contrôles
CREATE POLICY "Enable delete for authenticated users" ON controls_plan FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- 4. Vérifier les politiques créées
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'controls_plan';

-- 5. Vérifier que RLS est activé
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'controls_plan';
