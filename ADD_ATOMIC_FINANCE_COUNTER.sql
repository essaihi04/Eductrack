-- ============================================================
-- Numérotation ATOMIQUE des factures / reçus (finance_counters)
-- ============================================================
-- Problème : le backend faisait lecture PUIS update du compteur. Deux
-- encaissements simultanés (deux caissiers, paiement famille en parallèle…)
-- lisaient la même valeur → même numéro de reçu → violation de
-- UNIQUE(school_id, receipt_number) → erreur 500, paiement rejeté.
--
-- Cette fonction incrémente et renvoie le compteur en UNE seule instruction
-- (INSERT … ON CONFLICT … RETURNING) : deux appels concurrents obtiennent
-- forcément deux numéros distincts.
--
-- À exécuter UNE FOIS dans Supabase → SQL Editor.
-- Le backend l'utilise via RPC, avec repli sur l'ancien chemin si absente.

CREATE OR REPLACE FUNCTION next_finance_counter(
  p_school_id UUID,
  p_counter_type TEXT,
  p_year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO finance_counters (school_id, counter_type, year, last_value)
  VALUES (p_school_id, p_counter_type, p_year, 1)
  ON CONFLICT (school_id, counter_type, year)
  DO UPDATE SET last_value = finance_counters.last_value + 1,
                updated_at = NOW()
  RETURNING last_value INTO v_next;
  RETURN v_next;
END;
$$;

-- La fonction n'est appelée que par le backend (service_role).
REVOKE ALL ON FUNCTION next_finance_counter(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_finance_counter(UUID, TEXT, INTEGER) TO service_role;
