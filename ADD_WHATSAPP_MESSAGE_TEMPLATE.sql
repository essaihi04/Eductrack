-- ═══════════════════════════════════════════════════════════════════════════
-- MODÈLE META ATTACHÉ À UNE CAMPAGNE WHATSAPP
--
-- Hors fenêtre de 24 h, un message rédigé librement ne peut partir que sous
-- forme d'annonce. Une campagne dont le contenu correspond EXACTEMENT à un
-- template approuvé (offre des manuels scolaires, par exemple) n'a pas cette
-- limite : le template transporte le message entier.
--
-- L'envoi de masse est repris depuis la base après un redémarrage : le choix
-- du template doit donc y être stocké, pas seulement passé à la requête.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS template_key    TEXT,
  ADD COLUMN IF NOT EXISTS template_params JSONB,
  ADD COLUMN IF NOT EXISTS template_lang   TEXT;

COMMENT ON COLUMN public.whatsapp_messages.template_key IS
  'Clé du registre backend/src/services/whatsapp/templates.js (ex. « manuels »). NULL = message libre, annoncé hors fenêtre 24 h.';
COMMENT ON COLUMN public.whatsapp_messages.template_params IS
  'Valeurs des {{1}}, {{2}}… du template, dans l''ordre.';
COMMENT ON COLUMN public.whatsapp_messages.template_lang IS
  'Langue imposée à toute la campagne (« fr », « ar »). NULL = langue de chaque parent (choix explicite, sinon langue de son dernier message).';
