# ⚠️ IMPORTANT : Exécutez ce script maintenant dans Supabase

Les erreurs "permission denied for table class_teachers" continuent parce que le script RLS n'a pas été exécuté dans Supabase.

## Instructions (1 minute)

### 1. Ouvrez Supabase
- Allez sur https://app.supabase.com
- Sélectionnez votre projet
- Cliquez sur **SQL Editor** dans le menu de gauche

### 2. Créez une nouvelle requête
- Cliquez sur **"New Query"**

### 3. Copiez ce script EXACTEMENT

```sql
DROP POLICY IF EXISTS "Admins can manage teacher subjects" ON public.teacher_subjects;
DROP POLICY IF EXISTS "Admins can manage class teachers" ON public.class_teachers;

CREATE POLICY "teacher_subjects_admin_policy" ON public.teacher_subjects
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "class_teachers_admin_policy" ON public.class_teachers
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
```

### 4. Cliquez sur **"Run"** (ou Ctrl+Enter)

Attendez le message de succès ✓

### 5. Rechargez l'application

Appuyez sur **F5** dans votre navigateur

## Résultat attendu

Les erreurs devraient disparaître et vous pourrez :
- ✅ Ajouter des matières aux professeurs
- ✅ Ajouter plusieurs professeurs par classe
- ✅ Importer des élèves via Excel

## Si vous recevez une erreur

Vérifiez que :
1. Vous êtes connecté à Supabase en tant qu'admin
2. Vous avez copié le script exactement
3. Les tables `teacher_subjects` et `class_teachers` existent (créées précédemment)
