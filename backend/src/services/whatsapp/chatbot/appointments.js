/**
 * Prise de rendez-vous par WhatsApp.
 *
 * Deux interlocuteurs, deux flux :
 *
 *  A. LE PARENT demande un rendez-vous (menu principal ou texte libre
 *     « je veux un rendez-vous », « بغيت موعد »…) :
 *       enfant → administration ou professeur → objet → créneau souhaité
 *     La demande part ensuite dans le circuit normal (service appointments.js) :
 *     directeur pédagogique, responsable pédagogique de la classe, administration
 *     — et le professeur s'il est visé.
 *
 *  B. LE PROFESSEUR répond sur WhatsApp au message de demande. Son numéro n'est
 *     pas celui d'un parent : on l'identifie dans `profiles` (role = teacher) et
 *     on lit la date qu'il propose (français, arabe, darija — repli DeepSeek).
 *     Sa réponse est une PROPOSITION : c'est le staff qui accorde ensuite.
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '../../../config/supabase.js';
import { sendText } from '../index.js';
import * as State from './state.js';
import {
  createAppointment,
  proposeSlot,
  markTeacherUnavailable,
  listClassTeachers,
  formatSlot,
  getAppointment,
} from '../../appointments.js';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  timeout: 30_000,
  maxRetries: 1,
});

const TZ_OFFSET = '+01:00'; // Maroc (Africa/Casablanca)

// ─────────────────────────────────────────────────────────────────────────
// Détection « je veux un rendez-vous »
// ─────────────────────────────────────────────────────────────────────────

const APPT_RE = new RegExp([
  // Français
  'rendez[\\s-]?vous', '\\brdv\\b', '\\brencontrer?\\b', 'prendre rendez',
  'voir le (directeur|prof|professeur|responsable)', 'rencontre avec',
  // Arabe standard / darija
  'موعد', 'مقابلة', 'نلتقي', 'نشوف المدير', 'نشوف الأستاذ',
  // Darija en lettres latines (arabizi)
  'maw3id', 'maw9id', 'nchouf lmoudir', 'nchof lmoudir', 'bghit nchouf',
].join('|'), 'i');

/** Le message demande-t-il un rendez-vous ? */
export function isAppointmentQuery(text) {
  const t = String(text || '').trim();
  if (t.length < 3) return false;
  return APPT_RE.test(t);
}

const NEGATIVE_RE = /^(non|no|nn|refus|refuse|je refuse|pas possible|impossible|لا|ماشي ممكن|makayn|mamkanch)/i;

/**
 * Filtre bon marché : le message ressemble-t-il à une réponse de créneau ?
 * Sert à ne PAS interroger la base pour chaque message d'un numéro qui est à
 * la fois parent et professeur — seuls les messages contenant une date, une
 * heure, un jour de la semaine ou un refus déclenchent la vérification.
 */
export function looksLikeSlotReply(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (NEGATIVE_RE.test(t)) return true;
  return /\d{1,2}\s*(?:h|:|heures?)|\d{1,2}[\/\-.]\d{1,2}|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|aujourd'?hui|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد|غدا|غدوة|موعد/i.test(t);
}

// ─────────────────────────────────────────────────────────────────────────
// Lecture d'une date + heure FUTURE dans un message libre
// ─────────────────────────────────────────────────────────────────────────

const MONTHS_FR = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11,
  décembre: 12, decembre: 12,
};
const WEEKDAYS_FR = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

/** Aujourd'hui à minuit, en heure du Maroc. */
function todayCasa() {
  const parts = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });
  const [y, m, d] = parts.split('-').map(Number);
  return { y, m, d };
}

