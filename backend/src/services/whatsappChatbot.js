/**
 * Shim de compatibilité — pointe vers le nouveau chatbot v2.
 *
 * L'ancien fichier (2700 lignes Wasender + IA monolithique) est conservé
 * en `.legacy.js.bak` pour référence.
 *
 * Le nouveau chatbot vit dans `./whatsapp/chatbot/`.
 * Il fournit :
 *  - menu interactif (liste cliquable Cloud API + repli texte numéroté)
 *  - réponses prédéfinies déterministes pour pédagogie & finance
 *  - DeepSeek IA uniquement sur le chemin "Question libre"
 */

import { handleIncomingWhatsAppMessage as v2Handler } from './whatsapp/chatbot/index.js';
import { sendText, sendMediaBuffer, getStatus } from './whatsapp/index.js';
import { sendUtility } from './whatsapp/utility.js';
import { supabaseAdmin } from '../config/supabase.js';
import path from 'path';
import fs from 'fs';

// Log un envoi de message WhatsApp dans whatsapp_messages + whatsapp_message_recipients
// pour que l'admin puisse le voir dans l'historique. Toute erreur ici est silencieuse
// (le log ne doit pas casser l'envoi réel).
async function logWhatsAppSend({
  schoolId,
  phoneNumber,
  content,
  messageType = 'text',
  mediaUrl = null,
  fileName = null,
  category = 'general',
  senderId = null,
  parentId = null,
  recipientFilter = null,
  status, // 'sent' | 'failed'
  errorMessage = null,
}) {
  if (!schoolId) return;
  try {
    const { data: msgLog } = await supabaseAdmin
      .from('whatsapp_messages')
      .insert({
        school_id: schoolId,
        sent_by: senderId,
        message_type: messageType,
        content: content || '',
        media_url: mediaUrl,
        file_name: fileName,
        category,
        recipient_filter: recipientFilter,
        total_recipients: 1,
        sent_count: status === 'sent' ? 1 : 0,
        failed_count: status === 'failed' ? 1 : 0,
        status: status === 'sent' ? 'completed' : 'failed',
      })
      .select('id')
      .single();

    if (msgLog?.id) {
      await supabaseAdmin
        .from('whatsapp_message_recipients')
        .insert({
          message_id: msgLog.id,
          phone_e164: phoneNumber,
          parent_id: parentId,
          status,
          sent_at: status === 'sent' ? new Date().toISOString() : null,
          error_message: errorMessage,
        });
    }
  } catch (e) {
    console.warn('[whatsapp][log] Échec log message:', e.message);
  }
}

// Adapter legacy : conserve l'ancienne signature { from, text, id, sessionId }
// où sessionId vaut le school_id.
export async function handleIncomingWhatsAppMessage(messageInfo) {
  const { from, text, id, sessionId } = messageInfo;
  return v2Handler({ from, text, id, schoolId: sessionId });
}

/**
 * Envoyer une réponse WhatsApp simple — utilisé par teacher / homework / controls
 * routes pour notifier les parents. Enregistre automatiquement le log dans
 * whatsapp_messages pour visibilité côté admin.
 *
 * @param {object} opts  { category, senderId, parentId, recipientFilter }
 */
export async function sendWhatsAppResponse(phoneNumber, message, schoolId, opts = {}) {
  if (!(await getStatus(schoolId)).connected) {
    console.error('[whatsapp] Pas de session active pour school', schoolId);
    await logWhatsAppSend({
      schoolId, phoneNumber, content: message, messageType: 'text',
      category: opts.category, senderId: opts.senderId, parentId: opts.parentId,
      recipientFilter: opts.recipientFilter,
      status: 'failed', errorMessage: 'Session WhatsApp non connectée',
    });
    return false;
  }
  // Cette fonction sert à DEUX usages : les réponses du chatbot (fenêtre 24 h
  // ouverte par définition) et les notifications PROACTIVES du personnel
  // enseignant (absences…). Pour ces dernières, l'appelant fournit un template
  // utilitaire : hors fenêtre, le texte libre serait refusé par Meta.
  const result = opts.template
    ? await sendUtility(schoolId, phoneNumber, {
        text: message, template: opts.template, params: opts.templateParams || [],
      })
    : await sendText(schoolId, phoneNumber, message);
  await logWhatsAppSend({
    schoolId, phoneNumber, content: message, messageType: 'text',
    category: opts.category, senderId: opts.senderId, parentId: opts.parentId,
    recipientFilter: opts.recipientFilter,
    status: result.success ? 'sent' : 'failed',
    errorMessage: result.success ? null : (result.message || 'Erreur envoi'),
  });
  return !!result.success;
}

