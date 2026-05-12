-- ============================================================
-- MIGRATION: Module Finance pour Eductrack
-- Rôle: finance_manager + Modèles de frais + Factures + Paiements + Dépenses
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- 1. Étendre le check de rôle sur profiles pour inclure 'finance_manager'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'profiles' AND constraint_name = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'teacher', 'student', 'super_admin', 'school_admin', 'finance_manager', 'parent'));

-- ============================================================
-- 2. MODÈLES DE FRAIS (réutilisables)
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  academic_year TEXT NOT NULL,
  level TEXT,
  school_type TEXT,
  currency TEXT DEFAULT 'MAD',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_templates_school ON fee_templates(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_templates_year ON fee_templates(academic_year);

-- Items composant un modèle
CREATE TABLE IF NOT EXISTS fee_template_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES fee_templates(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'registration', 'tuition', 'transport', 'canteen',
    'insurance', 'activity', 'supplies', 'uniform', 'other'
  )),
  name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  recurrence TEXT NOT NULL CHECK (recurrence IN ('one_time', 'monthly', 'quarterly', 'annual')),
  due_month INTEGER CHECK (due_month BETWEEN 1 AND 12),
  start_month INTEGER DEFAULT 9 CHECK (start_month BETWEEN 1 AND 12),
  end_month INTEGER DEFAULT 6 CHECK (end_month BETWEEN 1 AND 12),
  is_optional BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_template_items_template ON fee_template_items(template_id);

-- ============================================================
-- 3. PLANS DE FRAIS PAR ÉLÈVE (avec ajustements individuels)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_fee_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id UUID REFERENCES fee_templates(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL,
  sibling_discount_percent NUMERIC(5, 2) DEFAULT 0 CHECK (sibling_discount_percent >= 0 AND sibling_discount_percent <= 100),
  scholarship_amount NUMERIC(12, 2) DEFAULT 0,
  custom_notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_student_fee_plans_school ON student_fee_plans(school_id);
CREATE INDEX IF NOT EXISTS idx_student_fee_plans_student ON student_fee_plans(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fee_plans_year ON student_fee_plans(academic_year);

-- Items personnalisés (overrides ou ajouts au modèle)
CREATE TABLE IF NOT EXISTS student_fee_plan_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES student_fee_plans(id) ON DELETE CASCADE,
  source_template_item_id UUID REFERENCES fee_template_items(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'registration', 'tuition', 'transport', 'canteen',
    'insurance', 'activity', 'supplies', 'uniform', 'other'
  )),
  name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  recurrence TEXT NOT NULL CHECK (recurrence IN ('one_time', 'monthly', 'quarterly', 'annual')),
  due_month INTEGER CHECK (due_month BETWEEN 1 AND 12),
  start_month INTEGER DEFAULT 9,
  end_month INTEGER DEFAULT 6,
  is_optional BOOLEAN DEFAULT false,
  enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_fee_plan_items_plan ON student_fee_plan_items(plan_id);

-- ============================================================
-- 4. COMPTEURS (numérotation factures & reçus)
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  counter_type TEXT NOT NULL CHECK (counter_type IN ('invoice', 'receipt')),
  year INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, counter_type, year)
);

-- ============================================================
-- 5. FACTURES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES student_fee_plans(id) ON DELETE SET NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  period_label TEXT,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_due NUMERIC(12, 2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled')),
  currency TEXT DEFAULT 'MAD',
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES profiles(id),
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_school ON invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- Lignes de facture
CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- ============================================================
-- 6. PAIEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL CHECK (method IN ('cash', 'check', 'transfer', 'card_pos', 'other')),
  reference TEXT,
  notes TEXT,
  status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES profiles(id),
  cancellation_reason TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_payments_school ON payments(school_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

-- ============================================================
-- 7. DÉPENSES ÉCOLE (admin only)
-- ============================================================
CREATE TABLE IF NOT EXISTS school_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'salaries', 'rent', 'utilities', 'supplies', 'maintenance',
    'equipment', 'marketing', 'taxes', 'insurance', 'transport', 'other'
  )),
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_to TEXT,
  payment_method TEXT CHECK (payment_method IN ('cash', 'check', 'transfer', 'card', 'other')),
  reference TEXT,
  attachment_url TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_expenses_school ON school_expenses(school_id);
CREATE INDEX IF NOT EXISTS idx_school_expenses_date ON school_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_school_expenses_category ON school_expenses(category);

-- ============================================================
-- 8. FONCTION : Mettre à jour le statut de la facture sur paiement
-- ============================================================
CREATE OR REPLACE FUNCTION update_invoice_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_total_paid NUMERIC(12, 2);
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payments
  WHERE invoice_id = NEW.invoice_id AND status = 'confirmed';

  SELECT * INTO v_invoice FROM invoices WHERE id = NEW.invoice_id;

  UPDATE invoices
  SET
    amount_paid = v_total_paid,
    status = CASE
      WHEN v_total_paid >= v_invoice.total THEN 'paid'
      WHEN v_total_paid > 0 THEN 'partial'
      WHEN v_invoice.due_date < CURRENT_DATE THEN 'overdue'
      ELSE 'issued'
    END,
    updated_at = NOW()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_update_invoice ON payments;
CREATE TRIGGER trg_payment_update_invoice
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION update_invoice_status_on_payment();

-- ============================================================
-- 9. RLS POLICIES (Row Level Security)
-- ============================================================
ALTER TABLE fee_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fee_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fee_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_counters ENABLE ROW LEVEL SECURITY;

-- Service role bypasse RLS par défaut (backend utilise service_role key)
-- Ces policies sont pour l'accès direct depuis le frontend si nécessaire

DROP POLICY IF EXISTS "finance_read_own_school" ON fee_templates;
CREATE POLICY "finance_read_own_school" ON fee_templates FOR SELECT
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  );

DROP POLICY IF EXISTS "finance_read_own_school" ON invoices;
CREATE POLICY "finance_read_own_school" ON invoices FOR SELECT
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR student_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  );

DROP POLICY IF EXISTS "finance_read_own_school" ON payments;
CREATE POLICY "finance_read_own_school" ON payments FOR SELECT
  USING (
    school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid())
    OR student_id = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  );

-- Notification: tous les autres accès (insert/update/delete) passent par le backend avec service_role
