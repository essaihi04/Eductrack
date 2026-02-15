-- Add wasender_api_key column to schools table
-- Each school can have its own Wasender API key for WhatsApp integration
ALTER TABLE schools ADD COLUMN IF NOT EXISTS wasender_api_key TEXT DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN schools.wasender_api_key IS 'Wasender Personal Access Token (PAT) for this school WhatsApp integration';
