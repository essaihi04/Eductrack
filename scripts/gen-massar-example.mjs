// Génère des fichiers Excel d'exemple reproduisant le format Massar
// (métadonnées en haut + en-têtes arabes + 1 onglet par matière, clé = code Massar).
//
// Usage : node scripts/gen-massar-example.mjs
// Sortie : examples/exemple_massar_*.xlsx
//
// ⚠️ Les codes/noms sont FICTIFS — ils servent à illustrer le FORMAT.
// Pour un import réel, partez de l'export Massar de votre propre établissement.

import * as XLSX from '../frontend/node_modules/xlsx/xlsx.mjs';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'examples');
mkdirSync(outDir, { recursive: true });

// Élèves fictifs (code Massar GRESA + nom/prénom arabes)
const STUDENTS = [
  ['J130045671', 'العلوي',   'أحمد'],
  ['J130045672', 'بناني',    'سارة'],
  ['J130045673', 'الإدريسي', 'يوسف'],
  ['J130045674', 'الفاسي',   'فاطمة الزهراء'],
  ['J130045675', 'بنعلي',    'مريم'],
  ['J130045676', 'الصقلي',   'محمد أمين'],
  ['J130045677', 'العمراني', 'هاجر'],
  ['J130045678', 'الحسني',   'إلياس'],
];

// Note aléatoire réaliste 8–18, format virgule (comme Massar)
const rndNote = () => String((Math.round((8 + Math.random() * 10) * 2) / 2)).replace('.', ',');

// Construit un classeur : 1 onglet par matière, layout Massar
function buildWorkbook({ etab, annee, classe, examenAr, subjects }) {
  const wb = XLSX.utils.book_new();
  for (const subject of subjects) {
    const meta = [
      ['الأكاديمية الجهوية للتربية والتكوين', 'الدار البيضاء سطات'],
      ['المديرية الإقليمية', 'برشيد'],
      ['المؤسسة', etab],
      ['القسم', classe],
      ['المادة', subject],
      ['نوع الامتحان', examenAr],
      ['السنة الدراسية', annee],
      [],
      ['رمز التلميذ', 'النسب', 'الاسم', 'النقطة'],
    ];
    const body = STUDENTS.map(([code, nom, prenom]) => [code, nom, prenom, rndNote()]);
    const ws = XLSX.utils.aoa_to_sheet([...meta, ...body]);
    ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 10 }];
    const tab = subject.replace(/[\\/?*[\]:]/g, '').slice(0, 28);
    XLSX.utils.book_append_sheet(wb, ws, tab);
  }
  return wb;
}

function save(wb, name) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const path = join(outDir, name);
  writeFileSync(path, buf);
  console.log('✓', path);
}

// 2BAC SVT — Examen national (matières et coefficients officiels)
save(buildWorkbook({
  etab: 'ثانوية ابن سينا التأهيلية',
  annee: '2025/2026',
  classe: '2BAC-SVT-1',
  examenAr: 'الامتحان الوطني',
  subjects: ['علوم الحياة والأرض', 'الفيزياء والكيمياء', 'الرياضيات', 'الفلسفة', 'اللغة الإنجليزية'],
}), 'exemple_massar_2BAC_SVT_national.xlsx');

// 3AC — Examen régional (toutes matières du régional)
save(buildWorkbook({
  etab: 'الثانوية الإعدادية المنصور الذهبي',
  annee: '2025/2026',
  classe: '3AC-4',
  examenAr: 'الامتحان الجهوي',
  subjects: ['اللغة العربية', 'الرياضيات', 'اللغة الفرنسية', 'الفيزياء والكيمياء',
    'علوم الحياة والأرض', 'الاجتماعيات', 'التربية الإسلامية', 'اللغة الإنجليزية'],
}), 'exemple_massar_3AC_regional.xlsx');

console.log('\nTerminé. Fichiers dans /examples');
