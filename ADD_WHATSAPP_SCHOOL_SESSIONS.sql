-- Create whatsapp_school_sessions table
-- Maps each school to its own Wasender session (all on the same Wasender account/API key)
CREATE TABLE IF NOT EXISTS whatsapp_school_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  wasender_session_id INTEGER NOT NULL,
  session_name TEXT,
  phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_whatsapp_school_sessions_school ON whatsapp_school_sessions(school_id);

-- RLS
ALTER TABLE whatsapp_school_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (backend uses supabaseAdmin)
CREATE POLICY "Service role full access on whatsapp_school_sessions"
  ON whatsapp_school_sessions FOR ALL
  USING (true) WITH CHECK (true);
