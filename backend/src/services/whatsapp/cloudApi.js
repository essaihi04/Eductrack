/**
 * Provider WhatsApp Cloud API (officielle Meta) — multi-écoles, token central.
 *
 * SEUL provider WhatsApp du projet depuis la suppression de Baileys.
 * Interface d'envoi (reprise telle quelle par ./index.js) :
 *   sendText / sendImage / sendDocument / sendMediaBuffer
 *   → format de retour { success: bool, data: { msgId }, message? }
 *
 * Caractéristiques :
 *   - Aucun socket, aucune session : tout passe par des appels HTTPS Graph API.
 *   - Aucune règle d'envoi : ni fenêtre horaire, ni délai entre deux messages,
 *     ni quota de montée en charge (l'API officielle n'a pas de risque de
 *     blocage pour usage automatisé). Seules s'appliquent les limites Meta.
 *   - 1 seul token (WA_TOKEN). Chaque école = un phone_number_id distinct,
 *     stocké dans whatsapp_school_sessions.phone_number_id.
 *
 * Variables d'environnement :
 *   WA_TOKEN          token System User permanent (Bearer)
 *   WA_WABA_ID        identifiant du WhatsApp Business Account (onboarding numéros)
 *   WA_API_VERSION    version Graph API (défaut v21.0)
 *   WA_APP_SECRET     pour vérifier la signature des webhooks entrants
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../../config/supabase.js';

const API_VERSION = process.env.WA_API_VERSION || 'v21.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
const TOKEN = () => process.env.WA_TOKEN;
const WABA_ID = () => process.env.WA_WABA_ID;

const ok = (msgId, extra = {}) => ({ success: true, data: { msgId, ...extra } });
const fail = (message, extra = {}) => ({ success: false, message, ...extra });

// Numéro WhatsApp → digits uniquement (Cloud API n'accepte pas le '+').
const toPlain = (phone) => String(phone || '').replace(/[^\d]/g, '');

// ─────────────────────────────────────────────────────────────────────────
// Résolution école ↔ phone_number_id (avec petit cache TTL)
// ─────────────────────────────────────────────────────────────────────────

const CACHE_TTL = 60_000; // 1 min
const providerCache = new Map(); // school_id -> { phoneNumberId, phone, status, at }

async function loadSession(schoolId) {
  const cached = providerCache.get(schoolId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached;

  const { data } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('phone_number_id, phone_number, status, session_name')
    .eq('school_id', schoolId)
    .maybeSingle();

  const entry = {
    phoneNumberId: data?.phone_number_id || null,
    phone: data?.phone_number || null,
    name: data?.session_name || null,
    status: data?.status || 'no_session',
    at: Date.now(),
  };
  providerCache.set(schoolId, entry);
  return entry;
}

/** Vide le cache d'une école (à appeler après modification du provider). */
export function invalidateCache(schoolId) {
  if (schoolId) providerCache.delete(schoolId);
  else providerCache.clear();
}

/** true si l'école a un numéro Cloud API configuré (seul provider supporté). */
export async function isCloudSchool(schoolId) {
  if (!schoolId || !TOKEN()) return false;
  const s = await loadSession(schoolId);
  return !!s.phoneNumberId;
}

/**
 * État de la connexion WhatsApp d'une école, au format attendu par les
 * appelants (`{ connected, status, phone, provider }`).
 *
 * ASYNCHRONE : avec le Cloud API il n'y a plus de socket en mémoire, l'état
 * vient de la base. Tous les appelants doivent faire `await getStatus(...)`.
 */
export async function getStatus(schoolId) {
  if (!schoolId) return { connected: false, status: 'no_school', phone: null, provider: 'cloud' };
  if (!TOKEN()) {
    return { connected: false, status: 'no_token', phone: null, provider: 'cloud',
      last_error: 'WA_TOKEN manquant (token Cloud API non configuré)' };
  }
  const s = await loadSession(schoolId);
  if (!s.phoneNumberId) {
    return { connected: false, status: 'no_session', phone: s.phone, name: s.name, provider: 'cloud' };
  }
  return {
    connected: s.status === 'connected',
    status: s.status,
    phone: s.phone,
    name: s.name,
    phoneNumberId: s.phoneNumberId,
    provider: 'cloud',
  };
}

