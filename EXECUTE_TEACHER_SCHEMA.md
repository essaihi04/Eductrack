# Exécuter le schéma de base de données pour l'interface professeur

## ⚠️ IMPORTANT - À faire maintenant

Vous devez exécuter le schéma de base de données dans Supabase pour que l'interface professeur fonctionne.

## 📋 Étapes

### Étape 1 : Ouvrir Supabase SQL Editor

1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet
3. Cliquez sur **SQL Editor** dans le menu de gauche
4. Cliquez sur **New Query**

### Étape 2 : Copier et exécuter le schéma

1. Ouvrez le fichier `TEACHER_TRACKING_SCHEMA.sql` dans votre éditeur
2. Copiez **tout le contenu**
3. Collez-le dans la query Supabase
4. Cliquez sur **Run**

⏳ Attendez que la query se termine (quelques secondes)

### Étape 3 : Ajouter les compétences de test

Créez une nouvelle query et exécutez :

```sql
INSERT INTO competencies (name, code, description) VALUES
('Compréhension', 'COMP', 'Comprendre les concepts'),
('Application', 'APP', 'Appliquer les connaissances'),
('Analyse', 'ANA', 'Analyser et critiquer'),
('Synthèse', 'SYN', 'Synthétiser et créer'),
('Communication', 'COM', 'Communiquer efficacement'),
('Collaboration', 'COL', 'Travailler en équipe'),
('Autonomie', 'AUT', 'Travailler de manière autonome'),
('Créativité', 'CRE', 'Penser de manière créative');
```

### Étape 4 : Vérifier que tout fonctionne

Exécutez cette query pour vérifier :

```sql
SELECT COUNT(*) as tables_created FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('sessions', 'session_tracking', 'mini_assessments', 'competencies', 'lesson_plan');
```

Vous devriez voir : `tables_created: 5`

## ✅ Vérification

Une fois le schéma exécuté, vous pouvez :

1. **Tester l'interface professeur** :
   - Connectez-vous en tant que professeur
   - Allez sur `/teacher/home`
   - Sélectionnez une classe
   - Créez une nouvelle séance

2. **Vérifier les données** :
   - Allez dans Supabase → Table Editor
   - Vérifiez que les tables sont créées
   - Vérifiez que les compétences sont présentes

## 🚨 En cas d'erreur

### Erreur : "Table already exists"
→ Les tables existent déjà, c'est normal. Continuez.

### Erreur : "Permission denied"
→ Exécutez d'abord `FIX_SERVICE_ROLE_PERMISSIONS.sql`

### Erreur : "Column does not exist"
→ Vérifiez que vous avez copié tout le contenu du fichier

## 📝 Fichiers à exécuter (dans cet ordre)

1. ✅ `FIX_SERVICE_ROLE_PERMISSIONS.sql` (si pas déjà fait)
2. ⏳ `TEACHER_TRACKING_SCHEMA.sql` (À FAIRE MAINTENANT)
3. ⏳ Compétences (query ci-dessus)

## 🎯 Après l'exécution

L'interface professeur sera complètement fonctionnelle avec :
- ✅ Suivi de séance (présence, travail, discipline, téléphone)
- ✅ Mini-évaluations avec compétences
- ✅ Cahier hebdomadaire
- ✅ Fiche élève avec statistiques
- ✅ Sauvegarde automatique

## 💡 Conseil

Gardez cette fenêtre ouverte pendant l'exécution pour voir les messages de succès/erreur.

---

**Besoin d'aide ?** Vérifiez les logs Supabase en bas de la page SQL Editor.
