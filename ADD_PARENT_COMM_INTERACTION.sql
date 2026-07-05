-- ============================================================
-- Interaction parent sur les communications (canal app)
-- ------------------------------------------------------------
-- Permet au parent, depuis l'app, de :
--   - réagir « J'aime » à un message  → reaction ('👍' | NULL)
--   - répondre par un message texte   → response_text + responded_at
--                                        + response_channel = 'app'
--
-- responded_at / response_channel existent déjà (ADD_COMMUNICATION_HUB.sql) ;
-- on n'ajoute ici que reaction + response_text. Idempotent.
-- ============================================================

ALTER TABLE whatsapp_message_recipients
  ADD COLUMN IF NOT EXISTS reaction TEXT,          -- '👍' quand le parent aime (NULL sinon)
  ADD COLUMN IF NOT EXISTS response_text TEXT;     -- texte de la réponse envoyée depuis l'app
