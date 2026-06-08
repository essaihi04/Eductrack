-- Empêche l'envoi en double de la notification d'absence aux parents.
-- À exécuter une fois dans Supabase (SQL Editor).

ALTER TABLE public.session_tracking
  ADD COLUMN IF NOT EXISTS absence_notified BOOLEAN NOT NULL DEFAULT FALSE;
