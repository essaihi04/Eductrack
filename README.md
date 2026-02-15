# 🎓 Application de Suivi des Élèves

Application web éducative complète pour gérer les absences, le comportement, les cahiers de leçons et les exercices des élèves.

## 🚀 Démarrage rapide

```bash
# Installation des dépendances
npm run install-all

# Lancer l'application (frontend + backend)
npm start
```

L'application sera accessible sur :
- **Frontend** : http://localhost:5173
- **Backend** : http://localhost:3000

## 📋 Prérequis

- Node.js (v18+)
- npm ou yarn
- Compte Supabase (gratuit)

## ⚙️ Configuration

### 1. Configuration Supabase (IMPORTANT)

Votre projet Supabase est déjà configuré :
- **URL** : https://aoucczuetzquokgqukou.supabase.co
- Les clés sont déjà dans les fichiers `.env.example`

**Étapes obligatoires** :

1. **Déployer le schéma de base de données** :
   - Allez sur https://aoucczuetzquokgqukou.supabase.co
   - Cliquez sur **SQL Editor** > **New Query**
   - Copiez tout le contenu du fichier `supabase-schema.sql`
   - Collez et cliquez sur **Run**

2. **Créer les fichiers .env** :
   ```bash
   cd backend
   copy .env.example .env
   cd ../frontend
   copy .env.example .env
   ```

3. **Créer le premier utilisateur Admin** (voir QUICK_START.md)

## 🎨 Stack Technique

- **Frontend** : React + Vite + TailwindCSS + Shadcn/UI + Framer Motion
- **Backend** : Node.js + Express
- **Base de données** : Supabase (PostgreSQL)
- **Authentification** : Supabase Auth
- **API** : REST

## 👥 Rôles

### Admin
- Gérer professeurs, classes, élèves, matières
- Voir statistiques globales
- Accès complet au système

### Professeur
- Marquer absences et retards
- Évaluer comportement et cahiers
- Enregistrer devoirs et notes

### Élève
- Voir son tableau de bord personnel
- Consulter ses absences et remarques
- Soumettre exercices

## 🤖 Module IA

Assistant IA intégré pour :
- Aide aux professeurs (suivi, idées de soutien)
- Guide pour les élèves (rappels, planification)
- Informations pour les parents

## 📁 Structure du projet

```
student-tracking-app/
├── frontend/          # Application React
├── backend/           # API Express
├── package.json       # Scripts de démarrage
└── README.md
```