function isoDate({ y, m, d }) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(base, days) {
  const dt = new Date(Date.UTC(base.y, base.m - 1, base.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function weekdayOf(day) {
  return new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
}

/**
 * Extrait la DATE (contrairement à dateExtractor.js, orientée passé, on vise
 * ici toujours le FUTUR : « jeudi » = le prochain jeudi).
 * @returns {string|null} YYYY-MM-DD
 */
export function parseFutureDate(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const today = todayCasa();

  if (/aujourd'?hui|اليوم|lyoum/i.test(lower)) return isoDate(today);
  if (/après[\s-]?demain|apres[\s-]?demain|بعد غد/i.test(lower)) return isoDate(addDays(today, 2));
  if (/demain|غدا|غدوة|ghedda|ghadda/i.test(lower)) return isoDate(addDays(today, 1));

  // JJ/MM ou JJ/MM/AAAA
  const num = lower.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (num) {
    const d = Number(num[1]);
    const m = Number(num[2]);
    let y = num[3] ? Number(num[3]) : today.y;
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      // Sans année explicite, une date déjà passée vise l'an prochain.
      const candidate = { y, m, d };
      if (!num[3] && isoDate(candidate) < isoDate(today)) candidate.y += 1;
      return isoDate(candidate);
    }
  }

  // « 12 septembre » / « 12 septembre 2026 »
  for (const [name, month] of Object.entries(MONTHS_FR)) {
    const match = lower.match(new RegExp(`(\\d{1,2})\\s+${name}(?:\\s+(\\d{4}))?`));
    if (match) {
      const d = Number(match[1]);
      const y = match[2] ? Number(match[2]) : today.y;
      if (d >= 1 && d <= 31) {
        const candidate = { y, m: month, d };
        if (!match[2] && isoDate(candidate) < isoDate(today)) candidate.y += 1;
        return isoDate(candidate);
      }
    }
  }

  // Jour de la semaine → PROCHAINE occurrence
  for (const [name, target] of Object.entries(WEEKDAYS_FR)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      let diff = (target - weekdayOf(today) + 7) % 7;
      if (diff === 0) diff = 7;                       // « jeudi » un jeudi = jeudi prochain
      if (/prochain|qui vient/.test(lower) && diff < 7) diff += 0;
      return isoDate(addDays(today, diff));
    }
  }

  return null;
}

/**
 * Extrait l'HEURE. Accepte « 10h », « 10h30 », « 10:30 », « 10 h 30 »,
 * « à 15 heures », « 3h de l'après-midi ».
 * @returns {string|null} HH:MM
 */
export function parseTime(text) {
  const lower = String(text || '').toLowerCase();

  const m = lower.match(/(\d{1,2})\s*(?:h|:|heures?|hr?)\s*(\d{2})?/);
  if (!m) return null;

  let hour = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (hour > 23 || minutes > 59) return null;

  // « 3h de l'après-midi » / « 3h du soir » → 15h
  if (hour < 12 && /(après[\s-]?midi|apres[\s-]?midi|soir|pm|المساء|العشية)/.test(lower)) hour += 12;

  return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Assemble date + heure en ISO (heure du Maroc). */
function toIso(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00${TZ_OFFSET}`).toISOString();
}

/**
 * Repli DeepSeek quand la regex échoue (arabe, darija, formulations libres).
 * @returns {Promise<{date:string|null, time:string|null, refused:boolean}|null>}
 */
async function aiParseSlot(text) {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  const today = isoDate(todayCasa());
  const sys = `Tu lis la réponse d'un professeur marocain à qui on demande de fixer un rendez-vous avec un parent. Le message peut être en français, arabe standard ou darija (y compris en lettres latines).
Aujourd'hui nous sommes le ${today} (Maroc).
Réponds STRICTEMENT en JSON, sans texte autour :
{"date": "YYYY-MM-DD ou null", "time": "HH:MM ou null", "refused": boolean}
Règles :
- date/time : le créneau proposé par le professeur, TOUJOURS dans le futur.
- Un jour de la semaine seul ("jeudi", "الخميس") = sa prochaine occurrence.
- refused = true si le professeur refuse ou dit qu'il n'est pas disponible.
- Si aucun créneau n'est exprimé, date et time valent null.`;
  try {
    const c = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: String(text || '').slice(0, 400) },
      ],
      temperature: 0.1,
      max_tokens: 120,
      response_format: { type: 'json_object' },
    });
    const raw = c.choices[0]?.message?.content?.trim();
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('[appointments/wa] DeepSeek:', e.message);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// A. FLUX PARENT
// ═════════════════════════════════════════════════════════════════════════

async function childrenOf(parentId) {
  const { data: links } = await supabaseAdmin
    .from('parent_students')
    .select('student:student_id(id, first_name, last_name, class_id, classes!fk_profiles_class(name))')
    .eq('parent_id', parentId);
  return (links || [])
    .map((l) => l.student)
    .filter(Boolean)
    .map((s) => ({
      id: s.id,
      name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
      class_id: s.class_id,
      class_name: s.classes?.name || null,
    }));
}

/** Convertit les chiffres arabes-indiens en chiffres latins. */
function normalizeDigits(text) {
  return String(text || '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

const ASK_TARGET = [
  '📅 *Demande de rendez-vous*',
  '',
  'Avec qui souhaitez-vous ce rendez-vous ?',
  '',
  '*1.* 🏫 L\'administration',
  '*2.* 👨‍🏫 Un professeur',
  '',
  '_Répondez 1 ou 2 — ou tapez *menu* pour annuler._',
].join('\n');

/**
 * Démarre le flux de prise de rendez-vous.
 * @param {object} p
 * @param {string} p.schoolId        école de l'état conversationnel
 * @param {object} p.parentInfo      { parent_id, school_id, school_name }
 * @param {string} p.phone
 * @param {string|null} p.studentId  enfant déjà sélectionné dans le chatbot
 */
export async function startAppointmentFlow({ schoolId, parentInfo, phone, studentId = null }) {
  const kids = await childrenOf(parentInfo.parent_id);
  if (kids.length === 0) {
    await sendText(parentInfo.school_id, phone, "❌ Aucun élève n'est rattaché à votre compte.", { urgent: true });
    return;
  }

  const selected = studentId && kids.find((k) => k.id === studentId)
    ? studentId
    : (kids.length === 1 ? kids[0].id : null);

  if (!selected) {
    State.setState(schoolId, phone, {
      state: 'APPT',
      apptStep: 'child',
      apptChildren: kids.map((k) => k.id),
    });
    const lines = [
      '📅 *Demande de rendez-vous*',
      '',
      'Pour quel enfant ?',
      '',
      ...kids.map((k, i) => `*${i + 1}.* 👶 ${k.name}${k.class_name ? ` (${k.class_name})` : ''}`),
      '',
      '_Répondez avec le numéro._',
    ];
    await sendText(parentInfo.school_id, phone, lines.join('\n'), { urgent: true });
    return;
  }

  State.setState(schoolId, phone, {
    state: 'APPT',
    apptStep: 'target',
    apptStudentId: selected,
    studentId: selected,
  });
  await sendText(parentInfo.school_id, phone, ASK_TARGET, { urgent: true });
}

/**
 * Traite un message reçu pendant le flux de rendez-vous (state = 'APPT').
 * @returns {Promise<boolean>} true si le message a été consommé
 */
export async function handleAppointmentReply({ schoolId, parentInfo, phone, text, state }) {
  const input = normalizeDigits(String(text || '').trim());
  const step = state?.apptStep;
  const schoolIdOut = parentInfo.school_id;

  // ── Étape 1 : choix de l'enfant ──
  if (step === 'child') {
    const kids = await childrenOf(parentInfo.parent_id);
    const idx = Number(input) - 1;
    const chosen = kids[idx] || kids.find((k) => k.name.toLowerCase().includes(input.toLowerCase()));
    if (!chosen) {
      await sendText(schoolIdOut, phone, '❌ Choix invalide. Répondez avec le numéro de l\'enfant.', { urgent: true });
      return true;
    }
    // `studentId` est aussi posé : l'enfant choisi ici reste sélectionné pour
    // la suite de la conversation (menu, questions libres…).
    State.setState(schoolId, phone, { apptStep: 'target', apptStudentId: chosen.id, studentId: chosen.id });
    await sendText(schoolIdOut, phone, ASK_TARGET, { urgent: true });
    return true;
  }

  // ── Étape 2 : administration ou professeur ──
  if (step === 'target') {
    if (input === '1' || /administration|direction|مدير|الإدارة/i.test(input)) {
      State.setState(schoolId, phone, { apptStep: 'subject', apptTargetType: 'administration', apptTeacherId: null });
      await sendText(schoolIdOut, phone,
        '📝 Quel est l\'*objet* de ce rendez-vous ?\n\n_Écrivez-le en quelques mots (ex. « résultats de mon fils », « problème de transport »)._',
        { urgent: true });
      return true;
    }
    if (input === '2' || /professeur|prof|أستاذ|ustad/i.test(input)) {
      const kids = await childrenOf(parentInfo.parent_id);
      const child = kids.find((k) => k.id === state.apptStudentId);
      const teachers = await listClassTeachers(child?.class_id);
      if (teachers.length === 0) {
        await sendText(schoolIdOut, phone,
          '❌ Aucun professeur n\'est encore rattaché à la classe de votre enfant.\n\nVotre demande sera adressée à l\'administration.\n\n📝 Quel est l\'*objet* de ce rendez-vous ?',
          { urgent: true });
        State.setState(schoolId, phone, { apptStep: 'subject', apptTargetType: 'administration', apptTeacherId: null });
        return true;
      }
      State.setState(schoolId, phone, {
        apptStep: 'teacher',
        apptTargetType: 'teacher',
        apptTeachers: teachers.map((t) => ({ id: t.id, name: t.name })),
      });
      const lines = [
        '👨‍🏫 *Avec quel professeur ?*',
        '',
        ...teachers.map((t, i) => `*${i + 1}.* ${t.name}${t.subjects.length ? ` — _${t.subjects.join(', ')}_` : ''}`),
        '',
        '_Répondez avec le numéro._',
      ];
      await sendText(schoolIdOut, phone, lines.join('\n'), { urgent: true });
      return true;
    }
    await sendText(schoolIdOut, phone, '❌ Répondez *1* (administration) ou *2* (professeur).', { urgent: true });
    return true;
  }

  // ── Étape 3 : choix du professeur ──
  if (step === 'teacher') {
    const list = state.apptTeachers || [];
    const idx = Number(input) - 1;
    const chosen = list[idx] || list.find((t) => t.name.toLowerCase().includes(input.toLowerCase()));
    if (!chosen) {
      await sendText(schoolIdOut, phone, '❌ Choix invalide. Répondez avec le numéro du professeur.', { urgent: true });
      return true;
    }
    State.setState(schoolId, phone, { apptStep: 'subject', apptTeacherId: chosen.id });
    await sendText(schoolIdOut, phone,
      `📝 Quel est l'*objet* du rendez-vous avec *${chosen.name}* ?\n\n_Écrivez-le en quelques mots._`,
      { urgent: true });
    return true;
  }

  // ── Étape 4 : objet ──
  if (step === 'subject') {
    if (input.length < 3) {
      await sendText(schoolIdOut, phone, '❌ Merci de préciser l\'objet du rendez-vous en quelques mots.', { urgent: true });
      return true;
    }
    State.setState(schoolId, phone, { apptStep: 'slot', apptSubject: input.slice(0, 300) });
    await sendText(schoolIdOut, phone,
      '🕐 Avez-vous une *préférence de créneau* ?\n\n_Ex. « jeudi matin », « après 16h ». Tapez *0* pour laisser l\'école choisir._',
      { urgent: true });
    return true;
  }

  // ── Étape 5 : créneau souhaité → enregistrement ──
  if (step === 'slot') {
    const preferred = (input === '0' || /^(non|aucun|peu importe|لا)$/i.test(input)) ? null : input.slice(0, 300);
    try {
      const appt = await createAppointment({
        parentId: parentInfo.parent_id,
        schoolId: parentInfo.school_id,
        studentId: state.apptStudentId || null,
        targetType: state.apptTargetType === 'teacher' ? 'teacher' : 'administration',
        teacherId: state.apptTeacherId || null,
        subject: state.apptSubject,
        preferredSlot: preferred,
        source: 'whatsapp',
      });

      const avec = appt.target_type === 'teacher'
        ? `*${`${appt.teacher?.first_name || ''} ${appt.teacher?.last_name || ''}`.trim()}*`
        : "*l'administration*";
      await sendText(schoolIdOut, phone, [
        '✅ *Votre demande de rendez-vous est enregistrée*',
        '',
        `👤 Avec : ${avec}`,
        `📝 Objet : ${appt.subject}`,
        preferred ? `🕐 Votre souhait : ${preferred}` : null,
        '',
        `L'établissement vous confirmera *la date et l'heure* par ce même canal.`,
        '',
        '_Tapez *menu* pour revenir aux autres options._',
      ].filter(Boolean).join('\n'), { urgent: true });
    } catch (e) {
      console.error('[appointments/wa] création:', e.message);
      await sendText(schoolIdOut, phone,
        "❌ La demande n'a pas pu être enregistrée. Réessayez plus tard ou contactez l'établissement.",
        { urgent: true });
    }
    State.setMenu(schoolId, phone, 'main');
    return true;
  }

  return false;
}

// ═════════════════════════════════════════════════════════════════════════
// B. FLUX PROFESSEUR (réponse WhatsApp à une demande)
// ═════════════════════════════════════════════════════════════════════════

/** Le numéro appartient-il à un professeur de cette école ? */
export async function getTeacherByPhone(phone, schoolId = null) {
  let q = supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, school_id')
    .eq('role', 'teacher')
    .eq('phone', phone);
  if (schoolId) q = q.eq('school_id', schoolId);
  const { data } = await q.limit(1);
  return data?.[0] || null;
}

/** Demandes en attente d'une réponse de ce professeur. */
async function pendingForTeacher(teacherId) {
  const { data } = await supabaseAdmin
    .from('appointment_requests')
    .select('id, subject, status, created_at, parent:profiles!appointment_requests_parent_id_fkey(first_name, last_name), student:profiles!appointment_requests_student_id_fkey(first_name, last_name)')
    .eq('teacher_id', teacherId)
    .in('status', ['en_attente', 'propose'])
    .order('created_at', { ascending: false })
    .limit(10);
  return data || [];
}

/** Enregistre la proposition du professeur et le lui confirme. */
async function registerProposal({ schoolId, phone, teacher, appointmentId, dateStr, timeStr }) {
  const appt = await getAppointment(appointmentId);
  if (!appt || appt.teacher_id !== teacher.id) return false;

  const iso = toIso(dateStr, timeStr);
  await proposeSlot({ appointment: appt, teacherId: teacher.id, proposedAt: iso });

  const parentName = `${appt.parent?.first_name || ''} ${appt.parent?.last_name || ''}`.trim();
  await sendText(teacher.school_id || schoolId, phone, [
    '✅ *Créneau proposé*',
    '',
    `📅 ${formatSlot(iso)}`,
    parentName ? `👤 Parent : ${parentName}` : null,
    `📝 Objet : ${appt.subject}`,
    '',
    "_L'administration valide le créneau puis prévient le parent. Vous recevrez la confirmation._",
  ].filter(Boolean).join('\n'), { urgent: true });
  return true;
}

/**
 * Tente de traiter le message comme la réponse d'un professeur à une demande
 * de rendez-vous.
 *
 * @returns {Promise<boolean>} true si le message a été consommé
 */
export async function handleTeacherAppointmentMessage({ schoolId, phone, text, teacher = null }) {
  const input = String(text || '').trim();
  if (!input) return false;

  const prof = teacher || await getTeacherByPhone(phone, schoolId);
  if (!prof) return false;

  const state = State.getState(schoolId, phone);
  const outSchool = prof.school_id || schoolId;

  // ── Le professeur avait été invité à préciser l'heure ──
  if (state?.state === 'APPT_TEACHER' && state.apptTeacherDate && state.apptTeacherPendingId) {
    const time = parseTime(input) || (await aiParseSlot(input))?.time;
    if (!time) {
      await sendText(outSchool, phone, '🕐 Merci d\'indiquer l\'*heure* du rendez-vous (ex. « 10h30 »).', { urgent: true });
      return true;
    }
    await registerProposal({
      schoolId, phone, teacher: prof,
      appointmentId: state.apptTeacherPendingId,
      dateStr: state.apptTeacherDate,
      timeStr: time,
    });
    State.resetState(schoolId, phone);
    return true;
  }

  const pending = await pendingForTeacher(prof.id);
  if (pending.length === 0) return false;

  // ── Le professeur devait dire de QUELLE demande il parle ──
  if (state?.state === 'APPT_TEACHER' && state.apptTeacherChoices) {
    const idx = Number(input.replace(/[^\d]/g, '')) - 1;
    const chosen = state.apptTeacherChoices[idx];
    if (chosen) {
      State.setState(schoolId, phone, { apptTeacherChoices: null, apptTeacherPendingId: chosen });
      await sendText(outSchool, phone,
        '📅 Indiquez la *date et l\'heure* que vous proposez (ex. « jeudi 10h30 »).',
        { urgent: true });
      return true;
    }
  }

  // ── Refus ──
  if (NEGATIVE_RE.test(input)) {
    const target = state?.apptTeacherPendingId || (pending.length === 1 ? pending[0].id : null);
    if (!target) return false;
    const appt = await getAppointment(target);
    if (!appt) return false;
    await markTeacherUnavailable({ appointment: appt, teacherId: prof.id, message: input });
    await sendText(outSchool, phone,
      "👍 C'est noté : vous n'êtes pas disponible. L'administration prendra le relais.",
      { urgent: true });
    State.resetState(schoolId, phone);
    return true;
  }

  // ── Lecture du créneau proposé ──
  let dateStr = parseFutureDate(input);
  let timeStr = parseTime(input);
  if (!dateStr) {
    const ai = await aiParseSlot(input);
    if (ai?.date) dateStr = ai.date;
    if (!timeStr && ai?.time) timeStr = ai.time;
  }
  if (!dateStr) return false; // pas une réponse de rendez-vous → laisser passer

  // Plusieurs demandes en attente → demander laquelle
  const target = state?.apptTeacherPendingId || (pending.length === 1 ? pending[0].id : null);
  if (!target) {
    State.setState(schoolId, phone, {
      state: 'APPT_TEACHER',
      apptTeacherChoices: pending.map((p) => p.id),
      apptTeacherDate: null,
      apptTeacherPendingId: null,
    });
    const lines = [
      '📅 Vous avez plusieurs demandes de rendez-vous en attente.',
      '',
      ...pending.map((p, i) => {
        const parent = `${p.parent?.first_name || ''} ${p.parent?.last_name || ''}`.trim();
        const kid = `${p.student?.first_name || ''}`.trim();
        return `*${i + 1}.* ${parent || 'Parent'}${kid ? ` (${kid})` : ''} — ${p.subject}`;
      }),
      '',
      '_Répondez avec le numéro concerné._',
    ];
    await sendText(outSchool, phone, lines.join('\n'), { urgent: true });
    return true;
  }

  // Date sans heure → on demande l'heure
  if (!timeStr) {
    State.setState(schoolId, phone, {
      state: 'APPT_TEACHER',
      apptTeacherPendingId: target,
      apptTeacherDate: dateStr,
      apptTeacherChoices: null,
    });
    await sendText(outSchool, phone,
      `📅 Date retenue : *${dateStr.split('-').reverse().join('/')}*.\n\n🕐 À quelle *heure* ? (ex. « 10h30 »)`,
      { urgent: true });
    return true;
  }

  await registerProposal({ schoolId, phone, teacher: prof, appointmentId: target, dateStr, timeStr });
  State.resetState(schoolId, phone);
  return true;
}
