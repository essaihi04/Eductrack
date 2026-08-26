/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  VARIANTES D'ÉCRITURE D'UN NUMÉRO DE TÉLÉPHONE                        ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  WhatsApp livre TOUJOURS un numéro international (« 212612345678 »),  ║
 * ║  normalisé en « +212612345678 » par le chatbot. En base, en revanche, ║
 * ║  `profiles.phone` contient ce que l'administration a saisi à la main :║
 * ║  « 0612345678 », « 06 12 34 56 78 », « 212612345678 »…                ║
 * ║                                                                       ║
 * ║  Une égalité stricte rate donc l'immense majorité des professeurs et  ║
 * ║  le chatbot les traite comme des numéros inconnus. Ce module produit  ║
 * ║  toutes les écritures plausibles du même numéro pour un `.in(...)`.   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

/** Chiffres nationaux d'un numéro marocain (« 612345678 »), ou ''. */
function nationalDigits(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('212')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return d;
}

/**
 * Toutes les écritures plausibles d'un numéro, pour une recherche en base.
 * Marocain : +212X, 212X, 0X, X. Étranger : +D et D.
 *
 * @param {string} raw  numéro sous n'importe quelle forme
 * @returns {string[]}  variantes uniques, jamais vide si `raw` a des chiffres
 */
export function phoneVariants(raw) {
  const brut = String(raw || '').trim();
  const digits = brut.replace(/\D/g, '');
  if (!digits) return [];

  const out = new Set([brut, digits, `+${digits}`]);

  const nat = nationalDigits(brut);
  if (nat) {
    // Un numéro marocain fait 9 chiffres en national (6…/7…). Au-delà, c'est
    // un numéro étranger : on ne lui invente pas de préfixe +212.
    if (nat.length === 9) {
      out.add(`+212${nat}`);
      out.add(`212${nat}`);
      out.add(`0${nat}`);
      out.add(nat);
    } else {
      out.add(nat);
    }
  }

  // « +0612… » n'est l'écriture de personne : on ne pollue pas la requête.
  return [...out].filter((v) => v && !v.startsWith('+0'));
}

/**
 * Forme canonique E.164 (« +212612345678 ») d'un numéro, ou '' s'il est vide.
 * C'est la forme dans laquelle les numéros DOIVENT être stockés.
 */
export function toE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  const nat = nationalDigits(raw);
  if (nat.length === 9) return `+212${nat}`;
  return `+${digits.replace(/^00/, '')}`;
}
