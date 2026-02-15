-- Diagnostic complet pour le système de documents et notifications

-- 1. Vérifier les documents récents
SELECT 
  '=== DOCUMENTS ===' as section;
  
SELECT 
  td.id,
  td.title,
  td.document_type,
  td.class_id,
  td.teacher_id,
  td.created_at,
  td.total_students,
  c.name as class_name,
  p.first_name || ' ' || p.last_name as teacher_name
FROM teaching_documents td
LEFT JOIN classes c ON td.class_id = c.id
LEFT JOIN profiles p ON td.teacher_id = p.id
ORDER BY td.created_at DESC
LIMIT 10;

-- 2. Vérifier les notifications de type document
SELECT 
  '=== NOTIFICATIONS DE TYPE DOCUMENT ===' as section;

SELECT 
  n.id,
  n.user_id,
  n.type,
  n.title,
  n.message,
  n.related_id,
  n.read,
  n.created_at,
  p.first_name || ' ' || p.last_name as student_name,
  c.name as class_name
FROM notifications n
LEFT JOIN profiles p ON n.user_id = p.id
LEFT JOIN classes c ON p.class_id = c.id
WHERE n.type = 'document'
ORDER BY n.created_at DESC
LIMIT 10;

-- 3. Vérifier les élèves dans chaque classe
SELECT 
  '=== ÉLÈVES PAR CLASSE ===' as section;

SELECT 
  c.id as class_id,
  c.name as class_name,
  COUNT(p.id) as student_count
FROM classes c
LEFT JOIN profiles p ON c.id = p.class_id AND p.role = 'student'
GROUP BY c.id, c.name
ORDER BY student_count DESC;

-- 4. Vérifier les documents par classe
SELECT 
  '=== DOCUMENTS PAR CLASSE ===' as section;

SELECT 
  c.id as class_id,
  c.name as class_name,
  COUNT(td.id) as document_count
FROM classes c
LEFT JOIN teaching_documents td ON c.id = td.class_id
GROUP BY c.id, c.name
ORDER BY document_count DESC;

-- 5. Vérifier les notifications par utilisateur
SELECT 
  '=== NOTIFICATIONS PAR UTILISATEUR ===' as section;

SELECT 
  n.user_id,
  p.first_name || ' ' || p.last_name as student_name,
  c.name as class_name,
  COUNT(*) FILTER (WHERE n.type = 'document') as document_notifications,
  COUNT(*) FILTER (WHERE n.read = false AND n.type = 'document') as unread_document_notifications
FROM notifications n
LEFT JOIN profiles p ON n.user_id = p.id
LEFT JOIN classes c ON p.class_id = c.id
WHERE p.role = 'student'
GROUP BY n.user_id, p.first_name, p.last_name, c.name
ORDER BY unread_document_notifications DESC;

-- 6. Vérifier un document spécifique et ses notifications
SELECT 
  '=== DERNIER DOCUMENT ET SES NOTIFICATIONS ===' as section;

WITH last_doc AS (
  SELECT id, title, class_id, teacher_id, created_at
  FROM teaching_documents
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  ld.id as document_id,
  ld.title,
  ld.class_id,
  ld.created_at as document_created_at,
  COUNT(n.id) as notification_count,
  COUNT(n.id) FILTER (WHERE n.read = false) as unread_count
FROM last_doc ld
LEFT JOIN notifications n ON n.related_id = ld.id AND n.type = 'document'
GROUP BY ld.id, ld.title, ld.class_id, ld.created_at;

-- 7. Vérifier les permissions RLS
SELECT 
  '=== POLITIQUES RLS ===' as section;

SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN ('teaching_documents', 'notifications', 'document_views')
ORDER BY tablename, cmd;
