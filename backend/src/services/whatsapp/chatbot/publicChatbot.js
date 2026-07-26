/**
 * Chatbot « visiteur » — répond aux numéros NON rattachés à un parent.
 *
 * Par défaut, un numéro inconnu reçoit un silence total (anti-bruit / anti-ban).
 * Quand l'école active l'option (whatsapp_school_sessions.public_chatbot_enabled),
 * ces numéros obtiennent un service RESTREINT :
 *
 *   ✅ liste des fournitures scolaires (PDF régénéré par niveau)
 *   ✅ informations générales issues des documents importés par l'école
 *      (règlement, calendrier, inscription, cantine, transport…)
 *   ❌ AUCUNE donnée d'élève : notes, absences, paiements, identité, identifiants.
 *
 * Le module n'a délibérément accès à aucune fonction de contexte élève : la
 * réponse IA est construite uniquement à partir des extraits de documents.
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '../../../config/supabase.js';
import { sendText } from '../index.js';
import * as State from './state.js';
import { detectSpecialCommand } from './ai.js';
import { getKnowledgeSnippets } from './knowledge.js';
import { isSuppliesQuery, handleSuppliesRequest, handleSuppliesLevelReply } from './supplies.js';
import { tryOfficialDocument } from './documents.js';
import {
  handleShowcaseQuestion, handleShowcaseReply, sendShowcaseMenu, buildShowcaseContext,
} from './showcase.js';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  timeout: 45_000,
  maxRetries: 1,
});

// Un inconnu ne doit pas pouvoir faire tourner l'IA (ni la facture DeepSeek)
// indéfiniment : plafond de messages traités par numéro et par jour.
const DAILY_LIMIT_PER_PHONE = 20;
const usage = new Map(); // phone -> { day: 'YYYY-MM-DD', count }

function underDailyLimit(phone) {
  const day = new Date().toISOString().slice(0, 10);
  const entry = usage.get(phone);
  if (!entry || entry.day !== day) {
    usage.set(phone, { day, count: 1 });
    return true;
  }
  if (entry.count >= DAILY_LIMIT_PER_PHONE) return false;
  entry.count += 1;
  return true;
}

// Cache du réglage par école (évite une requête à chaque message entrant).
const settingCache = new Map(); // schoolId -> { value, ts }
const SETTING_TTL_MS = 60_000;

/** L'école accepte-t-elle de répondre aux numéros inconnus ? */
export async function isPublicChatbotEnabled(schoolId) {
  if (!schoolId) return false;
  const hit = settingCache.get(schoolId);
  if (hit && Date.now() - hit.ts < SETTING_TTL_MS) return hit.value;

  const { data } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('public_chatbot_enabled')
    .eq('school_id', schoolId)
    .maybeSingle();

  const value = !!data?.public_chatbot_enabled;
  settingCache.set(schoolId, { value, ts: Date.now() });
  return value;
}

/** À appeler après changement du réglage côté admin (effet immédiat). */
export function invalidatePublicChatbotCache(schoolId) {
  if (schoolId) settingCache.delete(schoolId);
  else settingCache.clear();
}

// ─────────────────────────────────────────────────────────────────────────
// Réponse IA strictement limitée aux documents de l'école
// ─────────────────────────────────────────────────────────────────────────

const ARABIC_LETTERS_RE = new RegExp(
  `[${String.fromCharCode(0x0600)}-${String.fromCharCode(0x06FF)}]`,
  'g',
);

function isArabicText(text) {
  if (!text) return false;
  const arabic = (String(text).match(ARABIC_LETTERS_RE) || []).length;
  const letters = (String(text).match(/[\p{L}]/gu) || []).length;
  return letters > 0 && arabic / letters >= 0.3;
}

const PUBLIC_SYSTEM_PROMPT = `Tu es l'assistant WhatsApp PUBLIC d'une école marocaine. Tu réponds à des personnes dont le numéro n'est PAS rattaché à un élève (parents non enregistrés, futurs parents, visiteurs).

RÈGLES ABSOLUES :
1. Tu réponds UNIQUEMENT à partir du contexte fourni : la FICHE DE L'ÉCOLE (informations publiées par l'établissement) et les EXTRAITS DE DOCUMENTS OFFICIELS. Tu n'inventes rien.
2. Tu n'as AUCUNE donnée d'élève. Si on te demande des notes, absences, paiements, factures, identifiants, l'emploi du temps d'un élève ou toute information nominative : refuse poliment et explique que ces informations sont réservées aux parents dont le numéro est enregistré, en invitant à contacter l'administration de l'école.
3. Si la réponse n'est pas dans le contexte, dis simplement que tu n'as pas cette information et invite à contacter l'école. N'invente jamais un horaire, un tarif, un taux de réussite ou une date.
4. LANGUE : réponds dans la MÊME langue/écriture que la question (arabe → 100% arabe ; français → français ; darija latine → darija latine). Ne mélange jamais.
5. Réponse COURTE (8 lignes maximum), claire, avec des emojis pertinents.
6. Ne termine pas par « Tapez menu » : le système ajoute lui-même ce rappel.`;

