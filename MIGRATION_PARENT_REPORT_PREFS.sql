-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Préférences de notification WhatsApp côté PARENT                       ║
-- ║                                                                          ║
-- ║  Permet à chaque parent de :                                             ║
-- ║   • activer / désactiver les rapports IA quotidiens                      ║
-- ║   • choisir la fréquence : 'daily' (chaque jour) ou 'weekly'             ║
-- ║   • si 'weekly' : choisir le jour de la semaine (0=dim, 6=sam)           ║
-- ║   • choisir l'heure d'envoi                                              ║
-- ║                                                                          ║
-- ║  Comportement par défaut (pas de ligne) :                               ║
-- ║   → notifications activées, fréquence quotidienne, à l'heure de l'école ║
-- ║                                                                          ║
-- ║  Si une ligne existe pour un parent :                                   ║
-- ║   → le scheduler école IGNORE ce parent                                 ║
-- ║   → le scheduler parent dédié envoie selon ses préférences              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS parent_report_preferences (
  parent_id      UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  frequency      TEXT NOT NULL DEFAULT 'daily'
                 CHECK (frequency IN ('daily', 'weekly')),
  weekly_day     INT CHECK (weekly_day IS NULL OR weekly_day BETWEEN 0 AND 6),
  preferred_time TIME NOT NULL DEFAULT '18:00',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prp_enabled_time
  ON parent_report_preferences(enabled, preferred_time);

-- ─── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE parent_report_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents read own prefs" ON parent_report_preferences;
CREATE POLICY "Parents read own prefs" ON parent_report_preferences
  FOR SELECT USING (auth.uid() = parent_id);

DROP POLICY IF EXISTS "Parents upsert own prefs" ON parent_report_preferences;
CREATE POLICY "Parents upsert own prefs" ON parent_report_preferences
  FOR ALL USING (auth.uid() = parent_id) WITH CHECK (auth.uid() = parent_id);

-- ─── trigger updated_at ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_prp_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prp_set_updated_at ON parent_report_preferences;
CREATE TRIGGER prp_set_updated_at
  BEFORE UPDATE ON parent_report_preferences
  FOR EACH ROW EXECUTE FUNCTION trg_prp_set_updated_at();

-- ─── Table de log des rapports hebdomadaires (similaire à daily_reports) ─
CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  phone_e164 TEXT,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  report_content_fr TEXT,
  report_content_ar TEXT,
  tracking_data JSONB,
  status TEXT CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_lookup
  ON weekly_reports(student_id, parent_id, week_start);
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE parent_report_preferences IS
  'Préférences WhatsApp par parent : activer/désactiver, fréquence (daily/weekly), jour, heure.';
COMMENT ON TABLE weekly_reports IS
  'Log des rapports hebdomadaires envoyés via WhatsApp.';
