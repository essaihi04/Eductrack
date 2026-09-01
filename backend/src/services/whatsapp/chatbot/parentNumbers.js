/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  AJOUT D'UN NUMÉRO PAR LE PARENT LUI-MÊME                             ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║  Un élève a presque toujours DEUX parents joignables — souvent trois  ║
 * ║  avec un tuteur ou un grand-parent. Jusqu'ici, seule l'administration ║
 * ║  pouvait ajouter le second numéro : la mère qui écrivait depuis son   ║
 * ║  téléphone tombait dans le silence réservé aux numéros inconnus.      ║
 * ║                                                                       ║
 * ║  Le parent déjà rattaché déclare donc lui-même le numéro à ajouter.   ║
 * ║  Le nouveau numéro rejoint le MÊME compte famille (parent_contacts) : ║
 * ║  il voit exactement les mêmes enfants, sans duplication de profil.    ║
 * ║                                                                       ║
 * ║  PROCÉDURE — trois garde-fous, parce qu'un numéro rattaché donne      ║
 * ║  accès aux notes, aux absences, aux factures et aux identifiants :    ║
 * ║                                                                       ║
 * ║   1. le parent en place saisit le numéro et dit qui c'est ;           ║
 * ║   2. le chatbot renvoie un CODE que le nouveau numéro doit envoyer    ║
 * ║      lui-même au WhatsApp de l'école — nul ne peut donc rattacher un  ║
 * ║      téléphone qu'il n'a pas en main, et c'est ce message entrant qui ║
 * ║      vaut consentement (Meta l'exige) ;                               ║
 * ║   3. le rattachement est confirmé aux DEUX numéros, jamais en silence.║
 * ║                                                                       ║
 * ║  Les demandes en attente vivent en mémoire, comme le reste de l'état  ║
 * ║  conversationnel (state.js) : un redémarrage annule les codes en      ║
 * ║  cours, le parent recommence — aucune donnée n'est perdue.            ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import { supabaseAdmin } from '../../../config/supabase.js';
import { sendText } from '../index.js';
import * as State from './state.js';
import { normalizeDigits } from './textUtils.js';

const CODE_TTL_MS = 30 * 60 * 1000;   // validité du code envoyé au 2ᵉ numéro
const MAX_CONTACTS = 3;               // titulaire + 2 (2ᵉ parent, tuteur)
const MAX_ESSAIS = 5;                 // codes erronés tolérés par numéro
const MAX_DEMANDES_JOUR = 3;          // demandes ouvertes par parent et par jour

// `schoolId:nouveauNumero` -> { code, parentId, parentPhone, label, expiresAt, essais }
const enAttente = new Map();
// `parentId:AAAA-MM-JJ` -> nombre de demandes émises
const quotidien = new Map();

const cle = (schoolId, phone) => `${schoolId}:${phone}`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

function purger() {
  const t = Date.now();
  for (const [k, v] of enAttente) if (v.expiresAt < t) enAttente.delete(k);
  // Le compteur quotidien ne sert que pour la journée en cours.
  const jour = aujourdhui();
  for (const k of quotidien.keys()) if (!k.endsWith(jour)) quotidien.delete(k);
}

// ─────────────────────────────────────────────────────────────────────────
// Numéros
// ─────────────────────────────────────────────────────────────────────────

/**
 * Met un numéro saisi à la main au format E.164.
 *
 * Les parents écrivent « 0612345678 », « 06 12 34 56 78 », « +212612345678 »,
 * « 212612345678 » ou « 612345678 » : les cinq désignent le même téléphone.
 *
 * @returns {string|null} numéro E.164, ou null si la saisie n'est pas un numéro
 */
export function toE164(raw) {
  // Les claviers arabes envoient ٠١٢٣ : le numéro est le même.
  let p = normalizeDigits(String(raw || '')).replace(/[\s.\-()/]/g, '');
  if (!p) return null;
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  if (/^0\d{9}$/.test(p)) p = `+212${p.slice(1)}`;          // 0612345678
  else if (/^212\d{9}$/.test(p)) p = `+${p}`;                // 212612345678
  else if (/^[5-7]\d{8}$/.test(p)) p = `+212${p}`;           // 612345678
  else if (!p.startsWith('+')) p = `+${p}`;
  return /^\+\d{9,15}$/.test(p) ? p : null;
}

/** Affichage lisible d'un numéro marocain : +212612345678 → 06 12 34 56 78 */
function joli(e164) {
  const m = /^\+212(\d{9})$/.exec(e164 || '');
  if (!m) return e164;
  const n = `0${m[1]}`;
  return `${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)} ${n.slice(8)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Textes (français / arabe)
// ─────────────────────────────────────────────────────────────────────────

const AR = (parentInfo) => parentInfo?.lang === 'ar';

const T = {
  intro: (ar, numeros, restants) => ar
    ? [
      '*📱 إضافة رقم آخر*',
      '━━━━━━━━━━━━━━━━━━━',
      'الأرقام المرتبطة حاليًا بحسابكم:',
      ...numeros,
      '',
      `يمكنكم إضافة ${restants} رقم إضافي.`,
      '',
      'أرسلوا الرقم الجديد (مثال: 0612345678).',
      '_اكتبوا *0* للإلغاء._',
    ].join('\n')
    : [
      '*📱 Ajouter un numéro*',
      '━━━━━━━━━━━━━━━━━━━',
      'Numéros déjà rattachés à votre compte :',
      ...numeros,
      '',
      `Vous pouvez encore en ajouter ${restants}.`,
      '',
      'Envoyez le numéro à ajouter (ex. 0612345678).',
      '_Tapez *0* pour annuler._',
    ].join('\n'),

  complet: (ar) => ar
    ? `⚠️ حسابكم يتوفر على الحد الأقصى من الأرقام (${MAX_CONTACTS}). اتصلوا بالإدارة لتغيير أحدها.`
    : `⚠️ Votre compte a déjà le maximum de numéros (${MAX_CONTACTS}). Contactez l'administration pour en remplacer un.`,

  invalide: (ar) => ar
    ? '🤔 هذا لا يبدو رقم هاتف. أرسلوا الرقم في شكل 0612345678، أو *0* للإلغاء.'
    : "🤔 Ce n'est pas un numéro de téléphone. Envoyez-le sous la forme 0612345678, ou *0* pour annuler.",

  deja: (ar, num) => ar
    ? `ℹ️ الرقم ${num} مرتبط بالفعل بحسابكم.`
    : `ℹ️ Le numéro ${num} est déjà rattaché à votre compte.`,

  pris: (ar) => ar
    ? "⚠️ هذا الرقم مرتبط بحساب ولي أمر آخر في المؤسسة. المرجو الاتصال بالإدارة."
    : "⚠️ Ce numéro est déjà rattaché à un autre compte parent de l'établissement. Contactez l'administration.",

  qui: (ar, num) => ar
    ? [
      `📱 الرقم: *${num}*`,
      '',
      'من صاحب هذا الرقم؟',
      '*1.* 👨 الأب',
      '*2.* 👩 الأم',
      '*3.* 🧑 ولي الأمر (وصي)',
      '*4.* 👤 قريب آخر',
      '',
      '_اكتبوا *0* للإلغاء._',
    ].join('\n')
    : [
      `📱 Numéro : *${num}*`,
      '',
      'Qui est le titulaire de ce numéro ?',
      '*1.* 👨 Le père',
      '*2.* 👩 La mère',
      '*3.* 🧑 Le tuteur / la tutrice',
      '*4.* 👤 Un autre proche',
      '',
      '_Tapez *0* pour annuler._',
    ].join('\n'),

  code: (ar, num, code, enfants) => ar
    ? [
      '*🔐 خطوة أخيرة للتأكيد*',
      '━━━━━━━━━━━━━━━━━━━',
      `اطلبوا من صاحب الرقم *${num}* أن يرسل الرمز التالي إلى رقم واتساب المؤسسة (هذا الرقم):`,
      '',
      `*${code}*`,
      '',
      `بمجرد إرساله، سيتوصل بمعلومات ${enfants} مثلكم تمامًا.`,
      '_الرمز صالح لمدة 30 دقيقة._',
    ].join('\n')
    : [
      '*🔐 Dernière étape*',
      '━━━━━━━━━━━━━━━━━━━',
      `Demandez au titulaire du *${num}* d'envoyer ce code au WhatsApp de l'école (ce numéro) :`,
      '',
      `*${code}*`,
      '',
      `Dès qu'il l'aura envoyé, il recevra les informations de ${enfants}, comme vous.`,
      '_Le code est valable 30 minutes._',
    ].join('\n'),

  annule: (ar) => ar ? '❌ تم إلغاء الإضافة.' : "❌ Ajout annulé.",

  trop: (ar) => ar
    ? "⚠️ لقد طلبتم إضافة عدة أرقام اليوم. حاولوا غدًا أو اتصلوا بالإدارة."
    : "⚠️ Vous avez demandé plusieurs ajouts aujourd'hui. Réessayez demain ou contactez l'administration.",

  confirmeTitulaire: (ar, num, rang, label) => ar
    ? `✅ تم ربط الرقم *${num}* بحسابكم (${label} — الرقم ${rang}). سيتوصل من الآن فصاعدًا بأخبار أبنائكم.`
    : `✅ Le *${num}* est rattaché à votre compte (${label} — numéro ${rang}). Il recevra désormais les informations de vos enfants.`,

  bienvenue: (ar, ecole, enfants, label) => ar
    ? [
      `✅ تم ربط رقمكم بحساب أسرة *${ecole}* بصفة: ${label}.`,
      '',
      `ستتوصلون بمعلومات: ${enfants}.`,
      '',
      '_اكتبوا *menu* لعرض الخيارات._',
    ].join('\n')
    : [
      `✅ Votre numéro est rattaché au compte famille de *${ecole}* en tant que ${label}.`,
      '',
      `Vous recevrez les informations de : ${enfants}.`,
      '',
      '_Tapez *menu* pour afficher les options._',
    ].join('\n'),
};

const LABELS = {
  1: { fr: 'Père', ar: 'الأب' },
  2: { fr: 'Mère', ar: 'الأم' },
  3: { fr: 'Tuteur', ar: 'ولي الأمر' },
  4: { fr: 'Proche', ar: 'قريب' },
};

// ─────────────────────────────────────────────────────────────────────────
// Lecture du compte
// ─────────────────────────────────────────────────────────────────────────

/** Numéros WhatsApp déjà rattachés au compte parent (contacts + profil). */
async function numerosDuParent(parentId) {
  const [{ data: contacts }, { data: profil }] = await Promise.all([
    supabaseAdmin
      .from('parent_contacts')
      .select('phone_e164, label, is_primary, created_at')
      .eq('parent_id', parentId)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: true }),
    supabaseAdmin.from('profiles').select('phone').eq('id', parentId).maybeSingle(),
  ]);

  const liste = (contacts || []).map((c) => ({
    phone: c.phone_e164, label: c.label, primaire: c.is_primary,
  }));
  // Le numéro porté par le profil n'est pas toujours dans parent_contacts
  // (imports anciens) : il compte pourtant, getParentByPhone le reconnaît.
  if (profil?.phone && !liste.some((l) => l.phone === profil.phone)) {
    liste.unshift({ phone: profil.phone, label: null, primaire: true });
  }
  return liste;
}