function noAnswerMessage(text, schoolName) {
  if (isArabicText(text)) {
    return `🤔 لا أتوفر على هذه المعلومة في وثائق *${schoolName}*.\n\nيرجى الاتصال بإدارة المدرسة للحصول على إجابة دقيقة.`;
  }
  return `🤔 Je n'ai pas cette information dans les documents de *${schoolName}*.\n\nContactez l'administration de l'école pour une réponse précise.`;
}

/**
 * Répond à une question générale à partir des seuls documents de l'école.
 * @returns {Promise<string>}
 */
export async function answerFromKnowledge({ schoolId, schoolName, question }) {
  const [snippets, showcase] = await Promise.all([
    getKnowledgeSnippets(schoolId, question, { maxDocs: 3 }),
    // Fiche publiée par l'école : presentation, taux de reussite, atouts,
    // filieres, equipements, contacts (rubriques publiques uniquement).
    buildShowcaseContext(schoolId, { publicOnly: true }).catch(() => null),
  ]);
  if ((snippets.length === 0 && !showcase) || !process.env.DEEPSEEK_API_KEY) {
    return noAnswerMessage(question, schoolName);
  }

  try {
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      temperature: 0.2,
      max_tokens: 350,
      messages: [
        { role: 'system', content: PUBLIC_SYSTEM_PROMPT },
        {
          role: 'system',
          content: [
            `ÉCOLE : ${schoolName}`,
            showcase ? `FICHE DE L'ÉCOLE (informations publiées par l'établissement) :\n${showcase}` : null,
            snippets.length
              ? `EXTRAITS DES DOCUMENTS OFFICIELS :\n${snippets.map((sn) => `[${sn.title}]\n${sn.excerpt}`).join('\n---\n')}`
              : null,
          ].filter(Boolean).join('\n\n'),
        },
        { role: 'user', content: question },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || noAnswerMessage(question, schoolName);
  } catch (e) {
    console.error('[chatbot/public] DeepSeek:', e.message);
    return noAnswerMessage(question, schoolName);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Flux conversationnel visiteur
// ─────────────────────────────────────────────────────────────────────────

function welcomeMessage(schoolName) {
  return [
    `*👋 Bienvenue chez ${schoolName}*`,
    '━━━━━━━━━━━━━━━━━━━',
    'Je suis l\'assistant WhatsApp de l\'école. Je peux vous renseigner sur les *informations générales* :',
    '',
    '*1.* 🎒 Fournitures scolaires _(PDF par niveau)_',
    '*2.* 🏫 Découvrir l\'école _(photos, filières, résultats)_',
    '*3.* ℹ️ Autres informations _(inscription, horaires, règlement…)_',
    '',
    '_Répondez avec un numéro, ou posez directement votre question._',
    '',
    '⚠️ _Votre numéro n\'est pas rattaché à un élève : je ne peux pas communiquer de notes, absences ni paiements. Contactez l\'administration pour rattacher votre numéro._',
  ].join('\n');
}

function footerFor(text) {
  return isArabicText(text)
    ? '_اكتب *menu* لعرض الخيارات._'
    : '_Tapez *menu* pour revoir les options._';
}

async function getSchoolName(schoolId) {
  const { data } = await supabaseAdmin
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .maybeSingle();
  return data?.name || 'notre école';
}

/** Journalise le message entrant d'un visiteur (aucun parent associé). */
async function logIncoming({ schoolId, phone, text, providerMessageId }) {
  const { data } = await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .insert({
      phone_e164: phone,
      parent_id: null,
      school_id: schoolId,
      message_text: text || '',
      provider_message_id: providerMessageId,
      processed: false,
      category: 'general',
    })
    .select()
    .single();
  return data?.id || null;
}

async function markProcessed(id, reply = null) {
  if (!id) return;
  const update = { processed: true };
  if (reply) { update.ai_response_sent = true; update.ai_response_text = reply; }
  await supabaseAdmin.from('whatsapp_incoming_messages').update(update).eq('id', id);
}

/**
 * Traite un message d'un numéro inconnu.
 *
 * @returns {Promise<boolean>} true si le message a été pris en charge
 *   (false = l'option est désactivée → le comportement historique s'applique :
 *   silence total).
 */
export async function handlePublicMessage({ schoolId, phone, text, providerMessageId }) {
  if (!schoolId) return false;
  if (!(await isPublicChatbotEnabled(schoolId))) return false;

  if (!underDailyLimit(phone)) {
    console.log(`[chatbot/public] quota journalier atteint pour ${phone}, message ignoré`);
    return true;
  }

  const incomingId = await logIncoming({ schoolId, phone, text, providerMessageId });
  const schoolName = await getSchoolName(schoolId);
  const trimmed = String(text || '').trim();
  const state = State.getState(schoolId, phone);

  // Choix d'une rubrique de la vitrine
  if (state?.state === 'SCHOOL') {
    const handled = await handleShowcaseReply({ schoolId, phone, schoolName, text: trimmed });
    if (handled) {
      await sendText(schoolId, phone, footerFor(trimmed), { urgent: true });
      await markProcessed(incomingId);
      return true;
    }
  }

  // Choix du niveau après une demande de fournitures
  if (state?.state === 'SUPPLIES') {
    await handleSuppliesLevelReply({ schoolId, phone, student: null, text: trimmed });
    await markProcessed(incomingId);
    return true;
  }

  // Accueil / menu / première prise de contact
  const cmd = detectSpecialCommand(trimmed);
  const isGreeting = /^(bonjour|bonsoir|salut|coucou|hi|hello|hey|salam|salem|marhaba|ahlan|السلام|مرحبا|سلام|اهلا)[\s!.?,؟]*$/i.test(trimmed);
  if (!trimmed || cmd === 'menu' || cmd === 'help' || isGreeting) {
    State.setState(schoolId, phone, { state: 'PUBLIC' });
    await sendText(schoolId, phone, welcomeMessage(schoolName), { urgent: true });
    await markProcessed(incomingId);
    return true;
  }

  // Fournitures : option 1 du menu ou demande en texte libre
  if (trimmed === '1' || isSuppliesQuery(trimmed)) {
    await handleSuppliesRequest({ schoolId, phone, student: null, text: trimmed, fromMenu: trimmed === '1' });
    await markProcessed(incomingId);
    return true;
  }

  // Option 2 : vitrine de l'école (photos, filières, résultats, contacts)
  if (trimmed === '2') {
    await sendShowcaseMenu({ schoolId, phone, schoolName, publicOnly: true });
    await markProcessed(incomingId);
    return true;
  }

  // Demande d'un document officiel (règlement, calendrier, dossier
  // d'inscription…) : on envoie le PDF de l'école TEL QUEL, sans le reformater.
  const docSent = await tryOfficialDocument({ schoolId, phone, text: trimmed, schoolName })
    .catch((e) => { console.error('[chatbot/public] document officiel:', e.message); return false; });
  if (docSent) {
    await markProcessed(incomingId);
    return true;
  }

  // Question ciblée sur l'école (cantine, sport, taux de réussite, Facebook…)
  const showcaseHandled = await handleShowcaseQuestion({
    schoolId, phone, schoolName, text: trimmed, publicOnly: true,
  }).catch((e) => { console.error('[chatbot/public] vitrine:', e.message); return false; });
  if (showcaseHandled) {
    setTimeout(() => { sendText(schoolId, phone, footerFor(trimmed), { urgent: true }); }, 1500);
    await markProcessed(incomingId);
    return true;
  }

  // Option 3 : invitation à poser la question
  if (trimmed === '3') {
    State.setState(schoolId, phone, { state: 'PUBLIC' });
    await sendText(
      schoolId,
      phone,
      `ℹ️ Posez votre question sur *${schoolName}* (inscription, horaires, règlement, cantine, transport…).\n\n_Je réponds à partir des documents officiels de l'école._`,
      { urgent: true },
    );
    await markProcessed(incomingId);
    return true;
  }

  // Question libre → réponse issue des seuls documents de l'école
  const reply = await answerFromKnowledge({ schoolId, schoolName, question: trimmed });
  await sendText(schoolId, phone, reply, { urgent: true });
  setTimeout(() => {
    sendText(schoolId, phone, footerFor(trimmed), { urgent: true });
  }, 1500);
  await markProcessed(incomingId, reply);
  return true;
}
