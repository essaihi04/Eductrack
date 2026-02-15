# ⚠️ URGENT - Corriger les permissions de session_tracking

## Erreur rencontrée
```
permission denied for table session_tracking
```

## Solution

Exécutez ce script dans Supabase SQL Editor **maintenant** :

### Étapes

1. Allez sur https://app.supabase.com → Votre projet → **SQL Editor**
2. Créez une **New Query**
3. Copiez et collez ce code :

```sql
-- Donner les permissions à service_role pour les tables de suivi pédagogique

GRANT USAGE ON SCHEMA public TO service_role;

-- Permissions pour sessions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO service_role;

-- Permissions pour session_tracking
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_tracking TO service_role;

-- Permissions pour mini_assessments
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mini_assessments TO service_role;

-- Permissions pour assessment_competencies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_competencies TO service_role;

-- Permissions pour lesson_plan
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_plan TO service_role;

-- Permissions pour competencies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competencies TO service_role;

-- Permissions sur les séquences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
```

4. Cliquez sur **Run**
5. Attendez la confirmation ✓

## Après l'exécution

Rechargez l'application et testez à nouveau le suivi de séance. L'erreur devrait disparaître.

## Vérification

Pour vérifier que les permissions sont appliquées, exécutez :

```sql
SELECT table_name, privilege 
FROM information_schema.role_table_grants 
WHERE grantee = 'service_role' 
AND table_name IN ('sessions', 'session_tracking', 'mini_assessments', 'assessment_competencies', 'lesson_plan', 'competencies')
ORDER BY table_name, privilege;
```

Vous devriez voir 6 tables avec les permissions SELECT, INSERT, UPDATE, DELETE.
