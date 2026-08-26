/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  POLITESSES ET ACCUSÉS DE RÉCEPTION                                   ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Un tiers des messages entrants ne sont pas des questions : « merci », ║
 * ║  « ok », « bien reçu », « 👍 », « inchallah », ou la réponse à une     ║
 * ║  annonce (« oui je souhaite recevoir le détail »).                    ║
 * ║                                                                       ║
 * ║  Ils partaient pourtant vers DeepSeek, qui répondait un pavé — ou,    ║
 * ║  les jours de saturation, « le service IA est temporairement          ║
 * ║  indisponible », ce qui donnait au parent l'impression d'un système   ║
 * ║  cassé alors qu'il venait simplement de dire merci.                   ║
 * ║                                                                       ║
 * ║  On y répond ici, en une ligne, sans IA et sans coût.                 ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

const ARABE = /[؀-ۿ]/;

/** Retire emojis, ponctuation et accents pour comparer le fond du message. */
function noyau(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Remerciements et accusés de réception, en français, arabe et darija latine.
const ACCUSES = [
  'merci', 'merci beaucoup', 'merci bien', 'mrc', 'thanks', 'thank you',
  'ok', 'okay', 'oki', 'daccord', 'd accord', 'bien recu', 'bien recu merci',
  'recu', 'noted', 'compris', 'tres bien', 'parfait', 'super', 'bravo',
  'inchallah', 'inchaallah', 'incha allah', 'nchallah', 'chokran', 'choukran',
  'shukran', 'baraka allaho fik', 'barakallahoufik', 'saha', 'safi', 'wakha',
  'شكرا', 'شكرا جزيلا', 'بارك الله فيك', 'جزاك الله خيرا', 'حسنا', 'واخا',
  'صافي', 'ان شاء الله', 'إن شاء الله', 'تمام', 'موافق', 'مفهوم',
];

// Réponses à un template d'annonce (« Répondez à ce message pour recevoir le
// détail »). Elles ne demandent rien de neuf : le contenu part déjà tout seul
// par la livraison différée, inutile d'y ajouter une réponse d'IA.
const DEMANDES_DETAIL = [
  /\bd[ée]tail\b/i,
  /\bplus d.?infos?\b/i,
  /\brecevoir\b.*\bmessage\b/i,
  /التفاصيل/,
  /المزيد من المعلومات/,
];

const OUI_SEUL = [
  'oui', 'oui merci', 'oui svp', 'oui s il vous plait', 'oui avec plaisir',
  'yes', 'ah oui', 'bien sur', 'volontiers', 'marhba', 'oui marhba',
  'نعم', 'اي', 'ايه', 'أجل', 'موافق', 'بالتاكيد',
];

/**
 * Message de pure politesse : remerciement, accusé de réception, emoji seul.
 * Volontairement STRICT — « merci, et pour les notes ? » doit continuer vers
 * la vraie réponse, pas se faire congédier d'un « avec plaisir ».
 */
export function isPureAck(text) {
  const brut = String(text || '').trim();
  if (!brut) return false;

  // Emojis seuls (pouce, cœur, applaudissements…) : rien à traiter.
  if (!/[\p{L}\p{N}]/u.test(brut)) return true;

  const n = noyau(brut);
  if (!n) return true;
  if (n.split(' ').length > 5) return false;
  return ACCUSES.includes(n);
}

/**
 * Réponse à une annonce : « oui », « je veux le détail », « avec plaisir ».
 * Le contenu réel a déjà été livré par la file d'attente ; il ne reste qu'à
 * ne pas déranger le parent avec une réponse d'IA hors sujet.
 */
export function isAnnounceReply(text) {
  const brut = String(text || '').trim();
  if (!brut) return false;
  const n = noyau(brut);
  if (OUI_SEUL.includes(n)) return true;
  if (n.split(' ').length > 12) return false;
  return DEMANDES_DETAIL.some((re) => re.test(brut));
}

/** Réponse brève à une politesse, dans la langue du parent. */
export function ackMessage(text, { schoolName = null } = {}) {
  if (ARABE.test(String(text || ''))) {
    return `🙏 شكرا لكم${schoolName ? ` — ${schoolName}` : ''}.\n\n_اكتبوا *menu* لعرض الخيارات._`;
  }
  return `🙏 Avec plaisir${schoolName ? ` — ${schoolName}` : ''}.\n\n_Tapez *menu* pour afficher les options._`;
}

/** Confirmation envoyée quand la livraison différée vient de partir. */
export function deliveredMessage(text) {
  if (ARABE.test(String(text || ''))) {
    return `✅ تم إرسال التفاصيل أعلاه.\n\n_اكتبوا *menu* لعرض الخيارات._`;
  }
  return `✅ Le détail vient de vous être envoyé ci-dessus.\n\n_Tapez *menu* pour afficher les options._`;
}
