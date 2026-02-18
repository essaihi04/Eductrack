const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const GITHUB_TOKEN = process.env.GH_TOKEN;
const REPO_OWNER = 'essaihi04';
const REPO_NAME = 'Eductrack';
const DIST_DIR = path.join(__dirname, '..', 'dist');

if (!GITHUB_TOKEN) {
  console.error('❌ Erreur: GH_TOKEN non défini');
  console.error('Utilisez: $env:GH_TOKEN="votre-token" (PowerShell)');
  process.exit(1);
}

// Récupérer la version actuelle
const packageJson = require('../package.json');
const version = packageJson.version;
const tagName = `v${version}`;

console.log(`🚀 Génération de l'EXE pour Eductrack ${version}`);
console.log(`🏷️  Tag: ${tagName}`);

// Vérifier que les fichiers existent
const exeFiles = [
  `Eductrack Setup ${version}.exe`,
  `Eductrack-${version}-portable.exe`
];

const existingFiles = exeFiles.filter(f => fs.existsSync(path.join(DIST_DIR, f)));

if (existingFiles.length === 0) {
  console.error('❌ Aucun fichier EXE trouvé dans dist/');
  console.error('Lancez d\'abord: npm run build');
  process.exit(1);
}

console.log(`📦 Fichiers trouvés: ${existingFiles.join(', ')}`);

// Créer ou mettre à jour le release sur GitHub
async function uploadRelease() {
  try {
    // Vérifier si le release existe déjà
    console.log(`🔍 Vérification du release ${tagName}...`);
    
    let releaseId;
    let uploadUrl;
    
    try {
      const checkRelease = execSync(
        `curl -s -H "Authorization: Bearer ${GITHUB_TOKEN}" ` +
        `"https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${tagName}"`,
        { encoding: 'utf-8' }
      );
      const releaseData = JSON.parse(checkRelease);
      if (releaseData.id) {
        releaseId = releaseData.id;
        uploadUrl = `https://uploads.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/${releaseId}/assets`;
        console.log(`✅ Release existant trouvé: ${releaseId}`);
      }
    } catch (e) {
      console.log(`📝 Release non trouvé, création d'un nouveau...`);
    }

    // Créer le release s'il n'existe pas
    if (!releaseId) {
      const createReleaseCmd = `curl -s -X POST ` +
        `-H "Authorization: Bearer ${GITHUB_TOKEN}" ` +
        `-H "Content-Type: application/json" ` +
        `"https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases" ` +
        `-d "{\\"tag_name\\":\\"${tagName}\\",\\"name\\":\\"Eductrack ${version}\\",\\"body\\":\\"Version ${version} de l\\'application desktop Eductrack\\",\\"draft\\":false,\\"prerelease\\":false}"`;
      
      const createResult = execSync(createReleaseCmd, { encoding: 'utf-8' });
      const newRelease = JSON.parse(createResult);
      releaseId = newRelease.id;
      uploadUrl = `https://uploads.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/${releaseId}/assets`;
      console.log(`✅ Release créé: ${newRelease.html_url}`);
    }

    // Upload des fichiers
    for (const fileName of existingFiles) {
      const filePath = path.join(DIST_DIR, fileName);
      const fileSize = fs.statSync(filePath).size;
      
      console.log(`📤 Upload de ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);
      
      const uploadCmd = `curl -s -X POST ` +
        `-H "Authorization: Bearer ${GITHUB_TOKEN}" ` +
        `-H "Content-Type: application/octet-stream" ` +
        `"${uploadUrl}?name=${encodeURIComponent(fileName)}" ` +
        `--data-binary "@${filePath}"`;
      
      try {
        execSync(uploadCmd, { stdio: 'pipe' });
        console.log(`✅ ${fileName} uploadé avec succès`);
      } catch (uploadError) {
        console.error(`❌ Erreur upload ${fileName}:`, uploadError.message);
      }
    }

    console.log('\n🎉 Release terminé !');
    console.log(`🔗 URL: https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${tagName}`);
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

uploadRelease();
