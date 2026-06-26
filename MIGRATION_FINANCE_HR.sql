-- ============================================================
-- MIGRATION: Gestion RH / Paie intelligente
-- - finance_employee enrichi (categorie, mode de paie, taux horaire,
--   heures/mois, mode de paiement, assujetti CNSS)
-- - finance_payroll_line enrichi (heures, taux, net, paiement)
-- - finance_payroll_config (taux CNSS/AMO + bareme IR par ecole)
-- Idempotent. Prerequis : MIGRATION_FINANCE_PAYROLL (finance_employee,
-- finance_payroll_run, finance_payroll_line).
-- ============================================================

-- 1. Employes : champs RH
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'enseignant';
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS pay_mode TEXT DEFAULT 'fixed';
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(14,2) DEFAULT 0;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS default_monthly_hours NUMERIC(7,2) DEFAULT 0;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'bank';
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS cnss_subject BOOLEAN DEFAULT true;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS end_date DATE;
-- Mois payés (1-12) ; vide/null = tous les mois de l'année scolaire
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS paid_months JSONB;

-- Dossier RH : photo, identité, contact, bancaire, situation, charge prof
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS cin TEXT;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS birth_place TEXT;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS marital_status TEXT;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
ALTER TABLE finance_employee ADD COLUMN IF NOT EXISTS weekly_target_hours NUMERIC(7,2) DEFAULT 0;

-- Pièces jointes du dossier (diplômes, CIN, contrat, CV, autres)
CREATE TABLE IF NOT EXISTS finance_employee_document (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES finance_employee(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL DEFAULT 'other' CHECK (doc_type IN ('diploma','cin','contract','cv','other')),
  label       TEXT,
  file_url    TEXT NOT NULL,
  mime        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_emp_doc_employee ON finance_employee_document(employee_id);

ALTER TABLE finance_employee_document ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_read_own_school" ON finance_employee_document;
CREATE POLICY "finance_read_own_school" ON finance_employee_document FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

-- Contraintes (DROP IF EXISTS + ADD = idempotent, sans dollar-quoting)
ALTER TABLE finance_employee DROP CONSTRAINT IF EXISTS finance_employee_category_chk;
ALTER TABLE finance_employee ADD CONSTRAINT finance_employee_category_chk
  CHECK (category IN ('enseignant','assistant','administratif','chauffeur','agent_service','autre'));
ALTER TABLE finance_employee DROP CONSTRAINT IF EXISTS finance_employee_paymode_chk;
ALTER TABLE finance_employee ADD CONSTRAINT finance_employee_paymode_chk
  CHECK (pay_mode IN ('fixed','hourly'));
ALTER TABLE finance_employee DROP CONSTRAINT IF EXISTS finance_employee_paymethod_chk;
ALTER TABLE finance_employee ADD CONSTRAINT finance_employee_paymethod_chk
  CHECK (payment_method IN ('cash','bank'));

-- 2. Lignes de paie : heures + paiement
ALTER TABLE finance_payroll_line ADD COLUMN IF NOT EXISTS hours NUMERIC(7,2) DEFAULT 0;
ALTER TABLE finance_payroll_line ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(14,2) DEFAULT 0;
ALTER TABLE finance_payroll_line ADD COLUMN IF NOT EXISTS net_salary NUMERIC(14,2) DEFAULT 0;
ALTER TABLE finance_payroll_line ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT false;
ALTER TABLE finance_payroll_line ADD COLUMN IF NOT EXISTS paid_date DATE;
ALTER TABLE finance_payroll_line ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE finance_payroll_line ADD COLUMN IF NOT EXISTS expense_id UUID;
ALTER TABLE finance_payroll_line DROP CONSTRAINT IF EXISTS finance_payroll_line_paymethod_chk;
ALTER TABLE finance_payroll_line ADD CONSTRAINT finance_payroll_line_paymethod_chk
  CHECK (payment_method IS NULL OR payment_method IN ('cash','bank'));

-- 3. Config paie par ecole (taux CNSS/AMO + bareme IR)
CREATE TABLE IF NOT EXISTS finance_payroll_config (
  school_id             UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  cnss_rate             NUMERIC(6,3) DEFAULT 4.48,   -- part salariale CNSS (%)
  amo_rate              NUMERIC(6,3) DEFAULT 2.26,   -- part salariale AMO (%)
  cnss_ceiling          NUMERIC(14,2) DEFAULT 6000,  -- plafond CNSS (assiette)
  default_monthly_hours NUMERIC(7,2) DEFAULT 0,
  ir_brackets           JSONB DEFAULT '[
    {"limit":2500,"rate":0,"deduction":0},
    {"limit":4166.67,"rate":10,"deduction":250},
    {"limit":5000,"rate":20,"deduction":666.67},
    {"limit":6666.67,"rate":30,"deduction":1166.67},
    {"limit":15000,"rate":34,"deduction":1433.33},
    {"limit":null,"rate":38,"deduction":2033.33}
  ]'::jsonb,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 4. RLS (lecture ecole courante ; ecritures via backend service_role)
ALTER TABLE finance_payroll_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_read_own_school" ON finance_payroll_config;
CREATE POLICY "finance_read_own_school" ON finance_payroll_config FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

-- ============================================================
-- FIN. Le modele « par paiement » : un salaire paye en ESPECE cree une
-- depense (school_expenses, reference 'PAYROLL:<line_id>') ; paye en BANQUE
-- il est rapproche depuis le releve bancaire. La paie n'ecrit plus dans
-- finance_ledger_entry. Reconciliation a faire une fois :
--   DELETE FROM finance_ledger_entry WHERE source_type='payroll';
-- ============================================================
