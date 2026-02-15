-- Ajouter le type 'control_scheduled' au CHECK constraint de la table notifications

-- 1. Supprimer l'ancien CHECK constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- 2. Ajouter le nouveau CHECK constraint avec 'control_scheduled'
ALTER TABLE notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('homework', 'grade', 'message', 'system', 'control_scheduled'));

-- 3. Vérifier les contraintes de la table
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
JOIN pg_class cl ON cl.oid = c.conrelid
WHERE cl.relname = 'notifications'
  AND c.contype = 'c';
