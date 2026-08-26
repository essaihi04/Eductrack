/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ENVOIS UTILITAIRES PROACTIFS (l'école écrit la première)             ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Règle de l'API Cloud : le texte libre n'est accepté que dans la      ║
 * ║  FENÊTRE DE SERVICE de 24 h, ouverte par un message ENTRANT du        ║
 * ║  destinataire. En dehors, Meta rejette l'envoi (erreur 131047) et     ║
 * ║  seul un template approuvé passe.                                     ║
 * ║                                                                       ║
 * ║  Ce module tranche automatiquement :                                  ║
 * ║    fenêtre ouverte  → texte libre, riche et gratuit (comme Baileys)   ║
 * ║    fenêtre fermée   → template utilitaire approuvé, à paramètres      ║
 * ║    pas de template  → échec explicite `no_template` (jamais silencieux)║
 * ║                                                                       ║
 * ║  La fenêtre est mesurée sur le NUMÉRO (phone_e164), pas sur le        ║
 * ║  parent : c'est bien l'utilisateur WhatsApp qui l'ouvre, et certains  ║
 * ║  destinataires (personnel, réceptionniste) n'ont pas de parent_id.    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { supabaseAdmin } from '../../config/supabase.js';
import * as cloud from './cloudApi.js';
import { sendText } from './index.js';
import { isOutboundBlocked, OUTBOUND_DISABLED_MESSAGE } from './outboundGate.js';
import { getTemplate, buildComponents, definitionFor } from './templates.js';
import { queuePending } from './pendingDelivery.js';

/** Normalise un numéro pour la comparaison en base (E.164 sans espaces). */
const norm = (phone) => String(phone || '').replace(/[^\d+]/g, '');

/**
 * Le destinataire a-t-il écrit dans les dernières 24 h ?
 * Si oui, la fenêtre de service est ouverte : texte libre autorisé ET gratuit.
 */
export async function serviceWindowOpen(phone) {
  const p = norm(phone);
  if (!p) return false;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .select('id')
    .eq('phone_e164', p)
    .gte('created_at', since)
    .limit(1);
  if (error) {
    // En cas de doute on considère la fenêtre FERMÉE : partir sur un template
    // coûte un peu plus cher, mais un texte libre hors fenêtre serait perdu.
    console.warn('[whatsapp/utility] serviceWindowOpen:', error.message);
    return false;
  }
  return !!(data && data.length);
}

// Plages Unicode de l'alphabet arabe (arabe de base + supplements).
const ARABE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Langue a employer pour un template proactif.
 *
 * Le chatbot detecte l'arabe sur le texte ENTRANT du parent ; ici il n'y a
 * aucun texte a analyser puisque c'est l'ecole qui ecrit la premiere. On se
 * fonde donc sur la langue du DERNIER message recu de ce numero. Repli : fr.
 */
export async function preferredLanguage(phone) {
  const p = norm(phone);
  if (!p) return 'fr';

  // 1. Choix EXPLICITE du sélecteur de langue de l'app : il prime sur tout.
  const explicite = await langueChoisie(p);
  if (explicite) return explicite;

  // 2. Aucun choix enregistré → langue devinée du dernier message reçu.
  const { data, error } = await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .select('message_text')
    .eq('phone_e164', p)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return 'fr';
  return ARABE.test(data?.[0]?.message_text || '') ? 'ar' : 'fr';
}

/**
 * Langue explicitement choisie par le titulaire de ce numéro, ou null.
 * On tente parent_contacts (numéro WhatsApp déclaré) puis profiles.phone,
 * dans le même ordre que la résolution du chatbot.
 */
async function langueChoisie(phoneNormalise) {
  // Le client Supabase ne LÈVE pas sur erreur SQL, il la renvoie dans `error` :
  // si ADD_PREFERRED_LANGUAGE.sql n'a pas encore été exécuté, la colonne est
  // absente et il faut le détecter ici, sinon on croirait à « aucun choix ».
  const { data: contacts, error: errContact } = await supabaseAdmin
    .from('parent_contacts')
    .select('profiles:parent_id!inner(preferred_language)')
    .eq('phone_e164', phoneNormalise)
    .eq('channel', 'whatsapp')
    .limit(1);
  if (errContact) {
    console.warn('[whatsapp/utility] langue préférée indisponible — exécutez ADD_PREFERRED_LANGUAGE.sql :', errContact.message);
    return null;
  }
  const viaContact = contacts?.[0]?.profiles?.preferred_language;
  if (viaContact) return viaContact;

  const { data: profils, error: errProfil } = await supabaseAdmin
    .from('profiles')
    .select('preferred_language')
    .eq('phone', phoneNormalise)
    .limit(1);
  if (errProfil) return null;
  return profils?.[0]?.preferred_language || null;
}

/**
 * Objet court tiré du corps d'un message, pour le template générique
 * « information » hors fenêtre 24 h. On prend la première ligne non vide,
 * débarrassée du gras Markdown et des emojis.
 */
export function subjectFromText(text) {
  const line = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[*_~`]/g, '').replace(/[^\p{L}\p{N}\s'’,.:-]/gu, '').trim())
    .find((l) => l.length > 2);
  return line || "une information de l'établissement";
}

/**
 * Envoi utilitaire proactif.
 *
 * @param {string} schoolId
 * @param {string} phone            destinataire, E.164
 * @param {object} opts
 * @param {string} opts.text        version texte libre (fenêtre ouverte)
 * @param {string} opts.template    clé logique du registre (voir templates.js)
 * @param {Array}  opts.params      valeurs des {{1}}, {{2}}… dans l'ordre
 * @param {boolean} [opts.queueText] mettre le texte en attente derrière un
 *                                   template d'annonce (défaut oui ; à couper
 *                                   quand l'appelant met déjà en attente un
 *                                   média porteur du même texte en légende)
 * @returns {Promise<{success:boolean, channel?:string, reason?:string, message?:string}>}
 */
export async function sendUtility(schoolId, phone, { text, template, params = [], lang = null, queueText = true } = {}) {
  if (isOutboundBlocked()) {
    return { success: false, reason: 'outbound_disabled', message: OUTBOUND_DISABLED_MESSAGE };
  }
  if (!(await cloud.isCloudSchool(schoolId))) {
    return {
      success: false,
      reason: 'session_down',
      message: 'Numéro WhatsApp non configuré pour cette école (API Cloud)',
    };
  }

  // 1. Fenêtre ouverte → texte libre, exactement comme avant (et gratuit).
  if (text && (await serviceWindowOpen(phone))) {
    const r = await sendText(schoolId, phone, text);
    return { ...r, channel: 'free_text', paid: false };
  }

  // 2. Fenêtre fermée → template approuvé obligatoire.
  // Confort : le template générique « information » n'a qu'un paramètre (l'objet).
  // Quand l'appelant ne le fournit pas, on le dérive du texte libre — cela évite
  // d'imposer un libellé à la main sur chaque envoi du hub de communication.
  const finalParams =
    params.length ? params
    : (template === 'information' && text ? [subjectFromText(text)] : params);

  const tpl = template ? getTemplate(template) : null;
  if (!tpl) {
    const key = template || '(aucune)';
    console.warn(
      `[whatsapp/utility] Hors fenêtre 24h et template « ${key} » non configuré → envoi abandonné (${phone}).`
    );
    return {
      success: false,
      reason: 'no_template',
      message: `Message non envoyé : hors fenêtre 24 h et template « ${key} » non approuvé/configuré.`,
    };
  }

  // Un template d'ANNONCE ne transporte pas le message : sans mise en attente,
  // le texte réel serait perdu et le destinataire qui répond « oui » ne
  // recevrait jamais rien. On le stocke ici, il partira à sa première réponse.
  if (tpl.announce && text && queueText) {
    await queuePending({ schoolId, phone, text, kind: 'announced_text' });
  }

  // `tpl.name` = nom RÉELLEMENT approuvé chez Meta (variable d'environnement).
  // Chez Meta un même NOM porte plusieurs langues : seul `language` change.
  const def = definitionFor(tpl, lang || (await preferredLanguage(phone)));
  const r = await cloud.sendTemplate(
    schoolId,
    phone,
    tpl.name,
    def.language || 'fr',
    buildComponents(finalParams, def.buttonPayloads || [])
  );
  // `announced` : le template s'est contenté d'annoncer, le contenu réel n'est
  // pas parti. L'appelant doit le journaliser comme tel (voir deliveryStatus).
  return { ...r, channel: 'template', paid: true, lang: def.language, announced: tpl.announce === true };
}

/**
 * Envoi utilitaire d'un MÉDIA (PDF de bulletin, facture, reçu…).
 *
 * Un document est soumis à la même fenêtre de 24 h que le texte : hors fenêtre,
 * Meta n'accepte qu'un template. Or un template à en-tête média impose une URL
 * publique et un examen séparé — trop lourd pour un PDF généré à la volée.
 *
 * Stratégie retenue : hors fenêtre, on envoie le template texte qui ANNONCE le
 * document et invite le parent à répondre. Sa réponse rouvre la fenêtre 24 h,
 * et le PDF part alors librement (et gratuitement).
 *
 * @param {object} opts
 * @param {Buffer} opts.buffer      contenu du document
 * @param {string} opts.fileName
 * @param {string} [opts.mimetype]
 * @param {string} [opts.caption]
 * @param {string} [opts.template]  clé du registre, défaut « document »
 * @param {Array}  [opts.params]    paramètres du template d'annonce
 */
export async function sendUtilityMedia(schoolId, phone, {
  buffer, fileName, mimetype = 'application/pdf', caption = '',
  type = 'document', template = 'document', params = [], lang = null,
} = {}) {
  if (isOutboundBlocked()) {
    return { success: false, reason: 'outbound_disabled', message: OUTBOUND_DISABLED_MESSAGE };
  }
  if (!(await cloud.isCloudSchool(schoolId))) {
    return {
      success: false,
      reason: 'session_down',
      message: 'Numéro WhatsApp non configuré pour cette école (API Cloud)',
    };
  }

  if (await serviceWindowOpen(phone)) {
    const r = await cloud.sendMediaBuffer(schoolId, phone, buffer, { type, fileName, mimetype, caption });
    return { ...r, channel: 'free_media', paid: false };
  }

  const tpl = template ? getTemplate(template) : null;
  if (!tpl) {
    console.warn(
      `[whatsapp/utility] Document non envoyé : hors fenêtre 24 h et template « ${template || '(aucune)'} » non configuré (${phone}).`
    );
    return {
      success: false,
      reason: 'no_template',
      message: `Document non envoyé : hors fenêtre 24 h et template « ${template || '(aucune)'} » non approuvé/configuré.`,
    };
  }

  const def = definitionFor(tpl, lang || (await preferredLanguage(phone)));
  const r = await cloud.sendTemplate(
    schoolId, phone, tpl.name, def.language || 'fr', buildComponents(params, def.buttonPayloads || [])
  );
  // Succès = l'ANNONCE est partie ; le PDF suivra quand le parent répondra.
  return { ...r, channel: 'template_announce', paid: true, mediaDeferred: true, lang: def.language, announced: true };
}

/**
 * Statut de livraison à journaliser pour un résultat d'envoi.
 *
 *   'sent'      le destinataire a reçu le contenu ;
 *   'announced' seule l'annonce est partie — le contenu attend sa réponse ;
 *   'failed'    rien n'est parti.
 *
 * Distinguer les deux premiers n'est pas cosmétique : la boîte de réception
 * affichait « ✓ Envoyé » sous un message d'identifiants que le professeur
 * n'avait jamais reçu, ce qui rendait le diagnostic impossible.
 */
export function deliveryStatus(result) {
  if (!result?.success) return 'failed';
  return result.announced ? 'announced' : 'sent';
}