/** Le numéro appartient-il déjà à un AUTRE compte parent de l'école ? */
async function dejaPris(phone, schoolId, parentId) {
  const { data: contacts } = await supabaseAdmin
    .from('parent_contacts')
    .select('parent_id, profiles:parent_id!inner(id, school_id)')
    .eq('phone_e164', phone)
    .eq('channel', 'whatsapp')
    .eq('profiles.school_id', schoolId)
    .limit(5);
  if ((contacts || []).some((c) => c.parent_id !== parentId)) return true;

  const { data: profils } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'parent')
    .eq('school_id', schoolId)
    .eq('phone', phone)
    .limit(5);
  return (profils || []).some((p) => p.id !== parentId);
}

/** Prénoms des enfants du compte, pour dire au nouveau numéro ce qu'il verra. */
async function prenomsEnfants(parentId) {
  const { data } = await supabaseAdmin
    .from('parent_students')
    .select('student:student_id(first_name, last_name)')
    .eq('parent_id', parentId);
  const noms = (data || [])
    .map((l) => `${l.student?.first_name || ''} ${l.student?.last_name || ''}`.trim())
    .filter(Boolean);
  return noms.length ? noms.join(', ') : 'vos enfants';
}

// ─────────────────────────────────────────────────────────────────────────
// Parcours du parent déjà rattaché
// ─────────────────────────────────────────────────────────────────────────

