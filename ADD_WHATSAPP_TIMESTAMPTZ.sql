-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  DATES DES MESSAGES ENTRANTS : TIMESTAMP → TIMESTAMPTZ                ║
-- ║                                                                      ║
-- ║  Les tables du chatbot (créées avant les autres) stockent leurs dates ║
-- ║  en TIMESTAMP *sans* fuseau. PostgREST les renvoie alors sans marqueur║
-- ║  (« 2026-08-25T10:14:02 ») et le navigateur les lit comme des heures  ║
-- ║  LOCALES, alors que la valeur est en UTC : une heure d'écart au Maroc.║
-- ║                                                                      ║
-- ║  Effets visibles côté boîte de réception :                           ║
-- ║   • heure de réception fausse d'une heure ;                          ║
-- ║   • réponse d'un parent affichée AVANT le message auquel elle répond ;║
-- ║   • conversation qui ne remonte pas en tête alors qu'elle est la plus ║
-- ║     récente.                                                          ║
-- ║                                                                      ║
-- ║  Les valeurs déjà enregistrées sont en UTC (NOW() converti dans le    ║
-- ║  fuseau de la session Supabase, à savoir UTC) : la conversion est     ║
-- ║  donc exacte, sans décalage introduit.                               ║
-- ║                                                                      ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.           ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ─── Messages entrants ───────────────────────────────────────────────────
ALTER TABLE public.whatsapp_incoming_messages
  ALTER COLUMN received_at TYPE TIMESTAMPTZ USING received_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at  TYPE TIMESTAMPTZ USING created_at  AT TIME ZONE 'UTC';

-- ─── Conversations (même origine, même défaut) ───────────────────────────
ALTER TABLE public.whatsapp_conversations
  ALTER COLUMN last_message_at TYPE TIMESTAMPTZ USING last_message_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at      TYPE TIMESTAMPTZ USING created_at      AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at      TYPE TIMESTAMPTZ USING updated_at      AT TIME ZONE 'UTC';

-- ─── Vérification ────────────────────────────────────────────────────────
-- Les trois colonnes doivent afficher « timestamp with time zone ».
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_name IN ('whatsapp_incoming_messages', 'whatsapp_conversations')
   AND column_name IN ('received_at', 'created_at', 'last_message_at', 'updated_at')
 ORDER BY table_name, column_name;
