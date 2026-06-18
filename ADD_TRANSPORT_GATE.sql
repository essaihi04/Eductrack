-- Porte d'entrée transport : un parent (sans app) qui clique « Je ne veux pas »
-- au départ du bus est exclu des notifications transport de la journée.
-- (Le « oui » n'a pas besoin de stockage : le clic ouvre la fenêtre 24h gratuite,
--  détectée via whatsapp_incoming_messages.)

CREATE TABLE IF NOT EXISTS transport_daily_skip (
  parent_id uuid NOT NULL,
  day date NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (parent_id, day)
);

ALTER TABLE transport_daily_skip ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role full access transport_daily_skip"
  ON transport_daily_skip FOR ALL USING (true) WITH CHECK (true);
