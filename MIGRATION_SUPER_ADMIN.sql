-- ============================================================
-- MIGRATION: Super Admin Multi-Écoles
-- ============================================================
-- À exécuter dans l'ordre dans Supabase SQL Editor
-- ============================================================

-- 1. Table des écoles
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  phone TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status);
CREATE INDEX IF NOT EXISTS idx_schools_code ON schools(code);

-- 2. Créer l'école par défaut (IMPORTANT: noter l'id retourné)
INSERT INTO schools (name, code, status)
VALUES ('École Principale', 'ECOLE1', 'active')
ON CONFLICT (code) DO NOTHING;

-- 3. Mettre à jour la contrainte role dans profiles pour accepter super_admin, school_admin et parent
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'school_admin', 'teacher', 'student', 'parent'));

-- 4. Ajouter school_id à profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);

-- 5. Backfill: associer tous les profils existants à l'école par défaut
UPDATE profiles
SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1')
WHERE school_id IS NULL;

-- 6. Ajouter school_id aux tables métier
-- classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE classes SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);

-- sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE sessions SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_school ON sessions(school_id);

-- session_tracking
ALTER TABLE session_tracking ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE session_tracking SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_tracking_school ON session_tracking(school_id);

-- subjects
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE subjects SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);

-- attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE attendance SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_school ON attendance(school_id);

-- behavior_records
ALTER TABLE behavior_records ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE behavior_records SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_behavior_records_school ON behavior_records(school_id);

-- assignments
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE assignments SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_school ON assignments(school_id);

-- submissions
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE submissions SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_school ON submissions(school_id);

-- lessons
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE lessons SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_lessons_school ON lessons(school_id);

-- grades
ALTER TABLE grades ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE grades SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_grades_school ON grades(school_id);

-- teacher_subjects
ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE teacher_subjects SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_school ON teacher_subjects(school_id);

-- class_teachers
ALTER TABLE class_teachers ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
UPDATE class_teachers SET school_id = (SELECT id FROM schools WHERE code = 'ECOLE1') WHERE school_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_class_teachers_school ON class_teachers(school_id);

-- notifications (si elle existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    EXECUTE 'ALTER TABLE notifications ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id)';
    EXECUTE 'UPDATE notifications SET school_id = (SELECT id FROM schools WHERE code = ''ECOLE1'') WHERE school_id IS NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_school ON notifications(school_id)';
  END IF;
END $$;

-- 7. Table des invitations admin
CREATE TABLE IF NOT EXISTS school_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'school_admin' CHECK (role IN ('school_admin', 'admin')),
  token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_invitations_token ON school_invitations(token);
CREATE INDEX IF NOT EXISTS idx_school_invitations_school ON school_invitations(school_id);

-- 8. Table audit_log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  school_id UUID REFERENCES schools(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_school ON audit_log(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- 9. Trigger updated_at pour schools
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. RLS pour schools
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on schools" ON schools
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Users can view their own school" ON schools
  FOR SELECT USING (
    id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- 11. RLS pour school_invitations
ALTER TABLE school_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage all invitations" ON school_invitations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "School admins can manage their school invitations" ON school_invitations
  FOR ALL USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'school_admin'))
  );

-- 12. RLS pour audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view all audit logs" ON audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "School admins can view their school audit logs" ON audit_log
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'school_admin'))
  );

-- ============================================================
-- FIN DE LA MIGRATION
-- ============================================================
-- Après exécution:
-- 1. Vérifier que l'école par défaut existe: SELECT * FROM schools;
-- 2. Vérifier que tous les profils ont un school_id: SELECT count(*) FROM profiles WHERE school_id IS NULL;
-- 3. Créer le super admin manuellement:
--    UPDATE profiles SET role = 'super_admin', school_id = NULL WHERE email = 'votre-email@example.com';
-- ============================================================
