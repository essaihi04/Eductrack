-- Fix the notifications_type_check constraint to include 'document' type

-- First, check the current constraint
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'notifications'::regclass
  AND contype = 'c'
  AND conname = 'notifications_type_check';

-- Drop the old constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add the updated constraint with 'document' type included
ALTER TABLE notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('homework', 'grade', 'message', 'system', 'document', 'control_scheduled'));

-- Verify the constraint was updated
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'notifications'::regclass
  AND contype = 'c'
  AND conname = 'notifications_type_check';