async function getPhoneNumberId(schoolId) {
  const s = await loadSession(schoolId);
  return s.phoneNumberId;
}

/** Retrouve l'école à partir du phone_number_id reçu dans un webhook. */
export async function schoolIdByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return null;
  const { data } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('school_id')
    .eq('phone_number_id', String(phoneNumberId))
    .maybeSingle();
  return data?.school_id || null;
}

// ─────────────────────────────────────────────────────────────────────────
// Appel bas niveau Graph API
// ─────────────────────────────────────────────────────────────────────────

async function waSend(schoolId, payload) {
  const phoneNumberId = await getPhoneNumberId(schoolId);
  if (!phoneNumberId) return fail('Aucun phone_number_id configuré pour cette école');
  if (!TOKEN()) return fail('WA_TOKEN manquant (token Cloud API non configuré)');

  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      console.warn(`[cloudApi][${schoolId}] envoi échoué: ${msg}`);
      return fail(msg, { code: data?.error?.code });
    }
    return ok(data?.messages?.[0]?.id || null);
  } catch (e) {
    return fail(e.message || 'Erreur réseau Cloud API');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// API publique d'envoi (signatures identiques à index.js)
// ─────────────────────────────────────────────────────────────────────────

export async function sendText(schoolId, phone, text) {
  return waSend(schoolId, {
    to: toPlain(phone),
    type: 'text',
    text: { preview_url: false, body: String(text || '') },
  });
}

export async function sendImage(schoolId, phone, imageUrl, caption = '') {
  return waSend(schoolId, {
    to: toPlain(phone),
    type: 'image',
    image: { link: imageUrl, caption: caption || undefined },
  });
}

export async function sendDocument(schoolId, phone, documentUrl, fileName, caption = '') {
  return waSend(schoolId, {
    to: toPlain(phone),
    type: 'document',
    document: { link: documentUrl, filename: fileName || 'document.pdf', caption: caption || undefined },
  });
}

/**
 * Envoi d'un média depuis un buffer (PDF bulletins/factures, images locales).
 * Cloud API : on uploade d'abord le binaire pour obtenir un media_id, puis on
 * envoie le message référençant ce media_id.
 */
export async function sendMediaBuffer(schoolId, phone, buffer, { type = 'document', fileName, mimetype, caption } = {}) {
  const mediaId = await uploadMedia(schoolId, buffer, mimetype, fileName);
  if (!mediaId) return fail('Upload média Cloud API échoué');

  const to = toPlain(phone);
  if (type === 'image') {
    return waSend(schoolId, { to, type: 'image', image: { id: mediaId, caption: caption || undefined } });
  }
  if (type === 'video') {
    return waSend(schoolId, { to, type: 'video', video: { id: mediaId, caption: caption || undefined } });
  }
  if (type === 'audio') {
    return waSend(schoolId, { to, type: 'audio', audio: { id: mediaId } });
  }
  return waSend(schoolId, {
    to, type: 'document',
    document: { id: mediaId, filename: fileName || 'document.pdf', caption: caption || undefined },
  });
}

/** Upload d'un buffer vers /media → renvoie un media_id réutilisable. */
async function uploadMedia(schoolId, buffer, mimetype, fileName) {
  const phoneNumberId = await getPhoneNumberId(schoolId);
  if (!phoneNumberId) return null;
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([buffer], { type: mimetype || 'application/octet-stream' }), fileName || 'file');
    const res = await fetch(`${GRAPH}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN()}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn(`[cloudApi][${schoolId}] upload média échoué: ${data?.error?.message || res.status}`);
      return null;
    }
    return data?.id || null;
  } catch (e) {
    console.warn(`[cloudApi][${schoolId}] upload média erreur: ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Messages interactifs (LES VRAIS BOUTONS) + templates proactifs
// ─────────────────────────────────────────────────────────────────────────

/**
 * Envoie un menu sous forme de LISTE cliquable native (max 10 lignes).
 * Les rowId reprennent le format "menuId:optionId" pour rester compatibles
 * avec matchMenuOption() existant.
 */
// Limites Meta pour une ligne de liste interactive.
const LIST_TITLE_MAX = 24;
const LIST_DESC_MAX = 72;

/** Coupe à N caractères en comptant les points de code (les emojis en occupent plusieurs). */
function cut(text, max) {
  const chars = [...String(text ?? '')];
  return chars.length <= max ? String(text ?? '') : chars.slice(0, max).join('');
}

/**
 * Titre d'une ligne de liste. Meta impose 24 caractères ; on coupe sur un MOT
 * entier plutôt qu'en plein milieu (« Poser une question li » → « Poser une
 * question… »), et l'appelant reporte le libellé complet en description.
 */
function listRowTitle(text) {
  const full = String(text ?? '').trim();
  if ([...full].length <= LIST_TITLE_MAX) return full;
  const troncon = cut(full, LIST_TITLE_MAX - 1);         // place pour l'ellipse
  const espace = troncon.lastIndexOf(' ');
  // On ne recule au mot précédent que si cela laisse un titre encore lisible.
  const base = espace > LIST_TITLE_MAX / 2 ? troncon.slice(0, espace) : troncon;
  return `${base.replace(/[\s,;:.…-]+$/, '')}…`;
}

export async function sendListMenu(schoolId, phone, menu, ctx = {}) {
  const rows = menu.options.slice(0, 10).map((opt) => {
    const full = `${opt.emoji ? opt.emoji + ' ' : ''}${opt.label}`;
    const title = listRowTitle(full);
    // Titre tronqué → le libellé complet est repris en description (72 car.),
    // affichée sous le titre : plus rien n'est illisible.
    return title === full
      ? { id: `${menu.id}:${opt.id}`, title }
      : { id: `${menu.id}:${opt.id}`, title, description: cut(opt.label, LIST_DESC_MAX) };
  });

  const bodyLines = [];
  if (ctx.studentName) bodyLines.push(`👶 ${ctx.studentName}`);
  if (menu.description) bodyLines.push(menu.description);
  const body = bodyLines.join('\n') || menu.title;

  return waSend(schoolId, {
    to: toPlain(phone),
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: menu.title.slice(0, 60) },
      body: { text: body.slice(0, 1024) },
      footer: ctx.schoolName ? { text: String(ctx.schoolName).slice(0, 60) } : undefined,
      action: {
        // Libellé du bouton qui ouvre la liste — il fait partie de l'interface,
        // pas du contenu : il doit suivre la langue du destinataire.
        button: ctx.lang === 'ar' ? 'عرض الخيارات' : 'Voir les options',
        sections: [{ title: menu.title.slice(0, 24), rows }],
      },
    },
  });
}

