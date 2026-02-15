# ⚠️ URGENT - Corriger les permissions Supabase

## Problème
Les tables de suivi pédagogique n'ont pas les permissions correctes pour `service_role`.

## Solution immédiate

### Étape 1 : Ouvrir Supabase SQL Editor
1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet
3. Cliquez sur **SQL Editor**
4. Créez une **New Query**

### Étape 2 : Exécuter le script de permissions

Copiez et collez ce code :

```sql
-- Donner les permissions à service_role sur le schéma
GRANT USAGE ON SCHEMA public TO service_role;

-- Permissions pour les tables existantes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_subjects TO service_role;

-- Permissions pour les nouvelles tables de suivi pédagogique
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_tracking TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mini_assessments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_competencies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_plan TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competencies TO service_role;

-- Permissions sur les séquences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Désactiver RLS sur les tables de suivi
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_tracking DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.mini_assessments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_competencies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_plan DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.competencies DISABLE ROW LEVEL SECURITY;
```

### Étape 3 : Cliquer sur Run

Attendez la confirmation ✓

### Étape 4 : Rechargez l'application

Appuyez sur F5 dans votre navigateur et testez le suivi de séance.

## Nouvelle page créée

Une nouvelle page **"Suivi de séance"** a été créée avec :
- ✅ Sélection de classe
- ✅ Sélection de date
- ✅ Tableau avec tous les élèves
- ✅ Colonnes cliquables (Présence, Travail, Discipline, Téléphone)
- ✅ Sauvegarde automatique
- ✅ Tous les textes en français

## Accès à la nouvelle page

Dans le Sidebar (menu de gauche) → **Suivi de séance**

## Vérification

Après l'exécution du script, vous devriez pouvoir :
1. Cliquer sur "Suivi de séance" dans le menu
2. Sélectionner une classe
3. Cliquer sur les boutons pour enregistrer les données
4. Voir "✓ Sauvegardé" en haut à droite

---

**C'est urgent ! Exécutez ce script maintenant pour que tout fonctionne.**
