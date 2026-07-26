-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PRISE DE RENDEZ-VOUS PAR LES PARENTS (app + WhatsApp)                   ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║  Le parent demande un rendez-vous avec :                                 ║
-- ║    • l'ADMINISTRATION  → le staff fixe l'horaire                          ║
-- ║    • un PROFESSEUR     → le prof propose un créneau (app ou WhatsApp),   ║
-- ║                          un membre du staff l'accorde                     ║
-- ║                                                                           ║
-- ║  Dans TOUS les cas la confirmation finale vient du staff de l'école,     ║
-- ║  puis le parent est notifié automatiquement (push app sinon WhatsApp).   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Demandes de rendez-vous
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year TEXT,

  -- Demandeur + enfant concerné (sert au routage vers le responsable pédagogique)
  parent_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  class_id   UUID REFERENCES public.classes(id) ON DELETE SET NULL,

  -- Cible du rendez-vous
  target_type TEXT NOT NULL DEFAULT 'administration'
    CHECK (target_type IN ('administration', 'teacher')),
  teacher_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Contenu de la demande
  subject        TEXT NOT NULL,          -- objet du rendez-vous
  message        TEXT,                   -- détail libre du parent
  preferred_slot TEXT,                   -- souhait du parent, texte libre ("jeudi matin")

  status TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (status IN ('en_attente', 'propose', 'confirme', 'refuse', 'annule', 'termine')),

  -- Créneau proposé par le professeur (en attente d'accord du staff)
  proposed_at   TIMESTAMPTZ,
  proposed_note TEXT,
  proposed_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Créneau final accordé par le staff
  scheduled_at     TIMESTAMPTZ,
  duration_minutes INT DEFAULT 30,
  location         TEXT,

  -- Qui a tranché (staff)
  decided_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,

  -- Traçabilité de la notification envoyée au parent
  source                TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'whatsapp')),
  parent_notified_at    TIMESTAMPTZ,
  parent_notify_channel TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Un rendez-vous « professeur » doit désigner un professeur
  CONSTRAINT appt_teacher_required CHECK (
    target_type <> 'teacher' OR teacher_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_appt_school   ON public.appointment_requests(school_id, status);
CREATE INDEX IF NOT EXISTS idx_appt_parent   ON public.appointment_requests(parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appt_teacher  ON public.appointment_requests(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_appt_class    ON public.appointment_requests(class_id);
CREATE INDEX IF NOT EXISTS idx_appt_sched    ON public.appointment_requests(scheduled_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Journal des actions (qui a demandé / proposé / accordé / refusé)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointment_requests(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role TEXT,
  action     TEXT NOT NULL,   -- created | proposed | confirmed | declined | cancelled | rescheduled | completed
  details    JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appt_events ON public.appointment_events(appointment_id, created_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Nouveau type de notification in-app : 'appointment'
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('homework', 'grade', 'message', 'system', 'document', 'control_scheduled', 'appointment'));

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Permissions (le backend passe par service_role, RLS désactivé comme
--    pour les autres tables applicatives du projet)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.appointment_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_events   DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_events   TO service_role;

-- Vérification
SELECT 'appointment_requests' AS table_name, COUNT(*) AS rows FROM public.appointment_requests
UNION ALL
SELECT 'appointment_events', COUNT(*) FROM public.appointment_events;
