// Helpers d'envoi partagés entre les routes WhatsApp et le job d'envoi de masse
// (services/jobs). Extraits de routes/whatsapp.routes.js où ils étaient locaux.

import { sendText, sendImage, sendDocument } from './index.js';
import * as cloud from './cloudApi.js';
import { sendUtility, serviceWindowOpen } from './utility.js';
import { runAsCampaign } from './outboundGate.js';
import { queuePending } from './pendingDelivery.js';

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
export async function sendUnified(schoolId, phone, opts) {
  // Tout appelant de sendUnified écrit déjà une ligne destinataire : on pose
  // le contexte « campagne » pour que l'envoi ne soit pas AUSSI journalisé,
  // ce qui l'afficherait deux fois dans le fil de conversation.
  return runAsCampaign(() => sendUnifiedImpl(schoolId, phone, opts));
}

async function sendUnifiedImpl(schoolId, phone, {
  messageType, message, mediaUrl, fileName,
  templateKey = null, templateParams = [], templateLang = null,
}) {
  if (!(await serviceWindowOpen(phone))) {
    // Campagne adossée à un template APPROUVÉ dont le corps porte le message
    // entier : pas d'annonce, pas d'attente — le destinataire le lit du
    // premier coup, même fenêtre fermée.
    if (templateKey) {
      // `lang` null = langue de chaque destinataire (son choix explicite, à
      // défaut celle de son dernier message). Une valeur force toute la
      // campagne dans cette langue.
      return sendUtility(schoolId, phone, {
        text: message || '', template: templateKey, params: templateParams, lang: templateLang,
      });
    }
    // Le texte est mis en attente par sendUtility (template d'annonce) ; le
    // MÉDIA, lui, ne voyage pas dans un template : on le met en attente ici
    // pour qu'il parte dès la première réponse du destinataire.
    if (mediaUrl) {
      await queuePending({
        schoolId, phone, text: message || '', mediaUrl, fileName,
        messageType: messageType || 'document', kind: 'broadcast_media',
      });
      const r = await sendUtility(schoolId, phone, {
        text: message || '', template: 'information', queueText: false,
      });
      return { ...r, mediaDeferred: true };
    }
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
