-- Traçabilité du canal utilisé pour chaque rapport envoyé (push gratuit /
-- WhatsApp payant / opt-out) → permet de mesurer l'adoption de l'app et le
-- coût WhatsApp réel par école.
--
-- L'opt-out WhatsApp lui-même est stocké dans parent_contacts.consent_status
-- ('opted_out'), colonne déjà existante.

ALTER TABLE daily_reports  ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE weekly_reports ADD COLUMN IF NOT EXISTS channel TEXT;
