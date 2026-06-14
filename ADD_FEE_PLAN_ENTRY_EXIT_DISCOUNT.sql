-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION FINANCE : mois d'entrée/sortie + remise libre par élève    ║
-- ║                                                                      ║
-- ║  Gère les cas réels :                                                ║
-- ║   - élève inscrit en cours d'année → facturé à partir du mois d'entrée
-- ║   - élève qui part en cours d'année → facturé jusqu'au mois de sortie
-- ║   - frais d'inscription (ponctuel) → ramené au mois d'entrée          ║
-- ║   - bourse répartie sur le nombre RÉEL de mois facturés              ║
-- ║   - remise exceptionnelle (montant + motif)                          ║
-- ║                                                                      ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE student_fee_plans
  ADD COLUMN IF NOT EXISTS start_month INT,            -- mois d'entrée (1-12), NULL = début d'année
  ADD COLUMN IF NOT EXISTS end_month INT,              -- mois de sortie (1-12), NULL = fin d'année
  ADD COLUMN IF NOT EXISTS custom_discount_amount NUMERIC(12, 2) DEFAULT 0,  -- remise libre annuelle
  ADD COLUMN IF NOT EXISTS custom_discount_reason TEXT;                       -- motif de la remise
