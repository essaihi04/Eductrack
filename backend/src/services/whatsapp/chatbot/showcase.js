/**
 * Vitrine de l'école dans le chatbot WhatsApp.
 *
 * L'administration renseigne les informations générales (présentation, taux de
 * réussite, atouts, filières, contacts, réseaux sociaux) et des rubriques
 * illustrées (cantine, sport, salles, équipements, trophées, activités, élèves
 * méritants). Le chatbot :
 *   - répond en texte à une question ciblée (« vous avez une cantine ? »,
 *     « quel est le taux de réussite ? », « votre page Facebook ? »),
 *   - envoie les PHOTOS de la rubrique demandée,
 *   - propose un menu des rubriques disponibles.
 *
 * Deux niveaux de visibilité : `is_published` (parents rattachés) et
 * `is_public` (numéros inconnus / chatbot visiteur). Les élèves méritants sont
 * hors diffusion publique par défaut — ce sont des données de mineurs.
 */

import { supabaseAdmin } from '../../../config/supabase.js';
import { sendText, sendImage } from '../index.js';
import * as State from './state.js';

// Nombre maximum de photos envoyées d'un coup pour une rubrique : au-delà, on
// noie le parent et on consomme son forfait data pour rien.
const MAX_IMAGES_PER_TOPIC = 6;

export const CATEGORY_LABELS = {
  cantine: { emoji: '🍽️', label: 'Cantine & restauration' },
  sport: { emoji: '⚽', label: 'Sport & activités physiques' },
  salle: { emoji: '🏫', label: 'Salles & locaux' },
  equipement: { emoji: '🖥️', label: 'Équipements pédagogiques' },
  trophee: { emoji: '🏆', label: 'Trophées & distinctions' },
  activite: { emoji: '✨', label: 'Activités parascolaires' },
  filiere: { emoji: '📚', label: 'Filières & options' },
  eleve_merite: { emoji: '🎓', label: 'Élèves méritants' },
  transport: { emoji: '🚌', label: 'Transport scolaire' },
  autre: { emoji: '📌', label: 'Autres informations' },
};

// ─────────────────────────────────────────────────────────────────────────
// Détection d'intention (FR / AR / darija)
// ─────────────────────────────────────────────────────────────────────────

const TOPIC_PATTERNS = [
  ['cantine', ['cantine', 'restaurant', 'restauration', 'repas', 'menu du jour', 'nourriture', 'manger',
    'مطعم', 'المطعم', 'الكانتين', 'الأكل', 'الاكل', 'التغذية', 'makla', 'cantin']],
  ['sport', ['sport', 'sportif', 'gymnase', 'terrain', 'piscine', 'football', 'basket', 'salle de sport',
    'رياضة', 'الرياضة', 'ملعب', 'الملعب', 'مسبح', 'قاعة الرياضة', 'riyada']],
  ['equipement', ['tableau interactif', 'tableaux interactifs', 'equipement', 'équipement', 'informatique',
    'ordinateur', 'laboratoire', 'labo', 'materiel', 'matériel', 'projecteur', 'numerique', 'numérique',
    'سبورة', 'السبورة التفاعلية', 'تجهيزات', 'التجهيزات', 'حاسوب', 'مختبر', 'المختبر', 'الإعلاميات']],
  ['salle', ['salle', 'salles', 'classe équipée', 'locaux', 'batiment', 'bâtiment', 'infrastructure',
    'bibliotheque', 'bibliothèque', 'compartiment', 'compartiments',
    'قاعة', 'القاعات', 'الأقسام', 'المكتبة', 'المرافق', 'البنية']],
  ['trophee', ['trophee', 'trophée', 'trophees', 'trophées', 'prix', 'medaille', 'médaille', 'distinction',
    'concours', 'championnat', 'palmares', 'palmarès',
    'جوائز', 'الجوائز', 'كأس', 'ميدالية', 'مسابقة', 'تتويج']],
  ['activite', ['activite', 'activité', 'activites', 'activités', 'parascolaire', 'club', 'clubs', 'sortie',
    'colonie', 'excursion', 'atelier',
    'أنشطة', 'الأنشطة', 'نشاط', 'الأندية', 'رحلة', 'ورشة', 'الموازية']],
  ['filiere', ['filiere', 'filière', 'filieres', 'filières', 'option', 'options', 'branche', 'serie', 'série',
    'bac sciences', 'lettres', 'orientation',
    'شعبة', 'الشعب', 'المسالك', 'مسلك', 'التوجيه', 'تخصص']],
  ['eleve_merite', ['meilleur eleve', 'meilleure eleve', 'meilleur élève', 'meilleurs eleves', 'meilleurs élèves',
    'tableau d\'honneur', 'honneur', 'excellence', 'majorant', 'majorants', 'lauréat', 'laureat', 'meilleures notes',
    'المتفوقين', 'المتفوقون', 'لوحة الشرف', 'أفضل التلاميذ', 'الأوائل']],
  ['transport', ['transport', 'bus scolaire', 'ramassage', 'car scolaire',
    'النقل', 'الحافلة', 'حافلة', 'طوبيس']],
];

