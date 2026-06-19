-- ============================================================
-- MIGRATION: Comptabilite de gestion (Plan comptable + Budget)
-- Phase 1 -- Parite "Tableau Previsionnel" (Budget vs Reel)
-- Generique et configurable pour TOUTES les ecoles.
-- 100% statements simples (aucune fonction / aucun bloc DO) :
-- compatible avec les editeurs SQL qui decoupent sur ";".
-- A executer dans Supabase SQL Editor (idempotent).
-- ============================================================

-- ============================================================
-- 1. CATALOGUE GLOBAL DES POSTES PAR DEFAUT (hors ecole)
--    Arbre canonique : sections -> lignes. Generique.
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_account_default (
  default_key        TEXT PRIMARY KEY,
  kind               TEXT NOT NULL CHECK (kind IN ('revenue','expense')),
  node_type          TEXT NOT NULL CHECK (node_type IN ('section','line')),
  parent_default_key TEXT REFERENCES finance_account_default(default_key),
  name               TEXT NOT NULL,
  revenue_stream     TEXT,
  cash_or_bank       TEXT DEFAULT 'mixed' CHECK (cash_or_bank IN ('cash','bank','mixed')),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  catalog_version    INTEGER NOT NULL DEFAULT 1
);

-- RECETTES
INSERT INTO finance_account_default (default_key, kind, node_type, parent_default_key, name, revenue_stream, cash_or_bank, sort_order) VALUES
  ('rev_sec_encaissements','revenue','section', NULL,                 'Encaissements',         NULL,        'mixed', 100),
  ('rev_tuition',          'revenue','line',    'rev_sec_encaissements','Scolarite',           'tuition',   'mixed', 101),
  ('rev_transport',        'revenue','line',    'rev_sec_encaissements','Transport',           'transport', 'mixed', 102),
  ('rev_fi',               'revenue','line',    'rev_sec_encaissements','Frais inscription',   'fi',        'mixed', 103),
  ('rev_fr',               'revenue','line',    'rev_sec_encaissements','Fournitures',         'fr',        'mixed', 104),
  ('rev_other',            'revenue','line',    'rev_sec_encaissements','Autres recettes',     'other',     'mixed', 105)
ON CONFLICT (default_key) DO UPDATE
  SET name=EXCLUDED.name, parent_default_key=EXCLUDED.parent_default_key,
      revenue_stream=EXCLUDED.revenue_stream, sort_order=EXCLUDED.sort_order;

