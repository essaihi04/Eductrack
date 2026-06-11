-- =============================================================================
-- Création d'élèves SANS passer par l'API Auth (GoTrue) → contourne le rate limit
-- =============================================================================
-- Pourquoi : sur Supabase free-tier, créer beaucoup de comptes via l'API Auth
-- déclenche une limite de débit → import de classe bloqué (élèves manquants).
-- Cette fonction insère directement dans auth.users + auth.identities, ce que
-- GoTrue fait en interne, mais sans limite côté API.
--
-- ⚠️  AVERTISSEMENTS
--   • Sur Supabase CLOUD c'est NON SUPPORTÉ (le schéma `auth` peut changer).
--     Propre et durable uniquement en self-hosted.
--   • Teste avec 1-2 élèves AVANT un import massif (vérifie que le login marche).
--   • Le bcrypt est généré par pgcrypto (coût 10, identique à GoTrue).
--
-- Activation côté backend : variable d'env  USE_DIRECT_AUTH_INSERT=true
-- Désactivation (retour API Auth normale) : retire la variable / mets-la à false.
-- =============================================================================

-- pgcrypto fournit crypt() / gen_salt() pour le hash bcrypt
create extension if not exists pgcrypto;

create or replace function public.admin_create_student(
  p_email       text,
  p_password    text,
  p_first_name  text,
  p_last_name   text,
  p_role        text default 'student',
  p_massar_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_now     timestamptz := now();
begin
  -- 1) Compte d'authentification ------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    -- colonnes token : NOT NULL dans certaines versions → on met '' (jamais NULL)
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf', 10)),  -- hash bcrypt coût 10 (= GoTrue)
    v_now,                                   -- email confirmé → login immédiat
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'first_name', p_first_name,
      'last_name',  p_last_name,
      'role',       p_role,
      'massar_code', p_massar_code
    ),
    v_now, v_now,
    '', '', '', ''
  );

  -- 2) Identité « email » (indispensable, sinon le login échoue) -----------------
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email', v_now, v_now, v_now
  );

  return v_user_id;
end;
$$;

-- Seul le rôle backend (service_role) peut appeler cette fonction.
revoke all on function public.admin_create_student(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_create_student(text, text, text, text, text, text) to service_role;
