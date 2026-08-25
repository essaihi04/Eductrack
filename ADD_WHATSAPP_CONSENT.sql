-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  CONSENTEMENT WHATSAPP TRAÇABLE (parent_contacts)                     ║
-- ║                                                                      ║
-- ║  Meta exige de pouvoir PROUVER qu'un destinataire a accepté de        ║
-- ║  recevoir des messages. La colonne consent_status existait déjà       ║
-- ║  ('pending' | 'opted_in' | 'opted_out') mais rien n'enregistrait      ║
-- ║  QUAND ni COMMENT le consentement avait été donné.                    ║
-- ║                                                                      ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.parent_contacts
  ADD COLUMN IF NOT EXISTS consent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_source TEXT;

COMMENT ON COLUMN public.parent_contacts.consent_at IS
  'Date du dernier changement de consentement (opt-in à l''inscription, STOP/START par WhatsApp).';
COMMENT ON COLUMN public.parent_contacts.consent_source IS
  'Origine : inscription | whatsapp_stop | whatsapp_start | admin.';

-- Les contacts déjà marqués opted_in/opted_out sans date gardent au moins une
-- trace approximative : celle de leur création.
UPDATE public.parent_contacts
   SET consent_at = created_at,
       consent_source = COALESCE(consent_source, 'admin')
 WHERE consent_at IS NULL
   AND consent_status IN ('opted_in', 'opted_out');

-- Lecture rapide du taux de consentement par école (jointure via profiles).
CREATE INDEX IF NOT EXISTS idx_parent_contacts_consent
  ON public.parent_contacts(channel, consent_status);

-- ─── Vérification ────────────────────────────────────────────────────────
SELECT consent_status, count(*) AS contacts
  FROM public.parent_contacts
 WHERE channel = 'whatsapp'
 GROUP BY consent_status
 ORDER BY contacts DESC;