/**
 * Envoyer un fichier (PDF, image, etc.) — utilisé par documents.routes.
 * Enregistre automatiquement le log dans whatsapp_messages pour visibilité admin.
 *
 * @param {object} opts  { category, senderId, parentId, recipientFilter, mediaUrl }
 */
export async function sendWhatsAppFile(phoneNumber, filePath, caption, schoolId, opts = {}) {
  let type = 'document';
  let fileName = path.basename(filePath || 'file');
  try {
    if (!(await getStatus(schoolId)).connected) {
      console.error('[whatsapp] Pas de session active pour school', schoolId);
      await logWhatsAppSend({
        schoolId, phoneNumber, content: caption || '', messageType: 'document',
        mediaUrl: opts.mediaUrl, fileName,
        category: opts.category, senderId: opts.senderId, parentId: opts.parentId,
        recipientFilter: opts.recipientFilter,
        status: 'failed', errorMessage: 'Session WhatsApp non connectée',
      });
      return false;
    }
    if (!fs.existsSync(filePath)) {
      console.error('[whatsapp] Fichier introuvable:', filePath);
      await logWhatsAppSend({
        schoolId, phoneNumber, content: caption || '', messageType: 'document',
        mediaUrl: opts.mediaUrl, fileName,
        category: opts.category, senderId: opts.senderId, parentId: opts.parentId,
        status: 'failed', errorMessage: 'Fichier introuvable',
      });
      return false;
    }

    const ext = path.extname(filePath).toLowerCase().slice(1);
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

    const result = await sendMediaBuffer(schoolId, phoneNumber, buffer, {
      type,
      fileName,
      mimetype,
      caption,
    });

    await logWhatsAppSend({
      schoolId, phoneNumber, content: caption || '', messageType: type,
      mediaUrl: opts.mediaUrl, fileName,
      category: opts.category, senderId: opts.senderId, parentId: opts.parentId,
      recipientFilter: opts.recipientFilter,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.success ? null : (result.message || 'Erreur envoi fichier'),
    });
    return !!result.success;
  } catch (e) {
    console.error('[whatsapp] Erreur envoi fichier:', e);
    await logWhatsAppSend({
      schoolId, phoneNumber, content: caption || '', messageType: type,
      mediaUrl: opts.mediaUrl, fileName,
      category: opts.category, senderId: opts.senderId, parentId: opts.parentId,
      status: 'failed', errorMessage: e.message || 'Erreur envoi fichier',
    });
    return false;
  }
}

/**
 * Envoi d'un fichier WhatsApp depuis un buffer (fichier stocké sur Supabase,
 * plus sur disque). Même journalisation que sendWhatsAppFile.
 */
export async function sendWhatsAppFileBuffer(phoneNumber, buffer, fileName, mimetype, caption, schoolId, opts = {}) {
  try {
    if (!(await getStatus(schoolId)).connected) {
      await logWhatsAppSend({ schoolId, phoneNumber, content: caption || '', messageType: 'document', fileName, category: opts.category, senderId: opts.senderId, parentId: opts.parentId, recipientFilter: opts.recipientFilter, status: 'failed', errorMessage: 'Session WhatsApp non connectée' });
      return false;
    }
    const ext = path.extname(fileName || '').toLowerCase().slice(1);
    let type = 'document';
    let mt = mimetype || 'application/octet-stream';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) { type = 'image'; mt = `image/${ext === 'jpg' ? 'jpeg' : ext}`; }
    else if (['mp4', 'mov', 'webm'].includes(ext)) { type = 'video'; mt = `video/${ext}`; }
    else if (ext === 'pdf') mt = 'application/pdf';
    const result = await sendMediaBuffer(schoolId, phoneNumber, buffer, { type, fileName, mimetype: mt, caption });
    await logWhatsAppSend({ schoolId, phoneNumber, content: caption || '', messageType: type, fileName, category: opts.category, senderId: opts.senderId, parentId: opts.parentId, recipientFilter: opts.recipientFilter, status: result.success ? 'sent' : 'failed', errorMessage: result.success ? null : (result.message || 'Erreur envoi fichier') });
    return !!result.success;
  } catch (e) {
    console.error('[whatsapp] Erreur envoi fichier (buffer):', e);
    return false;
  }
}

/**
 * @deprecated — plus aucune clé de session externe. Renvoie toujours null.
 * Conservée pour ne pas casser les imports legacy (à supprimer après migration complète).
 */
export async function getSchoolSessionApiKey(_schoolId) {
  console.warn("[whatsapp] getSchoolSessionApiKey est déprécié (l'API Cloud officielle utilise un token central).");
  return null;
}
