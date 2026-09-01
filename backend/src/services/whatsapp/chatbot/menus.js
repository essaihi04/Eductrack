/**
 * Définition des menus du chatbot.
 *
 * Format : chaque menu = liste d'options { id, emoji, label, action }.
 *  - id : code court tapé par l'utilisateur (1, 2, p1, f3, ...)
 *  - action : nom de la fonction de réponse à appeler
 *
 * Le rendu par défaut est la LISTE cliquable native de l'API Cloud officielle.
 * Si elle échoue (hors fenêtre 24 h, numéro non rattaché), on retombe sur le
 * menu texte numéroté, auquel l'utilisateur peut toujours répondre par le
 * numéro de l'option.
 */

import * as A from './answers.js';
import { sendText } from '../index.js';
import * as cloud from '../cloudApi.js';
import { logOutgoing } from '../outgoingLog.js';
import { capabilityForOption, isCapabilityEnabled } from './capabilities.js';
import { preferredLanguage } from '../utility.js';
import { customOptionsForMenu } from './customEntries.js';

// ─────────────────────────────────────────────────────────────────────────
// MENUS
// ─────────────────────────────────────────────────────────────────────────

export const MAIN_MENU = {
  id: 'main',
  title: 'Bienvenue 👋',
  titleAr: 'مرحبا بكم 👋',
  description: 'Que souhaitez-vous consulter ?',
  descriptionAr: 'ماذا تودّون الاطلاع عليه؟',
  options: [
    { id: '1', emoji: '📚', label: 'Suivi pédagogique', labelAr: 'الدراسة', action: 'goto:pedagogy' },
    { id: '2', emoji: '💰', label: 'Finance / Paiements', labelAr: 'الأداءات', action: 'goto:finance' },
    { id: '3', emoji: '🎒', label: 'Vie scolaire', labelAr: 'الحياة المدرسية', action: 'goto:schoollife' },
    { id: '4', emoji: '💬', label: 'Poser une question libre', labelAr: 'طرح سؤال حر', action: 'goto:ai' },
    { id: '5', emoji: '🆔', label: 'Code Massar de mon enfant', labelAr: 'رمز مسار', action: A.getMassarCode },
    { id: '6', emoji: '👨‍👩‍👧', label: 'Changer d\'enfant', labelAr: 'تغيير الابن أو الابنة', action: 'goto:child' },
    { id: '7', emoji: '⚙️', label: 'Configuration du compte', labelAr: 'الحساب والولوج', action: 'goto:account' },
    { id: '8', emoji: '📅', label: 'Demander un rendez-vous', labelAr: 'طلب موعد', action: 'goto:appointment' },
  ],
};

export const ACCOUNT_MENU = {
  id: 'account',
  title: 'Configuration du compte ⚙️',
  titleAr: 'الحساب والولوج ⚙️',
  description: 'Gérez votre compte et le profil de votre enfant',
  descriptionAr: 'تدبير حسابكم وملف ابنكم',
  options: [
    { id: '1', emoji: '🔑', label: 'Mes identifiants (login & mot de passe)', labelAr: 'بيانات الدخول وكلمات السر', action: 'goto:credentials' },
    { id: '2', emoji: '📍', label: 'Ma localisation (transport scolaire)',    labelAr: 'موقعي (النقل المدرسي)',      action: 'goto:location' },
    { id: '3', emoji: '📷', label: 'Photo de profil de mon enfant',           labelAr: 'صورة ملف ابني',              action: 'goto:photo' },
    { id: '4', emoji: '📱', label: 'Ajouter un numéro (2ᵉ parent)',           labelAr: 'إضافة رقم (ولي أمر ثانٍ)',   action: 'goto:addnumber' },
    { id: '0', emoji: '🔙', label: 'Retour au menu principal',                labelAr: 'العودة إلى القائمة الرئيسية', action: 'goto:main' },
  ],
};

export const SCHOOL_LIFE_MENU = {
  id: 'schoollife',
  title: 'Vie scolaire 🎒',
  titleAr: 'الحياة المدرسية 🎒',
  description: 'Activités, photos, objets perdus et sondages',
  descriptionAr: 'الأنشطة والصور والأشياء الضائعة والاستطلاعات',
  options: [
    { id: '1', emoji: '✨', label: 'Activités parascolaires',        labelAr: 'الأنشطة الموازية',        action: A.getExtracurricular },
    { id: '2', emoji: '📸', label: 'Cahier de vie (photos)',         labelAr: 'دفتر الحياة المدرسية',     action: A.getClassroomFeed },
    { id: '3', emoji: '🔍', label: 'Objets perdus',                  labelAr: 'الأشياء الضائعة',          action: A.getLostItems },
    { id: '4', emoji: '🗳️', label: 'Sondages en cours',             labelAr: 'استطلاعات الرأي',          action: A.getActivePolls },
    { id: '5', emoji: '🎒', label: 'Fournitures scolaires (PDF)',    labelAr: 'اللوازم المدرسية (PDF)',   action: 'goto:supplies' },
    { id: '6', emoji: '🏫', label: 'Notre école (infos & photos)',  labelAr: 'مدرستنا (معلومات وصور)',   action: 'goto:school' },
    { id: '0', emoji: '🔙', label: 'Retour au menu principal',       labelAr: 'العودة إلى القائمة الرئيسية', action: 'goto:main' },
  ],
};

