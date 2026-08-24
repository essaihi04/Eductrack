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
