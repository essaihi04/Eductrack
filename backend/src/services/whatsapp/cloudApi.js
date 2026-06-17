/**
 * Provider WhatsApp Cloud API (officielle Meta) — multi-écoles, token central.
 *
 * Expose la MÊME interface publique que ./index.js (Baileys) :
 *   sendText / sendImage / sendDocument / sendMediaBuffer
 *   → format de retour { success: bool, data: { msgId }, message? }
 *
 * Différences clés avec Baileys :
 *   - Aucun socket, aucune session : tout passe par des appels HTTPS Graph API.
 *   - Aucune couche anti-ban (l'API officielle n'a pas de risque de ban).
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

const ok = (msgId, extra = {}) => ({ success: true, data: { msgId, ...extra } });
const fail = (message, extra = {}) => ({ success: false, message, ...extra });

// Numéro WhatsApp → digits uniquement (Cloud API n'accepte pas le '+').
const toPlain = (phone) => String(phone || '').replace(/[^\d]/g, '');

// ─────────────────────────────────────────────────────────────────────────
// Résolution école ↔ phone_number_id (avec petit cache TTL)
// ─────────────────────────────────────────────────────────────────────────

const CACHE_TTL = 60_000; // 1 min
const providerCache = new Map(); // school_id -> { provider, phoneNumberId, at }

async function loadSession(schoolId) {
  const cached = providerCache.get(schoolId);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached;

  const { data } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('provider, phone_number_id')
    .eq('school_id', schoolId)
    .maybeSingle();

  const entry = {
    provider: data?.provider || 'baileys',
    phoneNumberId: data?.phone_number_id || null,
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

/** true si l'école utilise le Cloud API officiel (et a un numéro configuré). */
export async function isCloudSchool(schoolId) {
  if (!schoolId || !TOKEN()) return false;
  const s = await loadSession(schoolId);
  return s.provider === 'cloud' && !!s.phoneNumberId;
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

export async function sendText(schoolId, phone, text /* , opts */) {
  return waSend(schoolId, {
    to: toPlain(phone),
    type: 'text',
    text: { preview_url: false, body: String(text || '') },
  });
}

export async function sendImage(schoolId, phone, imageUrl, caption = '' /* , opts */) {
  return waSend(schoolId, {
    to: toPlain(phone),
    type: 'image',
    image: { link: imageUrl, caption: caption || undefined },
  });
}

export async function sendDocument(schoolId, phone, documentUrl, fileName, caption = '' /* mimetype, opts */) {
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
export async function sendMediaBuffer(schoolId, phone, buffer, { type = 'document', fileName, mimetype, caption } = {} /* , opts */) {
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
export async function sendListMenu(schoolId, phone, menu, ctx = {}) {
  const rows = menu.options.slice(0, 10).map((opt) => ({
    id: `${menu.id}:${opt.id}`,
    title: `${opt.emoji ? opt.emoji + ' ' : ''}${opt.label}`.slice(0, 24),
  }));

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
        button: 'Voir les options',
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
 * au MÊME format que handleBaileysIncoming → handleIncomingWhatsAppMessage.
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
    msg.button?.text || // réponse à un bouton de template
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

  if (!text && !location && !image) return null;

  return { from, text, id, schoolId, location, image };
}
