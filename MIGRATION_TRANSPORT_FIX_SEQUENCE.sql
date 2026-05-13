-- ============================================================================
-- HOTFIX : permission denied for sequence bus_positions_id_seq
-- Le rôle service_role n'a pas USAGE sur la séquence créée par BIGSERIAL.
-- ============================================================================

GRANT USAGE, SELECT ON SEQUENCE public.bus_positions_id_seq TO service_role, authenticated, anon;

-- Idempotent : on accorde aussi sur les autres séquences du module au cas où
DO $$
DECLARE seq_name TEXT;
BEGIN
  FOR seq_name IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S' AND n.nspname = 'public'
      AND c.relname IN ('bus_positions_id_seq')
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role, authenticated, anon', seq_name);
  END LOOP;
END $$;
