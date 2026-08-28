/**
 * Affichage fidèle des emoji reçus des parents.
 *
 * Un parent écrit ☺, ✌ ou ❤ depuis WhatsApp ; l'application affichait un
 * dessin gris au trait, méconnaissable, là où WhatsApp montre une image en
 * couleur. Ce n'est pas une donnée perdue : c'est une règle Unicode. Une
 * soixantaine de caractères — les plus anciens, hérités des jeux de symboles —
 * s'affichent **en texte par défaut** ; il faut leur accoler le sélecteur de
 * variante U+FE0F pour demander la version emoji.
 *
 * WhatsApp le fait à l'affichage, pas dans le contenu du message : c'est donc à
 * nous de le refaire, sinon la police du navigateur choisit sa version noir et
 * blanc. Les emoji modernes (😀, 👋) ne sont pas concernés — ils sont déjà en
 * couleur par défaut et ne sont pas touchés ici.
 *
 * Le second volet du correctif est dans index.css : les polices emoji couleur
 * du système doivent passer AVANT les polices de texte, qui embarquent elles
 * aussi des versions monochromes de ces mêmes caractères.
 */

// Caractères « emoji, mais présentation texte par défaut » (Unicode : Emoji=Yes,
// Emoji_Presentation=No). Ce sont eux, et eux seuls, qui ont besoin du marqueur.
const TEXT_DEFAULT = new RegExp(
  '[\\u00A9\\u00AE\\u203C\\u2049\\u2122\\u2139\\u2194-\\u2199\\u21A9\\u21AA'
  + '\\u2328\\u23CF\\u23ED-\\u23EF\\u23F1\\u23F2\\u23F8-\\u23FA\\u24C2'
  + '\\u25AA\\u25AB\\u25B6\\u25C0\\u25FB\\u25FC\\u2600-\\u2604\\u260E\\u2611'
  + '\\u2618\\u261D\\u2620\\u2622\\u2623\\u2626\\u262A\\u262E\\u262F'
  + '\\u2638-\\u263A\\u2640\\u2642\\u265F\\u2660\\u2663\\u2665\\u2666\\u2668'
  + '\\u267B\\u267E\\u2692\\u2694-\\u2697\\u2699\\u269B\\u269C\\u26A0\\u26A7'
  + '\\u26B0\\u26B1\\u26C8\\u26CF\\u26D1\\u26D3\\u26E9\\u26F0\\u26F1\\u26F4'
  + '\\u26F7-\\u26F9\\u2702\\u2708\\u2709\\u270C\\u270D\\u270F\\u2712\\u2714'
  + '\\u2716\\u271D\\u2721\\u2733\\u2734\\u2744\\u2747\\u2763\\u2764\\u27A1'
  + '\\u2934\\u2935\\u2B05-\\u2B07\\u3030\\u303D\\u3297\\u3299'
  + '\\u{1F170}\\u{1F171}\\u{1F17E}\\u{1F17F}\\u{1F202}\\u{1F21A}\\u{1F22F}'
  + '\\u{1F237}\\u{1F321}\\u{1F324}-\\u{1F32C}\\u{1F336}\\u{1F37D}'
  + '\\u{1F396}\\u{1F397}\\u{1F399}-\\u{1F39B}\\u{1F39E}\\u{1F39F}'
  + '\\u{1F3CB}-\\u{1F3CE}\\u{1F3D4}-\\u{1F3DF}\\u{1F3F3}\\u{1F3F5}\\u{1F3F7}'
  + '\\u{1F43F}\\u{1F441}\\u{1F4FD}\\u{1F549}\\u{1F54A}\\u{1F56F}\\u{1F570}'
  + '\\u{1F573}-\\u{1F579}\\u{1F587}\\u{1F58A}-\\u{1F58D}\\u{1F590}'
  + '\\u{1F5A5}\\u{1F5A8}\\u{1F5B1}\\u{1F5B2}\\u{1F5BC}\\u{1F5C2}-\\u{1F5C4}'
  + '\\u{1F5D1}-\\u{1F5D3}\\u{1F5DC}-\\u{1F5DE}\\u{1F5E1}\\u{1F5E3}\\u{1F5E8}'
  + '\\u{1F5EF}\\u{1F5F3}\\u{1F5FA}\\u{1F6CB}\\u{1F6CD}-\\u{1F6CF}'
  + '\\u{1F6E0}-\\u{1F6E5}\\u{1F6E9}\\u{1F6F0}\\u{1F6F3}]',
  'gu',
);

// Le sélecteur de variante « présentation emoji ».
const VS16 = '\uFE0F';

// Ce qui suit déjà le caractère et rend le marqueur inutile — voire nuisible :
// un sélecteur de variante (FE0E demande explicitement le noir et blanc), une
// teinte de peau, ou l'enceinte d'une touche de clavier.
const ALREADY_QUALIFIED = /[\uFE0E\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}]/u;

/**
 * Rend lisibles les emoji d'un texte reçu, tel que WhatsApp les affiche.
 *
 * @param {string} text contenu brut du message
 * @returns {string} le même texte, emoji anciens qualifiés en couleur
 */
export function withColorEmoji(text) {
  const value = typeof text === 'string' ? text : String(text ?? '');
  if (!value) return value;
  return value.replace(TEXT_DEFAULT, (char, index) => {
    const next = value.slice(index + char.length, index + char.length + 2);
    return ALREADY_QUALIFIED.test(next) ? char : `${char}${VS16}`;
  });
}
