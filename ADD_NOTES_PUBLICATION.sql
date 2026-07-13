-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : validation & publication des contrôles / notes           ║
-- ║                                                                        ║
-- ║  Les contrôles saisis par les professeurs (ou par l'administration)    ║
-- ║  ne sont visibles chez les ÉLÈVES et les PARENTS qu'une fois VALIDÉS   ║
-- ║  et PUBLIÉS par l'administration (admin / directeur / responsable      ║
-- ║  pédagogique) depuis la page « Saisie des notes ».                     ║
-- ║                                                                        ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.controls_plan
  ADD COLUMN IF NOT EXISTS published    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_controls_plan_published ON public.controls_plan(published);

-- Backfill : les contrôles déjà terminés étaient déjà visibles chez les
-- élèves/parents → on les considère publiés pour ne rien casser.
UPDATE public.controls_plan
SET published = TRUE, published_at = NOW()
WHERE status = 'completed' AND (published IS DISTINCT FROM TRUE);
