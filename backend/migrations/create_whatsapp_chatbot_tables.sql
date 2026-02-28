-- Tables pour le système de chatbot IA WhatsApp

-- Table pour stocker les messages entrants des parents
CREATE TABLE IF NOT EXISTS whatsapp_incoming_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_e164 TEXT NOT NULL,
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  message_text TEXT,
  wasender_message_id TEXT,
  received_at TIMESTAMP DEFAULT NOW(),
  processed BOOLEAN DEFAULT false,
  ai_response_sent BOOLEAN DEFAULT false,
  ai_response_text TEXT,
  student_id UUID REFERENCES profiles(id),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour optimiser les recherches
CREATE INDEX IF NOT EXISTS idx_incoming_phone ON whatsapp_incoming_messages(phone_e164);
CREATE INDEX IF NOT EXISTS idx_incoming_parent ON whatsapp_incoming_messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_incoming_school ON whatsapp_incoming_messages(school_id);
CREATE INDEX IF NOT EXISTS idx_incoming_processed ON whatsapp_incoming_messages(processed);
CREATE INDEX IF NOT EXISTS idx_incoming_date ON whatsapp_incoming_messages(received_at DESC);

-- Table pour stocker les conversations WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  last_message_at TIMESTAMP DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour les conversations
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON whatsapp_conversations(phone_e164);
CREATE INDEX IF NOT EXISTS idx_conversations_school ON whatsapp_conversations(school_id);
CREATE INDEX IF NOT EXISTS idx_conversations_parent ON whatsapp_conversations(parent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_active ON whatsapp_conversations(is_active);

-- Ajouter une colonne webhook_url et webhook_secret à whatsapp_school_sessions si elles n'existent pas
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='whatsapp_school_sessions' 
                 AND column_name='webhook_url') THEN
    ALTER TABLE whatsapp_school_sessions ADD COLUMN webhook_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='whatsapp_school_sessions' 
                 AND column_name='webhook_secret') THEN
    ALTER TABLE whatsapp_school_sessions ADD COLUMN webhook_secret TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='whatsapp_school_sessions' 
                 AND column_name='webhook_enabled') THEN
    ALTER TABLE whatsapp_school_sessions ADD COLUMN webhook_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour whatsapp_conversations
DROP TRIGGER IF EXISTS update_whatsapp_conversations_updated_at ON whatsapp_conversations;
CREATE TRIGGER update_whatsapp_conversations_updated_at
  BEFORE UPDATE ON whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires pour documentation
COMMENT ON TABLE whatsapp_incoming_messages IS 'Messages WhatsApp entrants des parents avec réponses IA';
COMMENT ON TABLE whatsapp_conversations IS 'Historique des conversations WhatsApp par parent';
COMMENT ON COLUMN whatsapp_school_sessions.webhook_url IS 'URL du webhook configurée pour cette session';
COMMENT ON COLUMN whatsapp_school_sessions.webhook_secret IS 'Secret pour vérifier l''authenticité des webhooks';
COMMENT ON COLUMN whatsapp_school_sessions.webhook_enabled IS 'Indique si le webhook est activé pour cette session';
