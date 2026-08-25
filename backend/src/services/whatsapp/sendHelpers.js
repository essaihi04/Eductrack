// Helpers d'envoi partagés entre les routes WhatsApp et le job d'envoi de masse
// (services/jobs). Extraits de routes/whatsapp.routes.js où ils étaient locaux.

import { sendText, sendImage, sendDocument } from './index.js';
import * as cloud from './cloudApi.js';
import { sendUtility, serviceWindowOpen } from './utility.js';

// Une école est joignable si son numéro est rattaché à l'API Cloud officielle
// de Meta (provider unique depuis la suppression de Baileys).
export const isSessionReady = async (schoolId) => {
  if (!schoolId) return false;
  return await cloud.isCloudSchool(schoolId);
};

/**
 * Envoi unifié (texte / image / document).
 *
 * Utilisé par la route d'envoi manuel ET par le job d'envoi de masse : c'est
 * le plus gros volume proactif de l'application. Hors fenêtre de service de
 * 24 h, Meta refuse aussi bien le texte libre que le média — on bascule donc
 * sur le template « information », qui annonce l'objet et invite le parent à
 * répondre. Sa réponse rouvre la fenêtre et le contenu complet peut suivre.
 */
export async function sendUnified(schoolId, phone, { messageType, message, mediaUrl, fileName }) {
  if (!(await serviceWindowOpen(phone))) {
    return sendUtility(schoolId, phone, { text: message || '', template: 'information' });
  }
  if (messageType === 'image' && mediaUrl) {
    return sendImage(schoolId, phone, mediaUrl, message || '');
  }
  if (messageType === 'document' && mediaUrl) {
    return sendDocument(schoolId, phone, mediaUrl, fileName || 'document.pdf', message || '');
  }
  return sendText(schoolId, phone, message || '');
}
