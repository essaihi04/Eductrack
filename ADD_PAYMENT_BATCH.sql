-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Lot d'encaissement (batch) : relie tous les paiements d'une même  ║
-- ║  opération — y compris sur PLUSIEURS élèves (paiement famille).     ║
-- ║  Permet : 1 encaissement = 1 reçu unique listant tous les élèves   ║
-- ║  et le détail de chaque service/mois.                              ║
-- ╚══════════════════════════════════════════════════════════════════╝

ALTER TABLE payments ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_payments_batch ON payments(batch_id);
