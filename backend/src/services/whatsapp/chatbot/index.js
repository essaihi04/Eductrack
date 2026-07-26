/**
 * Orchestrateur du chatbot WhatsApp v2.
 *
 * Architecture :
 *   1. Message entrant Baileys → handleBaileysIncoming
 *   2. Identification du parent via numéro
 *   3. State machine :
 *        - Pas d'enfant sélectionné → menu de sélection enfant
 *        - Enfant sélectionné → menu principal (pédago / finance / IA)
 *        - Sous-menu → réponses prédéfinies déterministes (DB)
 *        - Mode IA → DeepSeek avec contexte élève
 *
 * IMPORTANT : DeepSeek IA n'est invoqué QUE si l'utilisateur choisit
 * explicitement "💬 Question libre" dans le menu principal.
 */

import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { downloadMediaMessage } from 'baileys';
import { supabaseAdmin } from '../../../config/supabase.js';
import { sendText } from '../index.js';
import { runAsChatbot } from '../outboundGate.js';
import { setWhatsappOptOut, setTransportSkipToday } from '../../notificationRouter.js';
import { markResponded } from '../../communicationTracking.js';
import {
  saveProfilePhotoBuffer,
  deleteProfilePhotoByUrl,
  setStudentAvatarUrl,
} from '../../../utils/profilePhoto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { categorizeIncoming } from '../../../utils/whatsappCategory.js';
import * as State from './state.js';
import { MENUS, sendMenu, matchMenuOption } from './menus.js';
import { answerWithAI, detectSpecialCommand, menuFooterForText, isBulletinQuery, detectSemester, isFullWeekTimetableQuery, isMassarQuery } from './ai.js';
import { getReceptionistByPhone, answerSchoolAI, receptionistWelcome, receptionistFooter } from './adminAi.js';
import { detectCredentialRequest, handleCredentialRequest } from './credentials.js';
import { maybeHandleDemoParent } from './demoParent.js';
import { handleAbsenceReply } from './absenceJustification.js';
import * as A from './answers.js';
import { generateInvoicePdfById } from './invoicePdf.js';
import { sendMediaBuffer, sendImage } from '../index.js';
import { getSocket } from '../baileysClient.js';
import { simulateRead } from '../antiBan.js';
import { generateBulletinPdfById } from '../../bulletins/bulletinPdf.js';
import { generateTimetablePdfForStudent } from '../../bulletins/timetablePdf.js';
import { generatePreview } from '../../dailyReports.js';
import { isSuppliesQuery, handleSuppliesRequest, handleSuppliesLevelReply } from './supplies.js';
import { handlePublicMessage } from './publicChatbot.js';
import { handleShowcaseQuestion, handleShowcaseReply, sendShowcaseMenu } from './showcase.js';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Envoie une photo sur WhatsApp en lisant le fichier sur le disque local en
 * priorité (pas d'aller-retour réseau), avec repli sur l'URL absolue.
 * `photoUrl` est soit un chemin relatif (/uploads/...) soit une URL http(s).
 */
async function sendPhotoLocalFirst(schoolId, phone, photoUrl, caption) {
  if (!photoUrl) return { success: false, message: 'no_url' };
  const localPath = join(__dirname, '../../../..', photoUrl);
  if (!photoUrl.startsWith('http') && fs.existsSync(localPath)) {
    const buf = fs.readFileSync(localPath);
    return sendMediaBuffer(schoolId, phone, buf, { type: 'image', caption }, { urgent: true });
  }
  const base = process.env.PUBLIC_BASE_URL || 'https://etrack.ma';
  const url = photoUrl.startsWith('http') ? photoUrl : `${base}${photoUrl}`;
  return sendImage(schoolId, phone, url, caption, { urgent: true });
}

/**
 * Génère et envoie le PDF paysage de l'emploi du temps hebdomadaire.
 * Retourne true si envoyé, false si emploi du temps vide ou erreur.
 */
async function sendTimetablePdf(schoolId, phone, student) {
  try {
    const pdf = await generateTimetablePdfForStudent(student.id);
    if (!pdf?.buffer) {
      await sendText(schoolId, phone,
        `📅 L'emploi du temps de *${student.first_name}* n'a pas encore été configuré.\n_Contactez l'administration de l'école._`,
        { urgent: true });
      return false;
    }
    await sendMediaBuffer(schoolId, phone, pdf.buffer, {
      type: 'document',
      fileName: pdf.fileName,
      mimetype: 'application/pdf',
      caption: `📅 Emploi du temps hebdomadaire de *${student.first_name} ${student.last_name}*`,
    }, { urgent: true });
    return true;
  } catch (e) {
    console.error('[chatbot] sendTimetablePdf error:', e.message);
    return false;
  }
}

/**
 * Envoie les PDFs des bulletins publiés d'un élève via WhatsApp.
 * Appelé soit depuis le menu (option 7), soit depuis l'IA si la question
 * contient "bulletin", "كشف النقط", etc.
 *
 * @param {string} schoolId
 * @param {string} phone
 * @param {object} student
 * @param {number|null} semester  - si fourni, n'envoie que les bulletins de ce semestre
 * @returns {Promise<number>} nombre de PDFs envoyés
 */
async function sendBulletinPdfs(schoolId, phone, student, semester = null) {
  try {
    let q = supabaseAdmin
      .from('bulletins')
      .select('id, semester, academic_year')
      .eq('student_id', student.id)
      .in('status', ['published', 'sent'])
      .order('academic_year', { ascending: false })
      .order('semester', { ascending: false });
    if (semester === 1 || semester === 2) q = q.eq('semester', semester);
    const { data: pubBulletins } = await q.limit(2);
    if (!pubBulletins || pubBulletins.length === 0) return 0;

    let count = 0;
    for (const b of pubBulletins) {
      const pdf = await generateBulletinPdfById(b.id);
      if (pdf?.buffer) {
        await sendMediaBuffer(schoolId, phone, pdf.buffer, {
          type: 'document',
          fileName: pdf.fileName,
          mimetype: 'application/pdf',
          caption: `📄 Bulletin ${b.academic_year} — Semestre ${b.semester}`,
        }, { urgent: true });
        count++;
      }
    }
    return count;
  } catch (e) {
    console.error('[chatbot] sendBulletinPdfs error:', e.message);
    return 0;
  }
}

/**
 * Tente de répondre depuis la vitrine de l'école (cantine, sport, équipements,
 * taux de réussite, réseaux sociaux…) AVANT de solliciter l'IA. Placé sur les
 * seuls chemins « question libre » : les options de menu gardent la priorité,
 * donc « Activités parascolaires » continue de renvoyer les inscriptions de
 * l'élève et non la galerie photos.
 *
 * @returns {Promise<boolean>} true si la vitrine a répondu
 */
async function tryShowcaseAnswer({ schoolId, phone, parentInfo, text }) {
  try {
    return await handleShowcaseQuestion({
      schoolId: parentInfo.school_id,
      stateSchoolId: schoolId,
      phone,
      schoolName: parentInfo.school_name,
      text,
    });
  } catch (e) {
    console.error('[chatbot] vitrine école:', e.message);
    return false;
  }
}

/**
 * Répond directement au parent qui demande le code Massar / code secret de son
 * enfant en texte libre (FR / arabe / darija), sans passer par l'IA. Retourne
 * true si la demande a été détectée et traitée.
 */
async function maybeAnswerMassar(schoolId, phone, student, parentInfo, text) {
  if (!isMassarQuery(text)) return false;
  const reply = await A.getMassarCode(student, parentInfo);
  await sendText(schoolId, phone, reply, { urgent: true });
  setTimeout(() => {
    sendText(schoolId, phone, `_Tapez *menu* pour d'autres options._`, { urgent: true });
  }, 1500);
  return true;
}

/**
 * Génère et envoie À LA DEMANDE le rapport de suivi du jour de l'élève
 * (consultation). Réutilise le même moteur IA que les rapports quotidiens
 * automatiques (generatePreview) mais SANS rien marquer comme « envoyé » :
 * c'est une simple consultation, indépendante de l'envoi programmé.
 */
async function sendDailyReportNow(schoolId, phone, student, parentInfo) {
  await sendText(
    schoolId,
    phone,
    `📊 Préparation du rapport de suivi de *${student.first_name}*… _un instant._`,
    { urgent: true }
  );
  try {
    const result = await generatePreview(student.id, schoolId);
    if (!result?.success || result?.error) {
      await sendText(
        schoolId,
        phone,
        `📊 ${result?.error || "Aucune donnée de suivi disponible aujourd'hui."}\n\n_Le rapport sera consultable dès qu'un professeur aura renseigné une séance._\n\n_Tapez *menu* pour d'autres options._`,
        { urgent: true }
      );
      return;
    }
    const report = result.report || {};
    let msg = '';
    if (report.fr) msg += report.fr;
    if (report.fr && report.ar) msg += '\n\n━━━━━━━━━━━━━━━\n\n';
    if (report.ar) msg += report.ar;
    if (!msg.trim()) {
      await sendText(schoolId, phone, `📊 Rapport indisponible pour le moment. Réessayez plus tard.`, { urgent: true });
      return;
    }
    await sendText(schoolId, phone, msg, { urgent: true });
    setTimeout(() => {
      sendText(schoolId, phone, `_Tapez *menu* pour d'autres options._`, { urgent: true });
    }, 1500);
  } catch (e) {
    console.error('[chatbot] sendDailyReportNow error:', e.message);
    await sendText(schoolId, phone, `⚠️ Erreur lors de la génération du rapport. Veuillez réessayer.`, { urgent: true });
  }
}

function normalizePhone(phone) {
  let p = String(phone || '').replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/\s+/g, '');
  if (!p.startsWith('+')) p = '+' + p;
  return p;
}

