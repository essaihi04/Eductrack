-- Cloud API (WhatsApp Business officielle) — colonnes ajoutées à la table
-- existante whatsapp_school_sessions. Une école est « cloud » dès qu'elle a
-- provider='cloud' ET un phone_number_id (identifiant du numéro côté Meta).
--
-- Modèle : 1 SEUL token central (System User) pour toutes les écoles, stocké
-- côté serveur dans WA_TOKEN. Chaque école n'a que son phone_number_id distinct,
-- tous rattachés au même WABA (WA_WABA_ID).

ALTER TABLE whatsapp_school_sessions
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'baileys';

ALTER TABLE whatsapp_school_sessions
  ADD COLUMN IF NOT EXISTS phone_number_id TEXT;

-- Lookup rapide phone_number_id → school_id (routage du webhook entrant)
CREATE INDEX IF NOT EXISTS idx_whatsapp_school_sessions_phone_number_id
  ON whatsapp_school_sessions(phone_number_id);
