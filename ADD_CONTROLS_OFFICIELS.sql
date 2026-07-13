-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : contrôles officiels (cadre marocain) + semestre           ║
-- ║                                                                        ║
-- ║  Cadre de référence : mémorandum ministériel 080/21 (MEN) —            ║
-- ║   • 2 فروض صفية (contrôles en classe) par matière et par أسدس          ║
-- ║   • 1 فرض موحد (contrôle unifié établissement) par أسدس, SAUF au       ║
-- ║     semestre 2 des années certifiantes (6AP, 3AC, 1BAC, 2BAC)          ║
-- ║                                                                        ║
-- ║  Colonnes ajoutées à controls_plan :                                   ║
-- ║   • semester      : 1 ou 2 (أسدس)                                      ║
-- ║   • control_type  : official | unified | simile | custom               ║
-- ║   • official_key  : identifiant du contrôle officiel (s1_f1, s1_f2,    ║
-- ║     s1_unified, s2_f1…) — sert à l'idempotence de la génération auto   ║
-- ║                                                                        ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.controls_plan
  ADD COLUMN IF NOT EXISTS semester     SMALLINT CHECK (semester IN (1, 2)),
  ADD COLUMN IF NOT EXISTS control_type TEXT DEFAULT 'custom'
    CHECK (control_type IN ('official', 'unified', 'simile', 'custom')),
  ADD COLUMN IF NOT EXISTS official_key TEXT;

-- Backfill du semestre depuis la date (calendrier MEN : S1 = sept → mi-janv,
-- S2 = mi-janv → juin). Janvier est rattaché au S1 (fin d'أسدس 1).
UPDATE public.controls_plan
SET semester = CASE
  WHEN EXTRACT(MONTH FROM date) >= 9 OR EXTRACT(MONTH FROM date) = 1 THEN 1
  ELSE 2
END
WHERE semester IS NULL AND date IS NOT NULL;

-- Un contrôle officiel donné (ex : s1_f1) ne peut exister qu'une fois par
-- classe × matière — garantit l'idempotence de la génération automatique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_controls_plan_official_unique
  ON public.controls_plan(class_id, subject_id, official_key)
  WHERE official_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_controls_plan_semester ON public.controls_plan(semester);
