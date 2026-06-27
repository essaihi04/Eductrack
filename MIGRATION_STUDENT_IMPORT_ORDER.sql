-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  MIGRATION : ordre d'affichage des élèves verrouillé sur le fichier     ║
-- ║  Excel d'import (position « N° » dans le fichier Massar / KoolSchool).  ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor (idempotent).             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- Position 1-based de l'élève dans le fichier importé. Re-synchronisée à chaque
-- (ré)import par /api/admin/students/import, y compris pour les élèves existants
-- → la liste « Gestion des classes » garde EXACTEMENT l'ordre du fichier, même
-- après une mise à jour répétée. Le tri applicatif est : class_id, import_order,
-- created_at (repli pour les élèves importés avant cette migration).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS import_order INTEGER;

-- Index pour accélérer le tri par classe + position.
CREATE INDEX IF NOT EXISTS idx_profiles_class_import_order
  ON profiles (class_id, import_order);
