-- ============================================
-- Migration: Daily AI Reports for Parents
-- ============================================

-- Settings table for daily report configuration per school
CREATE TABLE IF NOT EXISTS daily_report_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  send_time TIME DEFAULT '18:00',
  timezone TEXT DEFAULT 'Africa/Casablanca',
  language TEXT DEFAULT 'both' CHECK (language IN ('fr', 'ar', 'both')),
  include_recommendations BOOLEAN DEFAULT true,
  include_chapter_info BOOLEAN DEFAULT true,
  include_homework_status BOOLEAN DEFAULT true,
  include_behavior BOOLEAN DEFAULT true,
  include_grades BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id)
);

-- Log of generated and sent daily reports
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  parent_id UUID,
  phone_e164 TEXT,
  report_date DATE NOT NULL,
  report_content_fr TEXT,
  report_content_ar TEXT,
  tracking_data JSONB,
  ai_model TEXT DEFAULT 'deepseek-chat',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_student ON daily_reports(student_id, report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_school ON daily_reports(school_id, report_date);
CREATE INDEX IF NOT EXISTS idx_daily_report_settings_school ON daily_report_settings(school_id);

-- RLS
ALTER TABLE daily_report_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage daily_report_settings" ON daily_report_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'school_admin', 'super_admin'))
  );

CREATE POLICY "Admins can view daily_reports" ON daily_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'school_admin', 'super_admin'))
  );
