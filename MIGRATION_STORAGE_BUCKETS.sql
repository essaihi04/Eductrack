-- ============================================================
-- MIGRATION: Buckets Supabase Storage (stockage durable des fichiers)
--  - uploads-public  : photos, logos, vie scolaire, documents (URL publique)
--  - uploads-private : dossier RH sensible (CIN, diplomes, contrat) -> URLs signees
-- Idempotent (ON CONFLICT). Limite 20 Mo par fichier.
-- A executer dans Supabase > SQL Editor.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads-public', 'uploads-public', true, 20971520)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('uploads-private', 'uploads-private', false, 20971520)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;

-- Note : le backend ecrit via la service_role (qui contourne la RLS de
-- storage.objects). La lecture publique du bucket 'uploads-public' est permise
-- par le flag public=true. Le bucket 'uploads-private' est lu via URLs signees
-- generees par le backend (service_role). Aucune policy supplementaire requise.

-- ============================================================
-- FIN.
-- ============================================================
