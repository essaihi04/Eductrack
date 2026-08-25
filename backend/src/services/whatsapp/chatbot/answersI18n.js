/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  TRADUCTION DES RÉPONSES DU CHATBOT (français ↔ arabe)                ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Les réponses de `answers.js` mêlent du texte à des données calculées ║
 * ║  (montants, dates, pourcentages). On extrait donc le TEXTE ici, avec  ║
 * ║  des jetons `{{nom}}` pour les valeurs, plutôt que de dupliquer la    ║
 * ║  logique de calcul dans chaque langue.                                ║
 * ║                                                                       ║
 * ║  Règle : une clé absente en arabe retombe sur le français — jamais    ║
 * ║  sur la clé brute, qu'un parent ne doit jamais voir.                  ║
 * ║                                                                       ║
 * ║  La langue vient de `parentInfo.lang`, alimenté par le sélecteur de   ║
 * ║  langue de l'app (profiles.preferred_language).                       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

const STRINGS = {
  fr: {
    // ── Cadre commun ──
    'school.default': 'École',
    'common.session': 'Séance',
    'common.other': 'Autre',
    'common.noClass': "*{{name}}* n'est pas encore affecté(e) à une classe.",
    'common.noClassHint': "Les données de classe seront disponibles dès que l'établissement aura effectué cette affectation.",

    // ── Finance ──
    'finance.situation': 'Situation financière',
    'finance.titleFor': 'Finance — {{name}}',
    'finance.noInvoice': 'Aucune facture émise pour {{name}}.',
    'finance.statusUpToDate': '✅ À jour',
    'finance.statusOverdue': '⚠️ Impayés en retard',
    'finance.statusRemaining': '🟡 Reste à payer',
    'finance.totalBilled': '💵 Total facturé',
    'finance.paid': '✅ Payé',
    'finance.stillDue': '🔴 Reste dû',
    'finance.lateCount': '⏰ *{{count}} facture en retard*',
    'finance.lateCountPlural': '⏰ *{{count}} factures en retard*',
    'finance.lateAmount': 'Montant en retard',

    'invoice.last': 'Dernière facture',
    'invoice.number': '📋 N°',
    'invoice.period': '📅 Période',
    'invoice.total': '💵 Total',
    'invoice.remaining': '🔴 Reste',
    'invoice.dueDate': '⏰ Échéance',
    'invoice.detail': '*Détail :*',
    'invoice.status.issued': '🟡 Émise',
    'invoice.status.partial': '🟠 Partiellement payée',
    'invoice.status.paid': '✅ Payée',
    'invoice.status.overdue': '🔴 En retard',

    'payments.history': 'Historique paiements',
    'payments.latest': 'Derniers paiements',
    'payments.none': 'Aucun paiement enregistré pour {{name}}.',
    'payments.receipt': '📋 Reçu N°',
    'payments.method.cash': '💵 Espèces',
    'payments.method.bank_transfer': '🏦 Virement',
    'payments.method.check': '📝 Chèque',
    'payments.method.card': '💳 Carte',
    'payments.method.online': '🌐 En ligne',

    'due.title': 'Échéancier',
    'due.upcoming': 'Échéancier à venir',
    'due.allClear': '🎉 Aucun paiement en attente !\nVous êtes à jour.',
    'due.invoiceLabel': 'Facture {{number}}',
    // L'article est dans la clé : l'arabe n'en prend pas.
    'due.lateSince': 'Retard depuis le',
    'due.payBefore': 'À régler avant le',

    'contact.title': 'Coordonnées',
    'contact.payment': 'Contact & Paiement',
    'contact.unavailable': 'Informations indisponibles.',
    'contact.terms': '*Modalités de paiement :*',
    'contact.termsHint': "_Pour plus d'informations sur les modalités de paiement, contactez l'école._",

    // ── Pédagogie : libellés du suivi de séance ──
    'ped.presence.present': '✅ Présent',
    'ped.presence.absent': '❌ Absent',
    'ped.presence.late': '⏰ Retard',
    'ped.disc.excellent': '🟢 Excellent',
    'ped.disc.concentre': '🟢 Concentré',
    'ped.disc.good': '🟢 Bon',
    'ped.disc.correct': '🔵 Correct',
    'ped.disc.agite': '🟠 Agité',
    'ped.disc.perturbateur': '🔴 Perturbateur',
    'ped.disc.bad': '🔴 Mauvais',
    'ped.part.excellent': '🟢 Excellente',
    'ped.part.bonne': '🔵 Bonne',
    'ped.part.moyenne': '🟡 Moyenne',
    'ped.part.faible': '🟠 Faible',
    'ped.part.passive': '🔴 Passive',

    // ── P1 Dernier suivi ──
    'ped.lastTracking': 'Dernier suivi',
    'ped.lastTrackingFor': 'Dernier suivi — {{name}}',
    'ped.noTracking': 'Aucun suivi enregistré pour le moment.',
    'ped.participation': '👋 Participation',
    'ped.discipline': '🧘 Discipline',
    'ped.attitude': '🙂 Attitude',
    'ped.homework': '📚 Devoirs',
    'ped.done': '✅ Fait',
    'ped.notDone': '❌ Non fait',

    // ── P2 Bilan par matière ──
    'ped.summary': 'Bilan par matière',
    'ped.summaryFor': 'Bilan — {{name}}',
    'ped.noData': 'Aucune donnée de suivi disponible pour le moment.',
    'ped.sessionCount': '{{count}} séance',
    'ped.sessionCountPlural': '{{count}} séances',
    'ped.attendanceRate': '✅ Présence',
    'ped.absenceCount': '❌ {{count}} absence',
    'ped.absenceCountPlural': '❌ {{count}} absences',
    'ped.lateCount': '⏰ {{count}} retard',
    'ped.lateCountPlural': '⏰ {{count}} retards',
    'ped.goodParticipation': '👋 Bonne participation',
    'ped.globalAttendance': '📈 *Présence globale : {{pct}}%*',

    // ── P3 Présence de la semaine ──
    'ped.weekly': 'Présence cette semaine',
    'ped.weeklyFor': 'Présence — {{name}}',
    'ped.noSessionThisWeek': 'Aucune séance enregistrée cette semaine.',
    'ped.present': '✅ Présent',
    'ped.lates': '⏰ Retards',
    'ped.absences': '❌ Absences',
    'ped.absenceDetail': '_Détail des absences :_',

    // ── P4 Absences à justifier ──
    'ped.unjustified': 'Absences à justifier',
    'ped.noUnjustified': '✅ Aucune absence en attente de justification pour *{{name}}*. Merci !',
    'ped.unjustifiedIntro': 'Voici les absences de *{{name}}* en attente de justification :',
    'ped.howToJustify': '📝 *Pour justifier*, répondez simplement à ce message en indiquant le motif (maladie, rendez-vous médical, raison familiale…). Votre justification sera enregistrée automatiquement.',

    // ── P5 Devoirs ──
    'ped.homeworkTitle': 'Devoirs à faire',
    'ped.homeworkFor': 'Devoirs — {{name}}',
    'ped.noHomework': '🎉 Aucun devoir en attente !\nVotre enfant est à jour.',
    'ped.wasDue': 'Était dû',
    'ped.toSubmit': 'À rendre',
    'ped.overdueTag': '⚠️ *EN RETARD*',

    // ── P6 Programme de demain ──
    'ped.tomorrowProgram': 'Programme de demain',
    'ped.programFor': 'Programme — {{day}} {{date}}',
    'ped.coursesOf': '📅 *Cours du {{day}} :*',
    'ped.coursesNoneWeekend': '📅 *Cours :* Aucune séance prévue (week-end).',
    'ped.coursesNone': '📅 *Cours :* Aucune séance prévue demain.',
    'ped.hwTomorrow': '✍️ *Devoirs à rendre demain :*',
    'ped.hwTomorrowNone': '✍️ *Devoirs à rendre demain :* ✅ Aucun',
    'ped.controlsTomorrow': '⚠️ *Contrôles demain :*',
    'ped.course': 'Cours',
    'ped.control': 'Contrôle',
    'ped.day.monday': 'Lundi',
    'ped.day.tuesday': 'Mardi',
    'ped.day.wednesday': 'Mercredi',
    'ped.day.thursday': 'Jeudi',
    'ped.day.friday': 'Vendredi',
    'ped.day.saturday': 'Samedi',
    'ped.day.sunday': 'Dimanche',

    // ── P7 Documents ──
    'ped.documents': 'Documents partagés',
    'ped.documentsRecent': 'Documents récents',
    'ped.noDocuments': 'Aucun document partagé pour le moment.',
    'ped.docHint': "_Connectez-vous à l'application pour les télécharger._",
    'ped.teacher': 'Enseignant',
    'ped.doc': 'Document',
    'ped.docType.cours': 'Cours',
    'ped.docType.exercice': 'Exercice',
    'ped.docType.correction': 'Correction',
    'ped.docType.support': 'Support',
    'ped.docType.devoir': 'Devoir',
    'ped.docType.rattrapage': 'Rattrapage',
    'ped.docType.approfondissement': 'Approfondissement',

    // ── P8 Bulletins ──
    'ped.bulletins': 'Bulletins scolaires',
    'ped.noBulletins': 'Aucun bulletin publié pour le moment.',
    'ped.semesterLabel': '{{year}} — S{{n}}',
    'ped.average': '📊 Moyenne',
    'ped.rank': '🏅 Rang',
    'ped.bulletinPdfHint': '📎 _Le(s) bulletin(s) PDF arrivent juste après ce message._',
  },

  ar: {
    // ── Cadre commun ──
    'school.default': 'المؤسسة',
    'common.session': 'حصة',
    'common.other': 'أخرى',
    'common.noClass': 'لم يُسند *{{name}}* إلى قسم بعد.',
    'common.noClassHint': 'ستتوفر معطيات القسم بمجرد قيام المؤسسة بهذا الإسناد.',

    // ── Finance ──
    'finance.situation': 'الوضعية المالية',
    'finance.titleFor': 'الأداءات — {{name}}',
    'finance.noInvoice': 'لا توجد أي فاتورة صادرة لـ {{name}}.',
    'finance.statusUpToDate': '✅ الوضعية سليمة',
    'finance.statusOverdue': '⚠️ مستحقات متأخرة',
    'finance.statusRemaining': '🟡 مبلغ متبقٍ',
    'finance.totalBilled': '💵 مجموع الفوترة',
    'finance.paid': '✅ المؤدى',
    'finance.stillDue': '🔴 المتبقي',
    'finance.lateCount': '⏰ *فاتورة واحدة متأخرة*',
    'finance.lateCountPlural': '⏰ *{{count}} فواتير متأخرة*',
    'finance.lateAmount': 'المبلغ المتأخر',

    'invoice.last': 'آخر فاتورة',
    'invoice.number': '📋 رقم',
    'invoice.period': '📅 الفترة',
    'invoice.total': '💵 المجموع',
    'invoice.remaining': '🔴 المتبقي',
    'invoice.dueDate': '⏰ أجل الأداء',
    'invoice.detail': '*التفصيل:*',
    'invoice.status.issued': '🟡 صادرة',
    'invoice.status.partial': '🟠 مؤداة جزئيا',
    'invoice.status.paid': '✅ مؤداة',
    'invoice.status.overdue': '🔴 متأخرة',

    'payments.history': 'سجل الأداءات',
    'payments.latest': 'آخر الأداءات',
    'payments.none': 'لا يوجد أي أداء مسجل لـ {{name}}.',
    'payments.receipt': '📋 وصل رقم',
    'payments.method.cash': '💵 نقدا',
    'payments.method.bank_transfer': '🏦 تحويل بنكي',
    'payments.method.check': '📝 شيك',
    'payments.method.card': '💳 بطاقة',
    'payments.method.online': '🌐 عبر الإنترنت',

    'due.title': 'الاستحقاقات',
    'due.upcoming': 'الاستحقاقات المقبلة',
    'due.allClear': '🎉 لا يوجد أي أداء في الانتظار!\nوضعيتكم سليمة.',
    'due.invoiceLabel': 'فاتورة {{number}}',
    'due.lateSince': 'متأخرة منذ',
    'due.payBefore': 'تُؤدى قبل',

    'contact.title': 'معلومات الاتصال',
    'contact.payment': 'الاتصال والأداء',
    'contact.unavailable': 'المعلومات غير متوفرة.',
    'contact.terms': '*كيفيات الأداء:*',
    'contact.termsHint': '_لمزيد من المعلومات حول كيفيات الأداء، يرجى الاتصال بالمؤسسة._',

    // ── Pédagogie : libellés du suivi de séance ──
    'ped.presence.present': '✅ حاضر',
    'ped.presence.absent': '❌ غائب',
    'ped.presence.late': '⏰ متأخر',
    'ped.disc.excellent': '🟢 ممتاز',
    'ped.disc.concentre': '🟢 مركّز',
    'ped.disc.good': '🟢 جيد',
    'ped.disc.correct': '🔵 مقبول',
    'ped.disc.agite': '🟠 كثير الحركة',
    'ped.disc.perturbateur': '🔴 مشوّش',
    'ped.disc.bad': '🔴 غير مرضٍ',
    'ped.part.excellent': '🟢 ممتازة',
    'ped.part.bonne': '🔵 جيدة',
    'ped.part.moyenne': '🟡 متوسطة',
    'ped.part.faible': '🟠 ضعيفة',
    'ped.part.passive': '🔴 سلبية',

    // ── P1 Dernier suivi ──
    'ped.lastTracking': 'آخر تتبع للحصة',
    'ped.lastTrackingFor': 'آخر تتبع — {{name}}',
    'ped.noTracking': 'لا يوجد أي تتبع مسجل حاليا.',
    'ped.participation': '👋 المشاركة',
    'ped.discipline': '🧘 الانضباط',
    'ped.attitude': '🙂 السلوك',
    'ped.homework': '📚 الواجبات',
    'ped.done': '✅ منجز',
    'ped.notDone': '❌ غير منجز',

    // ── P2 Bilan par matière ──
    'ped.summary': 'حصيلة النقط حسب المادة',
    'ped.summaryFor': 'الحصيلة — {{name}}',
    'ped.noData': 'لا تتوفر أي معطيات تتبع حاليا.',
    'ped.sessionCount': 'حصة واحدة',
    'ped.sessionCountPlural': '{{count}} حصص',
    'ped.attendanceRate': '✅ الحضور',
    'ped.absenceCount': '❌ غياب واحد',
    'ped.absenceCountPlural': '❌ {{count}} غيابات',
    'ped.lateCount': '⏰ تأخر واحد',
    'ped.lateCountPlural': '⏰ {{count}} تأخرات',
    'ped.goodParticipation': '👋 مشاركة جيدة',
    'ped.globalAttendance': '📈 *الحضور الإجمالي: {{pct}}%*',

    // ── P3 Présence de la semaine ──
    'ped.weekly': 'حضور هذا الأسبوع',
    'ped.weeklyFor': 'الحضور — {{name}}',
    'ped.noSessionThisWeek': 'لا توجد أي حصة مسجلة هذا الأسبوع.',
    'ped.present': '✅ حاضر',
    'ped.lates': '⏰ التأخرات',
    'ped.absences': '❌ الغيابات',
    'ped.absenceDetail': '_تفصيل الغيابات:_',

    // ── P4 Absences à justifier ──
    'ped.unjustified': 'غيابات يجب تبريرها',
    'ped.noUnjustified': '✅ لا يوجد أي غياب في انتظار التبرير بخصوص *{{name}}*. شكرا لكم!',
    'ped.unjustifiedIntro': 'إليكم غيابات *{{name}}* التي تنتظر التبرير:',
    'ped.howToJustify': '📝 *للتبرير*، يكفي الرد على هذه الرسالة مع ذكر السبب (مرض، موعد طبي، سبب عائلي…). سيُسجَّل تبريركم تلقائيا.',

    // ── P5 Devoirs ──
    'ped.homeworkTitle': 'الواجبات المنزلية',
    'ped.homeworkFor': 'الواجبات — {{name}}',
    'ped.noHomework': '🎉 لا يوجد أي واجب في الانتظار!\nجميع الواجبات منجزة.',
    'ped.wasDue': 'كان مستحقا',
    'ped.toSubmit': 'يُسلَّم',
    'ped.overdueTag': '⚠️ *متأخر*',

    // ── P6 Programme de demain ──
    'ped.tomorrowProgram': 'برنامج الغد',
    'ped.programFor': 'البرنامج — {{day}} {{date}}',
    'ped.coursesOf': '📅 *دروس {{day}}:*',
    'ped.coursesNoneWeekend': '📅 *الدروس:* لا توجد حصص (عطلة نهاية الأسبوع).',
    'ped.coursesNone': '📅 *الدروس:* لا توجد حصص مبرمجة غدا.',
    'ped.hwTomorrow': '✍️ *واجبات تُسلَّم غدا:*',
    'ped.hwTomorrowNone': '✍️ *واجبات تُسلَّم غدا:* ✅ لا شيء',
    'ped.controlsTomorrow': '⚠️ *فروض غدا:*',
    'ped.course': 'درس',
    'ped.control': 'فرض',
    'ped.day.monday': 'الاثنين',
    'ped.day.tuesday': 'الثلاثاء',
    'ped.day.wednesday': 'الأربعاء',
    'ped.day.thursday': 'الخميس',
    'ped.day.friday': 'الجمعة',
    'ped.day.saturday': 'السبت',
    'ped.day.sunday': 'الأحد',

    // ── P7 Documents ──
    'ped.documents': 'الوثائق المشتركة',
    'ped.documentsRecent': 'الوثائق الأخيرة',
    'ped.noDocuments': 'لا توجد أي وثيقة مشتركة حاليا.',
    'ped.docHint': '_سجّلوا الدخول إلى التطبيق لتحميلها._',
    'ped.teacher': 'الأستاذ(ة)',
    'ped.doc': 'وثيقة',
    'ped.docType.cours': 'درس',
    'ped.docType.exercice': 'تمرين',
    'ped.docType.correction': 'تصحيح',
    'ped.docType.support': 'سند',
    'ped.docType.devoir': 'واجب',
    'ped.docType.rattrapage': 'استدراك',
    'ped.docType.approfondissement': 'تعميق',

    // ── P8 Bulletins ──
    'ped.bulletins': 'كشوف النقط',
    'ped.noBulletins': 'لم يُنشر أي كشف نقط حاليا.',
    'ped.semesterLabel': '{{year}} — الدورة {{n}}',
    'ped.average': '📊 المعدل',
    'ped.rank': '🏅 الرتبة',
    'ped.bulletinPdfHint': '📎 _ستصلكم كشوف النقط بصيغة PDF مباشرة بعد هذه الرسالة._',
  },
};

/** Remplace les jetons `{{nom}}` par les valeurs fournies. */
const interpolate = (text, vars) => {
  if (!vars || typeof text !== 'string') return text;
  return text.replace(/\{\{(\w+)\}\}/g, (m, name) => (
    vars[name] === undefined || vars[name] === null ? m : String(vars[name])
  ));
};

/**
 * Fonction de traduction pour une langue donnée.
 * @example const t = tr(parentInfo.lang); t('finance.paid')
 */
export function tr(lang) {
  const dict = STRINGS[lang] || STRINGS.fr;
  return (key, vars) => interpolate(dict[key] ?? STRINGS.fr[key] ?? key, vars);
}

/** Langue portée par parentInfo, normalisée. */
export const langOf = (parentInfo) => (parentInfo?.lang === 'ar' ? 'ar' : 'fr');

/**
 * Locale de formatage des dates et des nombres.
 * `ar-MA` donne des mois arabes marocains et des chiffres arabes occidentaux
 * (0-9), ceux réellement utilisés au Maroc — et non les chiffres orientaux.
 */
export const localeOf = (lang) => (lang === 'ar' ? 'ar-MA' : 'fr-FR');
