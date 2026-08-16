// Helpers d'envoi partagés entre les routes WhatsApp et le job d'envoi de masse
// (services/jobs). Extraits de routes/whatsapp.routes.js où ils étaient locaux.

import { sendText, sendImage, sendDocument, getStatus } from './index.js';
import * as cloud from './cloudApi.js';

// Une école est joignable si sa session Baileys est connectée, ou si elle passe
// par l'API Cloud officielle de Meta.
export const isSessionReady = async (schoolId) => {
  if (!schoolId) return false;
  if (getStatus(schoolId).connected) return true;
  return await cloud.isCloudSchool(schoolId);
};

// Envoi unifié (texte / image / document)
export async function sendUnified(schoolId, phone, { messageType, message, mediaUrl, fileName }) {
  if (messageType === 'image' && mediaUrl) {
    return sendImage(schoolId, phone, mediaUrl, message || '');
  }
  if (messageType === 'document' && mediaUrl) {
    return sendDocument(schoolId, phone, mediaUrl, fileName || 'document.pdf', message || '');
  }
  return sendText(schoolId, phone, message || '');
}
