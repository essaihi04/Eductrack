# Documents officiels — École Principale

Générés par `node backend/scripts/genEcoleDocs.mjs` (relancez la commande après avoir
modifié les contenus dans le script).

| Fichier | À importer en catégorie | Sert à |
|---|---|---|
| `Fournitures_2026-2027_Maternelle_Primaire.pdf` | **Fournitures** | PS → 6AP |
| `Fournitures_2026-2027_College_Lycee.pdf` | **Fournitures** | 1AC → 2BAC |
| `Reglement_interieur_2026-2027.pdf` | **Règlement** | réponses libres du chatbot |

## Mise en service (4 étapes)

1. **Base de données** — dans l'éditeur SQL de Supabase, exécutez si ce n'est pas déjà fait :
   `ADD_CHATBOT_KNOWLEDGE.sql`, `ADD_SCHOOL_SHOWCASE.sql`, puis
   `SEED_VITRINE_ECOLE_PRINCIPALE.sql` (⚠️ relisez d'abord les valeurs de démonstration :
   taux de réussite, atouts, coordonnées).

2. **Import des PDF** — application → *Communication → Documents chatbot* → « Importer un
   document ». Un import par fichier, avec la bonne catégorie. Le backend extrait le texte
   et découpe les fournitures **par niveau** : attendez le statut *Prêt* et vérifiez que les
   niveaux détectés sont complets (9 niveaux pour le primaire, 6 pour le collège-lycée).

3. **Photos** — *Communication → Vitrine école*. Les rubriques (cantine, salles, équipements,
   sport, activités, transport) sont déjà créées **sans image** : ouvrez chacune et utilisez
   « Remplacer l'image ». Une rubrique sans photo reste envoyée en texte.

4. **Chatbot visiteur** — le seed active `public_chatbot_enabled`. Vérifiez l'interrupteur
   dans *Communication → Documents chatbot*. Un numéro inconnu reçoit alors : fournitures
   (PDF par niveau), vitrine (photos + résultats + filières), réponses issues du règlement —
   et **jamais** de données d'élève.

## Test rapide

Depuis un téléphone dont le numéro n'est pas rattaché à un parent, écrivez au WhatsApp de
l'école : `bonjour` → menu visiteur ; `fournitures 5AP` → PDF du niveau ; `vous avez une
cantine ?` → texte + photos ; `quel est le taux de réussite ?` → chiffre publié.
