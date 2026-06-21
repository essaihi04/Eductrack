-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION v2 : édition élève + sections étendues (façon Koolskool)     ║
-- ║  Documents inscriptions, informations supplémentaires, contact parent.  ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor (idempotent).             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── Élève : informations supplémentaires ────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nationality          TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country              TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_staff_child       BOOLEAN;   -- Enfant du personnel
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_partner_group     BOOLEAN;   -- Groupe partenaire
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_expat             BOOLEAN;   -- Expatrié
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS had_accompaniment    BOOLEAN;   -- A déjà fait l'objet d'un accompagnement
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_transport        BOOLEAN;   -- Transport scolaire
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reinscription_date   DATE;      -- Date de réinscription
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS origin_school        TEXT;      -- Établissement d'origine

-- ─── Élève : documents du dossier + signature ────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS inscription_documents JSONB;    -- { livret_famille:bool, carnet_vaccination:bool, ... }
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS inscription_signature TEXT;     -- Signature électronique

-- ─── Parents : contact enrichi ───────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS professional_phone   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS professional_address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS matricule            TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_vip               BOOLEAN;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_payment_responsible BOOLEAN;

-- ─── Lien parent ↔ élève : rôles ─────────────────────────────────────────
ALTER TABLE parent_students ADD COLUMN IF NOT EXISTS is_emergency_contact  BOOLEAN;  -- Personne à contacter en urgence
ALTER TABLE parent_students ADD COLUMN IF NOT EXISTS is_pickup_authorized  BOOLEAN;  -- Autorisé à récupérer l'enfant
