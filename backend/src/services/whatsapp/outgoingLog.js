/**
 * Journal des messages sortants du CHATBOT.
 *
 * Les campagnes de l'école sont déjà tracées dans whatsapp_messages : chaque
 * destinataire y a sa ligne, avec son statut. Rien en revanche n'enregistrait
 * ce que le chatbot répond — menus, listes de fournitures, PDF, confirmations.
 * La boîte de réception montrait donc une conversation à trous : la question du
 * parent, puis plus rien, alors que le robot avait répondu.
 *
 * Ce journal comble ce trou. Il vit dans SA table (voir ADD_WHATSAPP_INBOX.sql)
 * plutôt que dans whatsapp_messages : y verser chaque réponse automatique
 * noierait l'historique des campagnes et fausserait les statistiques d'envoi.
 */

import { supabaseAdmin } from '../../config/supabase.js';

// Une migration manquante ne doit pas transformer chaque envoi en avalanche de
// logs : après le premier échec « table absente », on cesse d'essayer.
let tableMissing = false;

/**
 * Enregistre un message sortant. Ne lève jamais et n'est jamais attendu :
 * journaliser ne doit ni ralentir ni faire échouer une réponse au parent.
 */
export function logOutgoing(schoolId, phone, { type = 'text', body = '', mediaUrl = null, fileName = null, source = 'chatbot' }, result) {
  if (tableMissing || !phone) return;

  const row = {
    school_id: schoolId || null,
    phone_e164: String(phone),
    body: body ? String(body).slice(0, 4000) : null,
    message_type: type,
    media_url: mediaUrl,
    file_name: fileName,
    status: result?.success ? 'sent' : 'failed',
    error_message: result?.success ? null : (result?.message || null),
    source,
    provider_msg_id: result?.data?.msgId ? String(result.data.msgId) : null,
  };

  supabaseAdmin
    .from('whatsapp_outgoing_log')
    .insert(row)
    .then(({ error }) => {
      if (!error) return;
      if (/whatsapp_outgoing_log|does not exist|schema cache/i.test(error.message || '')) {
        tableMissing = true;
        console.warn('[outgoingLog] table absente — exécutez ADD_WHATSAPP_INBOX.sql (journalisation désactivée)');
      } else {
        console.warn('[outgoingLog]', error.message);
      }
    });
}
