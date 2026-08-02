-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : plan de classe (disposition des tables + placement)      ║
-- ║                                                                        ║
-- ║  Une ligne par classe : configuration de la salle (élèves par table,  ║
-- ║  nombre de rangées, tables par rangée) et affectation des places      ║
-- ║  (assignments : { "rangée-table-siège": student_id }).                ║
-- ║                                                                        ║
-- ║  Défaut demandé : tables de 2 élèves, 4 rangées.                      ║
-- ║                                                                        ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.class_seating_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL UNIQUE REFERENCES public.classes(id) ON DELETE CASCADE,
  seats_per_table INT NOT NULL DEFAULT 2 CHECK (seats_per_table BETWEEN 1 AND 6),
  row_count INT NOT NULL DEFAULT 4 CHECK (row_count BETWEEN 1 AND 10),
  tables_per_row INT NOT NULL DEFAULT 4 CHECK (tables_per_row BETWEEN 1 AND 8),
  assignments JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_class_seating_class ON public.class_seating_plans(class_id);
CREATE INDEX IF NOT EXISTS idx_class_seating_school ON public.class_seating_plans(school_id);

-- Le backend passe exclusivement par la clé service (bypass RLS) :
-- on active RLS sans policy publique pour bloquer tout accès direct client.
ALTER TABLE public.class_seating_plans ENABLE ROW LEVEL SECURITY;
