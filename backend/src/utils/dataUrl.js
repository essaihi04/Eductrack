/**
 * Décodage des fichiers que le navigateur envoie en « data URL ».
 *
 * Le front lit ses fichiers avec `FileReader.readAsDataURL`, qui produit
 * `data:<type>;base64,<contenu>`. Le piège : **le type peut porter des
 * paramètres**. Un enregistrement de Chrome s'annonce
 * `data:audio/webm;codecs=opus;base64,…` — deux points-virgules, pas un.
 *
 * Découper sur le premier point-virgule laisse alors `codecs=opus;base64,` collé
 * devant le contenu. `Buffer.from(…, 'base64')` n'échoue pas pour autant : il
 * ignore les caractères qu'il ne sait pas lire et rend un binaire tronqué,
 * silencieusement. Une note vocale de 272 Ko devenait ainsi 15 octets, et
 * l'erreur ne remontait que bien plus loin, sous la forme d'un « format audio
 * illisible » parfaitement trompeur.
 *
 * On coupe donc à la virgule, seule frontière fiable : le contenu base64 n'en
 * contient jamais.
 */

/** Préambule d'une data URL, quels que soient les paramètres du type. */
const PREFIX = /^data:[^,]*,/;

/**
 * Rend le binaire d'une data URL (ou d'un base64 nu).
 *
 * @param {string} value data URL complète, ou base64 sans préambule
 * @returns {Buffer} contenu décodé — vide si l'entrée ne l'est pas
 */
export function decodeDataUrl(value) {
  const text = String(value || '').trim();
  if (!text) return Buffer.alloc(0);
  return Buffer.from(text.replace(PREFIX, ''), 'base64');
}

/**
 * Type déclaré dans la data URL, paramètres retirés (`audio/webm`).
 * Sert de repli quand l'appelant n'a pas transmis le type à part.
 *
 * @returns {string} type MIME, ou chaîne vide s'il n'y en a pas
 */
export function mimeFromDataUrl(value) {
  const match = /^data:([^;,]+)/.exec(String(value || ''));
  return match ? match[1].trim() : '';
}