async function getParentByPhone(phone, schoolId = null) {
  // Cherche d'abord dans parent_contacts (numéro WhatsApp dédié).
  // IMPORTANT : un même numéro peut être enregistré pour des parents
  // appartenant à plusieurs écoles. On DOIT filtrer par schoolId (l'école
  // qui a reçu le message via sa session Baileys) sinon on risque de router
  // la conversation vers la mauvaise école (silence total à l'envoi car la
  // session de l'autre école n'est pas connectée).
  let parentId = null;
  let resolvedSchoolId = schoolId;

  let contactsQuery = supabaseAdmin
    .from('parent_contacts')
    .select('parent_id, profiles:parent_id!inner(id, school_id, first_name, last_name)')
    .eq('phone_e164', phone)
    .eq('channel', 'whatsapp');
  if (schoolId) {
    contactsQuery = contactsQuery.eq('profiles.school_id', schoolId);
  }
  const { data: contacts } = await contactsQuery.limit(1);

  if (contacts && contacts.length > 0) {
    parentId = contacts[0].parent_id;
    resolvedSchoolId = contacts[0].profiles?.school_id || schoolId;
  } else {
    // Fallback : profiles.phone
    let q = supabaseAdmin
      .from('profiles')
      .select('id, school_id, first_name, last_name, schools(name)')
      .eq('role', 'parent')
      .eq('phone', phone);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data: profs } = await q.limit(1);
    if (profs && profs.length > 0) {
      parentId = profs[0].id;
      resolvedSchoolId = profs[0].school_id;
    }
  }

  if (!parentId) return null;

  // Charge nom + école
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, school_id, schools(name)')
    .eq('id', parentId)
    .single();

  if (!profile) return null;

  // Un profil parent SANS aucun élève rattaché n'est pas un parent joignable :
  // c'est soit un profil orphelin laissé par une suppression, soit un parent
  // dissocié de tous ses enfants. Le numéro doit alors être traité comme
  // INCONNU (silence, ou chatbot visiteur si l'école l'a activé) plutôt que de
  // révéler qu'il est enregistré à l'école.
  const { count: linkCount } = await supabaseAdmin
    .from('parent_students')
    .select('student_id', { count: 'exact', head: true })
    .eq('parent_id', profile.id);
  if (!linkCount) {
    console.log(`[chatbot] parent ${profile.id} sans élève rattaché → numéro traité comme inconnu`);
    return null;
  }

  return {
    parent_id: profile.id,
    parent_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
    school_id: profile.school_id,
    school_name: profile.schools?.name || 'École',
  };
}

async function getParentChildren(parentId) {
  const { data: links } = await supabaseAdmin
    .from('parent_students')
    .select('student:student_id(id, first_name, last_name, class_id, massar_code, massar_secret, classes!fk_profiles_class(name))')
    .eq('parent_id', parentId);

  return (links || [])
    .map((l) => l.student)
    .filter(Boolean)
    .map((s) => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      class_id: s.class_id,
      class_name: s.classes?.name || null,
      massar_code: s.massar_code || null,
      massar_secret: s.massar_secret || null,
    }));
}

/**
 * Charge un élève UNIQUEMENT s'il est encore rattaché à ce parent.
 *
 * ⚠️ Sécurité : l'état conversationnel garde `studentId` en mémoire pendant
 * 30 min (rafraîchi à chaque message). Sans cette vérification, un parent
 * dissocié — ou supprimé alors que son profil survit — continuerait à recevoir
 * les notes, absences, factures et identifiants de l'élève. La source de
 * vérité est donc la table parent_students, relue à chaque message.
 */
