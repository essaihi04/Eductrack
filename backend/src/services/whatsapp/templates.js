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
 *
 * `announce: true` marque les templates qui ne font qu'ANNONCER un contenu
 * (« répondez à ce message pour le recevoir ») : l'envoi a réussi, mais le
 * contenu réel n'est PAS parti. Les appelants doivent alors journaliser
 * « annoncé », jamais « envoyé » — sinon la boîte de réception affirme avoir
 * livré un message que le destinataire n'a jamais vu.
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
    translations: {
      ar: {
        body: 'تحية طيبة، تُعلمكم المؤسسة أن {{1}} سُجّل(ت) غائبا(ة) يوم {{2}}. تفاصيل: {{3}}. يرجى تبرير هذا الغياب من فضاء ولي الأمر.',
        example: ['ياسين العلوي', 'الاثنين 25 غشت', 'صباح كامل'],
      },
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
    translations: {
      ar: {
        body: 'تحية طيبة، تم نشر نقطة جديدة لـ {{1}} في مادة {{2}}. النتيجة: {{3}}. التفاصيل متوفرة في فضاء ولي الأمر.',
        example: ['ياسين العلوي', 'الرياضيات', '15,5/20'],
      },
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
    translations: {
      ar: {
        body: 'تحية طيبة، فاتورتكم الخاصة بـ {{1}} ({{2}}) متوفرة. المبلغ المطلوب: {{3}}. تجدون الوثيقة المفصلة في فضاء ولي الأمر.',
        example: ['ياسين العلوي', 'شتنبر 2026', '1 200,00 درهم'],
      },
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
    translations: {
      ar: {
        body: 'تحية طيبة، تم إسناد واجب جديد لـ {{1}} في مادة {{2}}، يُسلَّم يوم {{3}}. نص الواجب كاملا في فضاء ولي الأمر.',
        example: ['ياسين العلوي', 'اللغة الفرنسية', 'الجمعة 29 غشت'],
      },
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
    translations: {
      ar: {
        body: 'تحية طيبة، انطلقت الحافلة المدرسية ({{1}}). ردّوا على هذه الرسالة لتتبّع الرحلة مباشرة اليوم، دون رسوم.',
        example: ['نقل الصباح'],
        // Les boutons sont traduits, mais les charges utiles restent
        // identiques : c'est elles que le chatbot reconnaît, pas le libellé.
        buttons: [
          { type: 'QUICK_REPLY', text: 'تتبّع الرحلة' },
          { type: 'QUICK_REPLY', text: 'ليس اليوم' },
        ],
      },
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
    translations: {
      ar: {
        body: 'تحية طيبة، تم تأكيد موعدكم « {{1}} » يوم {{2}}، مع {{3}}. ردّوا على هذه الرسالة إذا رغبتم في تعديله.',
        example: ['لقاء متابعة', 'الثلاثاء 26 غشت على الساعة 15:00', 'السيد بناني'],
      },
    },
  },

  document: {
    announce: true,
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
    translations: {
      ar: {
        body: 'تحية طيبة، تتوفر وثيقة تخص {{1}}: {{2}}. ردّوا على هذه الرسالة لاستلامها هنا مباشرة، أو اطّلعوا على فضاء ولي الأمر.',
        example: ['ياسين العلوي', 'نقطة الدورة الأولى'],
      },
    },
  },

  information: {
    announce: true,
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
    translations: {
      ar: {
        body: 'تحية طيبة، تودّ مؤسستكم التعليمية إبلاغكم بمعلومة بخصوص: {{1}}. ردّوا على هذه الرسالة لتلقّي التفاصيل، أو اطّلعوا على فضاء ولي الأمر.',
        example: ['الخرجة التربوية ليوم 12 شتنبر'],
      },
    },
  },

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  PAS DE TEMPLATE D'IDENTIFIANTS — N'EN RECRÉEZ PAS                    ║
  // ╠══════════════════════════════════════════════════════════════════════╣
  // ║  Un template « identifiants_connexion » portant login + mot de passe  ║
  // ║  a été soumis le 2026-08-26 : REJETÉ par Meta en quelques secondes,   ║
  // ║  en français comme en arabe. Ce n'est pas un défaut de rédaction —    ║
  // ║  la politique interdit de transporter un secret dans un template.     ║
  // ║  Seule la catégorie AUTHENTICATION le peut, et elle est réservée aux  ║
  // ║  codes à usage unique, dans un format imposé.                         ║
  // ║                                                                       ║
  // ║  Les identifiants suivent donc le seul chemin autorisé :              ║
  // ║    • fenêtre de 24 h ouverte → texte libre, envoi direct et complet ; ║
  // ║    • fenêtre fermée → annonce « information », puis livraison         ║
  // ║      automatique dès la réponse (services/whatsapp/pendingDelivery).  ║
  // ╚══════════════════════════════════════════════════════════════════════╝

  /**
   * MANUELS SCOLAIRES — offre de la maison d'édition partenaire.
   *
   * ⚠️ Seul template MARKETING du registre : il vante une offre commerciale
   * (remises, éditeur partenaire) et Meta refuse ce contenu en UTILITY.
   * Trois conséquences à connaître avant de l'employer :
   *   • il ne part JAMAIS vers un parent désabonné (STOP) ;
   *   • Meta plafonne les messages marketing reçus par utilisateur ;
   *   • il est facturé au tarif marketing, plus élevé que l'utilitaire.
   *
   * Le corps porte le message ENTIER : rien à annoncer, rien à attendre — le
   * parent le lit du premier coup, fenêtre de 24 h ouverte ou non. Le nom de
   * l'école et le numéro du partenaire sont des paramètres : le registre est
   * partagé par toutes les écoles du WABA, les inscrire en dur enverrait le
   * message d'une école aux parents des autres.
   */
  manuels: {
    env: 'WA_TPL_MANUELS',
    name: process.env.WA_TPL_MANUELS || null,
    params: ['ecole', 'telephonePartenaire'],
    definition: {
      name: 'manuels_scolaires',
      category: 'MARKETING',
      language: 'ar',
      body: `تحية طيبة من {{1}} 📚

حرصًا على توفير أفضل الظروف للتلاميذ وللاستفادة من أفضل خدمة في اقتناء الكتب المدرسية، يمكن للأسر اقتناء المقررات الدراسية مباشرة عبر دار النشر الشريكة، والاستفادة من:

✅ الطبعات الجديدة والمنقحة والمعتمدة للسنة الدراسية.
✅ تعويض المقرر مجانًا في حال ضياعه خلال السنة الدراسية، وفق شروط دار النشر.
✅ تخفيضات خاصة على أثمنة الكتب.

اختياركم يضمن الحصول على الكتب المعتمدة، بأحدث طبعاتها، مع خدمة مرافقة ومزايا إضافية.

📞 للطلب والاستفسار — دار النشر الشريكة: {{2}}

شكرًا لثقتكم وحرصكم على مصلحة أبنائكم 📖`,
      example: ['Groupe Scolaire Marcel Arnaud', '+212 630-225807'],
    },
    translations: {
      fr: {
        body: `Bonjour, un message de {{1}} 📚

Afin d'offrir les meilleures conditions aux élèves, les familles peuvent se procurer les manuels scolaires directement auprès de la maison d'édition partenaire, et bénéficier de :

✅ Les éditions neuves, révisées et agréées pour l'année scolaire.
✅ Le remplacement gratuit du manuel en cas de perte durant l'année, selon les conditions de l'éditeur.
✅ Des remises spéciales sur le prix des livres.

Votre choix garantit des ouvrages agréés, dans leur dernière édition, avec un accompagnement et des avantages supplémentaires.

📞 Commandes et renseignements — maison d'édition partenaire : {{2}}

Merci de votre confiance et de votre attention portée à vos enfants 📖`,
        example: ['Groupe Scolaire Marcel Arnaud', '+212 630-225807'],
      },
    },
  },

  /**
   * DOCUMENT OFFICIEL DE L'ÉCOLE — règlement intérieur, calendrier scolaire,
   * dossier d'inscription, menu de cantine, circuit de bus.
   *
   * Le chatbot sait déjà envoyer ces PDF (chatbot/documents.js), mais
   * uniquement quand le parent les réclame. Ce template permet de les
   * diffuser à la rentrée. UN SEUL template pour les six catégories : le
   * type passe en paramètre, ce qui évite six examens Meta distincts.
   */
  documentEcole: {
    announce: true,
    env: 'WA_TPL_DOC_ECOLE',
    name: process.env.WA_TPL_DOC_ECOLE || null,
    params: ['typeDocument'],
    definition: {
      name: 'document_ecole',
      category: 'UTILITY',
      language: 'fr',
      body: 'Bonjour, votre établissement met à votre disposition le document suivant : {{1}}. Répondez à ce message pour le recevoir en PDF, ou consultez votre espace parent.',
      example: ['Règlement intérieur'],
    },
    translations: {
      ar: {
        body: 'تحية طيبة، تضع مؤسستكم رهن إشارتكم الوثيقة التالية: {{1}}. ردّوا على هذه الرسالة لاستلامها بصيغة PDF، أو اطّلعوا عليها في فضاء ولي الأمر.',
        example: ['النظام الداخلي'],
      },
    },
  },

  /**
   * FOURNITURES SCOLAIRES.
   *
   * La réponse existe déjà dans le chatbot (chatbot/supplies.js) mais ne part
   * qu'en RÉACTION à une question du parent, donc toujours en fenêtre ouverte.
   * Ce template permet l'inverse : pousser la liste à la rentrée, sans
   * attendre que le parent la demande. Le PDF ne peut pas voyager dans un
   * template texte — on annonce la liste et le document part dès la réponse.
   */
  fournitures: {
    announce: true,
    env: 'WA_TPL_FOURNITURES',
    name: process.env.WA_TPL_FOURNITURES || null,
    params: ['niveau'],
    definition: {
      name: 'fournitures_scolaires',
      category: 'UTILITY',
      language: 'fr',
      body: 'Bonjour, la liste des fournitures scolaires pour {{1}} est disponible. Répondez à ce message pour la recevoir en PDF, ou retrouvez-la dans votre espace parent.',
      example: ['la 5ème année primaire'],
    },
    translations: {
      ar: {
        body: 'تحية طيبة، لائحة اللوازم المدرسية الخاصة بـ {{1}} متوفرة. ردّوا على هذه الرسالة لاستلامها بصيغة PDF، أو اطّلعوا عليها في فضاء ولي الأمر.',
        example: ['السنة الخامسة ابتدائي'],
      },
    },
  },
};

/**
 * Définition d'un template dans une langue donnée, avec repli sur la langue de
 * base (français). Chez Meta, un même NOM porte plusieurs langues : seul le
 * champ `language` change à l'envoi, jamais le nom.
 */
export function definitionFor(tpl, lang) {
  const base = tpl.definition;
  const tr = tpl.translations?.[lang];
  if (!tr || lang === base.language) return base;
  // `buttonPayloads` vient de la base : les libellés sont traduits, pas les
  // charges utiles — c'est elles que le chatbot reconnaît.
  return { ...base, ...tr, language: lang };
}

/** Toutes les langues déclarées pour un template (base + traductions). */
export function templateLanguages(tpl) {
  return [tpl.definition.language, ...Object.keys(tpl.translations || {})];
}

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
