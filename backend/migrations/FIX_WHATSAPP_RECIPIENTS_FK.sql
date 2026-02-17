-- Fix foreign key constraint on whatsapp_message_recipients to allow CASCADE on delete/update
-- This prevents errors when deleting or updating parent profiles

-- Drop the existing foreign key constraint
ALTER TABLE whatsapp_message_recipients 
DROP CONSTRAINT IF EXISTS whatsapp_message_recipients_parent_id_fkey;

-- Recreate the constraint with CASCADE
ALTER TABLE whatsapp_message_recipients 
ADD CONSTRAINT whatsapp_message_recipients_parent_id_fkey 
FOREIGN KEY (parent_id) 
REFERENCES profiles(id) 
ON DELETE CASCADE 
ON UPDATE CASCADE;

-- Also check and fix the message_id foreign key if needed
ALTER TABLE whatsapp_message_recipients 
DROP CONSTRAINT IF EXISTS whatsapp_message_recipients_message_id_fkey;

ALTER TABLE whatsapp_message_recipients 
ADD CONSTRAINT whatsapp_message_recipients_message_id_fkey 
FOREIGN KEY (message_id) 
REFERENCES whatsapp_messages(id) 
ON DELETE CASCADE 
ON UPDATE CASCADE;
