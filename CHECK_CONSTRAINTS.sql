-- Vérifier toutes les contraintes CHECK sur la table session_tracking
SELECT conname, pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'session_tracking'::regclass
AND contype = 'c';
