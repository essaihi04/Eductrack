# 📁 Structure du Projet

```
student-tracking-app/
│
├── 📄 package.json                 # Configuration racine + script npm start
├── 📄 README.md                    # Documentation principale
├── 📄 QUICK_START.md              # Guide de démarrage rapide
├── 📄 DEPLOYMENT_GUIDE.md         # Guide de déploiement détaillé
├── 📄 SETUP.md                    # Instructions de configuration
├── 📄 TEST_API.md                 # Exemples de tests API
├── 📄 supabase-schema.sql         # Schéma de base de données
├── 📄 .gitignore                  # Fichiers ignorés par Git
│
├── 📂 backend/                    # API Node.js + Express
│   ├── 📄 package.json
│   ├── 📄 .env.example            # Template des variables d'environnement
│   │
│   └── 📂 src/
│       ├── 📄 server.js           # Point d'entrée du serveur
│       │
│       ├── 📂 config/
│       │   └── 📄 supabase.js     # Configuration Supabase
│       │
│       ├── 📂 middleware/
│       │   └── 📄 auth.js         # Middleware d'authentification et autorisation
│       │
│       └── 📂 routes/
│           ├── 📄 auth.routes.js        # Routes d'authentification
│           ├── 📄 students.routes.js    # Routes de gestion des élèves
│           ├── 📄 attendance.routes.js  # Routes de gestion des présences
│           ├── 📄 behavior.routes.js    # Routes d'évaluation du comportement
│           ├── 📄 assignments.routes.js # Routes de gestion des devoirs
│           └── 📄 ai.routes.js          # Routes de l'assistant IA
│
└── 📂 frontend/                   # Application React
    ├── 📄 package.json
    ├── 📄 .env.example            # Template des variables d'environnement
    ├── 📄 index.html              # Point d'entrée HTML
    ├── 📄 vite.config.js          # Configuration Vite
    ├── 📄 tailwind.config.js      # Configuration TailwindCSS
    ├── 📄 postcss.config.js       # Configuration PostCSS
    │
    └── 📂 src/
        ├── 📄 main.jsx            # Point d'entrée React
        ├── 📄 App.jsx             # Composant principal + routing
        ├── 📄 index.css           # Styles globaux + Tailwind
        │
        ├── 📂 lib/
        │   ├── 📄 supabase.js     # Client Supabase
        │   └── 📄 utils.js        # Utilitaires (cn, formatDate, etc.)
        │
        ├── 📂 contexts/
        │   └── 📄 AuthContext.jsx # Contexte d'authentification
        │
        ├── 📂 components/
        │   ├── 📂 ui/             # Composants UI réutilisables
        │   │   ├── 📄 Button.jsx
        │   │   ├── 📄 Card.jsx
        │   │   └── 📄 Input.jsx
        │   │
        │   └── 📂 Layout/
        │       ├── 📄 Sidebar.jsx        # Barre latérale de navigation
        │       └── 📄 DashboardLayout.jsx # Layout principal
        │
        └── 📂 pages/
            ├── 📄 Login.jsx       # Page de connexion
            ├── 📄 Dashboard.jsx   # Router vers le bon dashboard
            │
            └── 📂 dashboards/
                ├── 📄 AdminDashboard.jsx    # Dashboard Admin
                ├── 📄 TeacherDashboard.jsx  # Dashboard Professeur
                └── 📄 StudentDashboard.jsx  # Dashboard Élève
```

## 🗄️ Base de Données Supabase

### Tables principales :

1. **profiles** - Profils utilisateurs (admin, teacher, student)
2. **classes** - Classes scolaires
3. **subjects** - Matières enseignées
4. **attendance** - Présences/absences
5. **behavior_records** - Évaluations de comportement
6. **assignments** - Devoirs
7. **submissions** - Soumissions de devoirs
8. **lessons** - Leçons/cahiers
9. **grades** - Notes

### Sécurité :

- ✅ Row Level Security (RLS) activé sur toutes les tables
- ✅ Politiques par rôle (admin, teacher, student)
- ✅ Index pour optimiser les performances

## 🔑 Variables d'Environnement

### Backend (.env)
```
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://aoucczuetzquokgqukou.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
OPENAI_API_KEY=your_openai_api_key (optionnel)
```