/** Option « Ajouter un numéro » du menu Compte. */
export async function startAddNumberFlow({ schoolId, phone, parentInfo }) {
  const ar = AR(parentInfo);
  const existants = await numerosDuParent(parentInfo.parent_id);

  if (existants.length >= MAX_CONTACTS) {
    State.setMenu(schoolId, phone, 'account');
    return sendText(schoolId, phone, T.complet(ar));
  }

  const compteur = quotidien.get(`${parentInfo.parent_id}:${aujourdhui()}`) || 0;
  if (compteur >= MAX_DEMANDES_JOUR) {
    State.setMenu(schoolId, phone, 'account');
    return sendText(schoolId, phone, T.trop(ar));
  }

  const lignes = existants.length
    ? existants.map((c, i) => {
      const suffixe = c.label ? ` _(${c.label})_` : (c.primaire ? ` _(${ar ? 'الرقم الرئيسي' : 'principal'})_` : '');
      return `*${i + 1}.* 📞 ${joli(c.phone)}${suffixe}`;
    })
    : [`*1.* 📞 ${joli(phone)}${ar ? ' _(هذا الرقم)_' : ' _(ce numéro)_'}`];

  State.setState(schoolId, phone, { state: 'ADDNUM', addNumStep: 'phone', addNumPhone: null });
  return sendText(schoolId, phone, T.intro(ar, lignes, MAX_CONTACTS - existants.length));
}

