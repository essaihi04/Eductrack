# 🎯 Commandes Essentielles

## 🚀 Démarrage

### Première installation
```bash
# Depuis la racine du projet
npm run install-all
```

### Lancer l'application (Frontend + Backend)
```bash
# Depuis la racine du projet
npm start
```

L'application sera accessible sur :
- **Frontend** : http://localhost:5173
- **Backend** : http://localhost:3000

---

## 📦 Installation

### Installer toutes les dépendances
```bash
npm run install-all
```

### Installer uniquement le backend
```bash
cd backend
npm install
```

### Installer uniquement le frontend
```bash
cd frontend
npm install
```

---

## 🔧 Développement

### Lancer uniquement le backend
```bash
cd backend
npm run dev
```

### Lancer uniquement le frontend
```bash
cd frontend
npm run dev
```

### Lancer les deux simultanément (recommandé)
```bash
# Depuis la racine
npm start
```

---

## 🏗️ Build

### Build du frontend
```bash
cd frontend
npm run build
```

### Build complet (frontend + backend)
```bash
# Depuis la racine
npm run build
```

---

## 🗄️ Base de Données

### Exécuter le schéma SQL
1. Allez sur https://aoucczuetzquokgqukou.supabase.co
2. SQL Editor > New Query
3. Copiez le contenu de `supabase-schema.sql`
4. Exécutez (Run)

### Vérifier les tables
```sql
-- Dans Supabase SQL Editor
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```

### Voir tous les utilisateurs
```sql
-- Dans Supabase SQL Editor
SELECT id, email, first_name, last_name, role 
FROM profiles;
```

---

## 👤 Gestion des Utilisateurs

### Créer un Admin (via API)
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

### Créer un Professeur
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "prof@school.com",
    "password": "Prof123!",
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
    "email": "eleve@school.com",
    "password": "Eleve123!",
    "firstName": "Jean",
    "lastName": "Martin",
    "role": "student"
  }'
```

---

## 🔐 Authentification

### Se connecter
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "Admin123!"
  }'
```

### Vérifier l'utilisateur actuel
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 🧪 Tests

### Tester la santé de l'API
```bash
curl http://localhost:3000/api/health
```

Réponse attendue :
```json
{"status":"OK","message":"API is running"}
```

### Lister les élèves
```bash
curl -X GET http://localhost:3000/api/students \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Marquer une présence
```bash
curl -X POST http://localhost:3000/api/attendance \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "STUDENT_UUID",
    "date": "2025-01-20",
    "status": "present"
  }'
```

---

## 🛠️ Dépannage

### Vérifier les ports utilisés
```bash
# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :5173

# Tuer un processus (Windows)
taskkill /PID <PID> /F
```

### Nettoyer les node_modules
```bash
# Supprimer tous les node_modules
rm -rf node_modules backend/node_modules frontend/node_modules

# Réinstaller
npm run install-all
```

### Vérifier les variables d'environnement
```bash
# Backend
cd backend
type .env

# Frontend
cd frontend
type .env
```

### Logs du backend
```bash
cd backend
npm run dev
# Les logs s'afficheront dans le terminal
```

### Logs du frontend
```bash
# Ouvrir la console du navigateur (F12)
# Onglet Console pour voir les erreurs
```

---

## 📝 Git

### Initialiser Git (si pas déjà fait)
```bash
git init
git add .
git commit -m "Initial commit"
```

### Créer une branche
```bash
git checkout -b feature/nouvelle-fonctionnalite
```

### Commit des changements
```bash
git add .
git commit -m "Description des changements"
```

### Push vers GitHub
```bash
git remote add origin https://github.com/votre-username/student-tracking-app.git
git push -u origin main
```

---

## 🔄 Mise à jour

### Mettre à jour les dépendances
```bash
# Backend
cd backend
npm update

# Frontend
cd frontend
npm update
```

### Vérifier les versions
```bash
# Node.js
node --version

# npm
npm --version
```

---

## 📊 Supabase

### Accéder au dashboard
```
https://aoucczuetzquokgqukou.supabase.co
```

### Voir les tables
Dashboard > Table Editor

### Voir les utilisateurs
Dashboard > Authentication > Users

### Exécuter du SQL
Dashboard > SQL Editor

### Voir les logs
Dashboard > Logs

---

## 🎨 Personnalisation

### Changer le port du backend
```bash
# Dans backend/.env
PORT=4000
```

### Changer le port du frontend
```bash
# Dans frontend/vite.config.js
export default {
  server: {
    port: 3000
  }
}
```

### Modifier les couleurs
```css
/* Dans frontend/src/index.css */
:root {
  --primary: 217 91% 60%;  /* Bleu */
  --accent: 142 76% 36%;   /* Vert */
}
```

---

## 📚 Documentation

### Lire la documentation
- `README.md` - Vue d'ensemble
- `QUICK_START.md` - Démarrage rapide
- `DEPLOYMENT_GUIDE.md` - Guide de déploiement
- `TEST_API.md` - Tests API
- `FEATURES.md` - Fonctionnalités
- `PROJECT_STRUCTURE.md` - Structure du projet

### Ouvrir dans le navigateur
```bash
# Windows
start README.md

# Ou ouvrir avec un éditeur Markdown
code README.md
```

---

## 🆘 Aide

### Problème de démarrage
1. Vérifier que Node.js est installé : `node --version`
2. Vérifier que les .env existent
3. Réinstaller les dépendances : `npm run install-all`
4. Vérifier les ports 3000 et 5173

### Erreur de connexion
1. Vérifier que le backend est démarré
2. Vérifier que Supabase est configuré
3. Vérifier que l'utilisateur existe dans la table profiles

### Erreur de base de données
1. Vérifier que le schéma SQL a été exécuté
2. Vérifier les clés Supabase dans .env
3. Vérifier les politiques RLS

---

**Pour plus d'aide, consultez les fichiers de documentation ! 📖**
