# 🧪 Tests de l'API

Ce document contient des exemples de requêtes pour tester l'API.

## 🔐 Authentification

### Créer un compte Admin
```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "email": "admin@school.com",
  "password": "Admin123!",
  "firstName": "Admin",
  "lastName": "Principal",
  "role": "admin"
}
```

### Créer un compte Professeur
```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "email": "teacher@school.com",
  "password": "Teacher123!",
  "firstName": "Marie",
  "lastName": "Dupont",
  "role": "teacher"
}
```

### Créer un compte Élève
```bash
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{
  "email": "student@school.com",
  "password": "Student123!",
  "firstName": "Jean",
  "lastName": "Martin",
  "role": "student"
}
```

### Se connecter
```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@school.com",
  "password": "Admin123!"
}
```

Réponse :
```json
{
  "user": {...},
  "session": {
    "access_token": "eyJhbGc...",
    ...
  },
  "profile": {
    "id": "...",
    "email": "admin@school.com",
    "first_name": "Admin",
    "last_name": "Principal",
    "role": "admin"
  }
}
```

**Important** : Copiez le `access_token` pour les requêtes suivantes.

### Vérifier l'utilisateur actuel
```bash
GET http://localhost:3000/api/auth/me
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## 👥 Gestion des Élèves

### Lister tous les élèves (Admin/Prof)
```bash
GET http://localhost:3000/api/students
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Récupérer un élève
```bash
GET http://localhost:3000/api/students/{student_id}
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Créer un élève (Admin)
```bash
POST http://localhost:3000/api/students
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "email": "eleve2@school.com",
  "firstName": "Sophie",
  "lastName": "Bernard",
  "dateOfBirth": "2008-05-15"
}
```

## 📅 Gestion des Présences

### Marquer une absence (Prof/Admin)
```bash
POST http://localhost:3000/api/attendance
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "studentId": "student_uuid_here",
  "date": "2025-01-20",
  "status": "absent",
  "reason": "Maladie"
}
```

Status possibles : `present`, `absent`, `late`, `excused`

### Lister les absences
```bash
GET http://localhost:3000/api/attendance?studentId=student_uuid_here
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Statistiques d'assiduité
```bash
GET http://localhost:3000/api/attendance/stats/{student_id}
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## 💬 Gestion du Comportement

### Ajouter une évaluation (Prof/Admin)
```bash
POST http://localhost:3000/api/behavior
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "studentId": "student_uuid_here",
  "type": "positive",
  "description": "Excellente participation en classe",
  "severity": 4
}
```

Types : `positive`, `negative`, `neutral`
Severity : 1-5

### Lister les évaluations
```bash
GET http://localhost:3000/api/behavior?studentId=student_uuid_here
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## 📝 Gestion des Devoirs

### Créer un devoir (Prof/Admin)
```bash
POST http://localhost:3000/api/assignments
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "title": "Exercices de Mathématiques",
  "description": "Chapitre 5 - Exercices 1 à 10",
  "classId": "class_uuid_here",
  "subjectId": "subject_uuid_here",
  "dueDate": "2025-01-25T23:59:59Z",
  "maxScore": 100
}
```

### Lister les devoirs
```bash
GET http://localhost:3000/api/assignments
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Soumettre un devoir (Élève)
```bash
POST http://localhost:3000/api/assignments/{assignment_id}/submit
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "content": "Mes réponses aux exercices...",
  "fileUrl": "https://example.com/mon-devoir.pdf"
}
```

### Noter une soumission (Prof/Admin)
```bash
PUT http://localhost:3000/api/assignments/submissions/{submission_id}/grade
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "score": 85,
  "feedback": "Très bon travail ! Quelques erreurs mineures."
}
```

## 🤖 Module IA

### Assistant pour professeur
```bash
POST http://localhost:3000/api/ai/teacher-assistant
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "question": "Comment aider un élève en difficulté en mathématiques ?",
  "context": {
    "studentId": "student_uuid_here"
  }
}
```

### Assistant pour élève
```bash
POST http://localhost:3000/api/ai/student-assistant
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "question": "Comment mieux organiser mes révisions ?"
}
```

## ✅ Vérification de santé

### Vérifier que l'API fonctionne
```bash
GET http://localhost:3000/api/health
```

Réponse attendue :
```json
{
  "status": "OK",
  "message": "API is running"
}
```

## 📌 Notes importantes

1. **Token d'authentification** : Toutes les routes (sauf `/auth/*` et `/health`) nécessitent un token Bearer
2. **Format des dates** : Utilisez le format ISO 8601 (ex: `2025-01-20T10:30:00Z`)
3. **UUIDs** : Les IDs sont des UUIDs générés par Supabase
4. **Permissions** : Certaines routes sont restreintes par rôle (admin, teacher, student)

## 🔧 Outils recommandés

- **Postman** : https://www.postman.com/
- **Insomnia** : https://insomnia.rest/
- **Thunder Client** (VS Code extension)
- **curl** (ligne de commande)
