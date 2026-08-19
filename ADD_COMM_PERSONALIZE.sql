-- Personnalisation des communications planifiées.
--
-- Quand la case est cochée, le texte WhatsApp est préfixé d'une salutation
-- nominative propre à chaque parent. Chaque destinataire reçoit donc un
-- message distinct, ce qui réduit fortement le risque de ban WhatsApp
-- (l'envoi de N messages rigoureusement identiques est un signal de spam).

ALTER TABLE scheduled_communications
  ADD COLUMN IF NOT EXISTS personalize BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN scheduled_communications.personalize IS
  'Préfixer le message WhatsApp d''une salutation au nom du parent';
