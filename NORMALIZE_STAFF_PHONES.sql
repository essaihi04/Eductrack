-- ═══════════════════════════════════════════════════════════════════════════
-- NORMALISATION DES NUMÉROS DU PERSONNEL (professeurs et encadrement)
--
-- WhatsApp livre les numéros en E.164 (« +212612345678 ») alors que la saisie
-- de l'administration donne « 0612345678 », « 06 12 34 56 78 », « 212612… ».
-- Le chatbot ne reconnaissait donc pas les professeurs et leur répondait comme
-- à un visiteur inconnu.
--
-- Le code sait désormais chercher toutes les écritures, mais la base doit être
-- alignée : un seul format = une seule requête et zéro ambiguïté.
--
-- À exécuter dans l'éditeur SQL Supabase. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Contrôle AVANT : ce qui n'est pas déjà en +212…
SELECT role, phone, COUNT(*)
  FROM profiles
 WHERE role IN ('teacher','pedagogical_director','pedagogical_manager','finance_manager','transport_manager','driver','admin','school_admin')
   AND phone IS NOT NULL AND phone <> ''
   AND phone !~ '^\+212[0-9]{9}$'
 GROUP BY role, phone
 ORDER BY role;

-- 2. Normalisation : on ne touche QUE les mobiles marocains reconnaissables
--    (9 chiffres nationaux commençant par 6 ou 7), les numéros étrangers et
--    les saisies fantaisistes sont laissés intacts.
WITH candidats AS (
  SELECT id,
         regexp_replace(phone, '\D', '', 'g') AS chiffres
    FROM profiles
   WHERE role IN ('teacher','pedagogical_director','pedagogical_manager','finance_manager','transport_manager','driver','admin','school_admin')
     AND phone IS NOT NULL AND phone <> ''
),
national AS (
  SELECT id,
         CASE
           WHEN chiffres ~ '^00212[67][0-9]{8}$' THEN substring(chiffres FROM 6)
           WHEN chiffres ~ '^212[67][0-9]{8}$'   THEN substring(chiffres FROM 4)
           WHEN chiffres ~ '^0[67][0-9]{8}$'     THEN substring(chiffres FROM 2)
           WHEN chiffres ~ '^[67][0-9]{8}$'      THEN chiffres
           ELSE NULL
         END AS nat
    FROM candidats
)
UPDATE profiles p
   SET phone = '+212' || n.nat
  FROM national n
 WHERE p.id = n.id
   AND n.nat IS NOT NULL
   AND p.phone IS DISTINCT FROM '+212' || n.nat;

-- 3. Contrôle APRÈS : doit ne plus renvoyer que des numéros étrangers ou invalides.
SELECT role, phone
  FROM profiles
 WHERE role IN ('teacher','pedagogical_director','pedagogical_manager','finance_manager','transport_manager','driver','admin','school_admin')
   AND phone IS NOT NULL AND phone <> ''
   AND phone !~ '^\+[0-9]{8,15}$'
 ORDER BY role;