const SUCCESS_RATE_RE = new RegExp([
  'taux de reussite', 'taux de réussite', 'taux dereussite', 'resultats de l', 'résultats de l',
  'pourcentage de reussite', 'pourcentage de réussite', 'combien de reussite', 'taux bac',
  'نسبة النجاح', 'نسبه النجاح', 'معدل النجاح', 'نتائج المدرسة', 'النجاح في الباك',
  'nisbat najah', 'taux najah',
].join('|'), 'i');

const CONTACT_RE = new RegExp([
  'facebook', 'instagram', 'insta', 'tiktok', 'youtube', 'reseaux sociaux', 'réseaux sociaux',
  'page de l\'ecole', 'site web', 'site internet', 'votre numero', 'votre numéro', 'numero de contact',
  'numéro de contact', 'contacter l', 'coordonnees', 'coordonnées', 'adresse de l\'ecole', 'ou se trouve',
  'où se trouve', 'localisation de l\'ecole',
  'فيسبوك', 'فايسبوك', 'انستغرام', 'إنستغرام', 'تيك توك', 'الموقع الإلكتروني', 'رقم الهاتف',
  'رقم المدرسة', 'التواصل', 'عنوان المدرسة', 'مكان المدرسة',
].join('|'), 'i');

const GENERAL_RE = new RegExp([
  'presentation de l', 'présentation de l', 'parlez moi de l\'ecole', 'infos sur l\'ecole',
  'informations sur l\'ecole', 'informations générales', 'informations generales',
  'votre ecole', 'votre école', 'pourquoi votre ecole', 'pourquoi votre école',
  'avantage', 'avantages', 'atout', 'atouts', 'trilingue', 'bilingue',
  'معلومات عن المدرسة', 'عن المدرسة', 'مميزات', 'المميزات', 'لماذا مدرستكم', 'ثلاثية اللغة',
].join('|'), 'i');

/**
 * Analyse un message et renvoie ce qu'il demande à la vitrine.
 * @returns {{kind: 'topic'|'success'|'contact'|'general', category?: string}|null}
 */
export function detectShowcaseIntent(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;

  if (SUCCESS_RATE_RE.test(t)) return { kind: 'success' };
  if (CONTACT_RE.test(t)) return { kind: 'contact' };

  for (const [category, keywords] of TOPIC_PATTERNS) {
    if (keywords.some((k) => t.includes(k.toLowerCase()))) return { kind: 'topic', category };
  }

  if (GENERAL_RE.test(t)) return { kind: 'general' };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Lecture des données
// ─────────────────────────────────────────────────────────────────────────

/** Profil de l'école (informations générales). */
export async function getSchoolProfile(schoolId) {
  if (!schoolId) return null;
  const { data } = await supabaseAdmin
    .from('school_profile')
    .select('*')
    .eq('school_id', schoolId)
    .maybeSingle();
  return data || null;
}

/**
 * Rubriques illustrées publiées.
 * @param {boolean} publicOnly  true pour un numéro inconnu (chatbot visiteur)
 */
export async function getShowcaseItems(schoolId, { category = null, publicOnly = false } = {}) {
  if (!schoolId) return [];
  let q = supabaseAdmin
    .from('school_showcase_items')
    .select('id, category, title, description, image_url, extra, sort_order')
    .eq('school_id', schoolId)
    .eq('is_published', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });
  if (category) q = q.eq('category', category);
  if (publicOnly) q = q.eq('is_public', true);
  const { data } = await q;
  return data || [];
}

