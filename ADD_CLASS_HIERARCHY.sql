-- Add school_type and filiere columns to classes table for hierarchical organization
-- school_type: 'college' or 'lycee'
-- filiere: track/branch (e.g. 'sciences_exp', 'eco', 'pc', 'svt', etc.)

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS school_type TEXT;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS filiere TEXT;

-- Index for efficient grouping queries
CREATE INDEX IF NOT EXISTS idx_classes_school_type ON public.classes(school_type);
CREATE INDEX IF NOT EXISTS idx_classes_filiere ON public.classes(filiere);
