// ============================================================
// Étape 1 — Sauvegarde locale des fichiers Supabase Storage
// ============================================================
// Télécharge TOUS les objets des buckets (uploads-public, uploads-private)
// vers migration-selfhost/data/storage/<bucket>/<chemin>.
// Relançable : les fichiers déjà téléchargés avec la bonne taille sont sautés.
//
// Usage :  cd backend && node ../migration-selfhost/01-download-storage.mjs
// (lit backend/.env pour SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../backend/.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const outRoot = join(here, 'data', 'storage');

let downloaded = 0, skipped = 0, failed = 0, bytes = 0;

async function walk(bucket, prefix) {
  let offset = 0;
  for (;;) {
    const { data: items, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) { console.error(`✗ list ${bucket}/${prefix}: ${error.message}`); failed++; return; }
    if (!items?.length) return;
    for (const it of items) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) { await walk(bucket, path); continue; }
      const dest = join(outRoot, bucket, path);
      const size = it.metadata?.size || 0;
      if (existsSync(dest) && statSync(dest).size === size) { skipped++; continue; }
      const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(path);
      if (dlErr) { console.error(`✗ ${bucket}/${path}: ${dlErr.message}`); failed++; continue; }
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, Buffer.from(await blob.arrayBuffer()));
      downloaded++; bytes += size;
      if (downloaded % 20 === 0) console.log(`  … ${downloaded} fichiers téléchargés`);
    }
    if (items.length < 1000) return;
    offset += 1000;
  }
}

const { data: buckets, error } = await sb.storage.listBuckets();
if (error) { console.error('listBuckets:', error.message); process.exit(1); }

for (const b of buckets) {
  console.log(`\n📦 Bucket ${b.name} (public=${b.public})`);
  await walk(b.name, '');
}

console.log(`\n✅ Terminé : ${downloaded} téléchargés (${(bytes / 1024 / 1024).toFixed(1)} Mo), ${skipped} déjà présents, ${failed} échecs.`);
if (failed > 0) process.exit(1);
