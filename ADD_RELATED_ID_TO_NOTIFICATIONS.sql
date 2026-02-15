-- Ajouter la colonne related_id à la table notifications

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_id UUID;

-- Vérifier que la colonne a été ajoutée
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND column_name = 'related_id';
