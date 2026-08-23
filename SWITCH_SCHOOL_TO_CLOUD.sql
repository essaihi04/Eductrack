-- Rattache une école à un numéro de l'API Cloud (app Meta « EducTrack »).
--
-- ⚠️ Depuis REMOVE_BAILEYS.sql, l'API Cloud est le SEUL provider :
--    la contrainte est CHECK (provider = 'cloud') et le code ne lit plus
--    la colonne `provider`. Le seul levier réel est `phone_number_id` :
--    isCloudSchool() renvoie true dès qu'il est renseigné
--    (backend/src/services/whatsapp/cloudApi.js).
--
-- Prérequis côté serveur (.env du backend) :
--   WA_TOKEN, WA_WABA_ID=3153441974844861, WA_VERIFY_TOKEN
--   WA_APP_SECRET  ← OBLIGATOIRE AVANT d'exécuter ce script.
--   Sans lui, verifySignature() ne vérifie rien et n'importe qui peut
--   injecter de faux messages de parents une fois l'école rattachée.

-- 1) Repérer l'école à rattacher
SELECT id, name FROM schools ORDER BY name;

-- 2) Rattacher l'école au numéro de TEST Meta (+1 555-676-5656).
--    ⚠️ Le numéro de test n'envoie qu'à 5 destinataires déclarés chez Meta.
--    Remplacer <SCHOOL_ID> par l'UUID de l'école.
INSERT INTO whatsapp_school_sessions (school_id, provider, phone_number_id, status)
VALUES ('<SCHOOL_ID>', 'cloud', '1201176879754895', 'connected')
ON CONFLICT (school_id) DO UPDATE
  SET phone_number_id = EXCLUDED.phone_number_id,
      status = 'connected';

-- 3) Vérifier
SELECT w.school_id, s.name, w.provider, w.phone_number_id, w.status
  FROM whatsapp_school_sessions w
  JOIN schools s ON s.id = w.school_id
 WHERE w.phone_number_id IS NOT NULL;

-- 4) Revenir en arrière : détacher le numéro (NE PAS repasser provider à
--    'baileys', la contrainte le refuse et le provider n'existe plus).
-- UPDATE whatsapp_school_sessions
--    SET phone_number_id = NULL, status = 'disconnected'
--  WHERE school_id = '<SCHOOL_ID>';

-- Rappel : cloudApi.js met le provider de chaque école en cache (TTL court).
-- Après ce script, redémarrer le backend pour une prise en compte immédiate :
--   pm2 restart eductrack-backend
