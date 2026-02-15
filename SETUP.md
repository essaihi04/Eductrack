# 🔧 Configuration de l'Application

## 📝 Étapes de configuration

### 1. Configuration Backend

Créez un fichier `.env` dans le dossier `backend/` en copiant le contenu de `.env.example` :

```bash
cd backend
copy .env.example .env
```

Le fichier `.env` contient déjà les informations Supabase configurées :
- **SUPABASE_URL** : https://aoucczuetzquokgqukou.supabase.co
- **SUPABASE_ANON_KEY** : Clé d'authentification publique
- **SUPABASE_SERVICE_ROLE_KEY** : Clé d'administration (à garder secrète)

### 2. Configuration de la Base de Données Supabase

1. Connectez-vous à votre projet Supabase : https://aoucczuetzquokgqukou.supabase.co
2. Allez dans **SQL Editor**
3. Copiez et exécutez le contenu du fichier `supabase-schema.sql` à la racine du projet
4. Cela créera toutes les tables, politiques RLS et données de test

### 3. Configuration Frontend

Créez un fichier `.env` dans le dossier `frontend/` :

```bash
cd frontend
copy .env.example .env
```

Le fichier doit contenir :
```
VITE_SUPABASE_URL=https://aoucczuetzquokgqukou.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvdWNjenVldHpxdW9rZ3F1a291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NjgzODksImV4cCI6MjA3NjU0NDM4OX0.Xasreh9nA28O1uoK8K3ShpGUuEfOrgkCFTLfqv7T-V4
```

### 4. Installation des dépendances

Depuis la racine du projet :

```bash
npm run install-all
```

Ou manuellement :
```bash
# Racine
npm install

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 5. Lancement de l'application

Depuis la racine du projet :

```bash
npm start
```

Cela lancera simultanément :
- **Backend** sur http://localhost:3000
- **Frontend** sur http://localhost:5173

## 🔐 Sécurité

⚠️ **IMPORTANT** : 
- Ne partagez JAMAIS votre `SUPABASE_SERVICE_ROLE_KEY`
- Les fichiers `.env` sont ignorés par Git pour votre sécurité
- En production, utilisez des variables d'environnement sécurisées

## 👥 Création du premier utilisateur Admin

Utilisez l'API pour créer un compte admin :

```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "email": "admin@school.com",
  "password": "Admin123!",
  "firstName": "Admin",
  "lastName": "Principal",
  "role": "admin"
}
```

## 🧪 Test de l'API

Vérifiez que le backend fonctionne :

```bash
curl http://localhost:3000/api/health
```

Réponse attendue :
```json
{"status":"OK","message":"API is running"}
```
