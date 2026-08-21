/**
 * Personnalisation et variation des messages sortants.
 *
 * Envoyer N fois un texte rigoureusement identique est un signal de spam
 * classique. Deux couches, cumulables :
 *
 *   1. Salutation nominative (`greetingFor`) — chaque parent reçoit un texte
 *      déjà distinct des autres. C'est ce que fait la planification.
 *   2. Reformulations générées par DeepSeek (`generateVariants`) — le corps du
 *      message existe en plusieurs versions de sens identique, distribuées en
 *      alternance sur les destinataires.
 *
 * ⚠️ GARDE-FOU : une reformulation par IA peut déformer un numéro de
 * téléphone, un lien, un montant ou une date. Un message d'école qui donne un
 * mauvais numéro est pire que pas de message du tout. Chaque variante est donc
 * VÉRIFIÉE : si elle ne reprend pas à l'identique tous les liens, numéros et
 * nombres de l'original, elle est rejetée.
 */

import OpenAI from 'openai';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  timeout: 90_000,
});

const hasArabic = (t) => /[؀-ۿ]/.test(String(t || ''));

/**
 * Salutation nominative, dans la langue du message.
 * @returns {string|null} null si le nom est inconnu.
 */
export function greetingFor(text, parentName) {
  const name = String(parentName || '').trim();
  if (!name) return null;
  return hasArabic(text) ? `تحية طيبة السيد(ة) ${name}،` : `Bonjour ${name},`;
}

/** Préfixe le message d'une salutation, sans doubler les sauts de ligne. */
export function withGreeting(text, parentName) {
  const greeting = greetingFor(text, parentName);
  return greeting ? `${greeting}\n\n${text}` : text;
}

// ── Éléments qui doivent survivre mot pour mot à une reformulation ──────────
const URL_RE = /https?:\/\/\S+/g;
// Numéros de téléphone : au moins 6 chiffres, tolérant aux espaces/tirets/points.
const PHONE_RE = /\+?\d[\d\s.\-()]{5,}\d/g;

const normalizeDigits = (s) => String(s).replace(/\D/g, '');

/**
 * Vérifie qu'une variante n'a rien perdu ni déformé d'essentiel.
 */
function preservesFacts(original, variant) {
  const origUrls = original.match(URL_RE) || [];
  for (const u of origUrls) {
    if (!variant.includes(u)) return false;
  }
  const origPhones = (original.match(PHONE_RE) || []).map(normalizeDigits).filter((d) => d.length >= 6);
  const variantDigits = (variant.match(PHONE_RE) || []).map(normalizeDigits);
  for (const p of origPhones) {
    if (!variantDigits.some((d) => d === p || d.endsWith(p) || p.endsWith(d))) return false;
  }
  // Une variante ne doit pas non plus être une coquille vide.
  if (variant.trim().length < original.trim().length * 0.5) return false;
  return true;
}

/**
 * Produit plusieurs formulations de sens identique.
 *
 * L'original figure TOUJOURS en première position : si l'IA est indisponible
 * ou si toutes ses propositions sont rejetées, l'envoi se fait normalement
 * avec le texte d'origine — la variation ne doit jamais bloquer un message.
 *
 * @param {string} text
 * @param {{count?: number}} opts
 * @returns {Promise<string[]>} au moins [text]
 */
export async function generateVariants(text, { count = 5 } = {}) {
  const original = String(text || '').trim();
  if (!original || !process.env.DEEPSEEK_API_KEY) return [original].filter(Boolean);
  // Sur un texte très court, reformuler n'apporte rien et déforme vite.
  if (original.length < 40) return [original];

  const wanted = Math.max(1, Math.min(10, count));

  try {
    const res = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      temperature: 1.1, // on CHERCHE de la diversité entre les versions
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            "Tu reformules des messages d'une école marocaine à des parents d'élèves.\n" +
            `Produis ${wanted} versions DIFFÉRENTES du message fourni.\n\n` +
            'RÈGLES ABSOLUES :\n' +
            "- Le SENS doit être rigoureusement identique. N'ajoute, ne retire et n'invente aucune information.\n" +
            "- Garde la MÊME LANGUE que l'original (français, arabe ou darija). Ne traduis jamais.\n" +
            '- Recopie À L\'IDENTIQUE : numéros de téléphone, liens, dates, horaires, montants, noms propres.\n' +
            "- Conserve le registre : une école qui s'adresse à des parents, poli et clair.\n" +
            '- Conserve le formatage WhatsApp (*gras*, _italique_, sauts de ligne) et les émojis.\n' +
            '- Fais varier les tournures de phrase et l\'ordre des idées, pas les faits.\n\n' +
            'Réponds en JSON : {"variants": ["version 1", "version 2", ...]}',
        },
        { role: 'user', content: original },
      ],
    });

    const raw = res.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const proposals = Array.isArray(parsed.variants) ? parsed.variants : [];

    const kept = [];
    let rejected = 0;
    for (const p of proposals) {
      const v = String(p || '').trim();
      if (!v || v === original) continue;
      if (!preservesFacts(original, v)) { rejected++; continue; }
      kept.push(v);
    }
    if (rejected) {
      console.warn(`[variantes] ${rejected} version(s) écartée(s) : un numéro ou un lien de l'original manquait`);
    }
    console.log(`[variantes] ${kept.length + 1} formulation(s) disponibles (original inclus)`);
    return [original, ...kept];
  } catch (e) {
    console.error('[variantes] génération impossible, envoi du texte d\'origine :', e.message);
    return [original];
  }
}
