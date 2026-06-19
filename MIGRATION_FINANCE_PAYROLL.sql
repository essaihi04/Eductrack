-- ============================================================
-- MIGRATION: Comptabilite de gestion -- Phase 2 (Paie)
-- Employes + bulletins de paie mensuels + grand livre unifie.
-- 100% statements simples (aucune fonction / aucun bloc DO).
-- A executer dans Supabase SQL Editor (idempotent).
-- Prerequis : MIGRATION_FINANCE_ACCOUNTING.sql
-- ============================================================

-- 1. Employes
CREATE TABLE IF NOT EXISTS finance_employee (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  profile_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  full_name     TEXT NOT NULL,
  role_label    TEXT,
  employment_type TEXT NOT NULL DEFAULT 'permanent' CHECK (employment_type IN ('permanent','vacataire')),
  base_salary   NUMERIC(14,2) NOT NULL DEFAULT 0,
  cnss_number   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_employee_school ON finance_employee(school_id);

-- 2. Bulletin de paie mensuel (run)
CREATE TABLE IF NOT EXISTS finance_payroll_run (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year  TEXT NOT NULL,
  year           INTEGER NOT NULL,
  month          INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  total_salary   NUMERIC(14,2) DEFAULT 0,
  total_cnss_amo NUMERIC(14,2) DEFAULT 0,
  total_ir       NUMERIC(14,2) DEFAULT 0,
  total          NUMERIC(14,2) DEFAULT 0,
  note           TEXT,
  posted_at      TIMESTAMPTZ,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_finance_payroll_run_school ON finance_payroll_run(school_id, academic_year);

-- 3. Lignes du bulletin (par employe)
CREATE TABLE IF NOT EXISTS finance_payroll_line (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id        UUID NOT NULL REFERENCES finance_payroll_run(id) ON DELETE CASCADE,
  employee_id   UUID REFERENCES finance_employee(id) ON DELETE SET NULL,
  employee_name TEXT,
  salary        NUMERIC(14,2) DEFAULT 0,
  cnss_amo      NUMERIC(14,2) DEFAULT 0,
  ir            NUMERIC(14,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_payroll_line_run ON finance_payroll_line(run_id);

-- 4. Grand livre unifie : la paie (et plus tard prets/impots) ecrivent ici.
--    La matrice agrege school_expenses UNION finance_ledger_entry par compte.
CREATE TABLE IF NOT EXISTS finance_ledger_entry (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES finance_account(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  source_type   TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('expense','payroll','loan','tax','manual')),
  source_id     UUID,
  cash_or_bank  TEXT,
  label         TEXT,
  entry_date    DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_lookup ON finance_ledger_entry(school_id, academic_year, account_id, month);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_source ON finance_ledger_entry(source_type, source_id);

-- 5. RLS (lecture ecole courante ; ecritures via backend service_role)
ALTER TABLE finance_employee     ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_payroll_run  ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_payroll_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_ledger_entry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_employee;
CREATE POLICY "finance_read_own_school" ON finance_employee FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_payroll_run;
CREATE POLICY "finance_read_own_school" ON finance_payroll_run FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_ledger_entry;
CREATE POLICY "finance_read_own_school" ON finance_ledger_entry FOR SELECT
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_payroll_line;
CREATE POLICY "finance_read_own_school" ON finance_payroll_line FOR SELECT
  USING (run_id IN (SELECT id FROM finance_payroll_run
                    WHERE school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()))
         OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin');

-- ============================================================
-- FIN -- Phase 2 (Paie). La matrice unira finance_ledger_entry aux depenses.
-- ============================================================
