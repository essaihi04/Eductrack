-- Jetons d'appareils pour le push NATIF (FCM) — app Capacitor Android/iOS.
-- Distinct de push_subscriptions (Web Push navigateur/PWA) : ici un simple jeton
-- FCM par appareil, utilisé par le backend (firebase-admin) pour faire sonner le
-- téléphone même app fermée.
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT,            -- 'android' | 'ios' | 'web'
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Un même jeton n'appartient qu'à un compte à la fois (upsert par token).
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_token ON public.device_tokens(token);
CREATE INDEX IF NOT EXISTS idx_device_token_user ON public.device_tokens(user_id);
