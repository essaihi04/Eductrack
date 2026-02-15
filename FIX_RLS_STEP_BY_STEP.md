# 🔐 Correction des erreurs de permissions RLS

## Problème
L'erreur suivante apparaît :
```
permission denied for table class_teachers
permission denied for table teacher_subjects
```

Les tables existent maintenant, mais les politiques RLS (Row Level Security) ne permettent pas aux admins d'y accéder.

## Solution (3 minutes)

### Étape 1 : Ouvrir Supabase SQL Editor
1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet
3. Cliquez sur **SQL Editor** → **New Query**

### Étape 2 : Exécuter le script de correction

Copiez et collez ce script complet :

```sql
-- Activer RLS sur les tables
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes politiques
DROP POLICY IF EXISTS "Admins can manage teacher subjects" ON public.teacher_subjects;
DROP POLICY IF EXISTS "Admins can manage class teachers" ON public.class_teachers;

-- Créer les nouvelles politiques pour teacher_subjects
CREATE POLICY "Admins can manage teacher subjects" ON public.teacher_subjects
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Créer les nouvelles politiques pour class_teachers
CREATE POLICY "Admins can manage class teachers" ON public.class_teachers
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

### Étape 3 : Cliquez sur **Run**

Attendez le message de succès ✓

### Étape 4 : Rechargez l'application

Appuyez sur **F5** pour recharger

## Vérification

Les erreurs devraient disparaître et vous pourrez :
- ✅ Ajouter des matières aux professeurs
- ✅ Ajouter plusieurs professeurs par classe
- ✅ Importer des élèves via Excel

## Si ça ne fonctionne pas

Exécutez cette requête pour vérifier l'état des politiques :

```sql
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename IN ('teacher_subjects', 'class_teachers');
```

Vous devriez voir 2 politiques pour chaque table.
