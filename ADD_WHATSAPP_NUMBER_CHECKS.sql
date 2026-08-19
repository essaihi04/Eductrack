-- ============================================================================
-- Cache « ce numéro existe-t-il sur WhatsApp ? »
--
-- Envoyer à des numéros qui ne sont pas sur WhatsApp est l'un des signaux les
-- plus lourds du classement anti-spam de Meta : un humain n'écrit pas à des
-- comptes inexistants, un automate qui déverse une liste importée si.
--
-- Les numéros de parents sont saisis à la main (fautes de frappe, lignes
-- fixes, numéros résiliés). On interroge WhatsApp UNE fois par numéro et on
-- garde la réponse ici : interroger en rafale serait lui-même un signal
-- (énumération de contacts).
--
-- Table partagée entre écoles : un numéro existe sur WhatsApp ou non,
-- indépendamment de l'établissement qui écrit.
--
-- À exécuter dans l'éditeur SQL de Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_number_checks (
  phone_e164          text PRIMARY KEY,
  exists_on_whatsapp  boolean NOT NULL,
  checked_at          timestamptz NOT NULL DEFAULT now()
);

-- Les numéros « absents » sont réinterrogés au bout de 60 jours (un parent
-- peut installer WhatsApp après coup) ; les numéros valides ne le sont jamais.
CREATE INDEX IF NOT EXISTS idx_wa_number_checks_negative
  ON public.whatsapp_number_checks(checked_at)
  WHERE exists_on_whatsapp = false;

ALTER TABLE public.whatsapp_number_checks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.whatsapp_number_checks TO service_role;

-- ── Vérification ────────────────────────────────────────────────────────────
-- SELECT exists_on_whatsapp, count(*) FROM whatsapp_number_checks GROUP BY 1;
