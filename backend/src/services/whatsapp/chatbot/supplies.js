/**
 * Réponse « fournitures scolaires » du chatbot WhatsApp.
 *
 * Le parent demande la liste des fournitures (par menu ou en texte libre, FR /
 * AR / darija). On détermine le NIVEAU concerné :
 *   1. niveau cité dans le message ("fournitures 2AP", "لوازم الثالثة ابتدائي")
 *   2. sinon le niveau de la classe de l'enfant sélectionné
 *   3. sinon, si un seul niveau existe dans le document, celui-là
 *   4. sinon on demande au parent de choisir dans une liste numérotée
 *
 * Puis on génère un PDF qui ne contient QUE ce niveau et on l'envoie.
 */

import { supabaseAdmin } from '../../../config/supabase.js';
import { sendText, sendMediaBuffer } from '../index.js';
import * as State from './state.js';
import { getActiveSections, matchSectionFromText, matchSectionForLevel, normalizeText } from './knowledge.js';
import { generateSectionPdf } from './suppliesPdf.js';
import { isSuppliesQuery } from './suppliesQuery.js';
export { isSuppliesQuery };

/**
 * Année scolaire affichée sur le PDF : celle saisie sur le document, sinon
 * déduite de la date.
 *
 * ⚠️ Une liste de fournitures se prépare pour la RENTRÉE À VENIR : de mars à
 * août, l'année pertinente est celle qui commence en septembre, pas l'année
 * scolaire qui s'achève. De septembre à février, c'est l'année en cours.
 */
function resolveAcademicYear(section) {
  const fromDoc = section?.document?.academic_year;
  if (fromDoc) return fromDoc;
  const now = new Date();
  const y = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return `${y}-${y + 1}`;      // année qui vient de commencer
  if (month <= 2) return `${y - 1}-${y}`;      // deuxième moitié de l'année en cours
  return `${y}-${y + 1}`;                      // mars → août : prochaine rentrée
}

/** Niveau de l'élève : classes.level en priorité, sinon le nom de la classe. */
async function getStudentLevel(student) {
  if (!student?.class_id) return student?.class_name || null;
  const { data } = await supabaseAdmin
    .from('classes')
    .select('level, name')
    .eq('id', student.class_id)
    .maybeSingle();
  return data?.level || data?.name || student.class_name || null;
}

/** Génère puis envoie le PDF d'une section au parent. */
async function sendSectionPdf({ schoolId, phone, section, student }) {
  const academicYear = resolveAcademicYear(section);
  const { buffer, fileName } = await generateSectionPdf({
    schoolId,
    section,
    title: 'Fournitures scolaires',
    academicYear,
  });

  const caption = [
    `🎒 *Fournitures scolaires* — ${section.level_label}`,
    student ? `👶 ${student.first_name} ${student.last_name}` : null,
    `📅 Année ${academicYear}`,
    '',
    '_Liste officielle de l\'école, à préparer pour la rentrée._',
  ].filter((l) => l !== null).join('\n');

  const res = await sendMediaBuffer(schoolId, phone, buffer, {
    type: 'document',
    fileName,
    mimetype: 'application/pdf',
    caption,
  });

  return !!res?.success;
}

/** Message listant les niveaux disponibles (choix numéroté). */
function levelChoicePrompt(sections) {
  const lines = [
    '*🎒 Fournitures scolaires*',
    '━━━━━━━━━━━━━━━━━━━',
    'Pour quel niveau souhaitez-vous la liste ?',
    '',
  ];
  sections.forEach((s, i) => {
    lines.push(`*${i + 1}.* 📘 ${s.level_label}`);
  });
  lines.push('');
  lines.push('_Répondez avec le numéro du niveau (ou son nom)._');
  return lines.join('\n');
}

const NO_DOCUMENT_MSG =
  '🎒 La liste des fournitures scolaires n\'a pas encore été publiée par l\'école.\n\n_Elle sera disponible ici dès que l\'administration l\'aura mise en ligne._\n\n_Tapez *menu* pour d\'autres options._';

