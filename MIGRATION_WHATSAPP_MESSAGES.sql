-- WhatsApp Messages log table for tracking sent messages
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id),
  sent_by UUID NOT NULL REFERENCES profiles(id),
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  file_name TEXT,
  recipient_filter JSONB,
  total_recipients INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_school_id ON public.whatsapp_messages(school_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_by ON public.whatsapp_messages(sent_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status ON public.whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);

-- Individual message delivery log
CREATE TABLE IF NOT EXISTS public.whatsapp_message_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES whatsapp_messages(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES profiles(id),
  phone_e164 TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  wasender_msg_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_recipients_message_id ON public.whatsapp_message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_wa_recipients_status ON public.whatsapp_message_recipients(status);
