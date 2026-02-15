# ⚡ Démarrage Rapide

## 🎯 En 5 étapes simples

### 1️⃣ Déployer le schéma Supabase

1. Allez sur https://aoucczuetzquokgqukou.supabase.co
2. Cliquez sur **SQL Editor** dans le menu
3. Cliquez sur **New Query**
4. Ouvrez le fichier `supabase-schema.sql` à la racine du projet
5. Copiez tout son contenu et collez-le dans l'éditeur
6. Cliquez sur **Run** (ou appuyez sur Ctrl+Enter)

✅ Vous devriez voir : "Success. No rows returned"

### 2️⃣ Créer les fichiers .env

**Backend :**
```bash
cd backend
copy .env.example .env
```

**Frontend :**
```bash
cd frontend
copy .env.example .env
```

Les fichiers `.env.example` contiennent déjà vos clés Supabase configurées !

### 3️⃣ Installer les dépendances

Depuis la racine du projet :
```bash
npm run install-all
```

⏱️ Cela prendra 2-3 minutes.

### 4️⃣ Créer un utilisateur Admin

**Option A - Via Supabase Dashboard (Recommandé) :**

1. Allez sur https://aoucczuetzquokgqukou.supabase.co
2. Cliquez sur **Authentication** > **Users**
3. Cliquez sur **Add user** > **Create new user**
4. Remplissez :
   - Email: `admin@school.com`
   - Password: `Admin123!`
5. Cliquez sur **Create user**
6. **IMPORTANT** : Copiez l'ID de l'utilisateur créé (format UUID)
7. Allez dans **Table Editor** > **profiles**
8. Cliquez sur **Insert** > **Insert row**
9. Remplissez :
   - **id** : Collez l'UUID copié à l'étape 6
   - **email** : `admin@school.com`
   - **first_name** : `Admin`
   - **last_name** : `Principal`
   - **role** : `admin`
10. Cliquez sur **Save**

**Option B - Via l'API (après avoir démarré le backend) :**

Voir le fichier `TEST_API.md` pour les détails.

### 5️⃣ Lancer l'application

Depuis la racine du projet :
```bash
npm start
```

🎉 L'application démarre sur :
- **Frontend** : http://localhost:5173
- **Backend** : http://localhost:3000

## 🔐 Se connecter

1. Ouvrez http://localhost:5173
2. Utilisez les identifiants :
   - **Email** : `admin@school.com`
   - **Mot de passe** : `Admin123!`

## 🎨 Que faire ensuite ?

### En tant qu'Admin :

1. **Créer des classes** : Allez dans "Classes" et ajoutez vos classes
2. **Ajouter des professeurs** : Créez des comptes professeurs
3. **Ajouter des élèves** : Inscrivez vos élèves et assignez-les à des classes
4. **Configurer les matières** : Les matières de base sont déjà créées (Maths, Français, Sciences, Histoire, Anglais)

### Créer d'autres utilisateurs :

**Professeur :**
```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "email": "prof@school.com",
  "password": "Prof123!",
  "firstName": "Marie",
  "lastName": "Dupont",
  "role": "teacher"
}
```

**Élève :**
```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "email": "eleve@school.com",
  "password": "Eleve123!",
  "firstName": "Jean",
  "lastName": "Martin",
  "role": "student"
}
```

## 🆘 Problèmes courants

### ❌ "Missing Supabase environment variables"
➡️ Vérifiez que les fichiers `.env` existent dans `backend/` et `frontend/`

### ❌ "Port 3000 already in use"
➡️ Un autre processus utilise le port 3000. Arrêtez-le ou changez le port dans `backend/.env`

### ❌ "Cannot find module"
➡️ Exécutez `npm run install-all` depuis la racine

### ❌ Erreur de connexion
➡️ Vérifiez que :
1. Le schéma SQL a été exécuté dans Supabase
2. L'utilisateur existe dans la table `profiles` avec le bon rôle
3. Le backend est bien démarré

### ❌ Page blanche sur le frontend
➡️ Ouvrez la console du navigateur (F12) pour voir les erreurs

## 📚 Documentation complète

- **DEPLOYMENT_GUIDE.md** : Guide détaillé de déploiement
- **TEST_API.md** : Exemples de requêtes API
- **README.md** : Vue d'ensemble du projet
- **SETUP.md** : Configuration détaillée

## 🎯 Fonctionnalités principales

### Pour les Admins :
- ✅ Gestion des professeurs, classes, élèves
- ✅ Statistiques globales
- ✅ Configuration des matières

### Pour les Professeurs :
- ✅ Marquer les présences/absences
- ✅ Évaluer le comportement
- ✅ Créer et noter des devoirs
- ✅ Enregistrer des leçons
- ✅ Assistant IA pour le suivi des élèves

### Pour les Élèves :
- ✅ Consulter ses absences
- ✅ Voir ses devoirs et notes
- ✅ Soumettre des exercices
- ✅ Suivre sa progression
- ✅ Assistant IA personnel

## 🎨 Design

- **Mode clair/sombre** : Automatique selon les préférences système
- **Responsive** : Fonctionne sur mobile, tablette et desktop
- **Animations** : Transitions fluides avec Framer Motion
- **Icônes** : Lucide React
- **Composants** : Shadcn/UI + Radix UI

## 🔒 Sécurité

- ✅ Authentification Supabase
- ✅ Row Level Security (RLS) activé
- ✅ Gestion des rôles (admin, teacher, student)
- ✅ Tokens JWT sécurisés
- ✅ Variables d'environnement protégées

## 💡 Astuces

1. **Mode développement** : Les modifications du code sont automatiquement rechargées
2. **Base de données** : Utilisez le Table Editor de Supabase pour voir/modifier les données
3. **Logs** : Consultez la console pour déboguer
4. **API** : Testez les endpoints avec Postman ou Thunder Client

Bon développement ! 🚀