-- DEPENSES (sections -> lignes)
INSERT INTO finance_account_default (default_key, kind, node_type, parent_default_key, name, revenue_stream, cash_or_bank, sort_order) VALUES
  ('exp_sec_payroll','expense','section', NULL,             'Masse salariale',                NULL,'mixed',200),
  ('salaries_permanent','expense','line', 'exp_sec_payroll','Salaires permanents',            NULL,'bank', 201),
  ('cnss_amo',         'expense','line',  'exp_sec_payroll','CNSS et AMO',                     NULL,'bank', 202),
  ('ir',               'expense','line',  'exp_sec_payroll','IR impot sur le revenu',         NULL,'bank', 203),
  ('exp_sec_cash','expense','section', NULL,           'Caisse interne especes',              NULL,'cash', 210),
  ('cash_misc',   'expense','line',    'exp_sec_cash', 'Depenses caisse especes',             NULL,'cash', 211),
  ('exp_sec_bank','expense','section', NULL,           'Banque',                              NULL,'bank', 220),
  ('loan_repayment','expense','line',  'exp_sec_bank', 'Remboursement pret',                  NULL,'bank', 221),
  ('leasing',       'expense','line',  'exp_sec_bank', 'Leasing',                             NULL,'bank', 222),
  ('bank_fees',     'expense','line',  'exp_sec_bank', 'Frais bancaires',                     NULL,'bank', 223),
  ('works',         'expense','line',  'exp_sec_bank', 'Travaux',                             NULL,'bank', 224),
  ('exp_sec_utilities','expense','section', NULL,              'Energie et communications',    NULL,'mixed',230),
  ('telephony',        'expense','line',    'exp_sec_utilities','Telephonie et internet',      NULL,'mixed',231),
  ('water_electricity','expense','line',    'exp_sec_utilities','Eau et electricite',          NULL,'mixed',232),
  ('exp_sec_transport','expense','section', NULL,              'Transport',                    NULL,'mixed',240),
  ('fuel_gasoil',              'expense','line','exp_sec_transport','Gasoil carburant',             NULL,'mixed',241),
  ('rolling_stock_maintenance','expense','line','exp_sec_transport','Entretien materiel roulant',   NULL,'mixed',242),
  ('vehicle_insurance',        'expense','line','exp_sec_transport','Assurances vehicules',         NULL,'mixed',243),
  ('exp_sec_premises','expense','section', NULL,              'Locaux',                        NULL,'mixed',250),
  ('rent',                'expense','line','exp_sec_premises','Loyer',                          NULL,'bank', 251),
  ('premises_maintenance','expense','line','exp_sec_premises','Entretien et reparation locaux', NULL,'mixed',252),
  ('consumables_clinic_hygiene_pharma','expense','line','exp_sec_premises','Consommables hygiene pharmacie',NULL,'mixed',253),
  ('equipment_it',        'expense','line','exp_sec_premises','Equipement et materiel info',    NULL,'mixed',254),
  ('bookstore',           'expense','line','exp_sec_premises','Librairie et fournitures',       NULL,'mixed',255),
  ('exp_sec_taxes','expense','section', NULL,            'Impots et taxes',                    NULL,'mixed',260),
  ('insurance_rc',      'expense','line','exp_sec_taxes','Assurances RC multirisque',          NULL,'bank', 261),
  ('fiduciary_fees',    'expense','line','exp_sec_taxes','Honoraires fiduciaires',             NULL,'bank', 262),
  ('is_acomptes',       'expense','line','exp_sec_taxes','IS acomptes',                        NULL,'bank', 263),
  ('stamp_duty',        'expense','line','exp_sec_taxes','Droits de timbre divers impots',     NULL,'mixed',264),
  ('taxe_pro_habitation','expense','line','exp_sec_taxes','Taxe professionnelle et habitation',NULL,'bank', 265),
  ('exp_sec_misc','expense','section', NULL,           'Divers',                              NULL,'mixed',270),
  ('misc',        'expense','line',    'exp_sec_misc', 'Divers',                              NULL,'mixed',271)
ON CONFLICT (default_key) DO UPDATE
  SET name=EXCLUDED.name, parent_default_key=EXCLUDED.parent_default_key,
      cash_or_bank=EXCLUDED.cash_or_bank, sort_order=EXCLUDED.sort_order;

-- ============================================================
-- 2. PLAN COMPTABLE PAR ECOLE (materialisation, personnalisable)
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_account (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_id      UUID REFERENCES finance_account(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('revenue','expense')),
  node_type      TEXT NOT NULL DEFAULT 'line' CHECK (node_type IN ('section','line')),
  code           TEXT,
  name           TEXT NOT NULL,
  default_key    TEXT,
  revenue_stream TEXT,
  cash_or_bank   TEXT DEFAULT 'mixed' CHECK (cash_or_bank IN ('cash','bank','mixed')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  is_system      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, default_key)
);
CREATE INDEX IF NOT EXISTS idx_finance_account_school ON finance_account(school_id);
CREATE INDEX IF NOT EXISTS idx_finance_account_parent ON finance_account(parent_id);
CREATE INDEX IF NOT EXISTS idx_finance_account_kind   ON finance_account(school_id, kind);

-- ============================================================
-- 3. BUDGET (Previsionnel) : montant par compte / mois / annee scolaire
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_budget (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  account_id    UUID NOT NULL REFERENCES finance_account(id) ON DELETE CASCADE,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, academic_year, account_id, month)
);
CREATE INDEX IF NOT EXISTS idx_finance_budget_lookup ON finance_budget(school_id, academic_year);

