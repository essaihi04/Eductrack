-- Add parent role support + parent↔student association + parent contacts

-- 1) Extend profiles.role check constraint to include 'parent'
-- NOTE: The constraint name may differ in your DB. If this fails, check the exact constraint name in Supabase.
-- Common approach: drop + recreate the constraint.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'teacher'::text, 'student'::text, 'parent'::text]));

-- 2) Parent ↔ Student association (many-to-many)
CREATE TABLE IF NOT EXISTS public.parent_students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  student_id uuid NOT NULL,
  relationship text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT parent_students_pkey PRIMARY KEY (id),
  CONSTRAINT parent_students_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT parent_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT parent_students_unique UNIQUE (parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_students_parent_id ON public.parent_students(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student_id ON public.parent_students(student_id);

-- 3) Parent contacts (WhatsApp phone)
CREATE TABLE IF NOT EXISTS public.parent_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  is_primary boolean NOT NULL DEFAULT false,
  consent_status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT parent_contacts_pkey PRIMARY KEY (id),
  CONSTRAINT parent_contacts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT parent_contacts_unique UNIQUE (parent_id, phone_e164, channel)
);

CREATE INDEX IF NOT EXISTS idx_parent_contacts_parent_id ON public.parent_contacts(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_contacts_phone ON public.parent_contacts(phone_e164);
