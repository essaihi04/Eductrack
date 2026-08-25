/**
 * Archivage des médias REÇUS sur WhatsApp (note vocale, photo, PDF, vidéo).
 *
 * Meta ne garde un média que quelques jours et son URL exige le token de
 * l'application : impossible de la donner telle quelle à un navigateur. Le
 * binaire est donc rapatrié une fois, déposé dans le bucket PRIVÉ, et la boîte
 * de réception en fabrique une URL signée à la demande.
 *
 * Le bucket privé n'est pas un détail : une note vocale de parent est une
 * donnée personnelle, elle n'a rien à faire derrière une URL publique.
 */

import { uploadBuffer, BUCKET_PRIVATE } from '../../utils/storage.js';

const EXT_BY_MIME = {
  'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'audio/amr': 'amr', 'audio/aac': 'aac',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'application/pdf': 'pdf',
};

const extFor = (mimetype, fallback = 'bin') => {
  const clean = String(mimetype || '').split(';')[0].trim();
  return EXT_BY_MIME[clean] || fallback;
};

/** Libellé lisible dans le fil quand le message n'a pas de texte. */
export function mediaPlaceholder(media) {
  if (!media) return '';
  if (media.kind === 'audio') return media.voice ? '🎤 Message vocal' : '🎵 Fichier audio';
  if (media.kind === 'image') return '📷 Photo';
  if (media.kind === 'video') return '🎬 Vidéo';
  if (media.kind === 'sticker') return '🏷️ Sticker';
  return `📎 ${media.fileName || 'Document'}`;
}

/**
 * Télécharge le média et le range dans le bucket privé.
 *
 * Ne lève jamais : un archivage raté ne doit pas empêcher le chatbot de
 * répondre au parent — le message reste enregistré, sans sa pièce jointe.
 *
 * @returns {Promise<object|null>} colonnes prêtes pour whatsapp_incoming_messages
 */
export async function storeIncomingMedia(schoolId, media) {
  if (!media?.download) return null;
  try {
    const buffer = await media.download();
    if (!buffer?.length) return null;

    const ext = extFor(media.mimetype, media.kind === 'audio' ? 'ogg' : 'bin');
    const baseName = media.voice ? 'vocal' : (media.fileName || media.kind);
    const file = {
      buffer,
      mimetype: media.mimetype || 'application/octet-stream',
      originalname: /\.[a-z0-9]{2,5}$/i.test(baseName) ? baseName : `${baseName}.${ext}`,
    };

    const { path } = await uploadBuffer({
      bucket: BUCKET_PRIVATE,
      folder: `whatsapp-inbox/${schoolId || 'sans-ecole'}`,
      file,
      prefix: media.kind,
    });

    return {
      media_path: path,
      media_type: media.kind,
      media_mimetype: file.mimetype,
      media_filename: file.originalname,
    };
  } catch (e) {
    console.warn('[inboxMedia] archivage impossible:', e.message);
    return null;
  }
}

/**
 * Insère la ligne d'un message entrant, pièce jointe comprise.
 *
 * Repli : si ADD_WHATSAPP_INBOX.sql n'a pas encore été exécuté, les colonnes
 * media_* n'existent pas. On réessaie sans elles — un média non archivé vaut
 * mieux qu'un message entrant perdu et un chatbot muet.
 */
export async function insertIncomingRow(supabase, row) {
  let { data, error } = await supabase
    .from('whatsapp_incoming_messages').insert(row).select().single();

  if (error && /media_(path|type|mimetype|filename)|column/i.test(error.message || '')) {
    console.warn('[inboxMedia] colonnes média absentes — exécutez ADD_WHATSAPP_INBOX.sql');
    const { media_path, media_type, media_mimetype, media_filename, ...plain } = row;
    ({ data, error } = await supabase
      .from('whatsapp_incoming_messages').insert(plain).select().single());
  }
  if (error) console.warn('[inboxMedia] insertion du message entrant:', error.message);
  return data || null;
}