/**
 * Réponse du parent pendant le parcours d'ajout.
 * @returns {Promise<boolean>} true si le message a été consommé
 */
export async function handleAddNumberReply({ schoolId, phone, text, parentInfo, state }) {
  if (state?.state !== 'ADDNUM') return false;
  const ar = AR(parentInfo);
  const saisie = normalizeDigits(String(text || '')).trim();

  // Sortie explicite, à toutes les étapes.
  if (/^(0|annuler|stop|non|إلغاء|لا)$/i.test(saisie)) {
    State.setMenu(schoolId, phone, 'account');
    await sendText(schoolId, phone, T.annule(ar));
    return true;
  }

  // ── Étape 1 : le numéro ──
  if (state.addNumStep === 'phone') {
    const e164 = toE164(saisie);
    if (!e164) {
      await sendText(schoolId, phone, T.invalide(ar));
      return true;
    }
    if (e164 === phone) {
      await sendText(schoolId, phone, T.deja(ar, joli(e164)));
      return true;
    }
    const existants = await numerosDuParent(parentInfo.parent_id);
    if (existants.some((c) => c.phone === e164)) {
      await sendText(schoolId, phone, T.deja(ar, joli(e164)));
      return true;
    }
    if (existants.length >= MAX_CONTACTS) {
      State.setMenu(schoolId, phone, 'account');
      await sendText(schoolId, phone, T.complet(ar));
      return true;
    }
    if (await dejaPris(e164, parentInfo.school_id, parentInfo.parent_id)) {
      State.setMenu(schoolId, phone, 'account');
      await sendText(schoolId, phone, T.pris(ar));
      return true;
    }

    State.setState(schoolId, phone, { addNumStep: 'label', addNumPhone: e164 });
    await sendText(schoolId, phone, T.qui(ar, joli(e164)));
    return true;
  }

  // ── Étape 2 : qui est-ce ? → génération du code ──
  if (state.addNumStep === 'label') {
    // État tronqué (redémarrage du serveur entre les deux étapes) : on
    // redemande le numéro plutôt que de continuer à vide.
    if (!state.addNumPhone) {
      State.setState(schoolId, phone, { addNumStep: 'phone' });
      await sendText(schoolId, phone, T.invalide(ar));
      return true;
    }
    const choix = LABELS[saisie];
    if (!choix) {
      await sendText(schoolId, phone, T.qui(ar, joli(state.addNumPhone)));
      return true;
    }
    const label = ar ? choix.ar : choix.fr;
    const nouveau = state.addNumPhone;

    purger();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    enAttente.set(cle(parentInfo.school_id, nouveau), {
      code,
      parentId: parentInfo.parent_id,
      parentPhone: phone,
      schoolId: parentInfo.school_id,
      schoolName: parentInfo.school_name,
      label: choix.fr,           // stocké en français : c'est la langue de la base
      lang: parentInfo.lang,
      expiresAt: Date.now() + CODE_TTL_MS,
      essais: 0,
    });

    const jour = `${parentInfo.parent_id}:${aujourdhui()}`;
    quotidien.set(jour, (quotidien.get(jour) || 0) + 1);

    State.setMenu(schoolId, phone, 'account');
    const enfants = await prenomsEnfants(parentInfo.parent_id);
    await sendText(schoolId, phone, T.code(ar, joli(nouveau), code, enfants));
    console.log(`[chatbot/numeros] code émis pour ${nouveau} par le parent ${parentInfo.parent_id}`);
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────
// Côté NOUVEAU numéro : il envoie le code
// ─────────────────────────────────────────────────────────────────────────

/**
 * Le message d'un numéro inconnu est-il le code d'un rattachement en attente ?
 *
 * Appelé AVANT le silence réservé aux inconnus. Un message qui n'est pas un
 * code (ou un code faux) rend la main : le numéro reste inconnu, on ne lui
 * révèle rien — surtout pas qu'une demande existe.
 *
 * @returns {Promise<boolean>} true si le rattachement a été fait
 */
export async function tryPairingCode({ schoolId, phone, text }) {
  purger();
  const attente = enAttente.get(cle(schoolId, phone));
  if (!attente) return false;

  const saisie = normalizeDigits(String(text || '')).replace(/[\s.\-]/g, '');
  if (!/^\d{6}$/.test(saisie)) return false;

  if (saisie !== attente.code) {
    attente.essais += 1;
    if (attente.essais >= MAX_ESSAIS) {
      enAttente.delete(cle(schoolId, phone));
      console.warn(`[chatbot/numeros] ${MAX_ESSAIS} codes erronés depuis ${phone} — demande annulée`);
    }
    return false;   // silence : un code faux n'apprend rien à celui qui essaie
  }

  enAttente.delete(cle(schoolId, phone));

  // Rang du nouveau numéro dans la famille (2ᵉ parent, 3ᵉ…).
  const existants = await numerosDuParent(attente.parentId);
  if (existants.length >= MAX_CONTACTS) {
    await sendText(schoolId, attente.parentPhone,
      `⚠️ Le rattachement du ${joli(phone)} a échoué : votre compte a atteint ${MAX_CONTACTS} numéros.`);
    return true;
  }
  const rang = existants.length + 1;

  const { error } = await supabaseAdmin
    .from('parent_contacts')
    .upsert({
      parent_id: attente.parentId,
      phone_e164: phone,
      channel: 'whatsapp',
      is_primary: false,
      label: attente.label,
      consent_status: 'opted_in',
      consent_at: new Date().toISOString(),
      consent_source: 'whatsapp_parent_add',
    }, { onConflict: 'parent_id,phone_e164,channel' });

  if (error) {
    console.error('[chatbot/numeros] rattachement impossible:', error.message);
    await sendText(schoolId, phone,
      "⚠️ Le rattachement n'a pas pu être enregistré. Contactez l'établissement.");
    return true;
  }

  console.log(`[chatbot/numeros] ${phone} rattaché au parent ${attente.parentId} (${attente.label}, rang ${rang})`);

  const ar = attente.lang === 'ar';
  const enfants = await prenomsEnfants(attente.parentId);
  const labelAffiche = ar
    ? (Object.values(LABELS).find((l) => l.fr === attente.label)?.ar || attente.label)
    : attente.label;

  // Le nouveau numéro vient d'écrire : sa fenêtre de 24 h est ouverte, le
  // texte part librement.
  await sendText(schoolId, phone, T.bienvenue(ar, attente.schoolName, enfants, labelAffiche));
  await sendText(schoolId, attente.parentPhone,
    T.confirmeTitulaire(ar, joli(phone), rang, labelAffiche));
  return true;
}

/** Nombre de rattachements en attente (supervision / tests). */
export function pendingCount() {
  purger();
  return enAttente.size;
}
