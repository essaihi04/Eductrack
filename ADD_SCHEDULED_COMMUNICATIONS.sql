-- Planificateur de communications (docs, événements, annonces) côté admin.
-- Au moment planifié, le backend route chaque envoi (push gratuit si l'app,
-- sinon WhatsApp) via notificationRouter.

CREATE TABLE IF NOT EXISTS scheduled_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_by uuid,
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'normal',          -- normal | deadline | urgent
  deadline_date date,
  attachment_url text,
  attachment_name text,
  target jsonb NOT NULL DEFAULT '{"all":true}'::jsonb,  -- {all:true} | {class_ids:[...]}
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',      -- scheduled | sending | sent | failed | canceled
  sent_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_comm_due
  ON scheduled_communications(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sched_comm_school
  ON scheduled_communications(school_id);

ALTER TABLE scheduled_communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access scheduled_communications"
  ON scheduled_communications FOR ALL USING (true) WITH CHECK (true);
