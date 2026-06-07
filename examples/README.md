# Exemples de fichiers Massar (notes d'examens)

Ces fichiers reproduisent le **format réel d'un export Massar** de notes
(métadonnées en haut, en-têtes arabes, **un onglet par matière**, clé =
**code Massar**, décimales à la **virgule**). Ils servent à tester l'import
de la page **Admin → Notes d'examens**.

| Fichier | Niveau | Examen | Matières |
|---|---|---|---|
| `exemple_massar_2BAC_SVT_national.xlsx` | 2BAC SVT | National | SVT, PC, Maths, Philosophie, Anglais |
| `exemple_massar_3AC_regional.xlsx` | 3AC | Régional | Arabe, Maths, Français, PC, SVT, Sociales, Éd. islamique, Anglais |

## ⚠️ Important
- Les **codes Massar et noms sont fictifs** : ils illustrent le **format**.
  Pour un import réel, l'appariement se fait par **code Massar** ; partez donc
  de l'**export Massar de votre propre établissement** (ou éditez ces fichiers
  en remplaçant les codes par ceux de vos élèves).
- Chaque onglet = **une matière** (format Massar « par matière ») : à l'import,
  sélectionnez « Matière du fichier Massar… » si une feuille n'a qu'une colonne
  note, puis importez feuille par feuille.

## Régénérer
```bash
node scripts/gen-massar-example.mjs
```
