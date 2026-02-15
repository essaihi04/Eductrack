-- Correction des permissions RLS pour la table control_tracking

-- 1. Réactiver RLS
ALTER TABLE control_tracking ENABLE ROW LEVEL SECURITY;

-- 2. Supprimer toutes les politiques existantes
DROP POLICY IF EXISTS "Teachers can view control tracking for their sessions" ON control_tracking;
DROP POLICY IF EXISTS "Teachers can insert control tracking for their sessions" ON control_tracking;
DROP POLICY IF EXISTS "Teachers can update control tracking for their sessions" ON control_tracking;
DROP POLICY IF EXISTS "Teachers can delete control tracking for their sessions" ON control_tracking;

-- 3. Créer des politiques RLS simples et permissives

-- Politique SELECT : Permettre à tous les utilisateurs authentifiés de voir le suivi
CREATE POLICY "Authenticated can read control_tracking"
ON control_tracking FOR SELECT TO authenticated
USING ( true );

-- Politique INSERT : Permettre à tous les utilisateurs authentifiés de créer du suivi
CREATE POLICY "Authenticated can insert control_tracking"
ON control_tracking FOR INSERT TO authenticated
WITH CHECK ( true );

-- Politique UPDATE : Permettre à tous les utilisateurs authentifiés de modifier le suivi
CREATE POLICY "Authenticated can update control_tracking"
ON control_tracking FOR UPDATE TO authenticated
USING ( true )
WITH CHECK ( true );

-- Politique DELETE : Permettre à tous les utilisateurs authentifiés de supprimer le suivi
CREATE POLICY "Authenticated can delete control_tracking"
ON control_tracking FOR DELETE TO authenticated
USING ( true );

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
WHERE tablename = 'control_tracking';

-- 5. Vérifier que RLS est activé
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'control_tracking';
