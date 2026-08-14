/**
 * Chatbot ENSEIGNANT — orchestrateur (phase 1 : consultation).
 *
 * Un professeur écrit depuis SON numéro (profiles.phone, role = teacher) et
 * consulte sa journée, ses classes, ses élèves, ses devoirs, ses contrôles et
 * ses demandes de rendez-vous, sans jamais ouvrir l'application.
 *
 * Trois garde-fous :
 *   1. le professeur est ré-identifié à CHAQUE message (jamais depuis l'état) ;
 *   2. son périmètre de classes est relu à chaque message (getTeacherScope) ;
 *   3. aucune écriture en base — les actions de saisie viendront en phase 2.
 *
 * L'état conversationnel utilise des champs dédiés (`tState`, `tCandidates`…) :
 * un numéro à double casquette (professeur ET parent) conserve ainsi son état
 * parent intact en passant d'un espace à l'autre.
 */

import { supabaseAdmin } from '../../../../config/supabase.js';
import { sendText } from '../../index.js';
import * as State from '../state.js';
import { sendMenu, matchMenuOption } from '../menus.js';
import { normalizeDigits } from '../textUtils.js';
import { detectSpecialCommand } from '../ai.js';
import {
  getTeacherByPhone,
  handleTeacherAppointmentMessage,
  looksLikeSlotReply,
} from '../appointments.js';
import { TEACHER_MAIN_MENU, SPACE_MENU, TEACHER_FOOTER } from './menus.js';
import * as A from './answers.js';

export { getTeacherByPhone };

// ─────────────────────────────────────────────────────────────────────────
// Choix d'espace (numéro professeur ET parent)
// ─────────────────────────────────────────────────────────────────────────

/** Le professeur demande explicitement à changer d'espace. */
export function isSpaceSwitchRequest(text) {
  return /^(espace|changer d'?espace|espaces|مساحة|تغيير المساحة)$/i.test(String(text || '').trim());
}

/**
 * Espace choisi par un numéro à double casquette, mémorisé LONGTEMPS.
 *
 * L'état conversationnel expire au bout de 30 min : s'y fier seul ferait
 * reposer la question « enseignant ou parent ? » plusieurs fois par jour. On
 * garde donc le choix à part, 30 jours. En mémoire process (perdu au
 * redémarrage : la question est alors reposée une fois), comme `state.js`.
 */
const SPACE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const spacePreference = new Map(); // `${schoolId}:${phone}` -> { space, expiresAt }

export function rememberSpace(schoolId, phone, space) {
  spacePreference.set(`${schoolId}:${phone}`, { space, expiresAt: Date.now() + SPACE_TTL_MS });
}

export function recallSpace(schoolId, phone) {
  const hit = spacePreference.get(`${schoolId}:${phone}`);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    spacePreference.delete(`${schoolId}:${phone}`);
    return null;
  }
  return hit.space;
}

/** Affiche le choix « espace enseignant / espace parent ». */
export async function sendSpaceMenu(schoolId, phone, schoolName) {
  spacePreference.delete(`${schoolId}:${phone}`);
  State.setState(schoolId, phone, { space: null, spacePending: true });
  return sendMenu(schoolId, phone, SPACE_MENU, { schoolName });
}

/**
 * Interprète la réponse au menu de choix d'espace.
 * @returns {'teacher'|'parent'|null}
 */
