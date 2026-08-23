const AR_ACTION_LABELS = {
  'pedagogy.tracking': 'آخر تتبع للحصة',
  'pedagogy.grades': 'حصيلة النقط حسب المادة',
  'pedagogy.attendance': 'حضور هذا الأسبوع',
  'pedagogy.unjustified': 'غيابات يجب تبريرها',
  'pedagogy.homework': 'الواجبات المنزلية',
  'pedagogy.timetable': 'استعمال الزمن',
  'pedagogy.documents': 'الوثائق المشتركة',
  'pedagogy.bulletins': 'كشوف النقط',
  'finance.balance': 'الرصيد المالي',
  'finance.last_invoice': 'آخر فاتورة',
  'finance.history': 'سجل الأداءات',
  'finance.due_dates': 'الاستحقاقات المقبلة',
  'finance.payment_info': 'معلومات الأداء',
  'schoollife.extracurricular': 'الأنشطة الموازية',
  'schoollife.feed': 'دفتر الحياة المدرسية',
  'schoollife.lost_items': 'الأشياء الضائعة',
  'schoollife.polls': 'استطلاعات الرأي',
  'main.massar': 'رمز مسار',
};

const AR_SECTION_LABELS = {
  pedagogy: 'الدراسة',
  finance: 'الأداءات',
  schoollife: 'الحياة المدرسية',
};

const TEXT = {
  fr: {
    serverError: 'Erreur serveur',
    childForbidden: "Cet enfant n'est pas rattaché à votre compte",
    contentUnavailable: "Ce contenu n'est plus disponible.",
    unknownAction: 'Action inconnue',
    disabledInfo: "Cette information n'est plus communiquée par {{school}}. Contactez l'établissement directement.",
    selectChild: 'Sélectionnez un enfant',
    emptyMessage: 'Message vide',
    aiDisabled: 'Les questions libres ne sont pas activées. Utilisez les boutons ci-dessous pour consulter les informations disponibles.',
  },
  ar: {
    serverError: 'حدث خطأ في الخادم',
    childForbidden: 'هذا الابن غير مرتبط بحسابكم',
    contentUnavailable: 'لم يعد هذا المحتوى متاحًا.',
    unknownAction: 'هذا الاختيار غير معروف',
    disabledInfo: 'لم تعد {{school}} تتيح هذه المعلومة. يُرجى التواصل مباشرة مع المؤسسة.',
    selectChild: 'اختاروا الابن المعني',
    emptyMessage: 'الرسالة فارغة',
    aiDisabled: 'الأسئلة الحرة غير مفعلة. استعملوا الأزرار أسفله للاطلاع على المعلومات المتاحة.',
  },
};