### Frontend (.env)
```
VITE_SUPABASE_URL=https://aoucczuetzquokgqukou.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

## 🚀 Scripts NPM

### Racine
- `npm start` - Lance frontend + backend simultanément
- `npm run install-all` - Installe toutes les dépendances
- `npm run build` - Build frontend + backend

### Backend
- `npm run dev` - Mode développement avec nodemon
- `npm start` - Mode production

### Frontend
- `npm run dev` - Serveur de développement Vite
- `npm run build` - Build de production
- `npm run preview` - Prévisualiser le build

## 🎨 Stack Technique Détaillée

### Frontend
- **Framework** : React 19.1.1
- **Build Tool** : Vite 7.1.7
- **Styling** : TailwindCSS 3.4.1
- **UI Components** : Radix UI + Shadcn/UI
- **Animations** : Framer Motion 11.0.3
- **Icons** : Lucide React 0.312.0
- **Charts** : Recharts 2.10.4
- **Routing** : React Router DOM 6.21.3
- **Date Handling** : date-fns 3.3.1
- **Database** : Supabase JS 2.39.3

### Backend
- **Runtime** : Node.js
- **Framework** : Express 4.18.2
- **Database** : Supabase (PostgreSQL)
- **Auth** : Supabase Auth
- **Security** : Helmet 7.1.0, CORS 2.8.5
- **Validation** : Express Validator 7.0.1
- **Logging** : Morgan 1.10.0

## 📊 Flux de Données

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  React Frontend │ (Port 5173)
│  - Auth Context │
│  - UI Components│
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│  Express Backend │ (Port 3000)
│  - Auth Middleware│
│  - API Routes    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│    Supabase      │
│  - PostgreSQL    │
│  - Auth          │
│  - RLS Policies  │
└──────────────────┘
```

## 🔐 Rôles et Permissions

### Admin
- ✅ Accès complet à toutes les fonctionnalités
- ✅ Gestion des utilisateurs (CRUD)
- ✅ Gestion des classes et matières
- ✅ Statistiques globales

### Teacher (Professeur)
- ✅ Voir tous les élèves
- ✅ Marquer présences/absences
- ✅ Évaluer le comportement
- ✅ Créer et noter des devoirs
- ✅ Enregistrer des leçons
- ❌ Gérer les utilisateurs

### Student (Élève)
- ✅ Voir ses propres données uniquement
- ✅ Consulter absences et notes
- ✅ Soumettre des devoirs
- ✅ Accéder à l'assistant IA
- ❌ Voir les autres élèves
- ❌ Modifier les données

## 🎯 Fonctionnalités par Module

### Module Authentification
- Inscription (avec rôle)
- Connexion
- Déconnexion
- Gestion de session
- Protection des routes

### Module Élèves
- Liste des élèves
- Profil détaillé
- Création/modification (Admin)
- Statistiques individuelles

### Module Présences
- Marquer présence/absence/retard
- Historique des présences
- Statistiques d'assiduité
- Filtres par date et élève

### Module Comportement
- Évaluations positives/négatives
- Historique des remarques
- Score de comportement
- Filtres et recherche

### Module Devoirs
- Création de devoirs
- Soumission par les élèves
- Notation par les profs
- Suivi des échéances

### Module IA
- Assistant pour professeurs
- Guide pour élèves
- Suggestions personnalisées
- Conseils pédagogiques

## 🔄 Workflow de Développement

1. **Développement local** : `npm start`
2. **Modifications** : Hot reload automatique
3. **Tests** : Utiliser TEST_API.md
4. **Commit** : Git avec .gitignore configuré
5. **Déploiement** : Suivre DEPLOYMENT_GUIDE.md

## 📝 Conventions de Code

### Backend
- Routes : `nom.routes.js`
- Middleware : `nom.js`
- Config : `nom.js`
- Exports ES6 modules

### Frontend
- Composants : PascalCase (ex: `Button.jsx`)
- Hooks : camelCase avec `use` (ex: `useAuth`)
- Contexts : PascalCase avec `Context` (ex: `AuthContext`)
- Utils : camelCase (ex: `formatDate`)

## 🎨 Design System

### Couleurs
- **Primary** : Bleu (#3B82F6) - Actions principales
- **Secondary** : Gris clair - Éléments secondaires
- **Accent** : Vert (#22C55E) - Succès, validation
- **Destructive** : Rouge - Erreurs, suppressions

### Composants UI
- Basés sur Radix UI
- Stylés avec TailwindCSS
- Variants configurables
- Accessibilité intégrée

### Animations
- Framer Motion pour les transitions
- Animations subtiles et fluides
- Performance optimisée
