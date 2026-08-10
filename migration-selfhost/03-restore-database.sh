#!/bin/bash
# ============================================================
# Étape 3 — Restauration dans le Supabase self-hosted
# ============================================================
# À lancer SUR le nouveau serveur, une fois la stack Supabase démarrée
# (docker compose up -d) et les dumps copiés dans data/.
#
# Usage :
#   export PGPASSWORD='le-mot-de-passe-postgres-du-self-hosted'  # POSTGRES_PASSWORD du .env docker
#   ./03-restore-database.sh
#
# Ordre important :
#   1. données auth (les profils référencent auth.users)
#   2. schéma + données public
#   3. données storage (métadonnées ; les fichiers sont uploadés à l'étape 4)

set -euo pipefail
cd "$(dirname "$0")"

HOST="${SELFHOST_DB_HOST:-127.0.0.1}"
PORT="${SELFHOST_DB_PORT:-5432}"
USER="${SELFHOST_DB_USER:-postgres}"
DB="postgres"
CONN="host=$HOST port=$PORT user=$USER dbname=$DB"

echo "── Test de connexion au self-hosted…"
psql "$CONN" -c "select version();" >/dev/null
echo "OK"

echo "── 1/3 Données auth + storage…"
# ON_ERROR_STOP=0 : quelques lignes internes (instances, sso…) peuvent être
# en doublon avec l'install neuve — sans gravité. Vérifier le compte à la fin.
psql "$CONN" -v ON_ERROR_STOP=0 -f data/dump-auth-storage-data.sql > /tmp/restore-auth.log 2>&1 || true
grep -ci "^ERROR" /tmp/restore-auth.log | xargs -I{} echo "   ({} erreurs — voir /tmp/restore-auth.log ; doublons internes = normal)"

echo "── 2/3 Schéma + données public…"
psql "$CONN" -v ON_ERROR_STOP=1 -f data/dump-public.sql > /tmp/restore-public.log 2>&1
echo "   OK"

echo "── 3/3 Vérifications…"
psql "$CONN" -t -c "select 'auth.users: ' || count(*) from auth.users;"
psql "$CONN" -t -c "select 'profiles:   ' || count(*) from public.profiles;"
psql "$CONN" -t -c "select 'storage.objects: ' || count(*) from storage.objects;"

echo "✅ Restauration terminée. Lancez ensuite 04-upload-storage.mjs pour les fichiers."
