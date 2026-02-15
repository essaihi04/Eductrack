-- Correction des permissions RLS pour la table controls_plan

-- 1. Désactiver temporairement RLS pour permettre l'accès
ALTER TABLE controls_plan DISABLE ROW LEVEL SECURITY;

-- 2. Réactiver RLS
ALTER TABLE controls_plan ENABLE ROW LEVEL SECURITY;

-- 3. Supprimer toutes les politiques existantes
DROP POLICY IF EXISTS "Teachers can view controls for their classes" ON controls_plan;
DROP POLICY IF EXISTS "Admins can view all controls" ON controls_plan;
DROP POLICY IF EXISTS "Teachers can create controls for their classes" ON controls_plan;
DROP POLICY IF EXISTS "Admins can create controls for any class" ON controls_plan;
DROP POLICY IF EXISTS "Teachers can update their own controls" ON controls_plan;
DROP POLICY IF EXISTS "Admins can update all controls" ON controls_plan;
DROP POLICY IF EXISTS "Teachers can delete their own controls" ON controls_plan;
DROP POLICY IF EXISTS "Admins can delete all controls" ON controls_plan;

-- 4. Créer des politiques RLS plus permissives pour le développement

-- Politique SELECT : Permettre à tous les utilisateurs authentifiés de voir les contrôles
CREATE POLICY "Enable read access for all authenticated users" ON controls_plan FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Politique INSERT : Permettre aux professeurs de créer des contrôles
CREATE POLICY "Enable insert for teachers" ON controls_plan FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'teacher'
    )
  );

-- Politique INSERT : Permettre aux admins de créer des contrôles
CREATE POLICY "Enable insert for admins" ON controls_plan FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Politique UPDATE : Permettre aux professeurs de modifier leurs propres contrôles
CREATE POLICY "Enable update for own controls" ON controls_plan FOR UPDATE
  USING (teacher_id = auth.uid());

-- Politique UPDATE : Permettre aux admins de modifier tous les contrôles
CREATE POLICY "Enable update for admins" ON controls_plan FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Politique DELETE : Permettre aux professeurs de supprimer leurs propres contrôles
CREATE POLICY "Enable delete for own controls" ON controls_plan FOR DELETE
  USING (teacher_id = auth.uid());

-- Politique DELETE : Permettre aux admins de supprimer tous les contrôles
CREATE POLICY "Enable delete for admins" ON controls_plan FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Vérifier que l'utilisateur actuel a les permissions
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
