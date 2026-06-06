# Examens de certification (système marocain)

Gestion des **années إشهادية** (à examen national/régional/local) : **6ème primaire (6AP)**,
**3ème collège (3AC)**, **1ère Bac (1BAC)** et **2ème Bac (2BAC)**, avec calcul de la
**moyenne de certification** en deux modes : **réel** et **simulé (examen blanc)**.

## 1. Règles officielles implémentées (MEN)

| Niveau | Formule de la moyenne de certification |
|--------|----------------------------------------|
| **2BAC** | 25% contrôle continu + 25% examen **régional** (passé en 1BAC) + 50% examen **national** |
| **1BAC** | moyenne de l'examen **régional** (= 25% du Bac final) |
| **3AC**  | 30% contrôle continu + 30% examen **local** + 40% examen **régional** |
| **6AP**  | (contrôle continu ×2 + **local** + **régional**) ÷ 4  → 50% / 25% / 25% |

Chaque examen ne porte que sur **certaines matières** selon la filière/niveau, avec des
**coefficients propres** (différents des coefficients de cursus pour le Bac).
Les matières et coefficients officiels sont pré-remplis (seed global `school_id = NULL`)
et **modifiables par école**.

Sources : voir les recherches dans l'historique (tawjihnet, 9rayti, MEN, etc.).

## 2. Déploiement

Exécuter **une fois** dans Supabase SQL Editor :

```
MIGRATION_EXAMS.sql
```

Crée : `exam_coefficients`, `exam_notes`, colonnes de certification sur `bulletins` /
`bulletin_lines`, RLS et seed des coefficients officiels.

## 3. Utilisation (admin)

1. **Notes d'examens** (menu latéral) :
   - Choisir la classe (niveau de certification), l'année, le **type d'examen**
     (national / régional / local — filtré selon le niveau) et le **scénario** :
     - **Réel** = notes officielles de l'examen passé.
     - **Examen blanc (simili)** = notes de simulation.
   - **Télécharger le modèle Excel** (élèves × matières de l'examen, pré-rempli).
   - **Importer Excel** (reconnaissance par code Massar, sinon Nom+Prénom).
   - Ou saisir directement dans la grille, puis **Enregistrer**.

2. **Bulletins** :
   - Pour une classe de certification, un sélecteur **Mode examen** apparaît
     (Réel / Simulé).
   - **Générer** calcule le contrôle continu **annuel** + les moyennes d'examen
     selon le mode, puis la **moyenne de certification** + mention.
   - Le PDF contient une section *Examen de certification* avec le détail par
     matière (local/régional/national), les moyennes pondérées et la moyenne finale.
   - Régénérer dans l'autre mode pour obtenir **les deux bulletins** (réel & simulé).
     Le mode du téléchargement PDF suit le sélecteur (`?mode=real|simili`).

### Mode simulé (« simili »)
Pour chaque matière/examen, on prend la note **réelle** si elle existe, sinon la note
**d'examen blanc**. Cela permet une **projection** : les examens déjà passés comptent en
réel, l'examen à venir compte avec sa note blanche.

## 4. Personnalisation des coefficients d'examen

API : `GET/PUT /api/bulletins/exam-coefficients?level=&filiere=&exam_type=`.
(Les défauts globaux MEN sont écrasés par les surcharges école.)
