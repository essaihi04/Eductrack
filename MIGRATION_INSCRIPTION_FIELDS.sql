-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : champs « fiche d'inscription » (façon Massar / Koolskool)  ║
-- ║  Élève (profiles role=student) + parents (profiles role=parent).        ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor (idempotent).             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── Élève ───────────────────────────────────────────────────────────────
-- (gender, birth_place, date_of_birth, massar_code, avatar_url, phone
--  existent déjà — cf. MIGRATION_STUDENT_FIELDS.sql / MIGRATION_BULLETINS.sql)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name_ar      TEXT;     -- الاسم الشخصي
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name_ar       TEXT;     -- الاسم العائلي
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS registration_number TEXT;    -- N° matricule interne (ex: 2025_000091)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS entry_date         DATE;     -- Date d'entrée à l'école
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level              TEXT;     -- Niveau saisi (ex: 1APIC)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dossier_status     TEXT;     -- 'complet' | 'incomplet'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cin                TEXT;     -- CIN (élève ou parent selon le profil)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS previous_school    TEXT;     -- Établissement fréquenté l'an dernier
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS previous_class     TEXT;     -- Classe précédente
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_health_issue   BOOLEAN DEFAULT false;  -- Problème de santé ?
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS health_notes       TEXT;     -- Détails médicaux
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_authorized   BOOLEAN;  -- Autorisation d'utiliser la photo
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_address       TEXT;     -- Adresse du domicile
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS quartier           TEXT;     -- Quartier / الحي
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_phone         TEXT;     -- Téléphone du domicile

-- ─── Parents (réutilisés via parent_students) ────────────────────────────
-- cin déjà ajouté ci-dessus (colonne partagée profiles).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profession         TEXT;     -- Profession du parent
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marital_status     TEXT;     -- Situation familiale
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address            TEXT;     -- Adresse du parent

-- La relation parent↔élève (père/mère/tuteur) est déjà stockée dans
-- parent_students.relationship — rien à ajouter.
