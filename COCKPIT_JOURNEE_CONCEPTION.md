# Cockpit Journée — conception

Vue « journée » de l'espace admin : lire une journée entière d'un coup d'œil —
quelles classes ont été suivies, par qui, et qui a décroché.

**État : proposition. Rien n'est construit.** Chiffres relevés sur la base de
production le 2026-08-16.

---

## 1. Ce que la base contient réellement

Mesuré avant toute maquette. Trois des quatre sources demandées sont vides ou
quasi vides.

| Donnée | Réel | Conséquence |
|---|---|---|
| Photos élèves (`profiles.avatar_url`) | **13 / 2 969** (0,4 %) | Le carrousel 3D de photos porterait sur presque rien |
| Photos profs | **0 / 84** | « Le prof, son nom et son image » n'a pas d'image |
| `class_timetable` | **8 classes / 133** (51 créneaux) | 94 % des classes n'ont aucun horaire saisi |
| `behavior_records` | **0 ligne** | La table comportement est vide |
| `session_tracking` | **11 865 lignes** | La vraie richesse : présence, discipline, téléphone, sommeil, participation, cahier |
| Dernière séance | **2026-08-08** | Ouverte « aujourd'hui », la page serait vide |

Le cœur visuel demandé (carrousel 3D de visages, photo du prof) repose sur des
données inexistantes. Ce n'est pas une raison d'abandonner l'idée, mais elle ne
peut pas être livrée telle quelle.

## 2. Les quatre décisions imposées par ces chiffres

### Monogrammes par défaut, photo quand elle existe
Pastille générée à partir des initiales, teinte dérivée de l'`id` de l'élève
(donc stable et reconnaissable d'une séance à l'autre). Le carrousel garde son
sens : des jetons qui tournent, pas des cadres vides. Une photo ajoutée
remplace le monogramme sans changement de code.

### Le comportement se lit dans `session_tracking`
`behavior_records` est vide et le restera : personne ne la remplit. Les
colonnes réelles sont `discipline`, `attitude`, `phone_use`, `sleeping`,
`homework` — sur 11 865 lignes au lieu de zéro.

### Sélecteur de jour, ouvert sur le dernier jour utile
« La journée » ne peut pas vouloir dire « aujourd'hui » : la dernière séance
date du 8 août. Une page qui s'ouvre vide passe pour cassée. Défaut : le jour
le plus récent contenant des séances, avec navigation et retour « aujourd'hui ».

### Le vide est un état à concevoir
Avec 8 classes sur 133, la grille sera surtout faite de trous. Une classe sans
horaire s'affiche explicitement, avec l'action « saisir l'emploi du temps » —
sinon le directeur conclut que l'outil ne voit pas ses classes.

## 3. Trois niveaux de lecture

**Niveau 0 — la grille.** Rail horaire vertical, une ligne par classe, un bloc
par créneau. Couleurs d'état : suivie / non suivie / en cours / à venir / sans
emploi du temps. Ligne « maintenant » calculée côté navigateur.

**Niveau 1 — le survol.** Matière, horaire, salle, prof (nom, monogramme,
heures du mois, séances suivies), et trois compteurs : absents, à risque,
score de santé.

**Niveau 2 — le clic.** Panneau de détail : trois rangées de jetons (absents,
à risque, incidents de comportement), la rangée active en carrousel 3D, plus le
cahier de texte et les remarques du prof.

### Contrainte structurante : le survol ne déclenche aucune requête
Un aperçu qui charge au survol arrive toujours en retard, surtout quand le
curseur balaie vingt créneaux en quelques secondes. **Tout ce qu'affiche le
survol est préchargé avec la grille.** Seul le clic va chercher du neuf.

## 4. Les données, source par source

| Donnée | Source | État |
|---|---|---|
| Créneaux du jour (horaire, matière, salle, prof) | `class_timetable` | existe |
| Suivie / non suivie | rapprochement `sessions` ↔ créneau | existe |
| Score de santé (présence, participation, incidents) | agrégat `session_tracking` | existe |
| Responsable pédagogique du créneau | `pedagogical_manager_scopes` | existe |
| Nom des absents + monogramme | `session_tracking` + `profiles` | à ajouter |
| Élèves à risque | score de risque déjà codé dans `admin.routes.js`, à rebrancher | à ajouter |
| Incidents de comportement | `discipline`, `attitude`, `phone_use`, `sleeping` | à ajouter |
| Heures du prof ce mois | somme des `sessions` du mois | à ajouter |
| Séances suivies par le prof | `sessions` ayant du `session_tracking` | à ajouter |
| Photo élève / prof | `profiles.avatar_url` | quasi vide |

### Travail serveur

- **Étendre `GET /api/admin/dashboard/timetable-today`** (existe déjà,
  `admin.routes.js`). Il charge déjà le détail élève et n'en garde que des
  compteurs — il suffit de cesser de le jeter. Ajouter : paramètre de date,
  agrégats prof, score de risque.
- **Nouvel endpoint de détail** `GET /dashboard/session/:id` : liste complète
  des élèves de la séance avec tous les indicateurs, cahier de texte, remarques.
- **Volume** : une journée à 133 classes représente potentiellement quelques
  milliers de lignes de suivi. Le niveau 0 renvoie les *listes courtes*
  (absents, à risque, incidents), jamais la classe entière. Le détail complet
  attend le clic.

## 5. Le relief sans moteur 3D

Le projet n'a aucune librairie 3D ; `framer-motion` est déjà installé et anime
déjà `rotateX` / `rotateY` sur la page d'accueil. Un carrousel cylindrique
s'obtient avec `perspective` sur le conteneur et une rotation par jeton : le
jeton de face agrandi et net, les autres reculés et atténués.

Three.js apporterait ombres et matériaux réels — invisible sur des pastilles à
initiales, contre plusieurs centaines de Ko à télécharger. Écarté.

## 6. Découpage

Chaque lot est utilisable seul.

1. **La grille et ses états** — sélecteur de jour, ligne « maintenant »,
   couleurs d'état, cas « sans emploi du temps ». S'appuie sur l'endpoint
   existant sans le modifier.
2. **Le survol enrichi** — extension de `timetable-today` : absents nommés, à
   risque, incidents, agrégats prof. Tout préchargé.
3. **Le panneau de détail** — nouvel endpoint séance, trois rangées de jetons,
   carrousel 3D, cahier de texte.
4. **Les vraies photos** — chantier séparé : collecte et rattachement des 2 969
   portraits. Le carrousel les accepte sans modification.

## 7. À trancher avant de démarrer

- **Les monogrammes conviennent-ils** pour les lots 1 à 3 ? Si les vrais
  visages sont exigés dès le départ, la collecte devient le chemin critique et
  passe en lot 1.
- **Quel périmètre ?** Les 8 classes pourvues d'un emploi du temps, ou faut-il
  saisir les 125 autres d'abord ? La page n'a d'intérêt pour un directeur que si
  sa journée y est complète — c'est le vrai préalable, davantage que le 3D.