/**
 * Boutons de réponse rapide (max 3). buttons = [{ id, label }].
 */
export async function sendButtons(schoolId, phone, bodyText, buttons) {
  return waSend(schoolId, {
    to: toPlain(phone),
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: String(bodyText).slice(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: String(b.id), title: String(b.label).slice(0, 20) },
        })),
      },
    },
  });
}

/**
 * Message proactif via template pré-approuvé (hors fenêtre 24h).
 * @param {Array} components composants Meta (body params, etc.)
 */
export async function sendTemplate(schoolId, phone, templateName, languageCode = 'fr', components = []) {
  return waSend(schoolId, {
    to: toPlain(phone),
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Onboarding d'un numéro depuis l'app (token central, sous le WABA central)
// Flux Meta : addPhoneNumber → requestCode → verifyCode → registerNumber
// ─────────────────────────────────────────────────────────────────────────

async function graphPost(path, body) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* corps vide */ }
  return { ok: res.ok, status: res.status, data };
}

/** Ajoute un numéro sous le WABA central → renvoie son phone_number_id. */
export async function addPhoneNumber({ cc, phone, verifiedName }) {
  if (!WABA_ID() || !TOKEN()) return { success: false, message: 'WA_WABA_ID ou WA_TOKEN manquant côté serveur' };
  const { ok, data } = await graphPost(`${WABA_ID()}/phone_numbers`, {
    cc: String(cc),
    phone_number: String(phone),
    verified_name: verifiedName,
  });
  if (!ok) return { success: false, message: data?.error?.message || 'Ajout du numéro échoué' };
  return { success: true, phoneNumberId: data.id };
}

/** Demande l'envoi du code de vérification (SMS ou VOICE). */
export async function requestCode(phoneNumberId, method = 'SMS', language = 'fr') {
  const { ok, data } = await graphPost(`${phoneNumberId}/request_code`, {
    code_method: method,
    language,
  });
  if (!ok) return { success: false, message: data?.error?.message || 'Envoi du code échoué' };
  return { success: true };
}

/** Vérifie le code reçu sur le numéro. */
export async function verifyCode(phoneNumberId, code) {
  const { ok, data } = await graphPost(`${phoneNumberId}/verify_code`, { code: String(code) });
  if (!ok) return { success: false, message: data?.error?.message || 'Code invalide' };
  return { success: true };
}

/** Active le numéro pour la messagerie Cloud API (définit un PIN 2FA). */
export async function registerNumber(phoneNumberId, pin) {
  const { ok, data } = await graphPost(`${phoneNumberId}/register`, {
    messaging_product: 'whatsapp',
    pin: String(pin),
  });
  if (!ok) return { success: false, message: data?.error?.message || 'Activation Cloud API échouée' };
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Réception : vérification signature + parsing du webhook Meta
// ─────────────────────────────────────────────────────────────────────────

/** Vérifie la signature X-Hub-Signature-256 d'un webhook entrant. */
export function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.WA_APP_SECRET;
  if (!secret) return true; // pas de secret configuré → on n'impose pas (dev)
  if (!signatureHeader || !rawBody) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Télécharge un média entrant (image envoyée par le parent) → buffer. */
async function downloadCloudMedia(mediaId) {
  // 1. Récupère l'URL temporaire du média
  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN()}` },
  });
  const meta = await metaRes.json();
  if (!meta?.url) throw new Error('URL média introuvable');
  // 2. Télécharge le binaire (auth requise)
  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN()}` } });
  const ab = await binRes.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Parse un payload webhook Meta et en extrait un message normalisé,
 * au format attendu par handleIncomingWhatsAppMessage.
 * @returns {object|null} { from, text, id, schoolId, location, image } ou null
 */
