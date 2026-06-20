-- ============================================================
-- MIGRATION: Comptabilite de gestion -- Phase 3
-- Prets / leasing (echeanciers) + Impots & taxes.
-- 100% statements simples. Prerequis : ACCOUNTING + PAYROLL.
-- ============================================================

-- 1. Prets / leasing
CREATE TABLE IF NOT EXISTS finance_loan (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  account_id  UUID REFERENCES finance_account(id),
  name        TEXT NOT NULL,
  loan_type   TEXT NOT NULL DEFAULT 'loan' CHECK (loan_type IN ('loan','leasing')),
  principal   NUMERIC(14,2) DEFAULT 0,
  annual_rate NUMERIC(6,3) DEFAULT 0,
  start_date  DATE,
  term_months INTEGER DEFAULT 12,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_loan_school ON finance_loan(school_id);

-- 2. Echeancier d'un pret (genere a la creation)
CREATE TABLE IF NOT EXISTS finance_loan_schedule (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id        UUID NOT NULL REFERENCES finance_loan(id) ON DELETE CASCADE,
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  seq            INTEGER,
  due_date       DATE NOT NULL,
  principal_part NUMERIC(14,2) DEFAULT 0,
  interest_part  NUMERIC(14,2) DEFAULT 0,
  total          NUMERIC(14,2) DEFAULT 0,
  status         TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','paid')),
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_loan_schedule_loan ON finance_loan_schedule(loan_id);
CREATE INDEX IF NOT EXISTS idx_finance_loan_schedule_school ON finance_loan_schedule(school_id);

-- 3. Obligations fiscales (IS acomptes, taxe pro, timbre, TVA...)
CREATE TABLE IF NOT EXISTS finance_tax_obligation (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  account_id   UUID REFERENCES finance_account(id),
  tax_type     TEXT DEFAULT 'other' CHECK (tax_type IN ('is_acompte','taxe_pro','taxe_habitation','stamp_duty','tva','other')),
  label        TEXT,
  period_label TEXT,
  due_date     DATE,
  amount       NUMERIC(14,2) DEFAULT 0,
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_tax_school ON finance_tax_obligation(school_id);

-- 4. RLS
ALTER TABLE finance_loan          ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_loan_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_tax_obligation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_loan;
CREATE POLICY "finance_read_own_school" ON finance_loan FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_loan_schedule;
CREATE POLICY "finance_read_own_school" ON finance_loan_schedule FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_tax_obligation;
CREATE POLICY "finance_read_own_school" ON finance_tax_obligation FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

-- ============================================================
-- FIN -- Phase 3. Le paiement d'une echeance / taxe ecrit dans
-- finance_ledger_entry (source_type loan / tax) et alimente la matrice.
-- ============================================================