// Les réponses déterministes proviennent du même moteur que WhatsApp et sont
// rédigées en français. Cette couche ne touche pas aux contenus saisis par
// l'école (noms, commentaires, descriptions) : elle traduit uniquement les
// libellés et phrases générés par l'application parent.
const AR_REPLACEMENTS = [
  ['Dernier suivi', 'آخر تتبع'],
  ['Bilan par matière', 'حصيلة حسب المادة'],
  ['Présence cette semaine', 'الحضور هذا الأسبوع'],
  ['Absences à justifier', 'غيابات يجب تبريرها'],
  ['Devoirs à faire', 'الواجبات المنزلية'],
  ['Programme de demain', 'برنامج الغد'],
  ['Documents partagés', 'الوثائق المشتركة'],
  ['Documents récents', 'أحدث الوثائق'],
  ['Situation financière', 'الوضعية المالية'],
  ['Dernière facture', 'آخر فاتورة'],
  ['Historique paiements', 'سجل الأداءات'],
  ['Derniers paiements', 'آخر الأداءات'],
  ['Échéancier à venir', 'الاستحقاقات المقبلة'],
  ['Échéancier', 'الاستحقاقات'],
  ['Contact & Paiement', 'التواصل والأداء'],
  ['Coordonnées', 'معلومات التواصل'],
  ['Code Massar', 'رمز مسار'],
  ['Bulletins scolaires', 'كشوف النقط'],
  ['Vie parascolaire', 'الأنشطة الموازية'],
  ['Cahier de vie', 'دفتر الحياة المدرسية'],
  ['Objets perdus', 'الأشياء الضائعة'],
  ['Sondages', 'استطلاعات الرأي'],
  ["n'est pas encore affecté(e) à une classe", 'لم يتم إسناده(ا) إلى قسم بعد'],
  ["Les données de classe seront disponibles dès que l'établissement aura effectué cette affectation.", 'ستصبح معطيات القسم متاحة فور إتمام المؤسسة لهذا الإسناد.'],
  ['Aucune séance enregistrée cette semaine.', 'لا توجد أي حصة مسجلة هذا الأسبوع.'],
  ['Aucun suivi enregistré pour le moment.', 'لا يوجد أي تتبع مسجل حاليًا.'],
  ['Aucune note de contrôle disponible pour le moment.', 'لا توجد أي نقطة فرض متاحة حاليًا.'],
  ['Aucune absence en attente de justification', 'لا توجد أي غيابات تنتظر التبرير'],
  ['Aucun devoir en attente !', 'لا توجد واجبات منتظرة!'],
  ['Votre enfant est à jour.', 'ابنكم منجز لجميع واجباته.'],
  ['Aucun document partagé pour le moment.', 'لا توجد أي وثيقة مشتركة حاليًا.'],
  ['Aucun bulletin publié pour le moment.', 'لم يتم نشر أي كشف نقط حاليًا.'],
  ['Aucune facture émise pour', 'لم تصدر أي فاتورة تخص'],
  ['Aucun paiement enregistré pour', 'لم يتم تسجيل أي أداء يخص'],
  ['Aucun paiement en attente !', 'لا يوجد أي أداء منتظر!'],
  ['Vous êtes à jour.', 'وضعيتكم محينة.'],
  ['Informations indisponibles.', 'المعلومات غير متاحة.'],
  ["n'est pas encore disponible", 'غير متاح حاليًا'],
  ["Veuillez contacter l'établissement.", 'يُرجى التواصل مع المؤسسة.'],
  ['Aucune activité prévue pour le moment.', 'لا توجد أي أنشطة مبرمجة حاليًا.'],
  ['Aucune activité partagée pour le moment.', 'لم تتم مشاركة أي نشاط حاليًا.'],
  ['Aucun objet signalé pour le moment.', 'لم يتم الإبلاغ عن أي غرض حاليًا.'],
  ['Aucun sondage en cours.', 'لا يوجد أي استطلاع جارٍ.'],
  ['Présence', 'الحضور'],
  ['Absences', 'الغيابات'],
  ['Absent', 'غائب'],
  ['Présent', 'حاضر'],
  ['Retard', 'تأخر'],
  ['Discipline', 'الانضباط'],
  ['Participation', 'المشاركة'],
  ['Devoirs', 'الواجبات'],
  ['Contrôles', 'الفروض'],
  ['Moyenne', 'المعدل'],
  ['Rang', 'الرتبة'],
  ['Total facturé', 'مجموع الفواتير'],
  ['Payé', 'المؤدى'],
  ['Reste dû', 'المتبقي'],
  ['Montant en retard', 'المبلغ المتأخر'],
  ['À jour', 'محين'],
  ['Reste à payer', 'المتبقي للأداء'],
  ['Période', 'الفترة'],
  ['Échéance', 'تاريخ الاستحقاق'],
  ['Détail', 'التفاصيل'],
  ['Code secret', 'الرمز السري'],
  ['Connexion', 'تسجيل الدخول'],
  ['Enseignant', 'الأستاذ'],
  ['Cours', 'درس'],
  ['Exercice', 'تمرين'],
  ['Correction', 'تصحيح'],
  ['Document', 'وثيقة'],
  ['À rendre', 'آخر أجل'],
  ['EN RETARD', 'متأخر'],
  ['demain', 'غدًا'],
  ['Lundi', 'الاثنين'],
  ['Mardi', 'الثلاثاء'],
  ['Mercredi', 'الأربعاء'],
  ['Jeudi', 'الخميس'],
  ['Vendredi', 'الجمعة'],
  ['Samedi', 'السبت'],
  ['Dimanche', 'الأحد'],
  ['janv.', 'يناير'], ['févr.', 'فبراير'], ['mars', 'مارس'],
  ['avr.', 'أبريل'], ['mai', 'ماي'], ['juin', 'يونيو'],
  ['juil.', 'يوليوز'], ['août', 'غشت'], ['sept.', 'شتنبر'],
  ['oct.', 'أكتوبر'], ['nov.', 'نونبر'], ['déc.', 'دجنبر'],
];

export const normalizeAssistantLocale = (value) => (
  String(value || '').toLowerCase().startsWith('ar') ? 'ar' : 'fr'
);

export const actionLabel = (action, fallback, locale) => (
  normalizeAssistantLocale(locale) === 'ar' ? (AR_ACTION_LABELS[action] || fallback) : fallback
);

export const sectionLabel = (menu, fallback, locale) => (
  normalizeAssistantLocale(locale) === 'ar' ? (AR_SECTION_LABELS[menu] || fallback) : fallback
);

export function assistantText(key, locale, vars = {}) {
  const lang = normalizeAssistantLocale(locale);
  const template = TEXT[lang][key] || TEXT.fr[key] || key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => (
    vars[name] === undefined || vars[name] === null ? match : String(vars[name])
  ));
}

export function localizeAssistantReply(value, locale) {
  if (normalizeAssistantLocale(locale) !== 'ar') return value;
  let output = String(value || '');
  for (const [from, to] of AR_REPLACEMENTS) output = output.split(from).join(to);
  return output;
}
