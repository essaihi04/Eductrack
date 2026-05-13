# Déploiement Module Transport

## 1. Migration SQL (Supabase)

Exécuter dans le SQL editor Supabase :
```sql
-- Voir MIGRATION_TRANSPORT.sql
```

## 2. Variables d'environnement backend

Ajouter dans `backend/.env` :

```env
# VAPID keys pour les notifications push web (à générer une seule fois)
VAPID_PUBLIC_KEY=<votre clé publique>
VAPID_PRIVATE_KEY=<votre clé privée>
VAPID_SUBJECT=mailto:contact@votre-domaine.com
```

Pour générer les clés VAPID :
```bash
node -e "const w = require('web-push'); const k = w.generateVAPIDKeys(); console.log('Public:', k.publicKey); console.log('Private:', k.privateKey);"
```

## 3. Realtime Supabase

La migration ajoute automatiquement les tables `bus_positions`, `bus_trips`, `trip_student_events` à la publication `supabase_realtime`. Aucune action supplémentaire requise.

## 4. Service Worker

Le fichier `frontend/public/sw.js` est servi automatiquement à la racine du site. Vérifier après déploiement que `https://votre-domaine/sw.js` est accessible (200 OK).

## 5. HTTPS obligatoire

Les notifications push **ET** la géolocalisation HTML5 nécessitent HTTPS (sauf en localhost). Confirmer que le domaine de production est en HTTPS.

## 6. Rôles à créer

- `transport_manager` : créé par admin via `/transport/managers`
- `driver` : créé par admin/transport_manager via `/transport/drivers`

Le chauffeur se connecte sur `/login` puis est redirigé vers `/driver`.

## 7. Inspirations concurrents

Module inspiré de Wassalni (Maroc), Kawa Education, Mas-school/Massar, MyKool, Alsa Maroc, et inDrive.
