#!/bin/bash
# ============================================================
# Étape 2 — Dump complet de la base Supabase cloud
# ============================================================
# À lancer de préférence depuis le NOUVEAU serveur (meilleur débit).
# Nécessite le mot de passe de la base :
#   Dashboard Supabase → Settings → Database → Database password
#   (bouton « Reset database password » si oublié)
#
# Usage :
#   export PGPASSWORD='le-mot-de-passe-db'
#   ./02-dump-database.sh
#
# Produit dans data/ :
#   - dump-public.sql            : schéma + données de l'app (public)
#   - dump-auth-storage-data.sql : DONNÉES de auth (comptes + mots de passe
#                                  hashés) et storage (métadonnées fichiers).
#                                  Données seules : les schémas auth/storage
#                                  existent déjà dans le self-hosted (leurs
#                                  versions internes peuvent différer).

set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data

PROJECT_REF="tmcgzstrkskrvflssvcq"
# Pooler session (IPv4). La région exacte est visible dans
# Dashboard → Settings → Database → Connection string (mode Session).
HOST="${SUPABASE_DB_HOST:-aws-0-eu-central-1.pooler.supabase.com}"
PORT="${SUPABASE_DB_PORT:-5432}"
USER="postgres.${PROJECT_REF}"
DB="postgres"
CONN="host=$HOST port=$PORT user=$USER dbname=$DB sslmode=require"

echo "── Test de connexion…"
psql "$CONN" -c "select current_database(), version();" >/dev/null
echo "OK"

echo "── Dump du schéma applicatif (public) : schéma + données…"
pg_dump "$CONN" \
  --schema=public \
  --no-owner --no-privileges \
  --file=data/dump-public.sql

echo "── Dump des données auth + storage (données seules)…"
pg_dump "$CONN" \
  --data-only \
  --schema=auth --schema=storage \
  --exclude-table='auth.schema_migrations' \
  --exclude-table='storage.migrations' \
  --no-owner --no-privileges \
  --file=data/dump-auth-storage-data.sql

echo "── Tailles :"
ls -lh data/dump-public.sql data/dump-auth-storage-data.sql

echo "✅ Dump terminé."
