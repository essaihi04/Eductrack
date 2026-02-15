// Script de diagnostic pour identifier les imports problématiques
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

function findFiles(dir, extension) {
  const files = [];
  const items = readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...findFiles(fullPath, extension));
    } else if (item.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function checkImports(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];
  
  lines.forEach((line, index) => {
    if (line.includes("from 'supabase-js'") || line.includes('from "supabase-js"')) {
      issues.push({
        line: index + 1,
        content: line.trim()
      });
    }
  });
  
  return issues;
}

console.log('🔍 Recherche des imports problématiques...\n');

const jsFiles = findFiles('./src', '.js');
console.log(`📁 ${jsFiles.length} fichiers JavaScript trouvés\n`);

let totalIssues = 0;
jsFiles.forEach(file => {
  const issues = checkImports(file);
  if (issues.length > 0) {
    console.log(`❌ ${file}:`);
    issues.forEach(issue => {
      console.log(`   Ligne ${issue.line}: ${issue.content}`);
      totalIssues++;
    });
    console.log('');
  }
});

if (totalIssues === 0) {
  console.log('✅ Aucun import problématique trouvé !');
  console.log('\n📦 Vérification des packages installés...');
  const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
  console.log('Dependencies:', Object.keys(packageJson.dependencies));
} else {
  console.log(`\n⚠️  ${totalIssues} import(s) problématique(s) trouvé(s)`);
}
