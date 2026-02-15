-- Table des devoirs
CREATE TABLE IF NOT EXISTS homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL CHECK (type IN ('exercice', 'revision', 'projet', 'recherche', 'presentation')),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('all', 'group')),
  due_date DATE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des élèves assignés aux devoirs
CREATE TABLE IF NOT EXISTS homework_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID REFERENCES homework(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(homework_id, student_id)
);

-- Table des soumissions de devoirs
CREATE TABLE IF NOT EXISTS homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID REFERENCES homework(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'graded', 'late')),
  submission_date TIMESTAMP WITH TIME ZONE,
  grade DECIMAL(5,2),
  feedback TEXT,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(homework_id, student_id)
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_homework_class_id ON homework(class_id);
CREATE INDEX IF NOT EXISTS idx_homework_created_by ON homework(created_by);
CREATE INDEX IF NOT EXISTS idx_homework_due_date ON homework(due_date);
CREATE INDEX IF NOT EXISTS idx_homework_students_homework_id ON homework_students(homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_students_student_id ON homework_students(student_id);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_homework_id ON homework_submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_student_id ON homework_submissions(student_id);

-- RLS Policies
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les profs peuvent voir les devoirs de leurs classes"
  ON homework FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = homework.class_id
      AND class_teachers.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Les élèves peuvent voir les devoirs de leur classe"
  ON homework FOR SELECT
  USING (
    class_id IN (
      SELECT class_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Les profs peuvent créer des devoirs pour leurs classes"
  ON homework FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = homework.class_id
      AND class_teachers.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Les profs peuvent modifier les devoirs de leurs classes"
  ON homework FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = homework.class_id
      AND class_teachers.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Les profs peuvent supprimer les devoirs de leurs classes"
  ON homework FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = homework.class_id
      AND class_teachers.teacher_id = auth.uid()
    )
  );

ALTER TABLE homework_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les profs peuvent voir les élèves assignés aux devoirs de leurs classes"
  ON homework_students FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM homework
      WHERE homework.id = homework_students.homework_id
      AND EXISTS (
        SELECT 1 FROM class_teachers
        WHERE class_teachers.class_id = homework.class_id
        AND class_teachers.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "Les élèves peuvent voir les devoirs auxquels ils sont assignés"
  ON homework_students FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Les profs peuvent assigner des élèves aux devoirs de leurs classes"
  ON homework_students FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM homework
      WHERE homework.id = homework_students.homework_id
      AND EXISTS (
        SELECT 1 FROM class_teachers
        WHERE class_teachers.class_id = homework.class_id
        AND class_teachers.teacher_id = auth.uid()
      )
    )
  );

ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les profs peuvent voir les soumissions des devoirs de leurs classes"
  ON homework_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM homework
      WHERE homework.id = homework_submissions.homework_id
      AND EXISTS (
        SELECT 1 FROM class_teachers
        WHERE class_teachers.class_id = homework.class_id
        AND class_teachers.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY "Les élèves peuvent voir leurs propres soumissions"
  ON homework_submissions FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Les élèves peuvent créer des soumissions"
  ON homework_submissions FOR INSERT
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Les élèves peuvent modifier leurs propres soumissions"
  ON homework_submissions FOR UPDATE
  USING (student_id = auth.uid());

CREATE POLICY "Les profs peuvent noter les soumissions des devoirs de leurs classes"
  ON homework_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM homework
      WHERE homework.id = homework_submissions.homework_id
      AND EXISTS (
        SELECT 1 FROM class_teachers
        WHERE class_teachers.class_id = homework.class_id
        AND class_teachers.teacher_id = auth.uid()
      )
    )
  );
