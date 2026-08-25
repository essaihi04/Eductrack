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
import { getTemplate, buildComponents } from './templates.js';

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
 * @returns {Promise<{success:boolean, channel?:string, reason?:string, message?:string}>}
 */
export async function sendUtility(schoolId, phone, { text, template, params = [] } = {}) {
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

  // `tpl.name` = nom RÉELLEMENT approuvé chez Meta (variable d'environnement).
  // `tpl.definition.name` n'est que le nom proposé au moment de la création.
  const r = await cloud.sendTemplate(
    schoolId,
    phone,
    tpl.name,
    tpl.definition.language || 'fr',
    buildComponents(finalParams, tpl.definition.buttonPayloads || [])
  );
  return { ...r, channel: 'template', paid: true };
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
  type = 'document', template = 'document', params = [],
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

  const r = await cloud.sendTemplate(
    schoolId, phone, tpl.name, tpl.definition.language || 'fr', buildComponents(params, tpl.definition.buttonPayloads || [])
  );
  // Succès = l'ANNONCE est partie ; le PDF suivra quand le parent répondra.
  return { ...r, channel: 'template_announce', paid: true, mediaDeferred: true };
}