export function readSpaceChoice(text) {
  const opt = matchMenuOption(SPACE_MENU, String(text || '').trim());
  if (opt?.action === 'space:teacher') return 'teacher';
  if (opt?.action === 'space:parent') return 'parent';
  const t = String(text || '').trim().toLowerCase();
  if (/^(prof|professeur|enseignant|أستاذ)$/.test(t)) return 'teacher';
  if (/^(parent|père|mère|ولي)$/.test(t)) return 'parent';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Contexte
// ─────────────────────────────────────────────────────────────────────────

/**
 * Nom de l'école du professeur (affiché en pied de chaque réponse).
 * Mis en cache : il apparaît dans chaque message et ne change quasiment jamais.
 */
const SCHOOL_NAME_TTL_MS = 10 * 60 * 1000;
const schoolNames = new Map(); // schoolId -> { name, expiresAt }

async function getSchoolName(schoolId) {
  const hit = schoolNames.get(schoolId);
  if (hit && hit.expiresAt > Date.now()) return hit.name;

  const { data } = await supabaseAdmin
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .maybeSingle();
  const name = data?.name || 'École';
  schoolNames.set(schoolId, { name, expiresAt: Date.now() + SCHOOL_NAME_TTL_MS });
  return name;
}

/** Envoi d'une réponse de consultation, suivie du rappel de menu. */
async function reply(ctx, body) {
  await sendText(ctx.schoolId, ctx.phone, `${body}\n\n${TEACHER_FOOTER}`, { urgent: true });
}

async function sendMainMenu(ctx) {
  State.setState(ctx.schoolId, ctx.phone, { tState: 'T_MENU', space: 'teacher' });
  return sendMenu(ctx.schoolId, ctx.phone, TEACHER_MAIN_MENU, { schoolName: ctx.schoolName });
}

// ─────────────────────────────────────────────────────────────────────────
// Exécution des options
// ─────────────────────────────────────────────────────────────────────────

async function executeOption(action, ctx) {
  const { teacher, scope, schoolName } = ctx;

  switch (action) {
    case 'today':
      return reply(ctx, await A.getTodayAgenda(teacher, scope, schoolName));

    case 'classes': {
      State.setState(ctx.schoolId, ctx.phone, { tState: 'T_CLASSES' });
      return reply(ctx, await A.getMyClasses(scope, schoolName));
    }

    case 'student': {
      State.setState(ctx.schoolId, ctx.phone, { tState: 'T_STUDENT' });
      return sendText(
        ctx.schoolId,
        ctx.phone,
        `*🎓 Fiche élève*\n━━━━━━━━━━━━━━━━━━━\nÉcrivez le *nom ou le prénom* de l'élève.\n\n_Seuls les élèves de vos classes sont accessibles._`,
        { urgent: true }
      );
    }

    case 'homework':
      return reply(ctx, await A.getActiveHomework(scope, schoolName));

    case 'controls':
      return reply(ctx, await A.getControls(teacher, scope, schoolName));

    case 'appointments':
      return reply(ctx, await A.getAppointments(teacher, schoolName));

    case 'timetable':
      return reply(ctx, await A.getWeekTimetable(teacher, scope, schoolName));

    default:
      return sendMainMenu(ctx);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sélection d'une classe / d'un élève
// ─────────────────────────────────────────────────────────────────────────

/** Résout un numéro ou un nom de classe dans le périmètre du professeur. */
function matchClass(input, classes) {
  const raw = normalizeDigits(String(input || '').trim());
  const idx = parseInt(raw, 10);
  if (Number.isFinite(idx) && idx >= 1 && idx <= classes.length) return classes[idx - 1];

  const t = raw.toLowerCase();
  if (t.length < 2) return null;
  return classes.find((c) => String(c.name || '').toLowerCase() === t)
    || classes.find((c) => String(c.name || '').toLowerCase().includes(t))
    || null;
}

/**
 * Cherche un élève dans les classes du professeur et envoie sa fiche.
 * @returns {Promise<boolean>} false si aucun élève ne correspond.
 */
async function trySendStudentSheet(ctx, input) {
  const students = await A.studentsOfClasses(ctx.scope.classIds);
  if (students.length === 0) return false;

  const { match, candidates } = A.matchStudents(input, students);

  if (match) {
    State.setState(ctx.schoolId, ctx.phone, { tState: 'T_MENU', tCandidates: null });
    await reply(ctx, await A.getStudentSheet(match, ctx.scope, ctx.schoolName));
    return true;
  }

  if (candidates.length > 1) {
    const lines = candidates.map((s, i) => {
      const cls = ctx.scope.classById.get(s.class_id);
      return `*${i + 1}.* 🎓 ${s.first_name} ${s.last_name}${cls ? ` _(${cls.name})_` : ''}`;
    });
    State.setState(ctx.schoolId, ctx.phone, {
      tState: 'T_STUDENT_PICK',
      tCandidates: candidates.map((s) => s.id),
    });
    await sendText(
      ctx.schoolId,
      ctx.phone,
      `*🎓 Plusieurs élèves correspondent*\n━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n\n_Répondez avec le numéro._`,
      { urgent: true }
    );
    return true;
  }

  return false;
}

/** Réponse à la liste d'homonymes : un numéro désigne l'élève. */
async function handleStudentPick(ctx, input) {
  const ids = State.getState(ctx.schoolId, ctx.phone)?.tCandidates || [];
  const idx = parseInt(normalizeDigits(String(input || '').trim()), 10);
  if (!Number.isFinite(idx) || idx < 1 || idx > ids.length) return false;

  // Le périmètre est relu : l'élève doit toujours être dans une classe du prof.
  const students = await A.studentsOfClasses(ctx.scope.classIds);
  const student = students.find((s) => s.id === ids[idx - 1]);
  if (!student) return false;

  State.setState(ctx.schoolId, ctx.phone, { tState: 'T_MENU', tCandidates: null });
  await reply(ctx, await A.getStudentSheet(student, ctx.scope, ctx.schoolName));
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Point d'entrée
// ─────────────────────────────────────────────────────────────────────────

/**
 * Traite un message d'un numéro identifié comme professeur.
 *
 * @param {object}  p
 * @param {string}  p.schoolId          - école de la session WhatsApp
 * @param {string}  p.phone             - numéro E.164 du professeur
 * @param {string}  p.text              - corps du message
 * @param {string}  [p.providerMessageId]
 * @param {object}  p.teacher           - profil professeur déjà résolu
 * @param {boolean} [p.dualRole]        - le numéro est aussi celui d'un parent
 * @param {boolean} [p.alreadyLogged]   - le message entrant est déjà journalisé
 * @returns {Promise<boolean>} true si le message a été traité
 */
export async function handleTeacherMessage({
  schoolId, phone, text, providerMessageId, teacher, dualRole = false, alreadyLogged = false,
}) {
  const prof = teacher || (await getTeacherByPhone(phone, schoolId));
  if (!prof) return false;

  const outSchoolId = prof.school_id || schoolId;
  const input = String(text || '').trim();

  // Réponse à une demande de rendez-vous (« mardi 10h30 ») : prioritaire, le
  // flux dédié sait reconnaître un créneau en FR / arabe / darija.
  const st = State.getState(schoolId, phone);
  if (st?.tState !== 'T_STUDENT' && (st?.state === 'APPT_TEACHER' || looksLikeSlotReply(input))) {
    try {
      const handled = await handleTeacherAppointmentMessage({ schoolId, phone, text: input, teacher: prof });
      if (handled) {
        await logIncoming({ phone, schoolId: outSchoolId, text: input, providerMessageId, alreadyLogged, processed: true });
        return true;
      }
    } catch (e) {
      console.error('[chatbot prof] rendez-vous:', e.message);
    }
  }

  const msgId = await logIncoming({ phone, schoolId: outSchoolId, text: input, providerMessageId, alreadyLogged });

  const [scope, schoolName] = await Promise.all([
    A.getTeacherScope(prof),
    getSchoolName(outSchoolId),
  ]);
  const ctx = { schoolId, phone, teacher: prof, scope, schoolName };

  // Retour au choix d'espace (numéro professeur ET parent)
  if (dualRole && isSpaceSwitchRequest(input)) {
    await sendSpaceMenu(schoolId, phone, schoolName);
    await markProcessed(msgId);
    return true;
  }

  // Accueil : première interaction ou état expiré
  const state = State.getState(schoolId, phone);
  const cmd = detectSpecialCommand(input);
  if (!state?.tState || cmd === 'menu' || cmd === 'help' || !input) {
    if (!state?.tState) {
      const name = `${prof.first_name || ''} ${prof.last_name || ''}`.trim();
      await sendText(
        schoolId,
        phone,
        `Bonjour ${name} 👋\nBienvenue dans votre *espace enseignant* — ${schoolName}.${dualRole ? `\n\n_Tapez *espace* pour basculer vers votre espace parent._` : ''}`,
        { urgent: true }
      );
    }
    await sendMainMenu(ctx);
    await markProcessed(msgId);
    return true;
  }

  // États d'attente : ils ont la priorité sur les numéros du menu principal.
  if (state.tState === 'T_STUDENT_PICK' && (await handleStudentPick(ctx, input))) {
    await markProcessed(msgId);
    return true;
  }

  if (state.tState === 'T_CLASSES') {
    const klass = matchClass(input, scope.classes);
    if (klass) {
      State.setState(schoolId, phone, { tState: 'T_MENU' });
      await reply(ctx, await A.getClassSummary(klass, schoolName));
      await markProcessed(msgId);
      return true;
    }
  }

  if (state.tState === 'T_STUDENT' && (await trySendStudentSheet(ctx, input))) {
    await markProcessed(msgId);
    return true;
  }

  // Option du menu principal (numéro, libellé, ou clic sur la liste WhatsApp)
  const opt = matchMenuOption(TEACHER_MAIN_MENU, normalizeDigits(input));
  if (opt) {
    await executeOption(opt.action, ctx);
    await markProcessed(msgId);
    return true;
  }

  // Raccourci : un nom tapé n'importe où ouvre la fiche de l'élève.
  if (input.length >= 3 && (await trySendStudentSheet(ctx, input))) {
    await markProcessed(msgId);
    return true;
  }

  await sendText(
    schoolId,
    phone,
    `🤔 Je n'ai pas reconnu « ${input.slice(0, 30)} ».\n\n_Choisissez une option, ou écrivez le nom d'un élève._`,
    { urgent: true }
  );
  await sendMainMenu(ctx);
  await markProcessed(msgId);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Journalisation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Journalise le message entrant du professeur (`parent_id` reste null : ce
 * n'est pas un parent). Renvoie l'id de la ligne, ou null si déjà journalisée
 * par l'orchestrateur parent (numéro à double casquette).
 */
async function logIncoming({ phone, schoolId, text, providerMessageId, alreadyLogged, processed = false }) {
  if (alreadyLogged) return null;
  try {
    const { data } = await supabaseAdmin
      .from('whatsapp_incoming_messages')
      .insert({
        phone_e164: phone,
        parent_id: null,
        school_id: schoolId,
        message_text: text || '',
        provider_message_id: providerMessageId,
        processed,
        // `category` est un ENUM Postgres (pedagogical / financial / transport
        // / general) : toute autre valeur ferait échouer l'insertion en
        // silence, et la déduplication des messages avec elle.
        category: 'pedagogical',
      })
      .select()
      .single();
    return data?.id || null;
  } catch (e) {
    console.error('[chatbot prof] journalisation:', e.message);
    return null;
  }
}

async function markProcessed(id) {
  if (!id) return;
  await supabaseAdmin
    .from('whatsapp_incoming_messages')
    .update({ processed: true })
    .eq('id', id);
}
