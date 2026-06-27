-- ───────────────────────────────────────────────────────────────────────────
-- Table teacher_documents
--
-- Pièces administratives du dossier d'un enseignant (CIN, diplôme, contrat,
-- CV…), ajoutées depuis la fiche prof (module pédagogique / admin).
--
-- Distinct de la table `documents` (supports de cours partagés aux élèves) et
-- de `finance_employee_document` (dossier RH/paie). Les fichiers sont stockés
-- dans le bucket privé Supabase et servis via URLs signées temporaires, comme
-- les documents RH sensibles.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doc_type    text NOT NULL DEFAULT 'other',
  label       text,
  file_url    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teacher_documents_teacher
  ON public.teacher_documents (teacher_id);

CREATE INDEX IF NOT EXISTS idx_teacher_documents_school
  ON public.teacher_documents (school_id);
