-- Permettre de cibler plusieurs élèves par signalement.
-- À exécuter une fois dans Supabase (SQL Editor).

CREATE TABLE IF NOT EXISTS public.issue_report_students (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    uuid NOT NULL REFERENCES public.issue_reports(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (issue_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_irs_issue ON public.issue_report_students(issue_id);
CREATE INDEX IF NOT EXISTS idx_irs_student ON public.issue_report_students(student_id);

ALTER TABLE public.issue_report_students DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.issue_report_students TO service_role;

-- Reprise des signalements déjà ciblés sur un seul élève (related_student)
INSERT INTO public.issue_report_students (issue_id, student_id)
SELECT id, related_student FROM public.issue_reports
WHERE related_student IS NOT NULL
ON CONFLICT (issue_id, student_id) DO NOTHING;
