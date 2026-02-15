# Format d'import des élèves via Excel

## Instructions

Pour importer des élèves en masse dans une classe, utilisez un fichier Excel (.xlsx, .xls ou .csv) avec le format suivant :

### Colonnes requises

| email | firstName | lastName |
|-------|-----------|----------|
| jean.dupont@example.com | Jean | Dupont |
| marie.martin@example.com | Marie | Martin |
| pierre.bernard@example.com | Pierre | Bernard |

### Détails

- **email** : Adresse email unique de l'élève (obligatoire)
- **firstName** : Prénom de l'élève (obligatoire)
- **lastName** : Nom de famille de l'élève (obligatoire)
- **password** : Mot de passe (optionnel, par défaut: TempPassword123!)

### Exemple de fichier Excel

```
email                          | firstName | lastName
jean.dupont@example.com        | Jean      | Dupont
marie.martin@example.com       | Marie     | Martin
pierre.bernard@example.com     | Pierre    | Bernard
sophie.rousseau@example.com    | Sophie    | Rousseau
```

### Variantes de noms de colonnes acceptées

Le système accepte plusieurs variantes de noms de colonnes :
- `email` ou `Email`
- `firstName` ou `First Name` ou `Prénom`
- `lastName` ou `Last Name` ou `Nom`
- `password` ou `Password`

### Étapes d'import

1. Allez dans l'onglet **Classes**
2. Cliquez sur la classe pour l'étendre
3. Cliquez sur **"Choisir un fichier Excel"**
4. Sélectionnez votre fichier Excel
5. Les élèves seront créés automatiquement et assignés à la classe

### Notes importantes

- Les emails doivent être uniques
- Tous les champs obligatoires doivent être remplis
- Les élèves seront créés avec un mot de passe temporaire s'il n'est pas spécifié
- Les élèves seront automatiquement assignés à la classe sélectionnée
