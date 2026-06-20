-- ============================================================
-- MIGRATION: Comptabilite de gestion -- Phase 4
-- Import releve bancaire (PDF) + regles de categorisation +
-- transactions + cloture mensuelle.
-- 100% statements simples. Prerequis : ACCOUNTING + PAYROLL.
-- ============================================================

-- 1. Releve bancaire importe
CREATE TABLE IF NOT EXISTS bank_statement (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  account_label   TEXT,
  period_start    DATE,
  period_end      DATE,
  opening_balance NUMERIC(14,2),
  closing_balance NUMERIC(14,2),
  source_filename TEXT,
  imported_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_statement_school ON bank_statement(school_id);

-- 2. Transaction bancaire (ligne du releve)
CREATE TABLE IF NOT EXISTS bank_transaction (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  statement_id  UUID REFERENCES bank_statement(id) ON DELETE CASCADE,
  txn_date      DATE,
  label         TEXT,
  amount        NUMERIC(14,2) DEFAULT 0,
  direction     TEXT NOT NULL DEFAULT 'debit' CHECK (direction IN ('debit','credit')),
  account_id    UUID REFERENCES finance_account(id),
  matched_payment_id UUID,
  status        TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','categorized','posted','ignored')),
  raw_ref       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_txn_school ON bank_transaction(school_id);
CREATE INDEX IF NOT EXISTS idx_bank_txn_statement ON bank_transaction(statement_id);

-- 3. Regles de categorisation (mot-cle -> compte), par ecole, configurable
CREATE TABLE IF NOT EXISTS bank_categorization_rule (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  pattern     TEXT NOT NULL,
  match_type  TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains','regex')),
  direction   TEXT DEFAULT 'debit' CHECK (direction IN ('debit','credit')),
  account_id  UUID REFERENCES finance_account(id),
  priority    INTEGER DEFAULT 100,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_rule_school ON bank_categorization_rule(school_id);

-- 4. Cloture mensuelle
CREATE TABLE IF NOT EXISTS finance_month_close (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open','closed')),
  closed_at     TIMESTAMPTZ DEFAULT NOW(),
  closed_by     UUID REFERENCES profiles(id),
  UNIQUE (school_id, academic_year, month)
);
CREATE INDEX IF NOT EXISTS idx_finance_month_close_school ON finance_month_close(school_id, academic_year);

-- 5. RLS
ALTER TABLE bank_statement          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transaction        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_categorization_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_month_close     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_read_own_school" ON bank_statement;
CREATE POLICY "finance_read_own_school" ON bank_statement FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS "finance_read_own_school" ON bank_transaction;
CREATE POLICY "finance_read_own_school" ON bank_transaction FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS "finance_read_own_school" ON bank_categorization_rule;
CREATE POLICY "finance_read_own_school" ON bank_categorization_rule FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_month_close;
CREATE POLICY "finance_read_own_school" ON finance_month_close FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

-- ============================================================
-- FIN -- Phase 4. Les transactions debit "postees" ecrivent dans
-- finance_ledger_entry (source_type='expense') et alimentent la matrice.
-- ============================================================
