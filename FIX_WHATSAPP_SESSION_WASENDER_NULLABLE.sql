-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  FIX : whatsapp_school_sessions.wasender_session_id NOT NULL          ║
-- ║                                                                      ║
-- ║  La colonne wasender_session_id (ancien fournisseur Wasender) est     ║
-- ║  restée NOT NULL. Or, depuis le passage à Baileys, on n'envoie plus   ║
-- ║  cette valeur → la 1re connexion d'une école (INSERT) échouait, donc  ║
-- ║  le nom et le numéro de session n'étaient pas enregistrés et          ║
-- ║  « disparaissaient » au moment du scan du QR.                        ║
-- ║                                                                      ║
-- ║  À exécuter UNE FOIS dans Supabase SQL Editor. Idempotent.           ║
-- ║  (Si MIGRATION_BAILEYS.sql n'a pas encore été exécuté, l'exécuter     ║
-- ║   d'abord : il ajoute les colonnes provider/status/...)              ║
-- ╚══════════════════════════════════════════════════════════════════════╝

ALTER TABLE whatsapp_school_sessions
  ALTER COLUMN wasender_session_id DROP NOT NULL;
