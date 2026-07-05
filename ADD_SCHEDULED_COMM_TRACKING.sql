-- ============================================================================
-- Tracking unifié des communications PLANIFIÉES (à exécuter APRÈS
-- ADD_COMMUNICATION_HUB.sql, dans Supabase SQL Editor).
--
-- Chaque envoi planifié écrit désormais dans whatsapp_messages /
-- whatsapp_message_recipients (comme les envois directs) → visible dans
-- l'historique, le détail « qui a vu / répondu » et le Dashboard parents.
--
-- - message_id : lien vers la ligne whatsapp_messages créée à l'envoi
-- - category   : boîte cible (general / pedagogical / financial / transport),
--                figée à la création selon le rôle de l'auteur
-- ============================================================================

ALTER TABLE public.scheduled_communications
  ADD COLUMN IF NOT EXISTS message_id UUID,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