export const PEDAGOGY_MENU = {
  id: 'pedagogy',
  title: 'Suivi pédagogique 📚',
  titleAr: 'الدراسة 📚',
  description: 'Choisissez ce que vous voulez consulter',
  descriptionAr: 'اختاروا ما تودّون الاطلاع عليه',
  options: [
    { id: '1', emoji: '📝', label: 'Dernier suivi',                  labelAr: 'آخر تتبع للحصة',           action: A.getLastControlGrades },
    { id: '2', emoji: '📊', label: 'Bilan par matière',               labelAr: 'حصيلة النقط حسب المادة',   action: A.getAverageBySubject },
    { id: '3', emoji: '📅', label: 'Présence cette semaine',          labelAr: 'حضور هذا الأسبوع',         action: A.getWeeklyAttendance },
    { id: '9', emoji: '📝', label: 'Absences à justifier',            labelAr: 'غيابات يجب تبريرها',       action: A.getUnjustifiedAbsences },
    { id: '4', emoji: '✍️', label: 'Devoirs à faire',                labelAr: 'الواجبات المنزلية',        action: A.getPendingHomework },
    { id: '5', emoji: '📆', label: 'Programme de demain',            labelAr: 'استعمال الزمن',            action: A.getTodaySchedule },
    { id: '6', emoji: '📎', label: 'Documents partagés',             labelAr: 'الوثائق المشتركة',         action: A.getRecentDocuments },
    { id: '7', emoji: '📄', label: 'Bulletins scolaires',            labelAr: 'كشوف النقط',               action: A.getBulletinSummary },
    { id: '8', emoji: '📊', label: 'Consulter mon rapport du jour',  labelAr: 'تقرير اليوم',              action: 'report:now' },
    { id: '0', emoji: '🔙', label: 'Retour au menu principal',       labelAr: 'العودة إلى القائمة الرئيسية', action: 'goto:main' },
  ],
};

export const FINANCE_MENU = {
  id: 'finance',
  title: 'Finance & Paiements 💰',
  titleAr: 'الأداءات 💰',
  description: 'Choisissez l\'information souhaitée',
  descriptionAr: 'اختاروا المعلومة المطلوبة',
  options: [
    { id: '1', emoji: '💰', label: 'Solde et impayés',               labelAr: 'الرصيد المالي',            action: A.getFinanceBalance },
    { id: '2', emoji: '🧾', label: 'Dernière facture',               labelAr: 'آخر فاتورة',               action: A.getLastInvoice },
    { id: '3', emoji: '💳', label: 'Historique des paiements',       labelAr: 'سجل الأداءات',             action: A.getPaymentHistory },
    { id: '4', emoji: '📅', label: 'Échéancier à venir',             labelAr: 'الاستحقاقات المقبلة',      action: A.getUpcomingDueDates },
    { id: '5', emoji: '📞', label: 'Coordonnées de paiement',        labelAr: 'معلومات الأداء',           action: A.getSchoolPaymentInfo },
    { id: '0', emoji: '🔙', label: 'Retour au menu principal',       labelAr: 'العودة إلى القائمة الرئيسية', action: 'goto:main' },
  ],
};

export const MENUS = {
  main: MAIN_MENU,
  pedagogy: PEDAGOGY_MENU,
  finance: FINANCE_MENU,
  schoollife: SCHOOL_LIFE_MENU,
  account: ACCOUNT_MENU,
};

// ─────────────────────────────────────────────────────────────────────────
// Langue du menu
// ─────────────────────────────────────────────────────────────────────────

/**
 * Applique une langue à un menu : titre, description et libellés.
 *
 * Une traduction absente retombe sur le français — jamais sur une chaîne vide
 * ni sur la clé brute. Les entrées ajoutées par l'administration de l'école
 * n'ont pas de version arabe : on les laisse telles quelles plutôt que
 * d'inventer une traduction de leur contenu.
 */
