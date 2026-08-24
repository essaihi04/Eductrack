# Migration vers Supabase self-hosted — kit de préparation

Objectif : quitter Supabase cloud (`tmcgzstrkskrvflssvcq`) pour une stack
Supabase open source hébergée sur notre propre serveur, avec reprise de
toutes les données (base + fichiers).

## Architecture retenue

**Un seul serveur** héberge tout : frontend (nginx), backend Node (pm2 ou
Docker), et la stack Supabase (Docker Compose). Recommandation matérielle :

| Ressource | Minimum | Confortable |
|-----------|---------|-------------|
| RAM       | 8 Go    | 16 Go       |
| vCPU      | 4       | 6–8         |
| Disque    | 80 Go NVMe | 160 Go NVMe |

La stack Supabase seule consomme ~2–3 Go de RAM ; le backend Node ~1 Go ; le
reste sert de marge à PostgreSQL (cache) et aux pics. (WhatsApp passe par
l'API Cloud de Meta : aucun processus de messagerie n'est hébergé ici.)

## Étapes (scripts numérotés)

| # | Script | Où | Quand |
|---|--------|-----|-------|
| 1 | `01-download-storage.mjs` | PC local | Dès maintenant (fait) — sauvegarde `data/storage/` |
| 2 | `02-dump-database.sh` | Nouveau serveur (ou PC avec pg_dump) | Au moment de la bascule — nécessite le mot de passe DB (Dashboard → Settings → Database) |
| 3 | `03-restore-database.sh` | Nouveau serveur | Après `docker compose up` de la stack Supabase |
| 4 | `04-upload-storage.mjs` | Nouveau serveur | Après l'étape 3 |

Le dossier `data/` (dumps + fichiers) est exclu de git (`.gitignore` racine).

## Checklist complète de la bascule

1. **Serveur prêt** : Ubuntu/Debian, Docker + Docker Compose installés.
2. **Stack Supabase** : cloner `supabase/supabase` → `docker/`, générer un
   `JWT_SECRET` fort + clés `ANON_KEY`/`SERVICE_ROLE_KEY` correspondantes,
   `POSTGRES_PASSWORD` fort, désactiver les services inutiles (Analytics,
   Vector) pour économiser la RAM. `docker compose up -d`.
3. **DNS + SSL** : sous-domaine (ex. `db.etrack.ma`) → IP du serveur ;
   nginx en frontal vers Kong (port 8000) + certbot.
4. **Dump cloud** (script 2) → **Restore self-hosted** (script 3) →
   **Upload fichiers** (script 4).
5. **Bascule backend** : `backend/.env` → `SUPABASE_URL=https://db.etrack.ma`,
   nouvelles `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`. Redémarrer.
6. **Bascule frontend** : `frontend/.env` → mêmes valeurs `VITE_*`,
   `npm run build`, recharger nginx.
7. **Tests** : login (les mots de passe utilisateurs SURVIVENT au dump auth),
   données élèves/finance, upload photo, chatbot WhatsApp, PDF.
8. **Apps installées** ⚠️ : l'URL Supabase est compilée dans l'APK Capacitor
   et l'app Electron → rebuild + redistribution. Garder le projet cloud
   actif pendant la transition pour les apps non mises à jour.
9. **Sauvegardes** (indispensable en self-host) : cron quotidien
   `pg_dump` + copie du volume storage vers un stockage externe.
10. **Décommission** : après 2–4 semaines sans incident, pause du projet
    cloud (garder un dernier dump).

## Inventaire (2026-08-01)

- Storage : `uploads-public` 96 fichiers / 36,8 Mo ; `uploads-private` vide.
- Voir `data/inventory.json` pour le comptage des tables.
