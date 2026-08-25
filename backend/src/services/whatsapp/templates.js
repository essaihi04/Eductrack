/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  TEMPLATES UTILITAIRES META (catégorie UTILITY)                       ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Un message proactif (l'école écrit la première) n'est accepté par    ║
 * ║  l'API Cloud QUE s'il utilise un template approuvé. Le texte libre    ║
 * ║  n'est autorisé que dans la fenêtre de service de 24 h ouverte par un ║
 * ║  message ENTRANT du parent.                                           ║
 * ║                                                                       ║
 * ║  CONTRAINTES META sur les paramètres ({{1}}, {{2}}…) :                 ║
 * ║    • pas de saut de ligne, pas de tabulation                          ║
 * ║    • pas plus de 4 espaces consécutifs                                ║
 * ║    • le corps ne peut ni COMMENCER ni FINIR par une variable          ║
 * ║  → d'où des templates dédiés à paramètres courts, et non un template  ║
 * ║    fourre-tout qui transporterait un texte multi-lignes.              ║
 * ║                                                                       ║
 * ║  Les noms réels sont surchargeables par variable d'environnement :    ║
 * ║  tant qu'un template n'est pas approuvé, laisser la variable vide     ║
 * ║  suffit à désactiver proprement ce canal (repli documenté).           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

/** Nettoie une valeur pour la rendre acceptable comme paramètre Meta. */
export function sanitizeParam(value, maxLength = 200) {
  const flat = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')   // sauts de ligne et tabulations interdits
    .replace(/ {2,}/g, ' ')        // >4 espaces consécutifs interdits
    .trim();
  if (!flat) return '-';           // un paramètre vide fait échouer l'envoi
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}

/**
 * Registre des templates.
 *
 * `params` documente l'ordre attendu ; `definition` est le corps envoyé à
 * l'API Meta pour créer le template (voir scripts/createWhatsAppTemplates.js).
 */
export const TEMPLATES = {
  absence: {
    env: 'WA_TPL_ABSENCE',
    name: process.env.WA_TPL_ABSENCE || null,
    params: ['eleve', 'date', 'detail'],
    definition: {
      name: 'absence_eleve',
      category: 'UTILITY',
      language: 'fr',
      body: "Bonjour, l'établissement vous informe que {{1}} a été noté(e) absent(e) le {{2}}. Précision : {{3}}. Merci de justifier cette absence depuis votre espace parent.",
      example: ['Yassine Alaoui', 'lundi 25 août', 'matinée complète'],
    },
  },

  note: {
    env: 'WA_TPL_NOTE',
    name: process.env.WA_TPL_NOTE || null,
    params: ['eleve', 'matiere', 'detail'],
    definition: {
      name: 'nouvelle_note',
      category: 'UTILITY',
      language: 'fr',
      body: 'Bonjour, une nouvelle note vient d\'être publiée pour {{1}} en {{2}}. Résultat : {{3}}. Le détail est disponible dans votre espace parent.',
      example: ['Yassine Alaoui', 'Mathématiques', '15,5/20'],
    },
  },

  facture: {
    env: 'WA_TPL_FACTURE',
    name: process.env.WA_TPL_FACTURE || null,
    params: ['eleve', 'periode', 'montant'],
    definition: {
      name: 'facture_disponible',
      category: 'UTILITY',
      language: 'fr',
      body: 'Bonjour, votre facture pour {{1}} ({{2}}) est disponible. Montant à régler : {{3}}. Retrouvez le document détaillé dans votre espace parent.',
      example: ['Yassine Alaoui', 'septembre 2026', '1 200,00 MAD'],
    },
  },

  devoir: {
    env: 'WA_TPL_DEVOIR',
    name: process.env.WA_TPL_DEVOIR || null,
    params: ['eleve', 'matiere', 'echeance'],
    definition: {
      name: 'nouveau_devoir',
      category: 'UTILITY',
      language: 'fr',
      body: 'Bonjour, un nouveau devoir a été donné à {{1}} en {{2}}, à rendre pour le {{3}}. L\'énoncé complet est consultable dans votre espace parent.',
      example: ['Yassine Alaoui', 'Français', 'vendredi 29 août'],
    },
  },

  transport: {
    env: 'WA_TRANSPORT_TEMPLATE',
    name: process.env.WA_TRANSPORT_TEMPLATE || null,
    params: ['direction'],
    definition: {
      name: 'transport_depart',
      category: 'UTILITY',
      language: 'fr',
      body: 'Bonjour, le bus scolaire vient de démarrer ({{1}}). Répondez à ce message pour suivre le trajet en direct aujourd\'hui, sans frais.',
      example: ['ramassage du matin'],
      buttons: [
        { type: 'QUICK_REPLY', text: 'Voir le suivi' },
        { type: 'QUICK_REPLY', text: 'Pas aujourd\'hui' },
      ],
      // Charge utile renvoyée par le webhook au clic, dans l'ordre des boutons.
      // Indispensable : sans elle, Meta renvoie le LIBELLÉ du bouton, que le
      // chatbot ne reconnaît pas (il attend transport_yes / transport_no).
      buttonPayloads: ['transport_yes', 'transport_no'],
    },
  },

  rendezVous: {
    env: 'WA_TPL_RDV',
    name: process.env.WA_TPL_RDV || null,
    params: ['objet', 'date', 'interlocuteur'],
    definition: {
      name: 'rendez_vous_parent',
      category: 'UTILITY',
      language: 'fr',
      body: 'Bonjour, votre rendez-vous « {{1}} » est confirmé pour le {{2}}, avec {{3}}. Répondez à ce message si vous souhaitez le modifier.',
      example: ['Réunion de suivi', 'mardi 26 août à 15h00', 'M. Bennani'],
    },
  },

  document: {
    env: 'WA_TPL_DOCUMENT',
    name: process.env.WA_TPL_DOCUMENT || null,
    params: ['eleve', 'typeDocument'],
    definition: {
      name: 'document_disponible',
      category: 'UTILITY',
      language: 'fr',
      body: 'Bonjour, un document concernant {{1}} est disponible : {{2}}. Répondez à ce message pour le recevoir directement ici, ou consultez votre espace parent.',
      example: ['Yassine Alaoui', 'bulletin du 1er semestre'],
    },
  },

  information: {
    env: 'WA_TPL_INFORMATION',
    name: process.env.WA_TPL_INFORMATION || null,
    // Repli générique : un seul paramètre, pour les appelants qui n'ont pas le
    // nom de l'école sous la main (la majorité ne dispose que du school_id).
    params: ['objet'],
    definition: {
      name: 'information_etablissement',
      category: 'UTILITY',
      language: 'fr',
      body: 'Bonjour, votre établissement scolaire souhaite vous transmettre une information au sujet de : {{1}}. Répondez à ce message pour en recevoir le détail, ou consultez votre espace parent.',
      example: ['la sortie pédagogique du 12 septembre'],
    },
  },
};

/** Template résolu par clé logique, ou null s'il n'est pas encore configuré. */
export function getTemplate(key) {
  const t = TEMPLATES[key];
  if (!t || !t.name) return null;
  return t;
}

/**
 * Construit le tableau `components` attendu par l'API Cloud.
 * @param {Array}  values   valeurs des {{1}}, {{2}}… du corps
 * @param {Array} [payloads] charges utiles des boutons quick-reply, dans l'ordre
 */
export function buildComponents(values = [], payloads = []) {
  const components = [];
  if (values.length) {
    components.push({
      type: 'body',
      parameters: values.map((v) => ({ type: 'text', text: sanitizeParam(v) })),
    });
  }
  payloads.forEach((payload, index) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(index),
      parameters: [{ type: 'payload', payload }],
    });
  });
  return components;
}
