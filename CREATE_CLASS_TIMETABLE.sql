-- Table emploi du temps par classe (recurring weekly schedule)
CREATE TABLE IF NOT EXISTS class_timetable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday')),
  slot_order INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  room TEXT,
  school_id UUID REFERENCES schools(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, day_of_week, slot_order)
);

-- Index pour les performances
CREATE INDEX IF NOT EXISTS idx_timetable_class ON class_timetable(class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_class_day ON class_timetable(class_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_timetable_school ON class_timetable(school_id);

-- RLS
ALTER TABLE class_timetable ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage timetables"
  ON class_timetable FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'school_admin', 'super_admin'))
  );

-- Teachers can view timetables for their classes
CREATE POLICY "Teachers can view timetables"
  ON class_timetable FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers
      WHERE class_teachers.class_id = class_timetable.class_id
      AND class_teachers.teacher_id = auth.uid()
    )
  );

-- Students can view timetable for their own class
CREATE POLICY "Students can view their class timetable"
  ON class_timetable FOR SELECT
  USING (
    class_id IN (SELECT class_id FROM profiles WHERE id = auth.uid() AND role = 'student')
  );