export function localizeMenu(menu, lang) {
  if (lang !== 'ar' || !menu) return menu;
  return {
    ...menu,
    title: menu.titleAr || menu.title,
    description: menu.descriptionAr || menu.description,
    options: (menu.options || []).map((o) => ({ ...o, label: o.labelAr || o.label })),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Menu effectif d'une école
// ─────────────────────────────────────────────────────────────────────────

/**
 * Construit le menu réellement présenté à un parent :
 *  - les options dont la capacité est coupée sont retirées ;
 *  - les contenus ajoutés par l'administration sont insérés avant le retour.
 *
 * Les menus déclarés plus haut restent le référentiel immuable ; on n'en
 * renvoie qu'une copie, jamais une version modifiée en place.
 */
export async function resolveMenu(schoolId, menuId) {
  const base = MENUS[menuId] || MENUS.main;

  const kept = [];
  for (const opt of base.options) {
    // L'option de retour n'est jamais gouvernée par une capacité.
    if (opt.id === '0') continue;
    const cap = capabilityForOption(base.id, opt.id);
    if (cap && !(await isCapabilityEnabled(schoolId, cap.id))) continue;
    // `menuId` permet au dispatcher de revérifier la capacité au moment de
    // l'exécution, sans avoir à retrouver de quel menu vient l'option.
    kept.push({ ...opt, menuId: base.id });
  }

  const custom = await customOptionsForMenu(schoolId, base.id);
  const back = base.options.find((o) => o.id === '0');

  return {
    ...base,
    options: [...kept, ...custom, ...(back ? [back] : [])],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Formatage texte du menu (toujours envoyé, fallback universel)
// ─────────────────────────────────────────────────────────────────────────

export function renderMenuText(menu, ctx = {}) {
  const lines = [];
  lines.push(`*${menu.title}*`);
  if (ctx.studentName) lines.push(`👶 Élève : *${ctx.studentName}*`);
  lines.push('━━━━━━━━━━━━━━━━━━━');
  if (menu.description) {
    lines.push(menu.description);
    lines.push('');
  }
  menu.options.forEach((opt) => {
    lines.push(`*${opt.id}.* ${opt.emoji} ${opt.label}`);
  });
  lines.push('');
  lines.push('_Répondez avec le numéro de votre choix._');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Envoi du menu via WhatsApp (interactive list + texte de secours)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Envoie un menu sur WhatsApp.
 * - Liste cliquable native de l'API Cloud officielle (vrais boutons)
 * - En cas d'échec (hors fenêtre 24 h, numéro non rattaché) → texte numéroté
 *
 * Dans tous les cas, l'utilisateur peut répondre par le NUMÉRO de l'option.
 */
export async function sendMenu(schoolId, phone, menu, ctx = {}) {
  // Langue du destinataire : choix explicite du sélecteur de l'app, sinon
  // langue devinée de son dernier message. `ctx.lang` permet de la forcer.
  const lang = ctx.lang || (await preferredLanguage(phone));
  const localise = localizeMenu(menu, lang);
  const contexte = { ...ctx, lang };

  const r = await cloud.sendListMenu(schoolId, phone, localise, contexte);
  if (r?.success) {
    // La liste native passe par cloudApi sans traverser whatsapp/index.js :
    // sans cette ligne, le menu manquerait dans la boîte de réception et
    // l'école verrait la réponse du parent sortir de nulle part.
    logOutgoing(schoolId, phone, { type: 'text', body: renderMenuText(localise, contexte) }, r);
    return true;
  }

  console.warn(`[chatbot] liste Cloud échouée, repli texte:`, r?.message);
  const res = await sendText(schoolId, phone, renderMenuText(localise, contexte));
  return !!res.success;
}

/**
 * Menu VISÉ par un clic de liste « menuId:optionId ».
 *
 * Un parent qui remonte dans le fil et reclique un bouton d'un menu affiché
 * plus tôt envoie « main:2 » alors que son état conversationnel est resté sur
 * « finance ». Le préfixe DIT pourtant de quel menu vient le bouton : c'est
 * lui qui fait foi, pas l'état. Sans cela, MARCEL ARNAUD a vu des parents
 * boucler sur « 🤔 Option non reconnue : "main:1" » cinq fois de suite.
 *
 * @returns {string|null} identifiant du menu visé, ou null si la saisie n'est
 *                        pas un identifiant de liste connu.
 */
export function targetMenuId(input) {
  const m = /^([a-z]+):([\w-]+)$/i.exec(String(input || '').trim());
  if (!m) return null;
  const id = m[1].toLowerCase();
  return MENUS[id] ? id : null;
}

/**
 * Trouve une option dans un menu à partir de la saisie utilisateur.
 * Accepte : numéro, label partiel, ou rowId "menu:id" (clic listMessage).
 */
export function matchMenuOption(menu, input) {
  if (!menu || !input) return null;
  const raw = String(input).trim();

  // Cas clic sur une ligne de liste : "menuId:optionId"
  if (raw.includes(':')) {
    const [mId, optId] = raw.split(':');
    if (mId === menu.id) {
      return menu.options.find((o) => o.id === optId) || null;
    }
  }

  // Cas numéro direct
  const byId = menu.options.find((o) => o.id === raw);
  if (byId) return byId;

  // Cas label partiel (recherche tolérante). On teste les DEUX langues : un
  // parent arabophone peut taper « الأداءات » aussi bien que « finance », et
  // le menu affiché ne dit rien de la langue dans laquelle il répondra.
  const lower = raw.toLowerCase();
  return menu.options.find((o) =>
    o.label.toLowerCase().includes(lower) ||
    (o.labelAr && o.labelAr.toLowerCase().includes(lower))
  ) || null;
}
