-- ───────────────────────────────────────────────────────────────────────────
-- Table school_receptionists
--
-- Numéros WhatsApp déclarés par l'admin comme « réceptionnistes ». Un numéro
-- présent ici reçoit le chatbot IA « statistiques de l'école » (DeepSeek) au
-- lieu d'être ignoré comme numéro inconnu. Ce n'est PAS un compte applicatif :
-- pas de ligne dans auth.users ni dans profiles, juste un numéro autorisé.
--
-- Les réponses partent via la session WhatsApp déjà connectée de l'école
-- (le « numéro d'envoi »), distincte du numéro personnel de l'admin.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_receptionists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  phone_e164  text NOT NULL,
  name        text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_school_receptionist_phone UNIQUE (school_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS idx_school_receptionists_phone
  ON public.school_receptionists (phone_e164)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_school_receptionists_school
  ON public.school_receptionists (school_id);
