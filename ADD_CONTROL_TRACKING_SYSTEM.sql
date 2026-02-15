-- Système de suivi rapide pour les contrôles

-- 1. Ajouter un champ 'type' à la table sessions
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('normal', 'control')) DEFAULT 'normal';

-- 2. Créer la table control_tracking pour le suivi spécifique aux contrôles
CREATE TABLE IF NOT EXISTS control_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Présence (Justification officielle)
  presence TEXT CHECK (presence IN ('present', 'absent', 'excused', 'late')),
  presence_reason TEXT,
  
  -- Matériel (Égalité des conditions)
  material_status TEXT CHECK (material_status IN ('complete', 'incomplete', 'missing')),
  missing_materials TEXT,
  
  -- Téléphone (Source principale de fraude)
  phone_use BOOLEAN DEFAULT FALSE,
  phone_confiscated BOOLEAN DEFAULT FALSE,
  
  -- Discipline (Triche / tentative)
  discipline_status TEXT CHECK (discipline_status IN ('good', 'warning', 'cheating_attempt', 'cheating_confirmed')),
  discipline_notes TEXT,
  
  -- Copie rendue (Traçabilité de l'épreuve)
  copy_submitted BOOLEAN DEFAULT FALSE,
  copy_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unicité : un enregistrement par étudiant par session de contrôle
  UNIQUE(session_id, student_id)
);

-- 3. Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_control_tracking_session ON control_tracking(session_id);
CREATE INDEX IF NOT EXISTS idx_control_tracking_student ON control_tracking(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(type);

-- 4. Activer RLS sur la nouvelle table
ALTER TABLE control_tracking ENABLE ROW LEVEL SECURITY;

-- 5. Politiques RLS pour control_tracking
CREATE POLICY "Teachers can view control tracking for their sessions"
  ON control_tracking FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE teacher_id = auth.uid()
    ) OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Teachers can insert control tracking for their sessions"
  ON control_tracking FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions WHERE teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can update control tracking for their sessions"
  ON control_tracking FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can delete control tracking for their sessions"
  ON control_tracking FOR DELETE
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE teacher_id = auth.uid()
    )
  );

-- 6. Trigger pour mettre à jour updated_at
CREATE TRIGGER update_control_tracking_updated_at
  BEFORE UPDATE ON control_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Commentaires pour documenter la structure
COMMENT ON COLUMN sessions.type IS 'Type de séance : normal (cours normal) ou control (contrôle/examen)';
COMMENT ON COLUMN control_tracking.presence IS 'Présence de l''élève : present, absent, excused, late';
COMMENT ON COLUMN control_tracking.presence_reason IS 'Justification officielle de l''absence';
COMMENT ON COLUMN control_tracking.material_status IS 'Statut du matériel : complete, incomplete, missing';
COMMENT ON COLUMN control_tracking.missing_materials IS 'Liste du matériel manquant';
COMMENT ON COLUMN control_tracking.phone_use IS 'Utilisation du téléphone détectée (source principale de fraude)';
COMMENT ON COLUMN control_tracking.phone_confiscated IS 'Téléphone confisqué';
COMMENT ON COLUMN control_tracking.discipline_status IS 'Statut disciplinaire : good, warning, cheating_attempt, cheating_confirmed';
COMMENT ON COLUMN control_tracking.discipline_notes IS 'Notes sur les incidents disciplinaires';
COMMENT ON COLUMN control_tracking.copy_submitted IS 'Copie rendue (traçabilité de l''épreuve)';
COMMENT ON COLUMN control_tracking.copy_notes IS 'Notes sur la copie rendue';
