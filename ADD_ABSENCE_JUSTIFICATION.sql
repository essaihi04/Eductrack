-- Suivi des absences : statut « vue » par le parent + justification.
-- À exécuter une fois dans Supabase (SQL Editor).
--
-- Ces colonnes alimentent l'onglet « Élèves absents » :
--  - seen_by_parent / seen_at : le parent a-t-il vu l'absence (WhatsApp lu OU
--    notification in-app lue). Réglable manuellement en attendant l'automatisation.
--  - justified            : NULL = non traité, TRUE = justifiée, FALSE = non justifiée.
--  - justification_comment: motif de la justification (saisi ou résumé par l'IA).
--  - justification_source : 'manual' | 'whatsapp' | 'app' | 'ai'.

ALTER TABLE public.session_tracking
  ADD COLUMN IF NOT EXISTS seen_by_parent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.session_tracking
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

ALTER TABLE public.session_tracking
  ADD COLUMN IF NOT EXISTS justified BOOLEAN;

ALTER TABLE public.session_tracking
  ADD COLUMN IF NOT EXISTS justification_comment TEXT;

ALTER TABLE public.session_tracking
  ADD COLUMN IF NOT EXISTS justification_source TEXT
    CHECK (justification_source IN ('manual', 'whatsapp', 'app', 'ai'));

-- Accélère la recherche des absences par état.
CREATE INDEX IF NOT EXISTS idx_session_tracking_presence
  ON public.session_tracking(presence);
