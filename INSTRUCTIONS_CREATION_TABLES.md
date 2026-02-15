# Instructions pour créer les tables manquantes

Les erreurs que vous voyez indiquent que les tables `teacher_subjects` et `class_teachers` n'existent pas encore dans Supabase.

## Étapes pour créer les tables

### 1. Accédez à Supabase SQL Editor
- Allez sur https://app.supabase.com
- Sélectionnez votre projet
- Cliquez sur **SQL Editor** dans le menu de gauche

### 2. Créez une nouvelle requête
- Cliquez sur **"New Query"**
- Copiez le contenu du fichier `CREATE_MISSING_TABLES.sql`
- Collez-le dans l'éditeur SQL

### 3. Exécutez le script
- Cliquez sur **"Run"** (ou appuyez sur Ctrl+Enter)
- Attendez que le script se termine

### 4. Vérifiez la création
Vous devriez voir un message de succès. Les tables suivantes seront créées :
- `teacher_subjects` - Relation entre professeurs et matières
- `class_teachers` - Relation entre classes et professeurs

## Contenu du script

Le script crée :

```sql
-- Table pour les matières des professeurs
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(teacher_id, subject_id)
);

-- Table pour les professeurs des classes
CREATE TABLE IF NOT EXISTS public.class_teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(class_id, teacher_id)
);
```

## Après la création

Une fois les tables créées :
1. Rechargez l'application
2. Les erreurs 500 devraient disparaître
3. Vous pourrez ajouter des matières aux professeurs
4. Vous pourrez ajouter plusieurs professeurs par classe

## Dépannage

Si vous recevez une erreur :
- Vérifiez que vous êtes connecté en tant qu'admin Supabase
- Assurez-vous que les tables `profiles`, `classes` et `subjects` existent
- Vérifiez que les noms de tables sont corrects (sensibles à la casse)
