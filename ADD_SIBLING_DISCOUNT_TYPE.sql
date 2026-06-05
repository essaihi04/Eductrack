-- Réduction fratrie : permettre un montant fixe (DH) en plus du pourcentage.
-- À exécuter une fois dans Supabase (SQL Editor).

ALTER TABLE public.student_fee_plans
  ADD COLUMN IF NOT EXISTS sibling_discount_type TEXT NOT NULL DEFAULT 'percent'
    CHECK (sibling_discount_type IN ('percent', 'amount'));

ALTER TABLE public.student_fee_plans
  ADD COLUMN IF NOT EXISTS sibling_discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
