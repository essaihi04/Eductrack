-- ───────────────────────────────────────────────────────────────────────────
-- Paiement par service (modèle Koolskools)
--
-- On modélise une facture par couple (mois × service) : la colonne
-- service_category porte la catégorie de frais (tuition, transport, canteen…)
-- correspondant à la facture. Une facture historique « mois groupé » (toutes
-- catégories dans une seule facture) garde service_category = NULL.
--
-- Cela permet de payer / annuler chaque service d'un mois indépendamment, tout
-- en réutilisant le modèle existant paiement → facture (1 reçu = 1 service/mois).
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS service_category TEXT;

-- Accélère le matching (élève, période, service) fait par monthly-services-status.
CREATE INDEX IF NOT EXISTS idx_invoices_student_period_service
  ON public.invoices (student_id, period_label, service_category);
