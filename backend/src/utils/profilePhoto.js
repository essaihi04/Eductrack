/**
 * Upload des photos de profil élève (remplace l'avatar emoji).
 *
 * Utilisé par :
 *  - POST /api/students/me/photo          (élève, sa propre photo)
 *  - POST /api/parent/children/:id/photo  (parent, photo de son enfant)
 *  - chatbot WhatsApp (photo envoyée par le parent)
 *
 * Les fichiers sont stockés dans uploads/profile-photos et servis
 * statiquement via /uploads (voir server.js). L'URL relative est
 * enregistrée dans profiles.avatar_url.
 */

import multer from 'multer';
import path, { dirname, join } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PROFILE_PHOTO_DIR = join(__dirname, '../../uploads/profile-photos');
export const PROFILE_PHOTO_WEB_PATH = '/uploads/profile-photos';

function ensureDir() {
  if (!fs.existsSync(PROFILE_PHOTO_DIR)) fs.mkdirSync(PROFILE_PHOTO_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir();
    cb(null, PROFILE_PHOTO_DIR);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `pp-${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const profilePhotoUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Seules les images JPG/PNG/WEBP sont autorisées'), ok);
  },
});

/**
 * Écrit un buffer image (ex: reçu via WhatsApp) dans le dossier des photos
 * de profil et retourne l'URL web relative (/uploads/profile-photos/...).
 */
export function saveProfilePhotoBuffer(buffer, mimetype = 'image/jpeg') {
  ensureDir();
  const ext = mimetype.includes('png') ? '.png' : mimetype.includes('webp') ? '.webp' : '.jpg';
  const fileName = `pp-wa-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  fs.writeFileSync(join(PROFILE_PHOTO_DIR, fileName), buffer);
  return `${PROFILE_PHOTO_WEB_PATH}/${fileName}`;
}

/** Supprime un fichier photo de profil à partir de son URL relative. */
export function deleteProfilePhotoByUrl(relUrl) {
  try {
    if (!relUrl || !relUrl.startsWith(PROFILE_PHOTO_WEB_PATH)) return;
    const filePath = join(PROFILE_PHOTO_DIR, path.basename(relUrl));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn('[profilePhoto] suppression impossible:', e.message);
  }
}

/**
 * Met à jour profiles.avatar_url d'un élève.
 * @returns {Promise<boolean>}
 */
export async function setStudentAvatarUrl(studentId, avatarUrl) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', studentId)
    .eq('role', 'student');
  if (error) {
    console.error('[profilePhoto] setStudentAvatarUrl error:', error.message);
    return false;
  }
  return true;
}
