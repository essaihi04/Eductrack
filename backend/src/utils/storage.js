/**
 * Stockage de fichiers sur Supabase Storage (durable, contrairement au disque
 * local éphémère sur Render). Deux buckets :
 *  - PUBLIC  ('uploads-public')  : photos profil/employé, logos, vie scolaire,
 *    documents pédagogiques (envoyés par WhatsApp/parents). URL publique stable.
 *  - PRIVÉ   ('uploads-private') : dossier RH sensible (CIN, diplômes, contrats).
 *    Servi via URLs signées temporaires.
 *
 * Upload via multer memoryStorage puis uploadBuffer().
 */
import multer from 'multer';
import path from 'path';
import { supabaseAdmin } from '../config/supabase.js';

export const BUCKET_PUBLIC = 'uploads-public';
export const BUCKET_PRIVATE = 'uploads-private';

let bucketsReady = false;
export async function ensureBuckets() {
  if (bucketsReady) return;
  for (const [name, isPublic] of [[BUCKET_PUBLIC, true], [BUCKET_PRIVATE, false]]) {
    const { error } = await supabaseAdmin.storage.createBucket(name, {
      public: isPublic, fileSizeLimit: 20 * 1024 * 1024,
    });
    // Ignore l'erreur « déjà existant »
    if (error && !/exist/i.test(error.message || '')) console.warn(`[storage] createBucket ${name}:`, error.message);
  }
  bucketsReady = true;
}

const safeExt = (filename) => (path.extname(filename || '').toLowerCase() || '');
const uniqueName = (prefix, filename) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt(filename)}`;

/** Upload mémoire (multer) — limite par défaut 20 Mo. */
export const memoryUpload = (limitMb = 20) => multer({ storage: multer.memoryStorage(), limits: { fileSize: limitMb * 1024 * 1024 } });

/**
 * Envoie un buffer dans un bucket. Renvoie { path, publicUrl }.
 * @param folder sous-dossier logique (ex: 'hr/photos', 'logos')
 */
export async function uploadBuffer({ bucket, folder, file, prefix = 'f' }) {
  await ensureBuckets();
  const objectPath = `${folder}/${uniqueName(prefix, file.originalname)}`;
  const { error } = await supabaseAdmin.storage.from(bucket).upload(objectPath, file.buffer, {
    contentType: file.mimetype, upsert: false,
  });
  if (error) throw new Error(`Upload échoué: ${error.message}`);
  const publicUrl = bucket === BUCKET_PUBLIC
    ? supabaseAdmin.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl
    : null;
  return { path: objectPath, publicUrl };
}

/** Supprime un objet (par son path) dans un bucket. */
export async function removeObject(bucket, objectPath) {
  if (!objectPath) return;
  try { await supabaseAdmin.storage.from(bucket).remove([objectPath]); }
  catch (e) { console.warn('[storage] remove:', e.message); }
}

/** URL signée temporaire pour un fichier du bucket privé. */
export async function signedUrl(objectPath, expiresIn = 3600) {
  if (!objectPath) return null;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_PRIVATE).createSignedUrl(objectPath, expiresIn);
  if (error) { console.warn('[storage] signedUrl:', error.message); return null; }
  return data?.signedUrl || null;
}
