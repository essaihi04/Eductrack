-- Création du système de planification de contrôles

-- 1. Créer la table controls_plan
CREATE TABLE IF NOT EXISTS controls_plan (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  description TEXT,
  status TEXT CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')) DEFAULT 'planned',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_controls_plan_teacher_id ON controls_plan(teacher_id);
CREATE INDEX IF NOT EXISTS idx_controls_plan_class_id ON controls_plan(class_id);
CREATE INDEX IF NOT EXISTS idx_controls_plan_date ON controls_plan(date);
CREATE INDEX IF NOT EXISTS idx_controls_plan_status ON controls_plan(status);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_controls_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_controls_plan_updated_at ON controls_plan;
CREATE TRIGGER trigger_update_controls_plan_updated_at
  BEFORE UPDATE ON controls_plan
  FOR EACH ROW
  EXECUTE FUNCTION update_controls_plan_updated_at();

-- Activer RLS sur controls_plan
ALTER TABLE controls_plan ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour controls_plan

-- Supprimer les politiques existantes (si elles existent)
DROP POLICY IF EXISTS "Teachers can view controls for their classes" ON controls_plan;
DROP POLICY IF EXISTS "Admins can view all controls" ON controls_plan;
DROP POLICY IF EXISTS "Teachers can create controls for their classes" ON controls_plan;
DROP POLICY IF EXISTS "Admins can create controls for any class" ON controls_plan;
DROP POLICY IF EXISTS "Teachers can update their own controls" ON controls_plan;
DROP POLICY IF EXISTS "Admins can update all controls" ON controls_plan;
DROP POLICY IF EXISTS "Teachers can delete their own controls" ON controls_plan;
DROP POLICY IF EXISTS "Admins can delete all controls" ON controls_plan;

-- Les professeurs peuvent voir les contrôles de leurs classes
CREATE POLICY "Teachers can view controls for their classes" ON controls_plan FOR SELECT
  USING (
    teacher_id = auth.uid() OR
    class_id IN (SELECT id FROM classes WHERE teacher_id = auth.uid())
  );

-- Les admins peuvent voir tous les contrôles
CREATE POLICY "Admins can view all controls" ON controls_plan FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Les professeurs peuvent créer des contrôles pour leurs classes
CREATE POLICY "Teachers can create controls for their classes" ON controls_plan FOR INSERT
  WITH CHECK (
    teacher_id = auth.uid() AND
    class_id IN (SELECT id FROM classes WHERE teacher_id = auth.uid())
  );

-- Les admins peuvent créer des contrôles pour n'importe quelle classe
CREATE POLICY "Admins can create controls for any class" ON controls_plan FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Les professeurs peuvent modifier leurs propres contrôles
CREATE POLICY "Teachers can update their own controls" ON controls_plan FOR UPDATE
  USING (teacher_id = auth.uid());

-- Les admins peuvent modifier tous les contrôles
CREATE POLICY "Admins can update all controls" ON controls_plan FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Les professeurs peuvent supprimer leurs propres contrôles
CREATE POLICY "Teachers can delete their own controls" ON controls_plan FOR DELETE
  USING (teacher_id = auth.uid());

-- Les admins peuvent supprimer tous les contrôles
CREATE POLICY "Admins can delete all controls" ON controls_plan FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Commentaires pour la documentation
COMMENT ON TABLE controls_plan IS 'Table pour planifier les contrôles avec notifications aux parents et élèves';
COMMENT ON COLUMN controls_plan.status IS 'Statut du contrôle: planned (planifié), in_progress (en cours), completed (terminé), cancelled (annulé)';
