# Interface Professeur - Guide Complet

## Vue d'ensemble

L'interface professeur est conçue pour faciliter le suivi pédagogique en temps réel avec une saisie rapide et une sauvegarde automatique.

## Écrans et Fonctionnalités

### 1. Accueil Professeur (`/teacher/home`)
- **Sélection de classe** : Choisir parmi les classes assignées
- **Actions rapides** : Créer une nouvelle séance, accéder au cahier, voir les évaluations
- **Séances d'aujourd'hui** : Liste des séances du jour avec accès direct
- **Historique** : Dernières séances enregistrées

### 2. Suivi de Séance (`/teacher/session/:classId/:sessionId`)
**Objectif** : Enregistrer présence, travail, discipline et usage du téléphone en < 3 minutes

**Caractéristiques** :
- Tableau avec une ligne par élève
- 4 colonnes cliquables avec états colorés
- Sauvegarde automatique toutes les 2 secondes
- Aucun champ texte obligatoire
- Interface minimaliste et responsive

**États des colonnes** :
- **Présence** : P (Présent/Vert), A (Absent/Rouge), R (Retard/Jaune), E (Excusé/Bleu)
- **Travail** : E (Excellent/Vert), B (Bon/Bleu), M (Moyen/Jaune), P (Pauvre/Rouge)
- **Discipline** : E (Excellent/Vert), B (Bon/Bleu), M (Moyen/Jaune), P (Pauvre/Rouge)
- **Téléphone** : ✓ (Oui/Rouge) ou ○ (Non/Gris)

### 3. Mini-Évaluation (`/teacher/assessments/:classId/:sessionId`)
- Toggle pour marquer un élève comme évalué
- Sélection de compétences avec 4 niveaux :
  - Non acquis (Rouge)
  - En cours (Jaune)
  - Acquis (Bleu)
  - Maîtrisé (Vert)
- Expansion/Réduction par élève
- Sauvegarde groupée

### 4. Cahier de Classe (`/teacher/calendar/:classId`)
**Planning hebdomadaire** (Lundi à Vendredi)

**Par jour** :
- Thème de la séance
- Objectifs pédagogiques
- Ressources utilisées
- Devoirs à faire

**Navigation** :
- Semaines précédente/suivante
- Édition en ligne
- Suppression de leçons

### 5. Fiche Élève (`/teacher/student/:studentId`)
**Lecture seule** - Agrégation des données de suivi

**Sections** :
- **Présences** : Compteurs (Présent, Absent, Retards)
- **Travail** : Compteurs (Excellent, Bon, Moyen, Pauvre)
- **Discipline** : Compteurs (Excellent, Bon, Téléphone)
- **Historique** : 10 dernières séances avec détails

## Architecture Technique

### Base de Données

#### Tables principales
- `sessions` : Séances de classe
- `session_tracking` : Suivi par élève et séance
- `mini_assessments` : Mini-évaluations
- `assessment_competencies` : Compétences évaluées
- `lesson_plan` : Planning hebdomadaire
- `competencies` : Référentiel de compétences

### Endpoints Backend

#### Séances
- `POST /api/teacher/sessions` - Créer une séance
- `GET /api/teacher/sessions/:sessionId` - Récupérer une séance
- `GET /api/teacher/classes/:classId/sessions` - Lister les séances d'une classe

#### Suivi
- `POST /api/teacher/session-tracking` - Enregistrer le suivi
- `GET /api/teacher/sessions/:sessionId/tracking` - Récupérer le suivi d'une séance

#### Mini-évaluations
- `GET /api/teacher/competencies` - Lister les compétences
- `POST /api/teacher/mini-assessments` - Enregistrer une évaluation

#### Cahier
- `GET /api/teacher/lesson-plan/:classId` - Récupérer le planning
- `POST /api/teacher/lesson-plan` - Créer une leçon
- `PUT /api/teacher/lesson-plan/:lessonId` - Mettre à jour
- `DELETE /api/teacher/lesson-plan/:lessonId` - Supprimer

#### Fiche élève
- `GET /api/teacher/students/:studentId` - Infos élève
- `GET /api/teacher/students/:studentId/stats` - Statistiques
- `GET /api/teacher/students/:studentId/tracking` - Historique

## Flux d'utilisation typique

### Début de séance
1. Accueil → Sélectionner classe
2. Cliquer "Nouvelle séance" ou sélectionner séance existante
3. Accéder au suivi de séance

### Suivi rapide (< 3 minutes)
1. Pour chaque élève, cliquer sur les colonnes pour définir l'état
2. Sauvegarde automatique en arrière-plan
3. Quitter quand terminé

### Évaluation (optionnel)
1. Depuis la séance, accéder aux mini-évaluations
2. Cocher les élèves à évaluer
3. Sélectionner les compétences et niveaux
4. Sauvegarder

### Planification
1. Accueil → Cahier
2. Naviguer vers la semaine souhaitée
3. Cliquer "Éditer" sur un jour
4. Remplir thème, objectifs, ressources, devoirs
5. Sauvegarder

## Design et UX

### Principes
- **Minimaliste** : Aucun élément superflu
- **Responsive** : Fonctionne sur mobile et PC
- **Rapide** : Sauvegarde automatique, pas de validation
- **Accessible** : Icônes claires, contraste élevé

### Couleurs
- Vert : Excellent/Présent
- Bleu : Bon/Acquis
- Jaune : Moyen/Retard
- Rouge : Pauvre/Absent/Problème

### Icônes
- Lucide React pour tous les icônes
- Tailles cohérentes (4-6 pour petits, 5-8 pour moyens)

## Intégration IA

Les données collectées permettent :
- **Analyse de comportement** : Patterns de présence, travail, discipline
- **Recommandations** : Suggestions d'intervention pédagogique
- **Prédictions** : Identification des élèves à risque
- **Rapports** : Synthèses automatiques par élève/classe

## Prochaines étapes

1. ✅ Créer les tables de base de données
2. ✅ Développer les pages React
3. ✅ Implémenter les endpoints backend
4. ⏳ Ajouter les routes dans le frontend
5. ⏳ Créer les données de test (compétences)
6. ⏳ Tester l'interface complète
7. ⏳ Intégrer l'IA pédagogique