export async function parseIncoming(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return null; // statuses (delivered/read) ou autre → ignorer

  const phoneNumberId = value?.metadata?.phone_number_id;
  const schoolId = await schoolIdByPhoneNumberId(phoneNumberId);
  if (!schoolId) {
    console.warn(`[cloudApi] webhook reçu pour phone_number_id inconnu: ${phoneNumberId}`);
    return null;
  }

  const from = '+' + toPlain(msg.from);
  const id = msg.id || `${Date.now()}`;

  // Clic bouton / liste → on récupère l'id (format "menuId:optionId")
  let text =
    msg.interactive?.list_reply?.id ||
    msg.interactive?.button_reply?.id ||
    msg.text?.body ||
    // Réponse à un bouton de template : le `payload` (défini à l'envoi) est
    // stable, alors que `text` est le libellé affiché — traduit ou reformulé,
    // il ne correspondrait plus aux mots-clés attendus par le chatbot.
    msg.button?.payload ||
    msg.button?.text ||
    msg.image?.caption ||
    msg.document?.caption ||
    '';

  // Localisation partagée → profil transport
  let location = null;
  if (msg.location && msg.location.latitude != null && msg.location.longitude != null) {
    location = {
      lat: Number(msg.location.latitude),
      lng: Number(msg.location.longitude),
      name: msg.location.name || null,
      address: msg.location.address || null,
    };
  }

  // Image partagée → photo de profil (téléchargement lazy)
  let image = null;
  if (msg.image?.id) {
    const mediaId = msg.image.id;
    image = {
      mimetype: msg.image.mime_type || 'image/jpeg',
      download: () => downloadCloudMedia(mediaId),
    };
  }

  // Tout média reçu (note vocale, photo, PDF, vidéo) est exposé sous une forme
  // unique : la boîte de réception doit pouvoir l'archiver et le rejouer, quel
  // que soit son type. `image` reste à part car il alimente aussi la photo de
  // profil de l'élève.
  let media = null;
  const MEDIA_KINDS = [
    ['audio', msg.audio], ['image', msg.image],
    ['document', msg.document], ['video', msg.video], ['sticker', msg.sticker],
  ];
  for (const [kind, node] of MEDIA_KINDS) {
    if (!node?.id) continue;
    const mediaId = node.id;
    media = {
      kind,
      mimetype: node.mime_type || null,
      // Une note vocale n'a pas de nom de fichier : on en fabrique un lisible.
      fileName: node.filename || `${kind}-${Date.now()}`,
      voice: kind === 'audio' ? node.voice === true : false,
      download: () => downloadCloudMedia(mediaId),
    };
    break;
  }

  if (!text && !location && !image && !media) return null;

  return { from, text, id, schoolId, location, image, media };
}

