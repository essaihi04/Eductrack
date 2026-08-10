// ============================================================
// Étape 4 — Upload des fichiers vers le Supabase self-hosted
// ============================================================
// Envoie le contenu de data/storage/<bucket>/** vers la nouvelle instance.
// Crée les buckets s'ils n'existent pas (uploads-public en public).
//
// Usage :
//   SELFHOST_URL=https://db.etrack.ma SELFHOST_SERVICE_KEY=eyJ... \
//     node 04-upload-storage.mjs
// (depuis un dossier où @supabase/supabase-js est installé, ex. backend/)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const URL_ = process.env.SELFHOST_URL;
const KEY = process.env.SELFHOST_SERVICE_KEY;
if (!URL_ || !KEY) { console.error('SELFHOST_URL et SELFHOST_SERVICE_KEY requis'); process.exit(1); }

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'data', 'storage');
const sb = createClient(URL_, KEY);

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const mimeOf = (p) => MIME[p.slice(p.lastIndexOf('.')).toLowerCase()] || 'application/octet-stream';

const walkFiles = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walkFiles(p) : [p];
});

let ok = 0, failed = 0;
for (const bucket of readdirSync(root)) {
  const isPublic = bucket === 'uploads-public';
  const { error: ce } = await sb.storage.createBucket(bucket, { public: isPublic });
  if (ce && !/already exists/i.test(ce.message)) console.warn(`createBucket ${bucket}: ${ce.message}`);

  for (const file of walkFiles(join(root, bucket))) {
    const key = relative(join(root, bucket), file).replace(/\\/g, '/');
    const { error } = await sb.storage.from(bucket).upload(key, readFileSync(file), {
      contentType: mimeOf(key), upsert: true,
    });
    if (error) { console.error(`✗ ${bucket}/${key}: ${error.message}`); failed++; }
    else { ok++; if (ok % 20 === 0) console.log(`  … ${ok} envoyés`); }
  }
}
console.log(`\n✅ ${ok} fichiers envoyés, ${failed} échecs.`);
process.exit(failed ? 1 : 0);