/** Catégories disponibles (avec compteur), dans l'ordre d'affichage du menu. */
function groupByCategory(items) {
  const order = Object.keys(CATEGORY_LABELS);
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.category)) map.set(it.category, []);
    map.get(it.category).push(it);
  }
  return [...map.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([category, list]) => ({ category, items: list }));
}

// ─────────────────────────────────────────────────────────────────────────
// Formatage des réponses
// ─────────────────────────────────────────────────────────────────────────

function successRateLine(profile) {
  if (profile?.success_rate == null) return null;
  const rate = Number(profile.success_rate);
  const pretty = Number.isInteger(rate) ? `${rate}` : rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const year = profile.success_rate_year ? ` (${profile.success_rate_year})` : '';
  const note = profile.success_rate_note ? `\n_${profile.success_rate_note}_` : '';
  return `📈 *Taux de réussite${year} : ${pretty} %*${note}`;
}

function contactLines(profile, schoolName) {
  const lines = [`*📞 Contacter ${schoolName}*`, '━━━━━━━━━━━━━━━━━━━'];
  const add = (emoji, label, value) => { if (value) lines.push(`${emoji} ${label} : ${value}`); };
  add('☎️', 'Téléphone', profile?.contact_phone);
  add('💬', 'WhatsApp', profile?.contact_whatsapp);
  add('✉️', 'Email', profile?.contact_email);
  add('🌐', 'Site web', profile?.website_url);
  add('📘', 'Facebook', profile?.facebook_url);
  add('📸', 'Instagram', profile?.instagram_url);
  add('🎵', 'TikTok', profile?.tiktok_url);
  add('▶️', 'YouTube', profile?.youtube_url);
  add('📍', 'Localisation', profile?.maps_url);
  if (lines.length === 2) return null;
  return lines.join('\n');
}

/** Carte de présentation de l'école (texte). */
function profileCard(profile, schoolName) {
  const lines = [`*🏫 ${schoolName}*`, '━━━━━━━━━━━━━━━━━━━'];

  if (profile?.about) lines.push(profile.about, '');

  const rate = successRateLine(profile);
  if (rate) lines.push(rate, '');

  if (profile?.languages?.length) {
    lines.push(`🗣️ *Langues d'enseignement :* ${profile.languages.join(' • ')}`);
  }
  if (profile?.advantages?.length) {
    lines.push('', '*✨ Nos atouts*');
    profile.advantages.forEach((a) => lines.push(`• ${a}`));
  }
  if (profile?.filieres?.length) {
    lines.push('', '*📚 Filières disponibles*');
    profile.filieres.forEach((f) => lines.push(`• ${f}`));
  }

  return lines.join('\n').trim();
}

/** Légende d'une photo de rubrique. */
function itemCaption(item) {
  const { emoji } = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.autre;
  const parts = [`${emoji} *${item.title}*`];

  // Élève méritant : la note et la classe vivent dans `extra`.
  const extra = item.extra || {};
  const details = [
    extra.student_name,
    extra.class_label,
    extra.grade ? `Moyenne : ${extra.grade}` : null,
    extra.year,
  ].filter(Boolean);
  if (details.length) parts.push(`_${details.join(' • ')}_`);

  if (item.description) parts.push(item.description);
  return parts.join('\n');
}

