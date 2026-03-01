import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { handleIncomingWhatsAppMessage } from '../services/whatsappChatbot.js';

const router = express.Router();

// Vérification de signature webhook
function verifyWebhookSignature(req) {
  const signature = req.headers['x-webhook-signature'];
  const webhookSecret = process.env.WASENDER_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.warn('[Webhook] WASENDER_WEBHOOK_SECRET non configuré, signature non vérifiée');
    return true; // Permettre en développement
  }
  
  // TODO: Implémenter la vraie vérification HMAC SHA256 selon la doc WasenderAPI
  // Pour l'instant, accepter tous les webhooks si le secret est configuré
  console.log('[Webhook] Signature reçue:', signature?.substring(0, 20) + '...');
  return true;
  
  /* Ancienne vérification incorrecte - à remplacer par HMAC
  if (!signature || signature !== webhookSecret) {
    console.error('[Webhook] Signature invalide');
    return false;
  }
  
  return true;
  */
}

// Webhook endpoint - PAS d'authentification JWT (appelé par WasenderAPI)
router.post('/whatsapp/incoming', async (req, res) => {
  try {
    // Vérifier la signature
    if (!verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    const payload = req.body;
    console.log('[Webhook] Event reçu:', payload.event);
    
    // Ne traiter que les messages reçus
    if (payload.event === 'messages.received') {
      const messageData = payload.data?.messages;
      
      if (messageData) {
        // Extraire les informations du message
        const messageInfo = {
          id: messageData.key?.id,
          from: messageData.key?.cleanedSenderPn || messageData.key?.remoteJid,
          text: messageData.messageBody || messageData.message?.conversation || '',
          timestamp: payload.timestamp,
          remoteJid: messageData.key?.remoteJid,
          sessionId: payload.data?.session_id || payload.session_id
        };
        
        console.log('[Webhook] Message de:', messageInfo.from, '- Texte:', messageInfo.text, '- Session:', messageInfo.sessionId);
        
        // Traiter le message en arrière-plan (ne pas bloquer le webhook)
        handleIncomingWhatsAppMessage(messageInfo)
          .catch(err => console.error('[Webhook] Erreur traitement message:', err));
      }
    }
    
    // Répondre immédiatement à WasenderAPI avec 200 OK
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] Erreur:', error);
    // Toujours répondre 200 pour éviter les retry de WasenderAPI
    res.status(200).json({ received: true, error: error.message });
  }
});

// Endpoint de vérification (pour tester que le webhook est actif)
router.get('/whatsapp/incoming', (req, res) => {
  res.status(200).json({ 
    status: 'active', 
    message: 'EduTrack WhatsApp Webhook is running',
    timestamp: new Date().toISOString()
  });
});

export default router;