async function getLinkedStudent(parentId, studentId) {
  if (!parentId || !studentId) return null;
  const { data: link } = await supabaseAdmin
    .from('parent_students')
    .select('student_id')
    .eq('parent_id', parentId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (!link) {
    console.warn(`[chatbot] élève ${studentId} n'est plus rattaché au parent ${parentId} — accès refusé`);
    return null;
  }
  return getStudentById(studentId);
}

async function getStudentById(studentId) {
  const { data: s } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, class_id, massar_code, massar_secret, classes!fk_profiles_class(name)')
    .eq('id', studentId)
    .single();
  if (!s) return null;
  return { ...s, class_name: s.classes?.name || null };
}

// ─────────────────────────────────────────────────────────────────────────
// Localisation domicile (transport scolaire)
// ─────────────────────────────────────────────────────────────────────────

/** Saisie "appliquer à tous les enfants" (FR / AR / EN). */
const APPLY_ALL_RE = /^(0|tous|toutes|all|الكل|كلهم|للجميع)[\s!.]*$/i;

/** Texte d'instructions pour partager sa position via WhatsApp. */
function locationInstructions(studentName) {
  return [
    `*📍 Localisation domicile (transport)*`,
    '━━━━━━━━━━━━━━━━━━━',
    `Pour enregistrer votre adresse${studentName ? ` pour *${studentName}*` : ''} :`,
    '',
    `*1.* Appuyez sur 📎 (trombone) ou ➕ dans WhatsApp`,
    `*2.* Choisissez *Localisation*`,
    `*3.* Envoyez votre *position actuelle* (depuis chez vous)`,
    '',
    `_Votre position sera enregistrée dans le profil transport de votre enfant, même s'il n'est pas encore inscrit au bus scolaire._`,
  ].join('\n');
}

/**
 * Détecte une question libre du parent sur l'envoi / la modification de sa
 * localisation ou adresse de transport (FR / AR / darija). Dans ce cas on
 * répond avec les instructions de partage au lieu de passer par l'IA.
 */
function isLocationHelpQuery(text) {
  const t = String(text || '').toLowerCase();
  const mentionsLocation = /(localisation|position|adresse|gps|موقع|الموقع|عنوان|العنوان)/i.test(t);
  if (!mentionsLocation) return false;
  const actionIntent = /(envoyer|envoie|partager|partage|changer|change|modifier|modifie|mettre|enregistrer|enregistre|ajouter|ajoute|comment|كيفاش|كيف|باش|أرسل|نرسل|بغيت|تغيير|نبدل|تسجيل)/i.test(t);
  const transportContext = /(transport|bus|ramassage|domicile|maison|النقل|الحافلة|طوبيس|الدار|المنزل)/i.test(t);
  return actionIntent || transportContext;
}

/**
 * Enregistre la position GPS dans le profil transport de l'élève
 * (profiles.home_lat / home_lng / home_address). Aucune affectation bus
 * n'est requise : la position est prête pour une future configuration.
 */
async function saveStudentHomeLocation(studentId, location) {
  const update = { home_lat: location.lat, home_lng: location.lng };
  const addr = [location.name, location.address].filter(Boolean).join(' — ');
  if (addr) update.home_address = addr;
  const { error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .eq('id', studentId)
    .eq('role', 'student');
  if (error) {
    console.error('[chatbot] saveStudentHomeLocation error:', error.message);
    return false;
  }
  return true;
}

async function hasActiveBusAssignment(studentId) {
  const { data } = await supabaseAdmin
    .from('bus_assignments')
    .select('id')
    .eq('student_id', studentId)
    .eq('active', true)
    .limit(1);
  return !!(data && data.length > 0);
}

/** Message de confirmation après enregistrement de la position. */
async function locationSavedMessage(child, location) {
  const lines = [
    `✅ *Localisation enregistrée* pour *${child.first_name} ${child.last_name}*`,
    `📍 ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`,
  ];
  const addr = [location.name, location.address].filter(Boolean).join(' — ');
  if (addr) lines.push(`🏠 ${addr}`);
  const onBus = await hasActiveBusAssignment(child.id);
  if (onBus) {
    lines.push('', `🚌 Le trajet du bus sera mis à jour avec cette adresse.`);
  } else {
    lines.push('', `🚌 _${child.first_name} n'est pas encore inscrit(e) au bus : votre position est enregistrée et sera utilisée dès son inscription au transport._`);
  }
  return lines.join('\n');
}

/**
 * Traite un message de localisation WhatsApp envoyé par le parent.
 *  - Enfant déjà sélectionné → enregistrement direct (+ proposition "tous")
 *  - Un seul enfant → enregistrement direct
 *  - Plusieurs enfants, aucun sélectionné → demande de sélection (ou "tous")
 */
async function handleLocationMessage({ location, phone, parentInfo, incomingMsgId }) {
  const schoolId = parentInfo.school_id;
  const children = await getParentChildren(parentInfo.parent_id);

  if (children.length === 0) {
    await sendText(schoolId, phone, `Aucun enfant n'est rattaché à votre numéro. Contactez ${parentInfo.school_name}.`, { urgent: true });
    await markProcessed(incomingMsgId);
    return;
  }

  const state = State.getState(schoolId, phone);
  const selected = state?.studentId
    ? children.find((c) => c.id === state.studentId)
    : null;

  // Cible unique : enfant sélectionné ou enfant unique
  const target = selected || (children.length === 1 ? children[0] : null);

  if (target) {
    const ok = await saveStudentHomeLocation(target.id, location);
    if (!ok) {
      await sendText(schoolId, phone, `⚠️ Erreur lors de l'enregistrement de votre position. Veuillez réessayer.`, { urgent: true });
      await markProcessed(incomingMsgId);
      return;
    }
    let msg = await locationSavedMessage(target, location);
    if (children.length > 1) {
      // Propose d'appliquer la même adresse aux frères et sœurs
      State.setState(schoolId, phone, { lastLocation: location });
      msg += `\n\n_Répondez *tous* pour appliquer cette adresse à tous vos enfants (${children.length})._`;
    }
    await sendText(schoolId, phone, msg, { urgent: true });
    await markProcessed(incomingMsgId);
    return;
  }

  // Plusieurs enfants, aucun sélectionné → demander pour quel enfant
  const lines = [
    `*📍 Localisation reçue*`,
    '━━━━━━━━━━━━━━━━━━━',
    `Pour quel enfant souhaitez-vous enregistrer cette adresse (transport scolaire) ?`,
    '',
  ];
  children.forEach((c, i) => {
    lines.push(`*${i + 1}.* 👶 ${c.first_name} ${c.last_name}${c.class_name ? ` _(${c.class_name})_` : ''}`);
  });
  lines.push(`*0.* 👨‍👩‍👧 Tous mes enfants`);
  lines.push('');
  lines.push(`_Répondez avec le numéro de votre choix._`);

  State.setState(schoolId, phone, {
    state: 'CHILD',
    pendingLocation: location,
    childrenList: children.map((c) => c.id),
  });
  await sendText(schoolId, phone, lines.join('\n'), { urgent: true });
  await markProcessed(incomingMsgId);
}

/** Applique une position à tous les enfants du parent et confirme. */
async function applyLocationToAllChildren({ location, phone, parentInfo }) {
  const children = await getParentChildren(parentInfo.parent_id);
  let okCount = 0;
  for (const c of children) {
    if (await saveStudentHomeLocation(c.id, location)) okCount += 1;
  }
  await sendText(
    parentInfo.school_id,
    phone,
    `✅ Localisation enregistrée pour *${okCount}/${children.length}* enfant(s).\n📍 ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}\n\n_Tapez *menu* pour d'autres options._`,
    { urgent: true }
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Photo de profil (envoyée par le parent via WhatsApp)
// ─────────────────────────────────────────────────────────────────────────

const PHOTO_YES_RE = /^(oui|yes|ok|d'?accord|واخا|نعم|اه|أجل|wakha|confirmer?)[\s!.]*$/i;
const PHOTO_NO_RE = /^(non|no|annuler|cancel|لا|ماشي|الغاء|إلغاء)[\s!.]*$/i;

/** Texte d'instructions pour envoyer la photo de profil de l'enfant. */
function photoInstructions(studentName) {
  return [
    `*📷 Photo de profil${studentName ? ` de ${studentName}` : ''}*`,
    '━━━━━━━━━━━━━━━━━━━',
    `Envoyez maintenant la *photo de votre enfant* dans cette conversation :`,
    '',
    `*1.* Appuyez sur 📎 (trombone) ou 📷`,
    `*2.* Choisissez une photo claire du visage de votre enfant`,
    `*3.* Envoyez-la ici`,
    '',
    `_La photo sera enregistrée dans son profil et visible dans l'application._`,
  ].join('\n');
}

/** Applique une photo (déjà sauvegardée sur disque) au profil d'un enfant. */
async function applyProfilePhoto(schoolId, phone, child, photoUrl) {
  const ok = await setStudentAvatarUrl(child.id, photoUrl);
  if (!ok) {
    await sendText(schoolId, phone, `⚠️ Erreur lors de l'enregistrement de la photo. Veuillez réessayer.`, { urgent: true });
    return false;
  }
  await sendText(
    schoolId,
    phone,
    `✅ *Photo de profil mise à jour* pour *${child.first_name} ${child.last_name}* 📷\n\n_Elle est maintenant visible dans l'application._\n\n_Tapez *menu* pour d'autres options._`,
    { urgent: true }
  );
  return true;
}

/**
 * Traite une image WhatsApp envoyée par le parent → photo de profil enfant.
 *  - Mode "photo attendue" (option menu) + enfant ciblé → import direct
 *  - Enfant ciblé (sélectionné / unique / nommé dans la légende) → demande
 *    de confirmation (oui / non)
 *  - Plusieurs enfants sans cible → demande pour quel enfant
 */
async function handlePhotoMessage({ image, caption, phone, parentInfo, incomingMsgId }) {
  const schoolId = parentInfo.school_id;
  const children = await getParentChildren(parentInfo.parent_id);

  if (children.length === 0) {
    await sendText(schoolId, phone, `Aucun enfant n'est rattaché à votre numéro. Contactez ${parentInfo.school_name}.`, { urgent: true });
    await markProcessed(incomingMsgId);
    return;
  }

  // Téléchargement du média
  let buffer;
  try {
    buffer = await image.download();
  } catch (e) {
    console.error('[chatbot] téléchargement photo échoué:', e.message);
    await sendText(schoolId, phone, `⚠️ Impossible de télécharger votre photo. Veuillez la renvoyer.`, { urgent: true });
    await markProcessed(incomingMsgId);
    return;
  }
  const photoUrl = await saveProfilePhotoBuffer(buffer, image.mimetype);

  const state = State.getState(schoolId, phone);
  const selected = state?.studentId ? children.find((c) => c.id === state.studentId) : null;
  // Cible : enfant nommé dans la légende > enfant sélectionné > enfant unique
  const fromCaption = caption ? matchChildFromInput(caption, children) : null;
  const target = fromCaption || selected || (children.length === 1 ? children[0] : null);

  // Cible claire (enfant sélectionné, unique, ou nommé dans la légende) →
  // enregistrement direct, comme pour la localisation. On n'exige plus de « oui »
  // qui restait souvent sans réponse (le parent croyait la photo déjà enregistrée).
  if (target) {
    if (state?.awaitingPhoto) State.setState(schoolId, phone, { awaitingPhoto: false });
    await applyProfilePhoto(schoolId, phone, target, photoUrl);
    await markProcessed(incomingMsgId);
    return;
  }

  // Plusieurs enfants, aucune cible → demander pour quel enfant
  const lines = [
    `*📷 Photo reçue*`,
    '━━━━━━━━━━━━━━━━━━━',
    `Pour quel enfant souhaitez-vous enregistrer cette photo de profil ?`,
    '',
  ];
  children.forEach((c, i) => {
    lines.push(`*${i + 1}.* 👶 ${c.first_name} ${c.last_name}${c.class_name ? ` _(${c.class_name})_` : ''}`);
  });
  lines.push('');
  lines.push(`_Répondez avec le numéro de l'enfant, ou *non* pour annuler._`);

  State.setState(schoolId, phone, {
    state: 'PHOTO',
    pendingPhotoUrl: photoUrl,
    pendingPhotoTargetId: null,
    childrenList: children.map((c) => c.id),
  });
  await sendText(schoolId, phone, lines.join('\n'), { urgent: true });
  await markProcessed(incomingMsgId);
}

// ─────────────────────────────────────────────────────────────────────────
// Rapports IA (préférences de notifications WhatsApp) — assistant pas à pas
// ─────────────────────────────────────────────────────────────────────────

// L'app stocke weekly_day au format 0=Dimanche … 6=Samedi.
const WEEKDAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
// Saisie utilisateur 1..7 (Lun→Dim) → valeur app (0=Dim … 6=Sam)
const REPORT_DAY_INPUT = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 };

const YES_RE = /^(1|oui|yes|ok|نعم|اه|أجل|واخا|wakha)[\s!.]*$/i;
const NO_RE = /^(2|non|no|لا|ماشي)[\s!.]*$/i;

/** Charge les préférences du parent + l'heure par défaut de l'école. */
async function getReportPreferences(parentInfo) {
  const { data } = await supabaseAdmin
    .from('parent_report_preferences')
    .select('*')
    .eq('parent_id', parentInfo.parent_id)
    .maybeSingle();

  let defaultTime = '18:00';
  try {
    const { data: ss } = await supabaseAdmin
      .from('daily_report_settings')
      .select('send_time')
      .eq('school_id', parentInfo.school_id)
      .maybeSingle();
    if (ss?.send_time) defaultTime = String(ss.send_time).substring(0, 5);
  } catch (_) { /* fallback 18:00 */ }

  return { prefs: data || null, defaultTime };
}

/** Upsert des préférences. @returns {Promise<boolean>} */
async function saveReportPreferences(parentId, draft) {
  const payload = {
    parent_id: parentId,
    enabled: draft.enabled,
    frequency: draft.frequency,
    weekly_day: draft.frequency === 'weekly' ? draft.weekly_day : null,
    preferred_time: String(draft.preferred_time).substring(0, 5),
  };
  const { error } = await supabaseAdmin
    .from('parent_report_preferences')
    .upsert(payload, { onConflict: 'parent_id' });
  if (error) {
    console.error('[chatbot] saveReportPreferences error:', error.message);
    return false;
  }
  return true;
}

/** Résumé lisible de la config actuelle. */
function reportStatusText(prefs, defaultTime) {
  if (!prefs) return `_Configuration actuelle : paramètres de l'école (quotidien à ${defaultTime})._`;
  if (!prefs.enabled) return `_Configuration actuelle : 🔕 rapports désactivés._`;
  const t = String(prefs.preferred_time || defaultTime).substring(0, 5);
  if (prefs.frequency === 'weekly') {
    return `_Configuration actuelle : 📅 hebdomadaire le ${WEEKDAY_LABELS[prefs.weekly_day] || '—'} à ${t}._`;
  }
  return `_Configuration actuelle : 📅 quotidien à ${t}._`;
}

/**
 * Parse une heure saisie librement : "18:00", "18h30", "18h", "18", "8:5".
 * Valide le créneau anti-ban WhatsApp (07:00 → 22:59).
 * @returns {string|null} "HH:MM" normalisé ou null si invalide.
 */
function parseReportTime(raw) {
  const t = normalizeDigits(String(raw || '').trim()).replace(/\s/g, '');
  const m = t.match(/^(\d{1,2})(?:[:hH](\d{1,2})?)?$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = m[2] != null ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  const minutes = hh * 60 + mm;
  if (minutes < 7 * 60 || minutes > 22 * 60 + 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const REPORT_FREQUENCY_PROMPT =
  `*📊 Fréquence des rapports*\n\nÀ quelle fréquence souhaitez-vous les recevoir ?\n\n*1.* 📆 Quotidien _(chaque jour avec séance)_\n*2.* 🗓️ Hebdomadaire _(un résumé par semaine)_\n\n_Répondez 1 ou 2._`;

const REPORT_WEEKDAY_PROMPT =
  `*🗓️ Jour de réception*\n\nQuel jour voulez-vous recevoir le résumé hebdomadaire ?\n\n*1.* Lundi\n*2.* Mardi\n*3.* Mercredi\n*4.* Jeudi\n*5.* Vendredi\n*6.* Samedi\n*7.* Dimanche\n\n_Répondez avec le numéro du jour (1 à 7)._`;

function reportTimePrompt(defaultTime) {
  return `*⏰ Heure de réception*\n\nÀ quelle heure souhaitez-vous recevoir le rapport ?\n\n_Exemple : 18:00 — créneau autorisé entre *07:00* et *22:59* (heure du Maroc)._\n_Tapez *ok* pour garder ${defaultTime}._`;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers : conversion chiffres arabes-indic + matching enfant
// ─────────────────────────────────────────────────────────────────────────

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXT_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Convertit les chiffres arabes-indic (٠-٩) et persans (۰-۹) en chiffres ASCII.
 * Ex: "١" → "1", "٢" → "2".
 */
function normalizeDigits(text) {
  if (!text) return '';
  return String(text)
    .replace(/[٠-٩]/g, (c) => ARABIC_INDIC.indexOf(c).toString())
    .replace(/[۰-۹]/g, (c) => EXT_ARABIC_INDIC.indexOf(c).toString());
}

/**
 * Tente d'identifier un enfant à partir d'une saisie texte du parent.
 * Accepte :
 *   - un numéro (1, 2, ١, ٢, …)
 *   - le prénom ou nom de famille (FR ou AR), même partiel
 *   - le nom complet dans n'importe quel ordre
 */
function matchChildFromInput(rawText, children) {
  if (!children || children.length === 0) return null;
  const text = normalizeDigits(String(rawText || '').trim());
  if (!text) return null;

  // 1. Tentative index numérique
  const idx = parseInt(text, 10);
  if (Number.isFinite(idx) && idx >= 1 && idx <= children.length) {
    return children[idx - 1];
  }

  // 2. Tentative match par nom (insensible à la casse / espaces multiples)
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const t = norm(text);
  if (t.length < 2) return null;

  for (const c of children) {
    const first = norm(c.first_name);
    const last = norm(c.last_name);
    const full1 = `${first} ${last}`;
    const full2 = `${last} ${first}`;
    if (
      t === first ||
      t === last ||
      t === full1 ||
      t === full2 ||
      full1.includes(t) ||
      full2.includes(t) ||
      (first.length >= 3 && t.includes(first)) ||
      (last.length >= 3 && t.includes(last))
    ) {
      return c;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Envoi du menu de sélection enfant
// ─────────────────────────────────────────────────────────────────────────

async function sendChildSelectionMenu(schoolId, phone, children, parentInfo) {
  if (children.length === 0) {
    await sendText(schoolId, phone, `Aucun enfant n'est rattaché à votre numéro.\n\nVeuillez contacter ${parentInfo.school_name} pour configurer votre compte.`, { urgent: true });
    return;
  }

  if (children.length === 1) {
    // Un seul enfant → sélection auto
    State.selectStudent(schoolId, phone, children[0].id);
    await sendMainMenu(schoolId, phone, children[0], parentInfo);
    return;
  }

  // Plusieurs enfants → menu numéroté
  const lines = [
    `*👨‍👩‍👧 Sélection de l'enfant*`,
    '━━━━━━━━━━━━━━━━━━━',
    `Bonjour ${parentInfo.parent_name} 👋`,
    `Pour quel enfant souhaitez-vous des informations ?`,
    '',
  ];
  children.forEach((c, i) => {
    lines.push(`*${i + 1}.* 👶 ${c.first_name} ${c.last_name}${c.class_name ? ` _(${c.class_name})_` : ''}`);
  });
  lines.push('');
  lines.push(`_Répondez avec le numéro de l'enfant._`);

  State.setChildSelection(schoolId, phone);
  // Stocke la liste pour résoudre la sélection
  State.setState(schoolId, phone, { childrenList: children.map((c) => c.id) });

  await sendText(schoolId, phone, lines.join('\n'), { urgent: true });
}

// ─────────────────────────────────────────────────────────────────────────
// Envoi du menu principal
// ─────────────────────────────────────────────────────────────────────────

async function sendMainMenu(schoolId, phone, student, parentInfo) {
  State.setMenu(schoolId, phone, 'main');
  await sendMenu(schoolId, phone, MENUS.main, {
    studentName: `${student.first_name} ${student.last_name}`,
    schoolName: parentInfo.school_name,
  });
}

async function sendSubMenu(schoolId, phone, menuId, student, parentInfo) {
  State.setMenu(schoolId, phone, menuId);
  await sendMenu(schoolId, phone, MENUS[menuId], {
    studentName: `${student.first_name} ${student.last_name}`,
    schoolName: parentInfo.school_name,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Dispatcher d'action de menu
// ─────────────────────────────────────────────────────────────────────────

async function executeOption(option, schoolId, phone, student, parentInfo) {
  // Action de consultation à la demande du rapport de suivi du jour.
  if (option.action === 'report:now') {
    return sendDailyReportNow(schoolId, phone, student, parentInfo);
  }

  // Action de navigation : "goto:menuId"
  if (typeof option.action === 'string' && option.action.startsWith('goto:')) {
    const target = option.action.split(':')[1];
    if (target === 'main') {
      return sendMainMenu(schoolId, phone, student, parentInfo);
    }
    if (target === 'pedagogy' || target === 'finance' || target === 'schoollife' || target === 'account') {
      return sendSubMenu(schoolId, phone, target, student, parentInfo);
    }
    if (target === 'ai') {
      State.setAIMode(schoolId, phone);
      const msg = `*💬 Question libre*\n━━━━━━━━━━━━━━━━━━━\n\nPosez votre question sur ${student.first_name} en tant que parent.\n\nExemples :\n• "Comment se débrouille-t-il en maths ?"\n• "Que dois-je payer ce mois-ci ?"\n\n_L'IA répond en se basant uniquement sur les données de votre enfant._\n\nTapez *menu* à tout moment pour revenir au menu principal.`;
      return sendText(schoolId, phone, msg, { urgent: true });
    }
    if (target === 'child') {
      const children = await getParentChildren(parentInfo.parent_id);
      return sendChildSelectionMenu(schoolId, phone, children, parentInfo);
    }
    if (target === 'location') {
      // Affiche l'adresse actuelle si elle existe, puis les instructions
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('home_lat, home_lng, home_address')
        .eq('id', student.id)
        .single();
      let current = '';
      if (prof?.home_lat != null && prof?.home_lng != null) {
        current = `\n\n🏠 Adresse actuelle enregistrée :\n📍 ${Number(prof.home_lat).toFixed(6)}, ${Number(prof.home_lng).toFixed(6)}${prof.home_address ? `\n${prof.home_address}` : ''}\n_Envoyez une nouvelle position pour la remplacer._`;
      }
      return sendText(schoolId, phone, locationInstructions(`${student.first_name} ${student.last_name}`) + current, { urgent: true });
    }
    if (target === 'school') {
      // Vitrine de l'école : présentation, puis menu des rubriques illustrées.
      return sendShowcaseMenu({
        schoolId, phone, schoolName: parentInfo.school_name, stateSchoolId: schoolId,
      });
    }
    if (target === 'supplies') {
      // Liste des fournitures : PDF régénéré pour le seul niveau de l'enfant.
      return handleSuppliesRequest({ schoolId, phone, student, text: '', fromMenu: true });
    }
    if (target === 'photo') {
      // Active le mode "photo attendue" : la prochaine image reçue sera
      // importée directement comme photo de profil de l'enfant sélectionné.
      State.setState(schoolId, phone, { awaitingPhoto: true });
      return sendText(schoolId, phone, photoInstructions(`${student.first_name} ${student.last_name}`), { urgent: true });
    }
    if (target === 'reports') {
      // Démarre l'assistant de configuration des rapports IA WhatsApp.
      const { prefs, defaultTime } = await getReportPreferences(parentInfo);
      State.setState(schoolId, phone, {
        state: 'REPORT',
        reportStep: 'enabled',
        reportDefaultTime: defaultTime,
        reportDraft: {
          enabled: prefs?.enabled ?? true,
          frequency: prefs?.frequency || 'daily',
          weekly_day: prefs?.weekly_day ?? 1,
          preferred_time: String(prefs?.preferred_time || defaultTime).substring(0, 5),
        },
      });
      const status = reportStatusText(prefs, defaultTime);
      return sendText(
        schoolId,
        phone,
        `*📊 Rapports IA WhatsApp*\n━━━━━━━━━━━━━━━━━━━\n${status}\n\nSouhaitez-vous *recevoir* les rapports de suivi de votre enfant ?\n\n*1.* ✅ Oui\n*2.* 🔕 Non (désactiver)\n\n_Répondez 1 ou 2. Tapez *menu* pour annuler._`,
        { urgent: true }
      );
    }
    if (target === 'credentials') {
      // Propose : parent uniquement ou parent + enfant
      const replyMsg = await handleCredentialRequest({
        text: 'mes identifiants',
        parentInfo,
        student,
        target: 'both',
      });
      await sendText(schoolId, phone, replyMsg, { urgent: true });
      setTimeout(() => {
        sendText(schoolId, phone, `_Tapez *menu* pour d'autres options._`, { urgent: true });
      }, 1500);
      return;
    }
  }

  // Action = fonction (réponse prédéfinie)
  if (typeof option.action === 'function') {
    try {
      // Cas spécial sondages : on bascule directement en mode vote, sans
      // afficher la liste générique en double. Seul le prompt de vote est
      // envoyé (options numérotées + instruction).
      if (option.action === A.getActivePolls) {
        const polls = await A.getActivePollsData(student, parentInfo);
        if (polls.length === 0) {
          await sendText(schoolId, phone, await A.getActivePolls(student, parentInfo), { urgent: true });
        } else {
          State.setPollVoting(schoolId, phone, polls);
          await sendText(schoolId, phone, A.formatPollPrompt(polls[0], 1, polls.length), { urgent: true });
        }
        return;
      }

      const reply = await option.action(student, parentInfo);
      await sendText(schoolId, phone, reply, { urgent: true });

      // Cas spécial : pour les "Bulletins scolaires" on envoie aussi les PDFs.
      if (option.action === A.getBulletinSummary) {
        await sendBulletinPdfs(schoolId, phone, student);
      }

      // Cas spécial : pour les "Objets perdus" on envoie aussi les photos
      // disponibles, juste après la liste texte. On lit le fichier depuis le
      // disque local en priorité (pas d'aller-retour réseau) et on retombe
      // sur l'URL absolue si le fichier n'est pas trouvé localement.
      if (option.action === A.getLostItems) {
        try {
          const items = await A.getLostItemsWithPhotos(parentInfo);
          let okCount = 0;
          for (const it of items) {
            if (!it.photo_url) continue;
            let caption = `🧷 ${it.title}`;
            if (it.location_found) caption += `\n📍 ${it.location_found}`;
            let res;
            const localPath = join(__dirname, '../../../..', it.photo_url);
            if (!it.photo_url.startsWith('http') && fs.existsSync(localPath)) {
              const buf = fs.readFileSync(localPath);
              res = await sendMediaBuffer(schoolId, phone, buf, { type: 'image', caption }, { urgent: true });
            } else {
              const base = process.env.PUBLIC_BASE_URL || 'https://etrack.ma';
              const url = it.photo_url.startsWith('http') ? it.photo_url : `${base}${it.photo_url}`;
              res = await sendImage(schoolId, phone, url, caption, { urgent: true });
            }
            if (res?.success) okCount += 1;
            else console.warn('[chatbot] photo objet perdu NON envoyée:', it.title, res?.message || res?.reason || '');
          }
          console.log(`[chatbot] objets perdus: ${okCount}/${items.length} photo(s) envoyée(s)`);
        } catch (photoErr) {
          console.error('[chatbot] Erreur envoi photos objets perdus:', photoErr);
        }
      }

      // Cas spécial : pour le "Cahier de vie" on envoie aussi les photos des
      // posts récents juste après le récap texte.
      if (option.action === A.getClassroomFeed) {
        try {
          const media = await A.getClassroomFeedMedia(student, parentInfo);
          let okCount = 0;
          for (const m of media) {
            const res = await sendPhotoLocalFirst(schoolId, phone, m.url, `📸 ${m.title}`);
            if (res?.success) okCount += 1;
            else console.warn('[chatbot] photo cahier de vie NON envoyée:', m.title, res?.message || res?.reason || '');
          }
          console.log(`[chatbot] cahier de vie: ${okCount}/${media.length} photo(s) envoyée(s)`);
        } catch (feedErr) {
          console.error('[chatbot] Erreur envoi photos cahier de vie:', feedErr);
        }
      }

      // Cas spécial : pour la "Dernière facture" on envoie aussi le PDF
      // en pièce jointe juste après le récap texte.
      if (option.action === A.getLastInvoice) {
        try {
          const { data: lastInv } = await supabaseAdmin
            .from('invoices')
            .select('id')
            .eq('student_id', student.id)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastInv?.id) {
            const pdf = await generateInvoicePdfById(lastInv.id);
            if (pdf?.buffer) {
              await sendMediaBuffer(schoolId, phone, pdf.buffer, {
                type: 'document',
                fileName: pdf.fileName,
                mimetype: 'application/pdf',
                caption: '📎 Votre facture en PDF',
              }, { urgent: true });
            }
          }
        } catch (pdfErr) {
          console.error('[chatbot] Erreur génération/envoi PDF facture:', pdfErr);
        }
      }

      // Petit menu de rappel à la fin
      setTimeout(() => {
        sendText(schoolId, phone, `_Tapez *menu* pour d'autres options ou choisissez directement un autre numéro._`, { urgent: true });
      }, 1500);
      return;
    } catch (e) {
      console.error('[chatbot] Erreur exécution option:', e);
      await sendText(schoolId, phone, `⚠️ Erreur lors de la récupération des données. Veuillez réessayer.`, { urgent: true });
      return;
    }
  }

  // Aucune action reconnue
  await sendText(schoolId, phone, `Option non reconnue. Tapez *menu* pour recommencer.`, { urgent: true });
}

// ─────────────────────────────────────────────────────────────────────────
// Chatbot « Réceptionniste » — assistant statistiques de l'école
// ─────────────────────────────────────────────────────────────────────────

/**
 * Traite un message d'un numéro déclaré « réceptionniste » : chatbot IA libre
 * répondant sur les statistiques globales de l'école (DeepSeek). Pas de menu :
 * questions libres uniquement.
 */
async function handleReceptionistMessage({ phone, text, providerMessageId, schoolId, receptionist }) {
  // Log du message entrant (parent_id = null : ce n'est pas un parent).
  const { data: incomingMsg } = await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .insert({
      phone_e164: phone,
      parent_id: null,
      school_id: schoolId,
      message_text: text || '',
      provider_message_id: providerMessageId,
      processed: false,
      category: 'admin_stats',
    })
    .select()
    .single();

  const cmd = detectSpecialCommand(text);
  if (cmd === 'menu' || cmd === 'help' || !String(text || '').trim()) {
    await sendText(schoolId, phone, receptionistWelcome(receptionist, text), { urgent: true });
    await markProcessed(incomingMsg?.id);
    return;
  }

  const reply = await answerSchoolAI({ messageText: text, schoolInfo: receptionist });
  await sendText(schoolId, phone, reply, { urgent: true });
  await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .update({ ai_response_sent: true, ai_response_text: reply })
    .eq('id', incomingMsg?.id);

  setTimeout(() => {
    sendText(schoolId, phone, receptionistFooter(text), { urgent: true });
  }, 1500);

  await markProcessed(incomingMsg?.id);
}

// ─────────────────────────────────────────────────────────────────────────
// Entry point principal
// ─────────────────────────────────────────────────────────────────────────

/**
 * Point d'entrée appelé pour chaque message WhatsApp entrant.
 * @param {object} param0
 * @param {string} param0.from        - numéro E.164 du parent
 * @param {string} param0.text        - corps du message
 * @param {string} param0.id          - ID Baileys du message
 * @param {string} param0.schoolId    - school_id résolu via la session Baileys
 * @param {object} [param0.location]  - localisation partagée { lat, lng, name, address }
 * @param {object} [param0.image]     - image partagée { download(), mimetype }
 */
// Les deux handlers d'entrée posent le contexte « chatbot » (outboundGate) :
// les réponses envoyées pendant le traitement d'un message entrant restent
// autorisées même quand les notifications sortantes sont désactivées.
export async function handleIncomingWhatsAppMessage(args) {
  return runAsChatbot(() => handleIncomingImpl(args));
}

async function handleIncomingImpl({ from, text, id, schoolId, location = null, image = null }) {
  const phone = normalizePhone(from);
  console.log(`[chatbot] ← ${phone} (school=${schoolId}): "${text?.substring(0, 80)}"${location ? ` 📍(${location.lat},${location.lng})` : ''}${image ? ' 📷' : ''}`);

  // 0. Déduplication
  const { data: existing } = await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .select('id, processed')
    .eq('provider_message_id', id)
    .maybeSingle();
  if (existing?.processed) {
    console.log('[chatbot] Message déjà traité, ignoré:', id);
    return;
  }

  // 0.bis Mode démo commercial : mot-clé « DEMO PARENT » (QR scanné par un
  // prospect) → création automatique d'un parent lié à l'élève suivant de la
  // classe démo. Ne concerne QUE les écoles avec demo_parent_configs enabled.
  if (text && !location && !image) {
    try {
      const demoHandled = await maybeHandleDemoParent({ phone, text, schoolId, providerMessageId: id });
      if (demoHandled) return;
    } catch (e) {
      console.error('[chatbot] demo parent hook:', e.message);
    }
  }

  // 1. Identifier le parent
  const parentInfo = await getParentByPhone(phone, schoolId);
  if (!parentInfo) {
    // 1.bis Pas un parent → est-ce un « réceptionniste » déclaré par l'admin ?
    // Si oui, on bascule sur le chatbot IA « statistiques de l'école ».
    if (location || image) {
      // Le chatbot réceptionniste ne gère que le texte (questions libres).
      console.log('[chatbot] Numéro non autorisé (média ignoré):', phone);
      return;
    }
    const receptionist = await getReceptionistByPhone(phone, schoolId);
    if (receptionist) {
      console.log(`[chatbot] ← réceptionniste ${phone} (school=${receptionist.school_id})`);
      await handleReceptionistMessage({
        phone,
        text,
        providerMessageId: id,
        schoolId: receptionist.school_id,
        receptionist,
      });
      return;
    }

    // 1.ter Chatbot « visiteur » (si l'école l'a activé) : le numéro inconnu
    // obtient UNIQUEMENT les informations générales des documents importés
    // (fournitures par niveau, règlement…), jamais de données d'élève.
    const publicHandled = await handlePublicMessage({
      schoolId,
      phone,
      text,
      providerMessageId: id,
    });
    if (publicHandled) {
      console.log(`[chatbot] ← visiteur ${phone} (school=${schoolId})`);
      return;
    }

    console.log('[chatbot] Numéro non autorisé:', phone);
    return; // Silence total pour les inconnus (anti-bruit)
  }

  // 2. Logger le message entrant
  const incomingCategory = categorizeIncoming?.(text) || 'pedagogical';
  const { data: incomingMsg } = await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .insert({
      phone_e164: phone,
      parent_id: parentInfo.parent_id,
      school_id: parentInfo.school_id,
      message_text: text || (location ? `📍 Localisation: ${location.lat},${location.lng}` : image ? '📷 Photo reçue' : ''),
      provider_message_id: id,
      processed: false,
      category: incomingCategory,
    })
    .select()
    .single();

  // Tracking communications : ce message entrant vaut « réponse » (et lecture)
  // pour les envois récents adressés à ce parent.
  markResponded({ parentId: parentInfo.parent_id, phone }).catch(() => {});

  // 2.bis Localisation partagée → enregistrement dans le profil transport
  // de l'élève (home_lat/home_lng), même sans affectation bus.
  if (location) {
    await handleLocationMessage({ location, phone, parentInfo, incomingMsgId: incomingMsg?.id });
    return;
  }

  // 2.ter Image partagée → photo de profil de l'enfant (avec confirmation)
  if (image) {
    await handlePhotoMessage({ image, caption: text, phone, parentInfo, incomingMsgId: incomingMsg?.id });
    return;
  }

  // 3. Demande d'identifiants (toujours prioritaire — court-circuite le menu)
  // Permet au parent de récupérer/réinitialiser son login + mot de passe via
  // n'importe quel message contenant les mots-clés associés.
  const credReq = detectCredentialRequest(text);
  if (credReq.wants) {
    let credStudent = null;
    if (credReq.target !== 'parent') {
      const st = State.getState(schoolId, phone);
      if (st?.studentId) credStudent = await getLinkedStudent(parentInfo.parent_id, st.studentId);
      if (!credStudent) {
        const children = await getParentChildren(parentInfo.parent_id);
        if (children.length === 1) credStudent = await getStudentById(children[0].id);
      }
    }
    const replyMsg = await handleCredentialRequest({
      text,
      parentInfo,
      student: credStudent,
      target: credReq.target,
    });
    await sendText(parentInfo.school_id, phone, replyMsg, { urgent: true });
    await supabaseAdmin
      .from('whatsapp_incoming_messages')
      .update({ ai_response_sent: true, ai_response_text: replyMsg, category: 'credentials' })
      .eq('id', incomingMsg?.id);
    await markProcessed(incomingMsg?.id);
    return;
  }

  // 3.0 Demande du code Massar en texte libre (FR / arabe / darija) — court-
  // circuite le menu et l'IA. On résout l'enfant comme pour les identifiants :
  // enfant sélectionné, sinon enfant unique. Si plusieurs enfants sans
  // sélection, on laisse le flux normal demander de choisir l'enfant d'abord.
  if (isMassarQuery(text)) {
    const st = State.getState(schoolId, phone);
    let massarStudent = st?.studentId ? await getLinkedStudent(parentInfo.parent_id, st.studentId) : null;
    if (!massarStudent) {
      const children = await getParentChildren(parentInfo.parent_id);
      if (children.length === 1) massarStudent = await getStudentById(children[0].id);
    }
    if (massarStudent) {
      await maybeAnswerMassar(parentInfo.school_id, phone, massarStudent, parentInfo, text);
      await supabaseAdmin
        .from('whatsapp_incoming_messages')
        .update({ category: 'pedagogical', ai_response_sent: true })
        .eq('id', incomingMsg?.id);
      await markProcessed(incomingMsg?.id);
      return;
    }
    // Plusieurs enfants sans sélection → on continue le flux normal (le menu de
    // sélection d'enfant sera affiché ; le parent pourra redemander ensuite).
  }

  // 3.0.bis Demande de fournitures scolaires en texte libre (FR / arabe /
  // darija). Le parent ne reçoit JAMAIS le document complet de l'école : on
  // régénère un PDF pour le seul niveau concerné (cité dans le message, sinon
  // celui de l'enfant, sinon on lui fait choisir).
  if (isSuppliesQuery(text)) {
    const st = State.getState(schoolId, phone);
    let suppliesStudent = st?.studentId ? await getLinkedStudent(parentInfo.parent_id, st.studentId) : null;
    if (!suppliesStudent) {
      const children = await getParentChildren(parentInfo.parent_id);
      if (children.length === 1) suppliesStudent = await getStudentById(children[0].id);
    }
    await handleSuppliesRequest({
      schoolId: parentInfo.school_id,
      stateSchoolId: schoolId,
      phone,
      student: suppliesStudent,
      text,
    });
    await supabaseAdmin
      .from('whatsapp_incoming_messages')
      .update({ category: 'general', ai_response_sent: true })
      .eq('id', incomingMsg?.id);
    await markProcessed(incomingMsg?.id);
    return;
  }

  // 3.bis Commandes spéciales (toujours prioritaires)
  const cmd = detectSpecialCommand(text);
  if (cmd === 'menu' || cmd === 'help') {
    const state = State.getState(schoolId, phone);
    let student = state?.studentId ? await getLinkedStudent(parentInfo.parent_id, state.studentId) : null;
    if (!student) {
      const children = await getParentChildren(parentInfo.parent_id);
      await sendChildSelectionMenu(parentInfo.school_id, phone, children, parentInfo);
    } else {
      await sendMainMenu(parentInfo.school_id, phone, student, parentInfo);
    }
    await markProcessed(incomingMsg?.id);
    return;
  }
  if (cmd === 'stop') {
    State.resetState(schoolId, phone);
    // Persiste l'opt-out WhatsApp → le routeur ne lui enverra plus de WhatsApp.
    await setWhatsappOptOut(parentInfo.parent_id, true);
    await sendText(
      parentInfo.school_id,
      phone,
      `✅ C'est noté, vous ne recevrez plus de messages sur WhatsApp.\n\n📲 Vous pouvez toujours tout consulter dans l'application ${parentInfo.school_name}.\n\nPour réactiver WhatsApp, écrivez *START* ou contactez l'école.`,
      { urgent: true }
    );
    await markProcessed(incomingMsg?.id);
    return;
  }
  // Porte d'entrée transport : réponse aux boutons « Voir détails » / « Je ne veux pas »
  // (id boutons Cloud : transport_yes / transport_no ; repli texte Baileys : BUS OUI / BUS NON)
  {
    const t = String(text || '').trim().toLowerCase();
    if (t === 'transport_yes' || t === 'bus oui') {
      await sendText(parentInfo.school_id, phone, `✅ C'est noté, vous recevrez le suivi du bus aujourd'hui, *gratuitement*. 🚌`, { urgent: true });
      await markProcessed(incomingMsg?.id);
      return;
    }
    if (t === 'transport_no' || t === 'bus non') {
      await setTransportSkipToday(parentInfo.parent_id);
      await sendText(parentInfo.school_id, phone, `Compris 👍 Vous ne recevrez pas les notifications du bus aujourd'hui.`, { urgent: true });
      await markProcessed(incomingMsg?.id);
      return;
    }
  }

  // Réactivation des notifications WhatsApp après un STOP
  if (/^(start|démarrer|demarrer|reprendre|activer|oui je veux)$/i.test(String(text || '').trim())) {
    await setWhatsappOptOut(parentInfo.parent_id, false);
    await sendText(parentInfo.school_id, phone, `✅ Vos notifications WhatsApp sont réactivées. Tapez *menu* pour commencer.`, { urgent: true });
    await markProcessed(incomingMsg?.id);
    return;
  }

  // 3.ter Réponse à une notification d'absence → « vue » + justification IA.
  // On ne détourne le message QUE si le parent n'est pas dans une saisie
  // guidée (photo / rapports / sélection enfant) et que ce n'est pas un simple
  // numéro de menu. Sinon le flux chatbot normal continue.
  {
    const st = State.getState(schoolId, phone);
    const inDataFlow = st && ['PHOTO', 'REPORT', 'CHILD'].includes(st.state);
    const trimmed = String(text || '').trim();
    const isMenuNumber = /^\d{1,2}$/.test(normalizeDigits(trimmed));
    if (!inDataFlow && !isMenuNumber && trimmed.length >= 3) {
      try {
        const r = await handleAbsenceReply({ parentInfo, text: trimmed });
        if (r.handled) {
          await sendText(parentInfo.school_id, phone, r.reply, { urgent: true });
          await supabaseAdmin
            .from('whatsapp_incoming_messages')
            .update({ category: 'absence_justification', ai_response_sent: true, ai_response_text: r.reply })
            .eq('id', incomingMsg?.id);
          setTimeout(() => {
            sendText(parentInfo.school_id, phone, `_Tapez *menu* pour d'autres options._`, { urgent: true });
          }, 1200);
          await markProcessed(incomingMsg?.id);
          return;
        }
      } catch (e) {
        console.error('[chatbot] Erreur justification absence:', e.message);
      }
    }
  }

  // 4. State machine
  let state = State.getState(schoolId, phone);

  // Mode PHOTO : une photo est en attente de confirmation / de cible.
  // (Traité avant le bloc "pas d'enfant sélectionné" car ce mode peut
  // exister sans studentId pour un parent multi-enfants.)
  if (state?.state === 'PHOTO' && state.pendingPhotoUrl) {
    const photoUrl = state.pendingPhotoUrl;
    const children = await getParentChildren(parentInfo.parent_id);
    const input = normalizeDigits(String(text || '').trim());

    if (PHOTO_NO_RE.test(input)) {
      await deleteProfilePhotoByUrl(photoUrl);
      State.setState(schoolId, phone, { pendingPhotoUrl: null, pendingPhotoTargetId: null });
      if (state.studentId) State.setMenu(schoolId, phone, 'main');
      else State.resetState(schoolId, phone);
      await sendText(parentInfo.school_id, phone, `❌ Photo annulée. Tapez *menu* pour d'autres options.`, { urgent: true });
      await markProcessed(incomingMsg?.id);
      return;
    }

    let photoChild = null;
    if (PHOTO_YES_RE.test(input) && state.pendingPhotoTargetId) {
      photoChild = children.find((c) => c.id === state.pendingPhotoTargetId) || null;
    }
    if (!photoChild) {
      const ordered = (state.childrenList || [])
        .map((cid) => children.find((c) => c.id === cid))
        .filter(Boolean);
      photoChild = matchChildFromInput(text, ordered.length ? ordered : children);
    }

    if (photoChild) {
      State.setState(schoolId, phone, { pendingPhotoUrl: null, pendingPhotoTargetId: null });
      State.selectStudent(schoolId, phone, photoChild.id);
      await applyProfilePhoto(parentInfo.school_id, phone, photoChild, photoUrl);
      await markProcessed(incomingMsg?.id);
      return;
    }

    await sendText(
      parentInfo.school_id,
      phone,
      `🤔 Réponse non reconnue. Répondez *oui* pour confirmer, *non* pour annuler, ou le *prénom / numéro* de l'enfant.`,
      { urgent: true }
    );
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Mode REPORT : assistant de configuration des rapports IA WhatsApp.
  // (Ne dépend que de parentInfo — placé avant le bloc "pas d'enfant".)
  if (state?.state === 'REPORT') {
    const draft = { ...(state.reportDraft || {}) };
    const defaultTime = state.reportDefaultTime || '18:00';
    const input = normalizeDigits(String(text || '').trim());

    // Étape 1 : activer / désactiver
    if (state.reportStep === 'enabled') {
      if (YES_RE.test(input)) {
        draft.enabled = true;
        State.setState(schoolId, phone, { reportDraft: draft, reportStep: 'frequency' });
        await sendText(parentInfo.school_id, phone, REPORT_FREQUENCY_PROMPT, { urgent: true });
      } else if (NO_RE.test(input)) {
        draft.enabled = false;
        const ok = await saveReportPreferences(parentInfo.parent_id, draft);
        State.setMenu(schoolId, phone, 'account');
        await sendText(
          parentInfo.school_id,
          phone,
          ok ? `🔕 *Rapports IA désactivés.*\n\nVous ne recevrez plus de rapports automatiques. Réactivez quand vous voulez via *Configuration du compte*.\n\n_Tapez *menu* pour revenir._`
             : `⚠️ Erreur lors de l'enregistrement. Réessayez plus tard.`,
          { urgent: true }
        );
      } else {
        await sendText(parentInfo.school_id, phone, `🤔 Répondez *1* (Oui) ou *2* (Non).`, { urgent: true });
      }
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Étape 2 : fréquence
    if (state.reportStep === 'frequency') {
      if (/^(1|quotidien|jour|daily|يومي)/i.test(input)) {
        draft.frequency = 'daily';
        State.setState(schoolId, phone, { reportDraft: draft, reportStep: 'time' });
        await sendText(parentInfo.school_id, phone, reportTimePrompt(draft.preferred_time || defaultTime), { urgent: true });
      } else if (/^(2|hebdo|semaine|weekly|أسبوعي)/i.test(input)) {
        draft.frequency = 'weekly';
        State.setState(schoolId, phone, { reportDraft: draft, reportStep: 'weekday' });
        await sendText(parentInfo.school_id, phone, REPORT_WEEKDAY_PROMPT, { urgent: true });
      } else {
        await sendText(parentInfo.school_id, phone, `🤔 Répondez *1* (Quotidien) ou *2* (Hebdomadaire).`, { urgent: true });
      }
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Étape 3 : jour (hebdomadaire uniquement)
    if (state.reportStep === 'weekday') {
      const n = parseInt(input, 10);
      if (Number.isFinite(n) && REPORT_DAY_INPUT[n] !== undefined) {
        draft.weekly_day = REPORT_DAY_INPUT[n];
        State.setState(schoolId, phone, { reportDraft: draft, reportStep: 'time' });
        await sendText(parentInfo.school_id, phone, reportTimePrompt(draft.preferred_time || defaultTime), { urgent: true });
      } else {
        await sendText(parentInfo.school_id, phone, `🤔 Indiquez le numéro du jour, de *1* (Lundi) à *7* (Dimanche).`, { urgent: true });
      }
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Étape 4 : heure → validation + enregistrement final
    if (state.reportStep === 'time') {
      let time = draft.preferred_time || defaultTime;
      if (!/^(ok|oui|garder|défaut|defaut)$/i.test(input)) {
        const parsed = parseReportTime(input);
        if (!parsed) {
          await sendText(parentInfo.school_id, phone, `🤔 Heure invalide. Donnez une heure entre *07:00* et *22:59* (ex : 18:00), ou tapez *ok* pour garder ${time}.`, { urgent: true });
          await markProcessed(incomingMsg?.id);
          return;
        }
        time = parsed;
      }
      draft.preferred_time = time;
      const ok = await saveReportPreferences(parentInfo.parent_id, draft);
      State.setMenu(schoolId, phone, 'account');
      if (!ok) {
        await sendText(parentInfo.school_id, phone, `⚠️ Erreur lors de l'enregistrement. Réessayez plus tard.`, { urgent: true });
      } else {
        const recap = draft.frequency === 'weekly'
          ? `📅 Hebdomadaire, le *${WEEKDAY_LABELS[draft.weekly_day]}* à *${time}*`
          : `📅 Quotidien à *${time}*`;
        await sendText(
          parentInfo.school_id,
          phone,
          `✅ *Rapports IA configurés !*\n\n${recap}\n\n_Vous recevrez les rapports de suivi sur ce numéro WhatsApp._\n_Tapez *menu* pour d'autres options._`,
          { urgent: true }
        );
      }
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Étape inconnue → réinitialise proprement
    State.setMenu(schoolId, phone, 'account');
    await sendText(parentInfo.school_id, phone, `Tapez *menu* pour revenir au menu.`, { urgent: true });
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Mode SCHOOL : le parent choisit une rubrique de la vitrine de l'école.
  if (state?.state === 'SCHOOL') {
    const handled = await handleShowcaseReply({
      schoolId: parentInfo.school_id,
      stateSchoolId: schoolId,
      phone,
      schoolName: parentInfo.school_name,
      text,
    });
    if (handled) {
      State.setMenu(schoolId, phone, 'schoollife');
      setTimeout(() => {
        sendText(parentInfo.school_id, phone, `_Tapez *menu* pour d'autres options._`, { urgent: true });
      }, 1500);
      await markProcessed(incomingMsg?.id);
      return;
    }
    // Choix non reconnu → on laisse le flux normal (question libre / menu).
  }

  // Mode SUPPLIES : le parent choisit le niveau des fournitures (numéro ou nom).
  // Placé avant le bloc « pas d'enfant sélectionné » : la liste ne dépend que du
  // niveau, pas de l'enfant.
  if (state?.state === 'SUPPLIES') {
    await handleSuppliesLevelReply({
      schoolId: parentInfo.school_id,
      stateSchoolId: schoolId,
      phone,
      text,
    });
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Pas d'état (1re interaction, expiré, ou redémarrage serveur) → essayer
  // d'abord d'interpréter la saisie comme une sélection d'enfant (numéro ou
  // nom), sinon afficher le menu de sélection.
  if (!state || !state.studentId) {
    const children = await getParentChildren(parentInfo.parent_id);
    if (children.length === 1) {
      State.selectStudent(schoolId, phone, children[0].id);
      state = State.getState(schoolId, phone);

      // Détecte si la 1re saisie est une vraie question (et non une simple
      // salutation type "bonjour", "salam", "hi"…). Si oui, on répond
      // directement à la question puis on affiche le menu, comme demandé.
      const trimmed = String(text || '').trim();
      const lower = trimmed.toLowerCase();
      const greetings = /^(bonjour|bonsoir|salut|coucou|hi|hello|hey|salam|salem|sa?lam|marhaba|ahlan|ا?لسلام|مرحبا|سلام|اهلا)[\s!.?,؟]*$/i;
      const isGreeting = greetings.test(lower) || trimmed.length < 5;
      const looksLikeQuestion = !isGreeting && (trimmed.includes(' ') || trimmed.length > 8);

      // Accueil
      await sendText(parentInfo.school_id, phone, `Bonjour ${parentInfo.parent_name} 👋\nBienvenue sur le service WhatsApp de *${parentInfo.school_name}*.`, { urgent: true });

      if (looksLikeQuestion) {
        try {
          const student = children[0];
          // Emploi du temps de la semaine → envoyer le PDF (comme dans les
          // états MENU/AI) au lieu d'une réponse texte de l'IA.
          if (isFullWeekTimetableQuery(text)) {
            await sendText(parentInfo.school_id, phone, `📅 Voici l'emploi du temps hebdomadaire de *${student.first_name}* :`, { urgent: true });
            await sendTimetablePdf(parentInfo.school_id, phone, student);
            await markProcessed(incomingMsg?.id);
            return;
          }
          if (await tryShowcaseAnswer({ schoolId, phone, parentInfo, text })) {
            await markProcessed(incomingMsg?.id);
            return;
          }
          const reply = await answerWithAI({ messageText: text, student, parentInfo });
          await sendText(parentInfo.school_id, phone, reply, { urgent: true });
          if (isBulletinQuery(text)) {
            await sendBulletinPdfs(parentInfo.school_id, phone, student, detectSemester(text));
          }
          await supabaseAdmin
            .from('whatsapp_incoming_messages')
            .update({ ai_response_sent: true, ai_response_text: reply })
            .eq('id', incomingMsg?.id);
        } catch (e) {
          console.error('[chatbot] Erreur IA 1re question:', e);
        }
      }

      // Menu principal après l'accueil (et la réponse IA si applicable)
      await sendMainMenu(parentInfo.school_id, phone, children[0], parentInfo);
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Plusieurs enfants : tenter de matcher la saisie courante (utile quand
    // l'état en mémoire a été perdu après un redémarrage PM2 alors que le
    // parent vient de recevoir le menu de sélection).
    const matched = matchChildFromInput(text, children);
    if (matched) {
      State.selectStudent(schoolId, phone, matched.id);
      await sendText(
        parentInfo.school_id,
        phone,
        `✅ Enfant sélectionné : *${matched.first_name} ${matched.last_name}*`,
        { urgent: true }
      );
      await sendMainMenu(parentInfo.school_id, phone, matched, parentInfo);
      await markProcessed(incomingMsg?.id);
      return;
    }

    await sendChildSelectionMenu(parentInfo.school_id, phone, children, parentInfo);
    await markProcessed(incomingMsg?.id);
    return;
  }

  // L'élève mémorisé doit TOUJOURS être revalidé : s'il a été dissocié de ce
  // parent (ou supprimé) entre deux messages, on repart de la liste réelle de
  // ses enfants au lieu de continuer à livrer ses données.
  const student = await getLinkedStudent(parentInfo.parent_id, state.studentId);
  if (!student) {
    State.resetState(schoolId, phone);
    const children = await getParentChildren(parentInfo.parent_id);
    if (children.length === 0) {
      // Plus aucun enfant : on ne répond rien (le numéro n'est plus légitime).
      await markProcessed(incomingMsg?.id);
      return;
    }
    await sendChildSelectionMenu(parentInfo.school_id, phone, children, parentInfo);
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Mode CHILD : attente sélection enfant (numéro OU nom, FR/AR/Darija)
  if (state.state === 'CHILD') {
    const childrenList = state.childrenList || [];
    // Reconstitue la liste d'objets enfants pour pouvoir matcher par nom
    const children = await getParentChildren(parentInfo.parent_id);
    const orderedChildren = childrenList.length
      ? childrenList
          .map((id) => children.find((c) => c.id === id))
          .filter(Boolean)
      : children;

    // Cas localisation en attente : le parent désigne l'enfant cible
    if (state.pendingLocation) {
      const loc = state.pendingLocation;
      if (APPLY_ALL_RE.test(normalizeDigits(String(text || '').trim()))) {
        State.setState(schoolId, phone, { pendingLocation: null, state: 'MENU', currentMenu: 'main' });
        await applyLocationToAllChildren({ location: loc, phone, parentInfo });
        await markProcessed(incomingMsg?.id);
        return;
      }
      const locChild = matchChildFromInput(text, orderedChildren);
      if (locChild) {
        State.setState(schoolId, phone, { pendingLocation: null });
        State.selectStudent(schoolId, phone, locChild.id);
        const ok = await saveStudentHomeLocation(locChild.id, loc);
        const msg = ok
          ? await locationSavedMessage(locChild, loc)
          : `⚠️ Erreur lors de l'enregistrement de votre position. Veuillez réessayer.`;
        await sendText(parentInfo.school_id, phone, `${msg}\n\n_Tapez *menu* pour d'autres options._`, { urgent: true });
        await markProcessed(incomingMsg?.id);
        return;
      }
      await sendText(
        parentInfo.school_id,
        phone,
        `🤔 Sélection non reconnue. Répondez avec le *numéro* de l'enfant, son *prénom*, ou *0* pour tous.`,
        { urgent: true }
      );
      await markProcessed(incomingMsg?.id);
      return;
    }

    const matched = matchChildFromInput(text, orderedChildren);
    if (matched) {
      State.selectStudent(schoolId, phone, matched.id);
      await sendText(
        parentInfo.school_id,
        phone,
        `✅ Enfant sélectionné : *${matched.first_name} ${matched.last_name}*`,
        { urgent: true }
      );
      await sendMainMenu(parentInfo.school_id, phone, matched, parentInfo);
      await markProcessed(incomingMsg?.id);
      return;
    }

    await sendText(
      parentInfo.school_id,
      phone,
      `🤔 Sélection non reconnue. Répondez avec :\n• le *numéro* de l'enfant (1, 2, ١, ٢…)\n• ou son *prénom* / *nom*`,
      { urgent: true }
    );
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Mode AI : forward DeepSeek (l'utilisateur a explicitement choisi cette option)
  if (state.state === 'AI') {
    if (isLocationHelpQuery(text)) {
      await sendText(parentInfo.school_id, phone, locationInstructions(`${student.first_name} ${student.last_name}`), { urgent: true });
      await markProcessed(incomingMsg?.id);
      return;
    }
    if (isFullWeekTimetableQuery(text)) {
      await sendText(parentInfo.school_id, phone, `📅 Voici l'emploi du temps hebdomadaire de *${student.first_name}* :`, { urgent: true });
      await sendTimetablePdf(parentInfo.school_id, phone, student);
      await markProcessed(incomingMsg?.id);
      return;
    }
    if (await tryShowcaseAnswer({ schoolId, phone, parentInfo, text })) {
      await markProcessed(incomingMsg?.id);
      return;
    }
    const reply = await answerWithAI({ messageText: text, student, parentInfo });
    await sendText(parentInfo.school_id, phone, reply, { urgent: true });
    if (isBulletinQuery(text)) {
      await sendBulletinPdfs(parentInfo.school_id, phone, student, detectSemester(text));
    }
    await supabaseAdmin
      .from('whatsapp_incoming_messages')
      .update({ ai_response_sent: true, ai_response_text: reply })
      .eq('id', incomingMsg.id);
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Mode POLL : le parent vote pour un sondage en répondant par un numéro
  if (state.state === 'POLL') {
    const queue = state.pollQueue || [];
    const idx = state.pollIndex || 0;
    const poll = queue[idx];
    if (!poll) {
      State.setMenu(schoolId, phone, 'schoollife');
      await sendText(parentInfo.school_id, phone, `Tapez *menu* pour revenir au menu.`, { urgent: true });
      await markProcessed(incomingMsg?.id);
      return;
    }
    // Accepte un numéro (1, 2, ٢…) OU le texte de l'option ("Oui", "non"…)
    const optIdx = A.matchPollOption(poll, text);
    if (optIdx < 0) {
      await sendText(parentInfo.school_id, phone, `🤔 Choix non reconnu. ${A.formatPollPrompt(poll, idx + 1, queue.length)}`, { urgent: true });
      await markProcessed(incomingMsg?.id);
      return;
    }
    const result = await A.recordPollVote(poll, optIdx, parentInfo);
    await sendText(parentInfo.school_id, phone, result.ok ? result.message : `⚠️ ${result.message}`, { urgent: true });

    // Passe au sondage suivant s'il en reste, sinon retour au menu Vie scolaire
    if (idx + 1 < queue.length) {
      State.setState(schoolId, phone, { pollIndex: idx + 1 });
      await sendText(parentInfo.school_id, phone, A.formatPollPrompt(queue[idx + 1], idx + 2, queue.length), { urgent: true });
    } else {
      State.setMenu(schoolId, phone, 'schoollife');
      await sendText(parentInfo.school_id, phone, `Merci ! 🙏 Tapez *menu* pour d'autres options.`, { urgent: true });
    }
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Mode MENU : essayer de matcher une option du menu en cours
  if (state.state === 'MENU') {
    // Raccourci : après un enregistrement de localisation, "tous" applique la
    // même adresse à tous les enfants du parent. ("0" est exclu ici car il
    // signifie "Retour" dans les sous-menus.)
    if (state.lastLocation && /^(tous|toutes|all|الكل|كلهم|للجميع)[\s!.]*$/i.test(String(text || '').trim())) {
      const loc = state.lastLocation;
      State.setState(schoolId, phone, { lastLocation: null });
      await applyLocationToAllChildren({ location: loc, phone, parentInfo });
      await markProcessed(incomingMsg?.id);
      return;
    }

    const menu = MENUS[state.currentMenu] || MENUS.main;
    const opt = matchMenuOption(menu, text);
    if (opt) {
      await executeOption(opt, parentInfo.school_id, phone, student, parentInfo);
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Pas de correspondance avec une option. Heuristique : si l'utilisateur a
    // tapé une vraie phrase / question (> 4 caractères, contient au moins 1
    // espace OU plus de 8 caractères), on considère que c'est une question
    // libre (français, arabe, darja, etc.) et on la route vers l'IA au lieu
    // de répondre "Option non reconnue".
    const trimmed = text.trim();
    const looksLikeQuestion =
      trimmed.length >= 5 && (trimmed.includes(' ') || trimmed.length > 8);

    if (looksLikeQuestion) {
      console.log(`[chatbot] MENU → IA fallback (texte libre): "${trimmed.substring(0, 40)}"`);
      if (isLocationHelpQuery(text)) {
        await sendText(parentInfo.school_id, phone, locationInstructions(`${student.first_name} ${student.last_name}`), { urgent: true });
        await markProcessed(incomingMsg?.id);
        return;
      }
      if (isFullWeekTimetableQuery(text)) {
        await sendText(parentInfo.school_id, phone, `📅 Voici l'emploi du temps hebdomadaire de *${student.first_name}* :`, { urgent: true });
        await sendTimetablePdf(parentInfo.school_id, phone, student);
        await markProcessed(incomingMsg?.id);
        return;
      }
      if (await tryShowcaseAnswer({ schoolId, phone, parentInfo, text })) {
        await markProcessed(incomingMsg?.id);
        return;
      }
      const reply = await answerWithAI({ messageText: text, student, parentInfo });
      await sendText(parentInfo.school_id, phone, reply, { urgent: true });
      if (isBulletinQuery(text)) {
        await sendBulletinPdfs(parentInfo.school_id, phone, student, detectSemester(text));
      }
      await supabaseAdmin
        .from('whatsapp_incoming_messages')
        .update({ ai_response_sent: true, ai_response_text: reply })
        .eq('id', incomingMsg.id);
      // Petit rappel pour revenir au menu
      setTimeout(() => {
        sendText(
          parentInfo.school_id,
          phone,
          menuFooterForText(text),
          { urgent: true }
        );
      }, 1500);
      await markProcessed(incomingMsg?.id);
      return;
    }

    // Saisie courte non reconnue (probable typo de numéro de menu) :
    // ré-afficher le menu courant.
    await sendText(parentInfo.school_id, phone, `🤔 Option non reconnue : "${text.substring(0, 30)}".`, { urgent: true });
    await sendMenu(parentInfo.school_id, phone, menu, {
      studentName: `${student.first_name} ${student.last_name}`,
      schoolName: parentInfo.school_name,
    });
    await markProcessed(incomingMsg?.id);
    return;
  }

  // Sécurité : état inconnu
  State.resetState(schoolId, phone);
  await sendMainMenu(parentInfo.school_id, phone, student, parentInfo);
  await markProcessed(incomingMsg?.id);
}

async function markProcessed(incomingMsgId) {
  if (!incomingMsgId) return;
  await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .update({ processed: true })
    .eq('id', incomingMsgId);
}

// ─────────────────────────────────────────────────────────────────────────
// Adapter Baileys (callback fourni à baileysClient.startSession)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Déballe les enveloppes de message WhatsApp. Quand un chat a les « messages
 * éphémères » (disparition automatique) activés, ou pour les « view once » et
 * les documents légendés, Baileys imbrique le vrai contenu sous un conteneur :
 *   m.ephemeralMessage.message.locationMessage
 *   m.viewOnceMessage.message.imageMessage
 *   m.documentWithCaptionMessage.message.documentMessage
 * Sans déballage, m.locationMessage / m.imageMessage sont undefined → aucune
 * détection (silence total). On déballe récursivement jusqu'au contenu réel.
 */
function unwrapMessage(message) {
  let m = message || {};
  for (let i = 0; i < 5; i += 1) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message ||
      null;
    if (!inner) break;
    m = inner;
  }
  return m;
}

export async function handleBaileysIncoming(args) {
  return runAsChatbot(() => handleBaileysImpl(args));
}

async function handleBaileysImpl({ schoolId, msg, sock }) {
  const m = unwrapMessage(msg.message);
  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    // Réponse à un listMessage : rowId stocké dans selectedRowId
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.buttonsResponseMessage?.selectedButtonId ||
    '';

  // Localisation partagée (position statique ou live) → profil transport
  const locMsg = m.locationMessage || m.liveLocationMessage;
  let location = null;
  if (locMsg && locMsg.degreesLatitude != null && locMsg.degreesLongitude != null) {
    location = {
      lat: Number(locMsg.degreesLatitude),
      lng: Number(locMsg.degreesLongitude),
      name: locMsg.name || null,
      address: locMsg.address || null,
    };
  }

  // Image partagée → photo de profil de l'enfant (téléchargement lazy : on
  // ne télécharge le média que si l'expéditeur est un parent connu)
  let image = null;
  if (m.imageMessage) {
    image = {
      mimetype: m.imageMessage.mimetype || 'image/jpeg',
      download: () => downloadMediaMessage(msg, 'buffer', {}),
    };
  }

  if (!text && !location && !image) return;

  const remoteJid = msg.key?.remoteJid || '';

  // Ignore les groupes (toujours @g.us)
  if (remoteJid.endsWith('@g.us')) {
    console.log(`[chatbot] Ignoré (groupe): ${remoteJid}`);
    return;
  }

  // Pour les messages 1-à-1, WhatsApp utilise désormais 2 formats :
  //   - @s.whatsapp.net : ancien format, le JID = phone E.164
  //   - @lid           : nouveau "Linked Identity" pour la confidentialité
  // Pour @lid, Baileys expose le vrai téléphone dans key.senderPn / participantPn
  // ou via remoteJidAlt selon la version. On tente chaque champ dans l'ordre.
  let phoneJid = null;
  if (remoteJid.endsWith('@s.whatsapp.net')) {
    phoneJid = remoteJid;
  } else if (remoteJid.endsWith('@lid')) {
    phoneJid =
      msg.key?.senderPn ||
      msg.key?.participantPn ||
      msg.key?.remoteJidAlt ||
      null;
    if (!phoneJid) {
      console.warn(
        `[chatbot] ⚠️  Message @lid sans numéro résoluble — clés disponibles: ${JSON.stringify(Object.keys(msg.key || {}))}`
      );
      return;
    }
    console.log(`[chatbot] 🔗 LID résolu: ${remoteJid} → ${phoneJid}`);
  } else {
    console.log(`[chatbot] Ignoré (format JID inconnu): ${remoteJid}`);
    return;
  }

  const from = '+' + phoneJid.split('@')[0];
  const id = msg.key?.id || `${Date.now()}`;

  // Comportement humain : on "lit" d'abord le message (coches bleues + on
  // apparaît en ligne) puis on marque une courte pause de lecture avant de
  // composer la réponse — exactement comme une personne qui ouvre la conv.
  const activeSock = sock || getSocket(schoolId);
  if (activeSock) {
    await simulateRead(activeSock, msg.key, remoteJid);
  }

  return handleIncomingWhatsAppMessage({ from, text, id, schoolId, location, image });
}