/** Liste texte d'une rubrique (utile quand un article n'a pas de photo). */
function topicText(category, items) {
  const { emoji, label } = CATEGORY_LABELS[category] || CATEGORY_LABELS.autre;
  const lines = [`*${emoji} ${label}*`, '━━━━━━━━━━━━━━━━━━━'];
  items.forEach((it) => {
    const extra = it.extra || {};
    const suffix = [extra.student_name, extra.grade ? `${extra.grade}/20` : null, extra.class_label]
      .filter(Boolean).join(' • ');
    lines.push(`• *${it.title}*${suffix ? ` — _${suffix}_` : ''}`);
    if (it.description) lines.push(`  ${it.description}`);
  });
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Envoi
// ─────────────────────────────────────────────────────────────────────────

/** Envoie les photos d'une rubrique (bornées à MAX_IMAGES_PER_TOPIC). */
async function sendTopicImages(schoolId, phone, items) {
  const withImage = items.filter((it) => it.image_url).slice(0, MAX_IMAGES_PER_TOPIC);
  let sent = 0;
  for (const it of withImage) {
    const res = await sendImage(schoolId, phone, it.image_url, itemCaption(it));
    if (res?.success) sent += 1;
    else console.warn('[showcase] photo non envoyée:', it.title, res?.message || res?.reason || '');
  }
  return { sent, total: withImage.length, skipped: items.length - withImage.length };
}

/**
 * Répond à une demande portant sur une rubrique précise.
 * @returns {Promise<boolean>} false si la rubrique est vide (rien envoyé)
 */
export async function sendTopic({ schoolId, phone, category, publicOnly = false }) {
  const items = await getShowcaseItems(schoolId, { category, publicOnly });
  if (items.length === 0) return false;

  await sendText(schoolId, phone, topicText(category, items));
  await sendTopicImages(schoolId, phone, items);
  return true;
}

/** Menu des rubriques disponibles ; mémorise l'ordre pour la réponse au numéro. */
export async function sendShowcaseMenu({ schoolId, phone, schoolName, publicOnly = false, stateSchoolId = schoolId }) {
  const profile = await getSchoolProfile(schoolId);
  const items = await getShowcaseItems(schoolId, { publicOnly });
  const groups = groupByCategory(items);

  const card = profileCard(profile, schoolName);
  if (card && card.split('\n').length > 2) {
    await sendText(schoolId, phone, card);
  }

  if (groups.length === 0) {
    const contact = contactLines(profile, schoolName);
    if (contact) await sendText(schoolId, phone, contact);
    else if (!card || card.split('\n').length <= 2) {
      await sendText(
        schoolId, phone,
        `🏫 Les informations de *${schoolName}* ne sont pas encore publiées ici.\n\n_Contactez l'administration de l'école._`,
      );
    }
    return;
  }

  const lines = ['*🏫 Que souhaitez-vous découvrir ?*', '━━━━━━━━━━━━━━━━━━━'];
  groups.forEach((g, i) => {
    const { emoji, label } = CATEGORY_LABELS[g.category] || CATEGORY_LABELS.autre;
    lines.push(`*${i + 1}.* ${emoji} ${label} _(${g.items.length})_`);
  });
  const contactIndex = groups.length + 1;
  lines.push(`*${contactIndex}.* 📞 Contacts & réseaux sociaux`);
  lines.push('');
  lines.push('_Répondez avec le numéro de votre choix._');

  State.setState(stateSchoolId, phone, {
    state: 'SCHOOL',
    showcaseCategories: groups.map((g) => g.category),
    showcasePublicOnly: publicOnly,
  });
  await sendText(schoolId, phone, lines.join('\n'));
}

/**
 * Traite la réponse au menu vitrine (état SCHOOL).
 * @returns {Promise<boolean>} true si le choix a été reconnu
 */
export async function handleShowcaseReply({ schoolId, phone, schoolName, text, stateSchoolId = schoolId }) {
  const state = State.getState(stateSchoolId, phone);
  const categories = state?.showcaseCategories || [];
  const publicOnly = !!state?.showcasePublicOnly;
  const choice = parseInt(String(text || '').trim(), 10);

  // Dernière entrée du menu = contacts & réseaux sociaux
  if (Number.isFinite(choice) && choice === categories.length + 1) {
    const profile = await getSchoolProfile(schoolId);
    const contact = contactLines(profile, schoolName);
    await sendText(
      schoolId, phone,
      contact || `📞 Les coordonnées de *${schoolName}* ne sont pas encore renseignées ici.`,
    );
    return true;
  }

  let category = Number.isFinite(choice) && choice >= 1 && choice <= categories.length
    ? categories[choice - 1]
    : null;

  // Le parent peut aussi écrire le nom de la rubrique (« cantine », « sport »…)
  if (!category) {
    const intent = detectShowcaseIntent(text);
    if (intent?.kind === 'topic' && categories.includes(intent.category)) category = intent.category;
  }

  if (!category) return false;

  const ok = await sendTopic({ schoolId, phone, category, publicOnly });
  if (!ok) {
    const { label } = CATEGORY_LABELS[category] || CATEGORY_LABELS.autre;
    await sendText(schoolId, phone, `Aucune information publiée pour « ${label} » pour le moment.`);
  }
  return true;
}

/**
 * Répond à une question libre qui concerne la vitrine (hors menu).
 * @returns {Promise<boolean>} true si la question a été traitée
 */
export async function handleShowcaseQuestion({ schoolId, phone, schoolName, text, publicOnly = false, stateSchoolId = schoolId }) {
  const intent = detectShowcaseIntent(text);
  if (!intent) return false;

  if (intent.kind === 'success') {
    const profile = await getSchoolProfile(schoolId);
    const line = successRateLine(profile);
    if (!line) return false;
    await sendText(schoolId, phone, `*🏫 ${schoolName}*\n${line}`);
    return true;
  }

  if (intent.kind === 'contact') {
    const profile = await getSchoolProfile(schoolId);
    const contact = contactLines(profile, schoolName);
    if (!contact) return false;
    await sendText(schoolId, phone, contact);
    return true;
  }

  if (intent.kind === 'topic') {
    return sendTopic({ schoolId, phone, category: intent.category, publicOnly });
  }

  // Présentation générale : carte + menu des rubriques
  const profile = await getSchoolProfile(schoolId);
  const items = await getShowcaseItems(schoolId, { publicOnly });
  if (!profile && items.length === 0) return false;
  await sendShowcaseMenu({ schoolId, phone, schoolName, publicOnly, stateSchoolId });
  return true;
}

/**
 * Contexte compact pour l'IA : permet à DeepSeek de répondre aux questions
 * nuancées sur l'école sans multiplier les détections de mots-clés.
 * @returns {Promise<string|null>}
 */
export async function buildShowcaseContext(schoolId, { publicOnly = false } = {}) {
  const [profile, items] = await Promise.all([
    getSchoolProfile(schoolId),
    getShowcaseItems(schoolId, { publicOnly }),
  ]);
  if (!profile && items.length === 0) return null;

  const ctx = {};
  if (profile) {
    if (profile.about) ctx.presentation = profile.about;
    if (profile.success_rate != null) {
      ctx.taux_de_reussite = {
        valeur: `${profile.success_rate} %`,
        annee: profile.success_rate_year || null,
        precision: profile.success_rate_note || null,
      };
    }
    if (profile.languages?.length) ctx.langues = profile.languages;
    if (profile.advantages?.length) ctx.atouts = profile.advantages;
    if (profile.filieres?.length) ctx.filieres = profile.filieres;
    const contacts = {
      telephone: profile.contact_phone,
      whatsapp: profile.contact_whatsapp,
      email: profile.contact_email,
      site: profile.website_url,
      facebook: profile.facebook_url,
      instagram: profile.instagram_url,
      tiktok: profile.tiktok_url,
      youtube: profile.youtube_url,
      localisation: profile.maps_url,
    };
    const filled = Object.entries(contacts).filter(([, v]) => v);
    if (filled.length) ctx.contacts = Object.fromEntries(filled);
  }

  if (items.length) {
    ctx.rubriques = groupByCategory(items).map(({ category, items: list }) => ({
      rubrique: CATEGORY_LABELS[category]?.label || category,
      elements: list.slice(0, 12).map((it) => ({
        titre: it.title,
        details: it.description || undefined,
        ...(it.extra?.student_name ? { eleve: it.extra.student_name } : {}),
        ...(it.extra?.grade ? { note: it.extra.grade } : {}),
        photo_disponible: !!it.image_url,
      })),
    }));
  }

  return JSON.stringify(ctx);
}
