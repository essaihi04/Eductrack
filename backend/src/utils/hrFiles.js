/**
 * Upload des fichiers du dossier RH (photo employé + pièces jointes :
 * diplômes, CIN, contrat, CV…). Calqué sur profilePhoto.js.
 *
 * Stockés dans uploads/hr et servis via /uploads/hr (voir server.js).
 * L'URL relative est enregistrée en base (finance_employee.photo_url /
 * finance_employee_document.file_url).
 */
import multer from 'multer';
import path, { dirname, join } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const HR_DIR = join(__dirname, '../../uploads/hr');
export const HR_WEB_PATH = '/uploads/hr';

function ensureDir() {
  if (!fs.existsSync(HR_DIR)) fs.mkdirSync(HR_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => { ensureDir(); cb(null, HR_DIR); },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `hr-${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const hrUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Formats acceptés : JPG, PNG, WEBP, PDF'), ok);
  },
});

/** Web path d'un fichier uploadé (à partir de l'objet multer file). */
export const hrFileUrl = (file) => `${HR_WEB_PATH}/${file.filename}`;

/** Supprime un fichier RH à partir de son URL relative. */
export function deleteHrFileByUrl(relUrl) {
  try {
    if (!relUrl || !relUrl.startsWith(HR_WEB_PATH)) return;
    const filePath = join(HR_DIR, path.basename(relUrl));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn('[hrFiles] suppression impossible:', e.message);
  }
}
