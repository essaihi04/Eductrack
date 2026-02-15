-- Script de diagnostic pour vérifier si les documents sont créés et les notifications

-- 1. Vérifier les documents récents créés
SELECT 
  td.id,
  td.title,
  td.document_type,
  td.class_id,
  td.teacher_id,
  td.created_at,
  c.name as class_name,
  p.first_name || ' ' || p.last_name as teacher_name,
  td.total_students
FROM teaching_documents td
LEFT JOIN classes c ON td.class_id = c.id
LEFT JOIN profiles p ON td.teacher_id = p.id
ORDER BY td.created_at DESC
LIMIT 20;

-- 2. Vérifier les notifications créées récemment
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
LIMIT 20;

-- 3. Vérifier si des documents existent pour une classe spécifique
-- Remplacez 'VOTRE_CLASS_ID' par l'ID de votre classe
SELECT 
  td.id,
  td.title,
  td.document_type,
  td.created_at,
  COUNT(*) OVER() as total_documents
FROM teaching_documents td
WHERE td.class_id IS NOT NULL
ORDER BY td.created_at DESC;

-- 4. Vérifier les élèves dans une classe
SELECT 
  p.id,
  p.first_name,
  p.last_name,
  p.class_id,
  c.name as class_name
FROM profiles p
LEFT JOIN classes c ON p.class_id = c.id
WHERE p.role = 'student'
  AND p.class_id IS NOT NULL
ORDER BY c.name, p.last_name
LIMIT 10;

-- 5. Vérifier les permissions sur teaching_documents
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'teaching_documents';

-- 6. Vérifier les permissions sur notifications
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'notifications';

-- 7. Compter les documents par classe
SELECT 
  c.id as class_id,
  c.name as class_name,
  COUNT(td.id) as document_count
FROM classes c
LEFT JOIN teaching_documents td ON c.id = td.class_id
GROUP BY c.id, c.name
ORDER BY document_count DESC;

-- 8. Vérifier si RLS est activé sur les tables
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('teaching_documents', 'notifications', 'document_views');