/**
 * Traite une demande de fournitures.
 *
 * @param {object} p
 * @param {string} p.schoolId          école du parent (données + envoi)
 * @param {string} [p.stateSchoolId]   clé d'état conversationnel (école de la session)
 * @param {string} p.phone
 * @param {object|null} p.student   élève sélectionné (peut être null)
 * @param {string} p.text           message du parent
 * @param {boolean} [p.fromMenu]    true si déclenché par l'option de menu
 * @returns {Promise<boolean>} true si la demande a été traitée
 */
export async function handleSuppliesRequest({ schoolId, stateSchoolId = schoolId, phone, student, text, fromMenu = false }) {
  const sections = await getActiveSections(schoolId, 'fournitures');
  if (sections.length === 0) {
    await sendText(schoolId, phone, NO_DOCUMENT_MSG);
    return true;
  }

  // 1. Niveau explicitement cité par le parent (sauf entrée par le menu, où le
  //    message est juste le numéro de l'option).
  let section = fromMenu ? null : matchSectionFromText(text, sections);

  // 2. Niveau de l'enfant sélectionné
  if (!section && student) {
    const level = await getStudentLevel(student);
    section = matchSectionForLevel(level, sections);
  }

  // 3. Document mono-niveau (ou « tous les niveaux »)
  if (!section && sections.length === 1) section = sections[0];

  // 4. Toujours ambigu → on fait choisir le parent
  if (!section) {
    State.setState(stateSchoolId, phone, {
      state: 'SUPPLIES',
      suppliesSectionIds: sections.map((s) => s.id),
    });
    await sendText(schoolId, phone, levelChoicePrompt(sections));
    return true;
  }

  await sendText(
    schoolId,
    phone,
    `🎒 Voici la liste des fournitures pour *${section.level_label}*. _Un instant, je prépare le PDF…_`,
  );

  const ok = await sendSectionPdf({ schoolId, phone, section, student });
  if (!ok) {
    await sendText(
      schoolId,
      phone,
      '⚠️ Le PDF n\'a pas pu être envoyé. Réessayez dans quelques instants.',
    );
  }
  return true;
}

/**
 * Réponse du parent au choix du niveau (état SUPPLIES).
 * @returns {Promise<boolean>} true si un niveau a été reconnu et le PDF envoyé
 */
export async function handleSuppliesLevelReply({ schoolId, stateSchoolId = schoolId, phone, student, text }) {
  const state = State.getState(stateSchoolId, phone);
  const ids = state?.suppliesSectionIds || [];
  const sections = (await getActiveSections(schoolId, 'fournitures'))
    .filter((s) => ids.includes(s.id));

  if (sections.length === 0) {
    State.setMenu(stateSchoolId, phone, 'main');
    await sendText(schoolId, phone, NO_DOCUMENT_MSG);
    return true;
  }

  // Ordre du prompt = ordre des ids mémorisés
  const ordered = ids.map((id) => sections.find((s) => s.id === id)).filter(Boolean);

  // Numéro dans la liste, sinon nom du niveau
  const raw = normalizeText(text).replace(/\s/g, '');
  const idx = parseInt(raw, 10);
  let section = Number.isFinite(idx) && idx >= 1 && idx <= ordered.length ? ordered[idx - 1] : null;
  if (!section) section = matchSectionFromText(text, ordered);

  if (!section) {
    await sendText(
      schoolId,
      phone,
      `🤔 Niveau non reconnu.\n\n${levelChoicePrompt(ordered)}`,
    );
    return true;
  }

  State.setState(stateSchoolId, phone, { state: 'MENU', currentMenu: 'main', suppliesSectionIds: null });
  await sendText(
    schoolId,
    phone,
    `🎒 Liste des fournitures pour *${section.level_label}*. _Un instant…_`,
  );
  const ok = await sendSectionPdf({ schoolId, phone, section, student: null });
  if (!ok) {
    await sendText(schoolId, phone, '⚠️ Le PDF n\'a pas pu être envoyé. Réessayez dans quelques instants.');
  }
  return true;
}
