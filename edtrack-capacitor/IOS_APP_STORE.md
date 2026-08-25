# Publier Bousole sur l'App Store

Tout le code nécessaire est en place. Ce qui reste est **côté Apple** : des comptes,
des clés et des secrets GitHub. Cette page est la marche à suivre.

---

## 1. Compte Apple Developer

- Adhésion **Apple Developer Program** : 99 $/an → https://developer.apple.com/programs/
- Compte **Organisation** recommandé (nom de la société affiché sur la fiche App Store).
  Il exige un numéro **D‑U‑N‑S** — comptez 1 à 2 semaines de délai.
- Noter le **Team ID** (10 caractères, visible en haut à droite du portail Developer).

## 2. Enregistrer l'app

1. Portail Developer → **Certificates, Identifiers & Profiles** → *Identifiers* → **+**
   - Type : App IDs → App
   - Bundle ID (explicit) : `org.edtrack.app`
   - Capabilities : cocher **Push Notifications**
2. **App Store Connect** → *Mes apps* → **+** → Nouvelle app
   - Plateforme iOS, bundle ID `org.edtrack.app`, nom « Bousole ».

## 3. Clé APNs (notifications)

Portail Developer → *Keys* → **+** → cocher **Apple Push Notifications service (APNs)**.
Le fichier `AuthKey_XXXXXXXXXX.p8` **n'est téléchargeable qu'une seule fois** : conservez-le.

À renseigner ensuite dans les variables d'environnement du **backend** :

| Variable | Valeur |
|---|---|
| `APNS_KEY_P8` | contenu du `.p8` (ou sa version base64 sur une ligne) |
| `APNS_KEY_ID` | les 10 caractères du nom du fichier |
| `APNS_TEAM_ID` | Team ID Apple |
| `APNS_BUNDLE_ID` | `org.edtrack.app` (défaut) |
| `APNS_ENV` | `production` (défaut) — `sandbox` pour un build Debug lancé depuis Xcode |

Le backend envoie alors les notifications iOS **en direct à Apple**
([backend/src/services/apnsPush.js](../backend/src/services/apnsPush.js)), tandis
qu'Android continue de passer par FCM. Aucun `GoogleService-Info.plist` n'est nécessaire.

## 4. Certificat et profil de signature

Depuis un Mac (ou via le portail Developer si vous générez la CSR ailleurs) :

1. Certificat **Apple Distribution** → l'exporter depuis Trousseau d'accès en `.p12`
   avec un mot de passe.
2. *Profiles* → **+** → **App Store Connect** → App ID `org.edtrack.app` → certificat
   ci-dessus. Donner un nom clair, par ex. `Bousole App Store`, puis télécharger
   le `.mobileprovision`.

## 5. Clé API App Store Connect (envoi automatique)

App Store Connect → *Utilisateurs et accès* → *Intégrations* → **Clés d'API** → **+**
(rôle **App Manager**). Notez le **Key ID**, l'**Issuer ID**, et téléchargez le `.p8`.

## 6. Secrets GitHub

`Settings > Secrets and variables > Actions` :

| Secret | Contenu |
|---|---|
| `IOS_CERT_P12_BASE64` | le `.p12` encodé en base64 |
| `IOS_CERT_P12_PASSWORD` | mot de passe du `.p12` |
| `IOS_PROVISION_BASE64` | le `.mobileprovision` encodé en base64 |
| `IOS_PROVISION_NAME` | nom exact du profil (`Bousole App Store`) |
| `IOS_TEAM_ID` | Team ID Apple |
| `ASC_KEY_ID` | Key ID de la clé App Store Connect |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8_BASE64` | le `.p8` App Store Connect encodé en base64 |

Encodage en base64 :

```bash
certutil -encode fichier.p12 fichier.txt
```

(sur macOS/Linux : `base64 -i fichier.p12 -o fichier.txt`) — retirez les lignes
`-----BEGIN/END CERTIFICATE-----` ajoutées par `certutil`.

## 7. Lancer le build

GitHub → onglet **Actions** → *iOS - TestFlight / App Store* → **Run workflow**,
en indiquant la version commerciale (ex. `1.0.1`). Le numéro de build est le numéro
de run, donc toujours unique. Le workflow signe, exporte l'IPA et l'envoie sur
TestFlight. Comptez 10 à 30 min de traitement avant qu'il apparaisse dans TestFlight.

Le workflow *Build iOS IPA (test, non signé)* sert uniquement à vérifier que le
projet compile ; son IPA n'est pas installable.

---

## Avant de soumettre à la review

- [ ] **Compte de démo** (identifiant + mot de passe) renseigné dans *App Review
      Information*. L'app est derrière un login : sans ça, rejet automatique.
- [ ] **Politique de confidentialité** en ligne, URL publique renseignée. Données
      d'élèves mineurs → soyez explicite sur la finalité et la conservation.
- [ ] **Fiche App Privacy** cohérente avec
      [PrivacyInfo.xcprivacy](ios/App/App/PrivacyInfo.xcprivacy) : nom, e‑mail,
      téléphone, position précise, contenu utilisateur, identifiant d'appareil —
      tous « liés à l'utilisateur », aucun suivi publicitaire.
- [ ] **Règle 4.2 « Minimum Functionality »** : l'app charge `https://etrack.ma`
      dans une WebView, ce qu'Apple rejette si rien ne la distingue d'un site.
      Mettez en avant dans les notes de review les fonctions réellement natives :
      notifications push, suivi GPS des bus, téléchargement et partage de documents.
- [ ] Captures d'écran 6,7" et 6,5" (iPhone) — obligatoires.
- [ ] Classification par âge : l'app cible des établissements scolaires, prévoir
      la question sur les utilisateurs mineurs.

## Ce qui est déjà fait dans le dépôt

- Projet Xcode Capacitor : [ios/App](ios/App)
- Manifeste de confidentialité : `ios/App/App/PrivacyInfo.xcprivacy`
- Entitlements APNs : `App.entitlements` (production) / `AppDebug.entitlements` (sandbox)
- Relais du jeton APNs vers Capacitor : `ios/App/App/AppDelegate.swift`
- `Info.plist` : mode arrière-plan notifications, `ITSAppUsesNonExemptEncryption`,
  descriptions caméra / photothèque / localisation en français, `arm64`
- ATS **non** désactivé (etrack.ma est en HTTPS)
- Envoi iOS côté serveur : [backend/src/services/apnsPush.js](../backend/src/services/apnsPush.js)