// ─────────────────────────────────────────────────────────────────────────
// Profil du numéro (photo, à propos, description, contacts)
//
// Un numéro rattaché à l'API Cloud n'est plus utilisable dans l'application
// WhatsApp : la photo de profil et les infos de la fiche entreprise ne se
// modifient QUE par l'API (ou via WhatsApp Manager). C'est ce que font les
// fonctions ci-dessous.
//
// La photo passe par l'API d'upload « resumable » de Meta, en deux temps :
//   1. ouverture d'une session d'upload sur l'APP    → id de session
//   2. envoi du binaire dans cette session           → « handle » réutilisable
// puis le handle est posé sur le profil du numéro.
// ─────────────────────────────────────────────────────────────────────────

const APP_ID = () => process.env.WA_APP_ID;

const PROFILE_FIELDS = 'about,address,description,email,profile_picture_url,websites,vertical';

/** Fiche entreprise du numéro de l'école. */
export async function getBusinessProfile(schoolId) {
  const phoneNumberId = await getPhoneNumberId(schoolId);
  if (!phoneNumberId) return fail('Aucun numéro Cloud API rattaché à cette école');
  if (!TOKEN()) return fail('WA_TOKEN manquant (token Cloud API non configuré)');
  try {
    const res = await fetch(
      `${GRAPH}/${phoneNumberId}/whatsapp_business_profile?fields=${PROFILE_FIELDS}`,
      { headers: { Authorization: `Bearer ${TOKEN()}` } },
    );
    const data = await res.json();
    if (!res.ok) return fail(data?.error?.message || `HTTP ${res.status}`);
    return { success: true, profile: data?.data?.[0] || {} };
  } catch (e) {
    return fail(e.message || 'Erreur réseau Cloud API');
  }
}

/**
 * Met à jour la fiche entreprise. Seuls les champs fournis sont envoyés :
 * Meta remplace ce qu'il reçoit et laisse le reste intact.
 * @param {object} fields { about, address, description, email, websites[], vertical, profile_picture_handle }
 */
export async function updateBusinessProfile(schoolId, fields = {}) {
  const phoneNumberId = await getPhoneNumberId(schoolId);
  if (!phoneNumberId) return fail('Aucun numéro Cloud API rattaché à cette école');
  if (!TOKEN()) return fail('WA_TOKEN manquant (token Cloud API non configuré)');

  const body = { messaging_product: 'whatsapp' };
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== '') body[k] = v;
  }
  if (Object.keys(body).length === 1) return fail('Aucun champ à mettre à jour');

  const { ok, data } = await graphPost(`${phoneNumberId}/whatsapp_business_profile`, body);
  if (!ok) return fail(data?.error?.message || 'Mise à jour du profil refusée');
  return { success: true };
}

/**
 * Upload « resumable » d'un binaire sur l'app Meta → handle réutilisable.
 * Nécessite WA_APP_ID (l'app à laquelle le System User a accès).
 * @returns {Promise<{success: boolean, handle?: string, message?: string}>}
 */
