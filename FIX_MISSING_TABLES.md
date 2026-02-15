# 🔧 Correction des erreurs "table not found"

## Problème
Les erreurs suivantes apparaissent :
```
Could not find the table 'public.teacher_subjects' in the schema cache
Could not find the table 'public.class_teachers' in the schema cache
```

## Solution rapide (2 minutes)

### Étape 1 : Ouvrir Supabase SQL Editor
1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet
3. Cliquez sur **SQL Editor** (menu gauche)
4. Cliquez sur **"New Query"**

### Étape 2 : Exécuter le script SQL

Copiez et collez ce script dans l'éditeur SQL :

```sql
-- Créer la table teacher_subjects
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(teacher_id, subject_id)
);

-- Créer la table class_teachers
CREATE TABLE IF NOT EXISTS public.class_teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(class_id, teacher_id)
);

-- Créer les index
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher_id ON public.teacher_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject_id ON public.teacher_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_class_id ON public.class_teachers(class_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher_id ON public.class_teachers(teacher_id);
```

### Étape 3 : Exécuter
- Cliquez sur **"Run"** (ou Ctrl+Enter)
- Attendez le message de succès ✓

### Étape 4 : Tester
1. Rechargez l'application (F5)
2. Allez dans l'onglet **Professeurs**
3. Cliquez sur un professeur pour l'étendre
4. Essayez d'ajouter une matière
5. Les erreurs 500 devraient disparaître ✓

## Vérification

Pour vérifier que les tables ont été créées, exécutez cette requête dans SQL Editor :

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('teacher_subjects', 'class_teachers');
```

Vous devriez voir 2 lignes :
- `teacher_subjects`
- `class_teachers`

## Après la création

Les fonctionnalités suivantes seront opérationnelles :
✅ Ajouter des matières aux professeurs
✅ Ajouter plusieurs professeurs par classe
✅ Importer des élèves via Excel

## Besoin d'aide ?

Si vous recevez une erreur :
1. Vérifiez que vous êtes connecté en tant qu'admin Supabase
2. Assurez-vous que les tables `profiles`, `classes` et `subjects` existent
3. Vérifiez que vous copiez exactement le script ci-dessus
