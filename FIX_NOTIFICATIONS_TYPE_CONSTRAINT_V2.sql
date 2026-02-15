-- Fix the notifications_type_check constraint to include 'document' type
-- This version handles existing rows that violate the constraint

-- Step 1: Check current constraint
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'notifications'::regclass
  AND contype = 'c'
  AND conname = 'notifications_type_check';

-- Step 2: Check for existing notifications with invalid types
SELECT 
  type,
  COUNT(*) as count
FROM notifications
WHERE type NOT IN ('homework', 'grade', 'message', 'system', 'document', 'control_scheduled')
GROUP BY type;

-- Step 3: Delete notifications with invalid types (if any)
DELETE FROM notifications
WHERE type NOT IN ('homework', 'grade', 'message', 'system', 'document', 'control_scheduled');

-- Step 4: Drop the old constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Step 5: Add the updated constraint with 'document' type included
ALTER TABLE notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('homework', 'grade', 'message', 'system', 'document', 'control_scheduled'));

-- Step 6: Verify the constraint was updated
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'notifications'::regclass
  AND contype = 'c'
  AND conname = 'notifications_type_check';

-- Step 7: Verify all notifications now have valid types
SELECT 
  type,
  COUNT(*) as count
FROM notifications
GROUP BY type
ORDER BY type;
