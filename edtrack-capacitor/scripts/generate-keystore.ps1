# Script PowerShell pour générer le keystore de signature APK
# Nécessite Java JDK installé

$KEYSTORE_PATH = "..\eductrack-release.keystore"
$KEY_ALIAS = "eductrack"
$KEY_PASSWORD = "Eductrack2024!"
$STORE_PASSWORD = "Eductrack2024!"
$VALIDITY = "10000"
$DNAME = "CN=Eductrack Team, OU=Dev, O=Eductrack, L=Casablanca, ST=Casablanca, C=MA"

Write-Host "Génération du keystore de signature APK..." -ForegroundColor Cyan

# Chercher keytool dans les emplacements courants
$keytool = $null
$javaPaths = @(
    "C:\Program Files\Java\jdk-17\bin\keytool.exe",
    "C:\Program Files\Java\jdk-21\bin\keytool.exe",
    "C:\Program Files\Eclipse Adoptium\jdk-17*\bin\keytool.exe",
    "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe",
    "C:\Program Files\Android\Android Studio\jre\bin\keytool.exe"
)

foreach ($path in $javaPaths) {
    $resolved = Resolve-Path $path -ErrorAction SilentlyContinue
    if ($resolved) {
        $keytool = $resolved.Path
        break
    }
}

if (-not $keytool) {
    $keytoolCmd = Get-Command keytool -ErrorAction SilentlyContinue
    if ($keytoolCmd) { $keytool = $keytoolCmd.Source }
}

if (-not $keytool) {
    Write-Host "ERREUR: keytool introuvable. Installe Java JDK ou Android Studio." -ForegroundColor Red
    Write-Host "Télécharge Java 17: https://www.oracle.com/java/technologies/downloads/#jdk17-windows" -ForegroundColor Yellow
    exit 1
}

Write-Host "keytool trouvé: $keytool" -ForegroundColor Green

if (Test-Path $KEYSTORE_PATH) {
    Write-Host "Le keystore existe déjà: $KEYSTORE_PATH" -ForegroundColor Yellow
    exit 0
}

& $keytool -genkeypair `
    -v `
    -keystore $KEYSTORE_PATH `
    -alias $KEY_ALIAS `
    -keyalg RSA `
    -keysize 2048 `
    -validity $VALIDITY `
    -storepass $STORE_PASSWORD `
    -keypass $KEY_PASSWORD `
    -dname $DNAME

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Keystore généré avec succès: $KEYSTORE_PATH" -ForegroundColor Green
    Write-Host "   Alias:    $KEY_ALIAS" -ForegroundColor Cyan
    Write-Host "   Validité: $VALIDITY jours (~27 ans)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "IMPORTANT: Garde ce fichier en sécurité! Sans lui tu ne pourras plus mettre à jour l'APK." -ForegroundColor Yellow
} else {
    Write-Host "ERREUR lors de la génération du keystore." -ForegroundColor Red
    exit 1
}
