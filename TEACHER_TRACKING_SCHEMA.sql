-- Tables pour le suivi pédagogique des professeurs

-- Table des séances (sessions de classe)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id),
  subject_id UUID REFERENCES subjects(id),
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  topic TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table du suivi de séance (présence, travail, discipline, téléphone)
CREATE TABLE IF NOT EXISTS session_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  presence TEXT CHECK (presence IN ('present', 'absent', 'late', 'excused')),
  work_status TEXT CHECK (work_status IN ('excellent', 'good', 'average', 'poor')),
  discipline TEXT CHECK (discipline IN ('excellent', 'good', 'average', 'poor')),
  phone_use BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des mini-évaluations
CREATE TABLE IF NOT EXISTS mini_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  assessed BOOLEAN DEFAULT FALSE,
  score NUMERIC(3,1),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des compétences évaluées
CREATE TABLE IF NOT EXISTS competencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table de liaison entre mini-évaluations et compétences
CREATE TABLE IF NOT EXISTS assessment_competencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assessment_id UUID NOT NULL REFERENCES mini_assessments(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  level TEXT CHECK (level IN ('not_acquired', 'in_progress', 'acquired', 'mastered')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table du cahier (planning hebdomadaire)
CREATE TABLE IF NOT EXISTS lesson_plan (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  week_start DATE NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday')),
  topic TEXT NOT NULL,
  objectives TEXT,
  resources TEXT,
  homework TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_sessions_class_date ON sessions(class_id, date);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_session_tracking_session ON session_tracking(session_id);
CREATE INDEX IF NOT EXISTS idx_session_tracking_student ON session_tracking(student_id);
CREATE INDEX IF NOT EXISTS idx_mini_assessments_session ON mini_assessments(session_id);
CREATE INDEX IF NOT EXISTS idx_mini_assessments_student ON mini_assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plan_class_week ON lesson_plan(class_id, week_start);

-- RLS Policies pour les sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their own sessions"
  ON sessions FOR SELECT
  USING (auth.uid() = teacher_id OR auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'
  ));

CREATE POLICY "Teachers can insert their own sessions"
  ON sessions FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update their own sessions"
  ON sessions FOR UPDATE
  USING (auth.uid() = teacher_id);

-- RLS Policies pour session_tracking
ALTER TABLE session_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view session tracking for their sessions"
  ON session_tracking FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE auth.uid() = teacher_id
    ) OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Teachers can insert session tracking for their sessions"
  ON session_tracking FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions WHERE auth.uid() = teacher_id
    )
  );

CREATE POLICY "Teachers can update session tracking for their sessions"
  ON session_tracking FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE auth.uid() = teacher_id
    )
  );

-- RLS Policies pour mini_assessments
ALTER TABLE mini_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view mini assessments for their sessions"
  ON mini_assessments FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE auth.uid() = teacher_id
    ) OR auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
  );

CREATE POLICY "Teachers can insert mini assessments for their sessions"
  ON mini_assessments FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions WHERE auth.uid() = teacher_id
    )
  );

CREATE POLICY "Teachers can update mini assessments for their sessions"
  ON mini_assessments FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE auth.uid() = teacher_id
    )
  );

-- RLS Policies pour lesson_plan
ALTER TABLE lesson_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view lesson plans for their classes"
  ON lesson_plan FOR SELECT
  USING (auth.uid() = teacher_id OR auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'
  ));

CREATE POLICY "Teachers can insert lesson plans for their classes"
  ON lesson_plan FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update lesson plans for their classes"
  ON lesson_plan FOR UPDATE
  USING (auth.uid() = teacher_id);
