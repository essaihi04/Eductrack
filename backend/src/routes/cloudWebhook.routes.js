/**
 * Webhook public WhatsApp Cloud API (Meta).
 *
 * ⚠️ Monté SANS le middleware `authenticate` (Meta n'envoie pas de JWT).
 * La sécurité repose sur :
 *   - GET  : vérification du hub.verify_token (WA_VERIFY_TOKEN)
 *   - POST : vérification de la signature X-Hub-Signature-256 (WA_APP_SECRET)
 *
 * Le POST répond 200 IMMÉDIATEMENT (sinon Meta réessaie en boucle), puis
 * traite le message en arrière-plan via le chatbot existant.
 */

import express from 'express';
import { verifySignature, parseIncoming } from '../services/whatsapp/cloudApi.js';
import { handleIncomingWhatsAppMessage } from '../services/whatsapp/chatbot/index.js';
import { markWaAck } from '../services/communicationTracking.js';

/**
 * Statuts d'acheminement des messages SORTANTS (sent/delivered/read) envoyés
 * par Meta dans le même webhook que les messages entrants → tracking des
 * communications (delivered_at / read_at).
 */
async function processStatuses(body) {
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      for (const st of change?.value?.statuses || []) {
        if (!st?.id) continue;
        if (st.status === 'read') await markWaAck(st.id, 'read');
        else if (st.status === 'delivered') await markWaAck(st.id, 'delivered');
      }
    }
  }
}

const router = express.Router();

// Vérification initiale du webhook (Meta appelle une fois en GET)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Réception des messages entrants
router.post('/webhook', async (req, res) => {
  // Signature (req.rawBody est capturé par express.json verify dans server.js)
  const sig = req.get('x-hub-signature-256');
  if (!verifySignature(req.rawBody, sig)) {
    console.warn('[cloudWebhook] signature invalide — requête rejetée');
    return res.sendStatus(403);
  }

  // ACK immédiat obligatoire
  res.sendStatus(200);

  // Traitement en arrière-plan
  try {
    await processStatuses(req.body);
    const parsed = await parseIncoming(req.body);
    if (parsed) {
      await handleIncomingWhatsAppMessage(parsed);
    }
  } catch (e) {
    console.error('[cloudWebhook] erreur traitement message entrant:', e.message);
  }
});

export default router;
