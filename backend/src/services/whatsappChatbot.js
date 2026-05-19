/**
 * Shim de compatibilité — pointe vers le nouveau chatbot v2.
 *
 * L'ancien fichier (2700 lignes Wasender + IA monolithique) est conservé
 * en `.legacy.js.bak` pour référence.
 *
 * Le nouveau chatbot vit dans `./whatsapp/chatbot/`.
 * Il fournit :
 *  - menu interactif (boutons listMessage + fallback texte)
 *  - réponses prédéfinies déterministes pour pédagogie & finance
 *  - DeepSeek IA uniquement sur le chemin "Question libre"
 */

import { handleIncomingWhatsAppMessage as v2Handler, handleBaileysIncoming as v2Baileys } from './whatsapp/chatbot/index.js';
import { sendText, sendMediaBuffer, getStatus } from './whatsapp/index.js';
import path from 'path';
import fs from 'fs';

// Adapter pour l'ancien webhook Wasender (compat) — le webhook n'est plus utilisé
// avec Baileys, mais on garde l'export pour ne pas casser les imports legacy.
export async function handleIncomingWhatsAppMessage(messageInfo) {
  // Format ancien : { from, text, id, sessionId } → schoolId résolu via DB
  const { from, text, id, sessionId } = messageInfo;
  // Avec Baileys, sessionId = school_id directement
  return v2Handler({ from, text, id, schoolId: sessionId });
}

// Re-export Baileys handler (utilisé par baileysClient.startSession)
export const handleBaileysIncoming = v2Baileys;

/**
 * Envoyer une réponse WhatsApp simple — utilisé par teacher / homework / controls
 * routes pour notifier les parents.
 */
export async function sendWhatsAppResponse(phoneNumber, message, schoolId) {
  if (!getStatus(schoolId).connected) {
    console.error('[whatsapp] Pas de session active pour school', schoolId);
    return false;
  }
  const result = await sendText(schoolId, phoneNumber, message);
  return !!result.success;
}

/**
 * Envoyer un fichier (PDF, image, etc.) — utilisé par documents.routes.
 */
export async function sendWhatsAppFile(phoneNumber, filePath, caption, schoolId) {
  try {
    if (!getStatus(schoolId).connected) {
      console.error('[whatsapp] Pas de session active pour school', schoolId);
      return false;
    }
    if (!fs.existsSync(filePath)) {
      console.error('[whatsapp] Fichier introuvable:', filePath);
      return false;
    }

    const ext = path.extname(filePath).toLowerCase().slice(1);
    let type = 'document';
    let mimetype = 'application/octet-stream';

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      type = 'image';
      mimetype = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    } else if (['mp4', 'mov', 'webm'].includes(ext)) {
      type = 'video';
      mimetype = `video/${ext}`;
    } else if (ext === 'pdf') {
      mimetype = 'application/pdf';
    } else if (['doc', 'docx'].includes(ext)) {
      mimetype = 'application/msword';
    }

    const buffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const result = await sendMediaBuffer(schoolId, phoneNumber, buffer, {
      type,
      fileName,
      mimetype,
      caption,
    });
    return !!result.success;
  } catch (e) {
    console.error('[whatsapp] Erreur envoi fichier:', e);
    return false;
  }
}

/**
 * @deprecated — Wasender n'est plus utilisé. Cette fonction renvoie toujours null.
 * Conservée pour ne pas casser les imports legacy (à supprimer après migration complète).
 */
export async function getSchoolSessionApiKey(_schoolId) {
  console.warn('[whatsapp] getSchoolSessionApiKey est déprécié (Baileys self-hosted ne nécessite plus de clé externe).');
  return null;
}
