-- Correction des permissions RLS pour la table control_tracking

-- 1. Supprimer les politiques existantes (si elles existent)
DROP POLICY IF EXISTS "Teachers can view control tracking for their sessions" ON control_tracking;
DROP POLICY IF EXISTS "Teachers can insert control tracking for their sessions" ON control_tracking;
DROP POLICY IF EXISTS "Teachers can update control tracking for their sessions" ON control_tracking;
DROP POLICY IF EXISTS "Teachers can delete control tracking for their sessions" ON control_tracking;

-- 2. Créer de nouvelles politiques RLS plus permissives

-- Politique de lecture : Les professeurs peuvent voir le tracking de leurs sessions
CREATE POLICY "Teachers can view control tracking for their sessions"
  ON control_tracking FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE teacher_id = auth.uid()
    )
  );

-- Politique d'insertion : Les professeurs peuvent insérer du tracking pour leurs sessions
CREATE POLICY "Teachers can insert control tracking for their sessions"
  ON control_tracking FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions WHERE teacher_id = auth.uid()
    )
  );

-- Politique de mise à jour : Les professeurs peuvent mettre à jour le tracking de leurs sessions
CREATE POLICY "Teachers can update control tracking for their sessions"
  ON control_tracking FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE teacher_id = auth.uid()
    )
  );

-- Politique de suppression : Les professeurs peuvent supprimer le tracking de leurs sessions
CREATE POLICY "Teachers can delete control tracking for their sessions"
  ON control_tracking FOR DELETE
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE teacher_id = auth.uid()
    )
  );

-- 3. Vérifier que RLS est activé
ALTER TABLE control_tracking ENABLE ROW LEVEL SECURITY;

-- 4. Donner les permissions de base au rôle service_role (pour les opérations backend)
GRANT ALL ON control_tracking TO service_role;
