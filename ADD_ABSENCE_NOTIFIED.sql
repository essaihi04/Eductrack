-- Gestion fine des notifications de présence/absence aux parents.
-- À exécuter une fois dans Supabase (SQL Editor).

-- Absence déjà notifiée pour cette séance (évite les doublons)
ALTER TABLE public.session_tracking
  ADD COLUMN IF NOT EXISTS absence_notified BOOLEAN NOT NULL DEFAULT FALSE;

-- Présence (arrivée) déjà notifiée pour cette séance / ce jour
ALTER TABLE public.session_tracking
  ADD COLUMN IF NOT EXISTS presence_notified BOOLEAN NOT NULL DEFAULT FALSE;