-- ============================================================
-- 4. ALTER non destructifs sur school_expenses
-- ============================================================
ALTER TABLE school_expenses ADD COLUMN IF NOT EXISTS account_id   UUID REFERENCES finance_account(id);
ALTER TABLE school_expenses ADD COLUMN IF NOT EXISTS cash_or_bank TEXT CHECK (cash_or_bank IN ('cash','bank'));
CREATE INDEX IF NOT EXISTS idx_school_expenses_account ON school_expenses(account_id);

-- ============================================================
-- 5. SEED ENSEMBLISTE POUR TOUTES LES ECOLES EXISTANTES
--    (Le seed des NOUVELLES ecoles est fait par le backend a la
--    premiere lecture du plan comptable -- lazy seed.)
--    Idempotent : ON CONFLICT DO NOTHING preserve les personnalisations.
-- ============================================================
-- 5a. Sections en premier (parent_id NULL)
INSERT INTO finance_account (school_id, parent_id, kind, node_type, name, default_key, revenue_stream, cash_or_bank, sort_order, is_system)
SELECT s.id, NULL, d.kind, d.node_type, d.name, d.default_key, d.revenue_stream, COALESCE(d.cash_or_bank,'mixed'), d.sort_order, true
FROM schools s
CROSS JOIN finance_account_default d
WHERE d.node_type = 'section'
ON CONFLICT (school_id, default_key) DO NOTHING;

-- 5b. Lignes ensuite (parent resolu via default_key, par ecole)
INSERT INTO finance_account (school_id, parent_id, kind, node_type, name, default_key, revenue_stream, cash_or_bank, sort_order, is_system)
SELECT s.id, parent.id, d.kind, d.node_type, d.name, d.default_key, d.revenue_stream, COALESCE(d.cash_or_bank,'mixed'), d.sort_order, true
FROM schools s
CROSS JOIN finance_account_default d
JOIN finance_account parent ON parent.school_id = s.id AND parent.default_key = d.parent_default_key
WHERE d.node_type = 'line'
ON CONFLICT (school_id, default_key) DO NOTHING;

-- ============================================================
-- 6. BACKFILL : rattacher les depenses existantes au plan comptable
--    (mapping de ancien enum -> default_key generique)
-- ============================================================
UPDATE school_expenses se
SET account_id = fa.id
FROM finance_account fa
WHERE fa.school_id = se.school_id
  AND se.account_id IS NULL
  AND fa.default_key = CASE se.category
        WHEN 'salaries'    THEN 'salaries_permanent'
        WHEN 'rent'        THEN 'rent'
        WHEN 'utilities'   THEN 'water_electricity'
        WHEN 'maintenance' THEN 'premises_maintenance'
        WHEN 'equipment'   THEN 'equipment_it'
        WHEN 'taxes'       THEN 'is_acomptes'
        WHEN 'insurance'   THEN 'insurance_rc'
        WHEN 'transport'   THEN 'fuel_gasoil'
        ELSE 'misc'
      END;

-- ============================================================
-- 7. RLS (lecture ecole courante ; ecritures via backend service_role)
-- ============================================================
ALTER TABLE finance_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_budget  ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_account_default ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_account;
CREATE POLICY "finance_read_own_school" ON finance_account FOR SELECT
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  );

DROP POLICY IF EXISTS "finance_read_own_school" ON finance_budget;
CREATE POLICY "finance_read_own_school" ON finance_budget FOR SELECT
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  );

DROP POLICY IF EXISTS "default_catalog_read" ON finance_account_default;
CREATE POLICY "default_catalog_read" ON finance_account_default FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- FIN -- Phase 1 (plan comptable + budget). Depenses = saisie manuelle.
-- Import releve bancaire (PDF) = phase ulterieure, non incluse.
-- ============================================================
