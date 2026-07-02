/**
 * Photos de profil (élèves) — stockées sur Supabase Storage (bucket public),
 * durable. L'URL publique absolue est enregistrée dans profiles.avatar_url.
 *
 * Utilisé par :
 *  - POST /api/students/me/photo          (élève, sa propre photo)
 *  - POST /api/parent/children/:id/photo  (parent, photo de son enfant)
 *  - chatbot WhatsApp (photo envoyée par le parent)
 */
import multer from 'multer';
import path from 'path';
import { supabaseAdmin } from '../config/supabase.js';
import { uploadBuffer, removeObject, BUCKET_PUBLIC } from './storage.js';

const PHOTO_FOLDER = 'profile-photos';

export const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file.originalname || '').toLowerCase())
      || /image\/(jpe?g|png|webp)/.test(file.mimetype || '');
    cb(ok ? null : new Error('Seules les images JPG/PNG/WEBP sont autorisées'), ok);
  },
});

/** Upload d'un fichier multer (mémoire) -> URL publique. */
export async function uploadProfilePhotoFile(file) {
  const { publicUrl } = await uploadBuffer({ bucket: BUCKET_PUBLIC, folder: PHOTO_FOLDER, file, prefix: 'pp' });
  return publicUrl;
}

/** Upload d'un buffer (ex: reçu via WhatsApp) -> URL publique. */
export async function saveProfilePhotoBuffer(buffer, mimetype = 'image/jpeg') {
  const ext = mimetype.includes('png') ? '.png' : mimetype.includes('webp') ? '.webp' : '.jpg';
  const { publicUrl } = await uploadBuffer({ bucket: BUCKET_PUBLIC, folder: PHOTO_FOLDER, file: { buffer, mimetype, originalname: `wa${ext}` }, prefix: 'pp-wa' });
  return publicUrl;
}

/** Supprime une photo de profil à partir de son URL (Supabase public ; legacy ignoré). */
export async function deleteProfilePhotoByUrl(url) {
  const marker = `/${BUCKET_PUBLIC}/`;
  const i = (url || '').indexOf(marker);
  if (i >= 0) await removeObject(BUCKET_PUBLIC, url.slice(i + marker.length));
}

/** Met à jour profiles.avatar_url d'un élève. */
export async function setStudentAvatarUrl(studentId, avatarUrl) {
  // .select() pour vérifier qu'une ligne a bien été modifiée : un .update()
  // sans correspondance renvoie { error: null } et masquerait un ID erroné.
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', studentId)
    .eq('role', 'student')
    .select('id');
  if (error) {
    console.error('[profilePhoto] setStudentAvatarUrl error:', error.message);
    return false;
  }
  if (!data || data.length === 0) {
    console.error(`[profilePhoto] setStudentAvatarUrl: aucun élève id=${studentId} (role=student) mis à jour`);
    return false;
  }
  return true;
}
