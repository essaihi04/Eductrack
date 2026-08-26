/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  LIVRAISON DIFFÉRÉE (contenu retenu par la fenêtre de 24 h)           ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Hors fenêtre de service, Meta refuse le texte libre : l'application  ║
 * ║  envoyait alors un template d'annonce (« répondez pour recevoir le    ║
 * ║  détail ») et JETAIT le contenu réel. Le destinataire répondait       ║
 * ║  « oui »… et ne recevait jamais rien.                                 ║
 * ║                                                                       ║
 * ║  Le contenu est désormais mis en attente ici, puis livré              ║
 * ║  automatiquement dès le premier message entrant de ce numéro — la     ║
 * ║  fenêtre est alors ouverte et le texte libre repasse.                 ║
 * ║                                                                       ║
 * ║  Table : whatsapp_pending_messages (ADD_WHATSAPP_PENDING_DELIVERY.sql)║
 * ║  Tant que la migration n'est pas exécutée, le module se contente de   ║
 * ║  prévenir dans les logs : aucun envoi n'est cassé.                    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { supabaseAdmin } from '../../config/supabase.js';
import { sendText, sendImage, sendDocument } from './index.js';

const TABLE = 'whatsapp_pending_messages';
/** Un identifiant de connexion livré trois semaines plus tard n'a plus de sens. */
const TTL_HOURS = 72;

const tableManquante = (error) =>
  /relation .* does not exist|could not find the table|schema cache/i.test(error?.message || '');

function avertirMigration(error) {
  if (tableManquante(error)) {
    console.warn('[whatsapp/pending] table absente — exécutez ADD_WHATSAPP_PENDING_DELIVERY.sql');
    return true;
  }
  return false;
}

/**
 * Met un contenu en attente de la réouverture de la fenêtre 24 h.
 *
 * @param {object} p
 * @param {string} p.schoolId
 * @param {string} p.phone        destinataire E.164
 * @param {string} [p.text]       texte à livrer
 * @param {string} [p.mediaUrl]
 * @param {string} [p.fileName]
 * @param {'text'|'image'|'document'} [p.messageType]
 * @param {string} [p.kind]       étiquette libre (« teacher_credentials »…)
 * @returns {Promise<boolean>} true si la mise en attente a réussi
 */
export async function queuePending({
  schoolId, phone, text = '', mediaUrl = null, fileName = null,
  messageType = 'text', kind = 'generic',
}) {
  if (!phone || (!text && !mediaUrl)) return false;
  const { error } = await supabaseAdmin.from(TABLE).insert({
    school_id: schoolId,
    phone_e164: String(phone),
    message_type: messageType,
    body_text: text || '',
    media_url: mediaUrl,
    file_name: fileName,
    kind,
    expires_at: new Date(Date.now() + TTL_HOURS * 3600 * 1000).toISOString(),
  });
  if (error) {
    if (!avertirMigration(error)) console.error('[whatsapp/pending] mise en attente:', error.message);
    return false;
  }
  console.log(`[whatsapp/pending] ${kind} en attente pour ${phone}`);
  return true;
}

/**
 * Livre tout ce qui attendait ce numéro. Appelé au tout début du traitement
 * d'un message ENTRANT : la fenêtre de 24 h vient précisément de s'ouvrir.
 *
 * @returns {Promise<number>} nombre de contenus livrés
 */
export async function flushPending(schoolId, phone) {
  if (!phone) return 0;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('id, school_id, message_type, body_text, media_url, file_name, kind')
    .eq('phone_e164', String(phone))
    .is('delivered_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    if (!avertirMigration(error)) console.error('[whatsapp/pending] lecture:', error.message);
    return 0;
  }
  if (!data?.length) return 0;

  let livres = 0;
  for (const row of data) {
    const school = row.school_id || schoolId;
    try {
      let r;
      if (row.message_type === 'image' && row.media_url) {
        r = await sendImage(school, phone, row.media_url, row.body_text || '');
      } else if (row.message_type === 'document' && row.media_url) {
        r = await sendDocument(
          school, phone, row.media_url, row.file_name || 'document.pdf', row.body_text || '',
        );
      } else {
        r = await sendText(school, phone, row.body_text || '');
      }
      if (!r?.success) {
        console.warn(`[whatsapp/pending] échec livraison ${row.kind} → ${phone}: ${r?.message || 'inconnu'}`);
        continue;
      }
      await supabaseAdmin.from(TABLE).update({ delivered_at: new Date().toISOString() }).eq('id', row.id);
      livres++;
    } catch (e) {
      console.error('[whatsapp/pending] livraison:', e.message);
    }
  }
  if (livres) {
    console.log(`[whatsapp/pending] ${livres} contenu(s) livré(s) à ${phone}`);
    await promouvoirAnnonces(phone);
  }
  return livres;
}

/**
 * Le contenu vient d'être livré : les lignes marquées « annoncé » pour ce
 * numéro deviennent enfin, et honnêtement, « envoyé ». Sans cela la boîte de
 * réception resterait bloquée sur « annoncé » alors que le parent a tout reçu.
 */
async function promouvoirAnnonces(phone) {
  try {
    const { data: lignes } = await supabaseAdmin
      .from('whatsapp_message_recipients')
      .select('id, message_id')
      .eq('phone_e164', String(phone))
      .eq('status', 'announced');
    if (!lignes?.length) return;

    const maintenant = new Date().toISOString();
    await supabaseAdmin
      .from('whatsapp_message_recipients')
      .update({ status: 'sent', sent_at: maintenant })
      .in('id', lignes.map((l) => l.id));

    // Envois à destinataire unique (identifiants d'un prof, d'un parent…) :
    // la campagne elle-même portait le statut « annoncé ».
    const messageIds = [...new Set(lignes.map((l) => l.message_id).filter(Boolean))];
    if (messageIds.length) {
      await supabaseAdmin
        .from('whatsapp_messages')
        .update({ status: 'sent' })
        .in('id', messageIds)
        .eq('status', 'announced');
    }
  } catch (e) {
    console.warn('[whatsapp/pending] promotion des annonces:', e.message);
  }
}