export async function uploadResumable(buffer, mimetype = 'image/jpeg', fileName = 'photo.jpg') {
  if (!APP_ID()) return fail('WA_APP_ID manquant (identifiant de l\'app Meta)');
  if (!TOKEN()) return fail('WA_TOKEN manquant (token Cloud API non configuré)');

  try {
    // 1. Ouvrir la session d'upload
    const qs = new URLSearchParams({
      file_name: fileName,
      file_length: String(buffer.length),
      file_type: mimetype,
    });
    const openRes = await fetch(`${GRAPH}/${APP_ID()}/uploads?${qs}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN()}` },
    });
    const openData = await openRes.json();
    if (!openRes.ok || !openData?.id) {
      return fail(openData?.error?.message || 'Ouverture de la session d\'upload refusée');
    }

    // 2. Envoyer le binaire. Cet appel exige le schéma « OAuth », pas « Bearer ».
    const putRes = await fetch(`${GRAPH}/${openData.id}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${TOKEN()}`,
        file_offset: '0',
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    });
    const putData = await putRes.json();
    if (!putRes.ok || !putData?.h) {
      return fail(putData?.error?.message || 'Envoi du fichier refusé');
    }
    return { success: true, handle: putData.h };
  } catch (e) {
    return fail(e.message || 'Erreur réseau upload Meta');
  }
}

/** Pose une nouvelle photo de profil sur le numéro de l'école. */
export async function setProfilePicture(schoolId, buffer, mimetype = 'image/jpeg', fileName = 'photo.jpg') {
  const up = await uploadResumable(buffer, mimetype, fileName);
  if (!up.success) return up;
  return updateBusinessProfile(schoolId, { profile_picture_handle: up.handle });
}

// ─────────────────────────────────────────────────────────────────────────
// État d'un numéro chez Meta (nom affiché, examen, qualité, palier d'envoi)
// ─────────────────────────────────────────────────────────────────────────

const NUMBER_FIELDS = [
  'verified_name',            // nom affiché soumis
  'display_phone_number',     // numéro tel que Meta l'affiche
  'name_status',              // APPROVED | PENDING_REVIEW | DECLINED | EXPIRED | NONE | AVAILABLE_WITHOUT_REVIEW
  'code_verification_status', // VERIFIED | NOT_VERIFIED | EXPIRED
  'quality_rating',           // GREEN | YELLOW | RED
  'messaging_limit_tier',     // TIER_250 | TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED
  'platform_type',
].join(',');

/**
 * Fiche technique du numéro de l'école telle que Meta la voit.
 *
 * `name_status` est le champ décisif : tant qu'il n'est pas APPROVED (ou
 * AVAILABLE_WITHOUT_REVIEW), les parents qui n'ont pas enregistré le contact
 * voient le numéro brut au lieu du nom de l'établissement.
 */
export async function getNumberInfo(schoolId) {
  const phoneNumberId = await getPhoneNumberId(schoolId);
  if (!phoneNumberId) return fail('Aucun numéro Cloud API rattaché à cette école');
  if (!TOKEN()) return fail('WA_TOKEN manquant (token Cloud API non configuré)');
  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}?fields=${NUMBER_FIELDS}`, {
      headers: { Authorization: `Bearer ${TOKEN()}` },
    });
    const data = await res.json();
    if (!res.ok) return fail(data?.error?.message || `HTTP ${res.status}`);
    return { success: true, number: data };
  } catch (e) {
    return fail(e.message || 'Erreur réseau Cloud API');
  }
}

/**
 * Demande un NOUVEAU nom affiché pour le numéro : Meta ouvre un examen, et le
 * nom ne change chez les destinataires qu'une fois approuvé. L'ancien nom
 * reste actif entre-temps — une demande refusée ne casse donc rien.
 */
export async function requestDisplayName(schoolId, newName) {
  const phoneNumberId = await getPhoneNumberId(schoolId);
  if (!phoneNumberId) return fail('Aucun numéro Cloud API rattaché à cette école');
  const name = String(newName || '').trim();
  if (!name) return fail('Nom affiché requis');

  const { ok, data } = await graphPost(`${phoneNumberId}`, { new_display_name: name });
  if (!ok) return fail(data?.error?.message || 'Demande de nom affiché refusée');
  return { success: true };
}
