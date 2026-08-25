/**
 * Personnalisation des messages sortants : salutation nominative.
 *
 * Historiquement, ce module portait aussi une génération de « variantes » par
 * IA : avec Baileys, envoyer N fois un texte rigoureusement identique était un
 * signal de spam qui pouvait faire bannir le numéro. L'API Cloud officielle de
 * Meta n'a pas cette contrainte — la reformulation automatique a donc été
 * retirée (elle coûtait un appel IA par campagne et risquait de déformer un
 * montant ou une date).
 *
 * Reste la salutation nominative, gardée pour ce qu'elle vaut vraiment : un
 * message qui s'adresse au parent par son nom est mieux reçu qu'un publipostage.
 */

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

/**
 * Mention de désabonnement, ajoutée aux messages PROACTIFS en texte libre
 * (notifications, communications planifiées, envois du hub).
 *
 * Ce n'est pas une politesse : un parent qui ignore qu'il peut se désabonner
 * BLOQUE le numéro, et c'est le blocage — pas le STOP — qui fait chuter la
 * note de qualité du numéro chez Meta, donc le volume d'envoi autorisé.
 *
 * Volontairement absent : les réponses du chatbot (le parent vient d'écrire,
 * lui rappeler qu'il peut partir n'a aucun sens) et les templates approuvés
 * (leur texte est figé par Meta, on ne peut rien y ajouter).
 */
export const OPT_OUT_NOTICE = '_Répondez STOP pour ne plus recevoir ces messages._';

/** Ajoute la mention, sauf si le texte la porte déjà. */
export function withOptOutNotice(text) {
  const body = String(text || '');
  if (!body.trim()) return body;
  if (/\bSTOP\b/i.test(body)) return body;
  return `${body}\n\n${OPT_OUT_NOTICE}`;
}
