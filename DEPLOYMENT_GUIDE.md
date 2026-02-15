# 🚀 Guide de Déploiement

## 📋 Étape 1 : Configuration de Supabase

### 1.1 Accéder à votre projet Supabase
Connectez-vous à : https://aoucczuetzquokgqukou.supabase.co

### 1.2 Déployer le schéma de base de données

1. Dans le dashboard Supabase, allez dans **SQL Editor**
2. Cliquez sur **New Query**
3. Copiez tout le contenu du fichier `supabase-schema.sql` (à la racine du projet)
4. Collez-le dans l'éditeur SQL
5. Cliquez sur **Run** pour exécuter le script

✅ Cela créera :
- Toutes les tables (profiles, classes, subjects, attendance, behavior_records, assignments, submissions, lessons, grades)
- Les politiques RLS (Row Level Security) pour sécuriser les données
- Les index pour optimiser les performances
- Les données de test (5 matières de base)

### 1.3 Vérifier la création des tables

Dans le dashboard Supabase :
1. Allez dans **Table Editor**
2. Vous devriez voir toutes les tables listées dans la barre latérale
3. Vérifiez que la table `subjects` contient 5 matières

## 📋 Étape 2 : Configuration de l'environnement

### 2.1 Backend

Créez le fichier `backend/.env` :

```bash
cd backend
copy .env.example .env
```

Le fichier `.env` est déjà configuré avec vos clés Supabase.

### 2.2 Frontend

Créez le fichier `frontend/.env` :

```bash
cd frontend
copy .env.example .env
```

Le fichier `.env` contient déjà les bonnes valeurs.

## 📋 Étape 3 : Installation des dépendances

Depuis la **racine du projet** :

```bash
npm run install-all
```

Cette commande installera automatiquement les dépendances pour :
- Le projet racine (concurrently)
- Le backend (Express, Supabase, etc.)
- Le frontend (React, TailwindCSS, etc.)

## 📋 Étape 4 : Créer le premier utilisateur Admin

### Option A : Via l'API Backend

1. Démarrez le backend :
```bash
cd backend
npm run dev
```

2. Utilisez un outil comme Postman ou curl pour créer un admin :

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "Admin123!",
    "firstName": "Admin",
    "lastName": "Principal",
    "role": "admin"
  }'
```

### Option B : Via Supabase Dashboard

1. Allez dans **Authentication** > **Users**
2. Cliquez sur **Add user** > **Create new user**
3. Remplissez :
   - Email: `admin@school.com`
   - Password: `Admin123!`
   - Confirm password: `Admin123!`
4. Cliquez sur **Create user**
5. Allez dans **Table Editor** > **profiles**
6. Cliquez sur **Insert** > **Insert row**
7. Remplissez :
   - id: (copiez l'ID de l'utilisateur créé dans Authentication)
   - email: `admin@school.com`
   - first_name: `Admin`
   - last_name: `Principal`
   - role: `admin`
8. Cliquez sur **Save**

## 📋 Étape 5 : Lancer l'application

Depuis la **racine du projet** :

```bash
npm start
```

Cette commande unique lancera :
- ✅ Backend sur http://localhost:3000
- ✅ Frontend sur http://localhost:5173

## 📋 Étape 6 : Accéder à l'application

1. Ouvrez votre navigateur
2. Allez sur http://localhost:5173
3. Connectez-vous avec :
   - Email: `admin@school.com`
   - Password: `Admin123!`

## 🎯 Créer des utilisateurs de test

### Créer un Professeur

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@school.com",
    "password": "Teacher123!",
    "firstName": "Marie",
    "lastName": "Dupont",
    "role": "teacher"
  }'
```

### Créer un Élève

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@school.com",
    "password": "Student123!",
    "firstName": "Jean",
    "lastName": "Martin",
    "role": "student"
  }'
```

## 🔧 Dépannage

### Le backend ne démarre pas
- Vérifiez que le fichier `backend/.env` existe
- Vérifiez que les variables Supabase sont correctes
- Vérifiez que le port 3000 n'est pas déjà utilisé

### Le frontend ne démarre pas
- Vérifiez que le fichier `frontend/.env` existe
- Exécutez `npm install` dans le dossier frontend
- Vérifiez que le port 5173 n'est pas déjà utilisé

### Erreur de connexion
- Vérifiez que le schéma SQL a bien été exécuté dans Supabase
- Vérifiez que l'utilisateur existe dans la table `profiles`
- Vérifiez que le rôle est bien défini (admin, teacher, ou student)

### Erreur "Missing Supabase environment variables"
- Vérifiez que les fichiers `.env` existent dans `backend/` et `frontend/`
- Vérifiez que les variables commencent par `VITE_` dans le frontend

## 📚 Prochaines étapes

Une fois connecté, vous pouvez :
1. **Admin** : Créer des classes, ajouter des professeurs et élèves
2. **Professeur** : Marquer les présences, créer des devoirs, évaluer le comportement
3. **Élève** : Consulter ses absences, soumettre des devoirs, voir ses notes

## 🎨 Personnalisation

### Changer les couleurs
Modifiez les variables CSS dans `frontend/src/index.css`

### Ajouter des matières
Allez dans **Table Editor** > **subjects** et ajoutez de nouvelles lignes

### Modifier les rôles
Les rôles sont définis dans la table `profiles` : `admin`, `teacher`, `student`
