/**
 * Réponses du chatbot ENSEIGNANT — 100 % CONSULTATION (phase 1).
 *
 * Aucune écriture en base ici : ces fonctions ne font que lire et formater.
 * Toute la sécurité repose sur le PÉRIMÈTRE : un professeur ne voit que les
 * classes où il intervient (class_teachers ∪ class_timetable), relu à chaque
 * message et jamais mémorisé dans l'état conversationnel — exactement la même
 * règle que `getLinkedStudent` côté parent.
 *
 * Note archivage : archiver un élève détache sa classe (class_id = null), donc
 * toutes les listes par classe ci-dessous excluent déjà les archivés sans avoir
 * besoin de filtrer `archived_at` (colonne parfois absente selon les écoles).
 */

import { supabaseAdmin } from '../../../../config/supabase.js';
import { selectInChunksSafe } from '../../../../utils/chunkedQueries.js';

// ─────────────────────────────────────────────────────────────────────────
// Helpers de formatage (mêmes conventions que le chatbot parent)
// ─────────────────────────────────────────────────────────────────────────

const header = (title, emoji) => `*${emoji} ${title}*\n━━━━━━━━━━━━━━━━━━━`;
const footer = (schoolName) => `\n━━━━━━━━━━━━━━━━━━━\n🏫 ${schoolName || 'École'}`;

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  } catch { return iso; }
};

/** '08:30:00' → '08:30' */
const fmtTime = (t) => (t ? String(t).slice(0, 5) : '—');

const todayISO = () => new Date().toISOString().slice(0, 10);

const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** class_timetable.day_of_week stocke le nom du jour en anglais minuscule. */
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABELS = {
  monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi',
  friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche',
};
const WEEK_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const fullName = (p) => `${p?.first_name || ''} ${p?.last_name || ''}`.trim();

const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Indicateur couleur sur un taux de présence. */
const presenceIcon = (p) => (p >= 90 ? '🟢' : p >= 75 ? '🔵' : p >= 60 ? '🟡' : '🔴');

// ─────────────────────────────────────────────────────────────────────────
// Périmètre du professeur
// ─────────────────────────────────────────────────────────────────────────

/**
 * Classes où le professeur intervient réellement.
 *
 * On croise DEUX sources : `class_teachers` (affectation déclarée, utilisée par
 * la route /teacher/my-classes) et `class_timetable` (créneaux). Certaines
 * écoles ne remplissent que l'emploi du temps : sans l'union, ces professeurs
 * n'auraient aucune classe.
 *
 * @returns {Promise<{classIds: string[], classes: Array, classById: Map}>}
 */
export async function getTeacherScope(teacher) {
  const [assigned, slots] = await Promise.all([
    supabaseAdmin.from('class_teachers').select('class_id').eq('teacher_id', teacher.id),
    supabaseAdmin.from('class_timetable').select('class_id').eq('teacher_id', teacher.id),
  ]);

  const ids = [...new Set(
    [...(assigned.data || []), ...(slots.data || [])]
      .map((r) => r.class_id)
      .filter(Boolean)
  )];

  if (ids.length === 0) return { classIds: [], classes: [], classById: new Map() };

  const rows = await selectInChunksSafe(ids, (part) =>
    supabaseAdmin.from('classes').select('id, name, level').in('id', part));

  // Le tri doit se faire en JS : les lots sont triés indépendamment.
  const classes = rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'));

  return {
    classIds: classes.map((c) => c.id),
    classes,
    classById: new Map(classes.map((c) => [c.id, c])),
  };
}

/** Élèves d'un ensemble de classes (jamais toute l'école). */
export async function studentsOfClasses(classIds) {
  if (!classIds || classIds.length === 0) return [];
  const rows = await selectInChunksSafe(classIds, (part) =>
    supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id')
      .eq('role', 'student')
      .in('class_id', part));
  return rows;
}

/**
 * Retrouve un élève DANS LE PÉRIMÈTRE du professeur à partir d'une saisie
 * libre (prénom, nom, nom complet dans n'importe quel ordre, ou numéro dans
 * une liste précédemment affichée).
 *
 * @returns {{match: object|null, candidates: Array}} plusieurs homonymes →
 *          `candidates` est renvoyé pour faire choisir le professeur.
 */
export function matchStudents(input, students) {
  const raw = String(input || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (raw.length < 2 || !students?.length) return { match: null, candidates: [] };

  const norm = (s) => String(s || '').toLowerCase().trim();
  const hits = students.filter((s) => {
    const first = norm(s.first_name);
    const last = norm(s.last_name);
    return (
      first === raw || last === raw ||
      `${first} ${last}` === raw || `${last} ${first}` === raw ||
      `${first} ${last}`.includes(raw) || `${last} ${first}`.includes(raw)
    );
  });

  if (hits.length === 1) return { match: hits[0], candidates: [] };
  return { match: null, candidates: hits.slice(0, 10) };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Ma journée
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cours du jour + rappel des séances non saisies.
 *
 * Une séance est considérée « saisie » quand une ligne `sessions` existe pour
 * la même classe au même horaire de début : c'est ce que fait le professeur
 * dans l'app en clôturant sa séance.
 */
export async function getTodayAgenda(teacher, scope, schoolName) {
  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()];
  const iso = todayISO();

  const [{ data: slots }, { data: sessions }] = await Promise.all([
    supabaseAdmin
      .from('class_timetable')
      .select('id, class_id, start_time, end_time, room, slot_order, subject:subjects(name)')
      .eq('teacher_id', teacher.id)
      .eq('day_of_week', dayName),
    supabaseAdmin
      .from('sessions')
      .select('id, class_id, start_time, topic')
      .eq('teacher_id', teacher.id)
      .eq('date', iso),
  ]);

  const ordered = (slots || []).sort(
    (a, b) => String(a.start_time || '').localeCompare(String(b.start_time || ''))
  );

  const doneKey = new Set((sessions || []).map((s) => `${s.class_id}|${fmtTime(s.start_time)}`));
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });

  const lines = [];
  if (ordered.length === 0) {
    lines.push(`Aucun cours à votre emploi du temps aujourd'hui.`);
  } else {
    ordered.forEach((s) => {
      const cls = scope.classById.get(s.class_id);
      const saved = doneKey.has(`${s.class_id}|${fmtTime(s.start_time)}`);
      let line = `${saved ? '✅' : '⏳'} *${fmtTime(s.start_time)}–${fmtTime(s.end_time)}* — ${cls?.name || 'Classe'}`;
      if (s.subject?.name) line += ` _(${s.subject.name})_`;
      if (s.room) line += `\n   📍 Salle ${s.room}`;
      if (!saved) line += `\n   _séance non encore saisie_`;
      lines.push(line);
    });
  }

  const { missing, activeDays } = await countMissingSessions(teacher, scope, 7);
  let tail = '';
  if (activeDays > 0) {
    tail = missing > 0
      ? `\n\n⚠️ *${missing} séance${missing > 1 ? 's' : ''} non saisie${missing > 1 ? 's' : ''}* sur les 7 derniers jours.`
      : `\n\n✅ Toutes vos séances des 7 derniers jours sont saisies.`;
  }

  return `${header(dateLabel, '📅')}\n\n${lines.join('\n\n')}${tail}${footer(schoolName)}`;
}

/**
 * Créneaux passés (hors aujourd'hui) sans séance enregistrée.
 *
 * Les vacances et jours fériés ne sont pas modélisés en base : compter tous
 * les créneaux de l'emploi du temps ferait sonner l'alerte en plein mois
 * d'août. On ne retient donc que les jours où AU MOINS UNE séance a été
 * enregistrée dans les classes du professeur, tous enseignants confondus —
 * c'est la seule trace fiable d'un jour réellement travaillé. Le compte est
 * ainsi minoré plutôt que majoré : mieux vaut taire un oubli que harceler.
 */
async function countMissingSessions(teacher, scope, days) {
  const since = daysAgoISO(days);
  const before = todayISO();

  const [{ data: slots }, schoolSessions] = await Promise.all([
    supabaseAdmin
      .from('class_timetable')
      .select('class_id, day_of_week, start_time')
      .eq('teacher_id', teacher.id),
    selectInChunksSafe(scope.classIds, (part) =>
      supabaseAdmin
        .from('sessions')
        .select('class_id, teacher_id, date, start_time')
        .in('class_id', part)
        .gte('date', since)
        .lt('date', before)),
  ]);

  if (!slots?.length) return { missing: 0, activeDays: 0 };

  const workedDays = new Set(schoolSessions.map((s) => s.date));
  const done = new Set(
    schoolSessions
      .filter((s) => s.teacher_id === teacher.id)
      .map((s) => `${s.date}|${s.class_id}|${fmtTime(s.start_time)}`)
  );

  const byDay = new Map();
  for (const s of slots) {
    if (!byDay.has(s.day_of_week)) byDay.set(s.day_of_week, []);
    byDay.get(s.day_of_week).push(s);
  }

  let missing = 0;
  let activeDays = 0;
  for (let i = 1; i <= days; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dISO = d.toISOString().slice(0, 10);
    if (!workedDays.has(dISO)) continue;
    activeDays += 1;
    for (const slot of byDay.get(DAY_NAMES[d.getDay()]) || []) {
      if (!done.has(`${dISO}|${slot.class_id}|${fmtTime(slot.start_time)}`)) missing += 1;
    }
  }
  return { missing, activeDays };
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Mes classes
// ─────────────────────────────────────────────────────────────────────────

/** Liste numérotée des classes du professeur, avec effectif. */
export async function getMyClasses(scope, schoolName) {
  if (scope.classes.length === 0) {
    return `${header('Mes classes', '🏫')}\n\nAucune classe ne vous est affectée.\n_Contactez l'administration de l'école._${footer(schoolName)}`;
  }

  const students = await studentsOfClasses(scope.classIds);
  const countByClass = new Map();
  students.forEach((s) => countByClass.set(s.class_id, (countByClass.get(s.class_id) || 0) + 1));

  const lines = scope.classes.map((c, i) => {
    const n = countByClass.get(c.id) || 0;
    return `*${i + 1}.* 🏫 ${c.name}${c.level ? ` _(${c.level})_` : ''} — ${n} élève${n > 1 ? 's' : ''}`;
  });

  return `${header('Mes classes', '🏫')}\n\n${lines.join('\n')}\n\n_Répondez avec le numéro d'une classe pour son bilan._${footer(schoolName)}`;
}

/**
 * Bilan d'une classe sur 30 jours : assiduité, élèves à surveiller,
 * devoirs en cours et prochain contrôle.
 */
export async function getClassSummary(klass, schoolName) {
  const since = daysAgoISO(30);
  const today = todayISO();

  const [students, { data: sessions }, { data: homework }, { data: controls }] = await Promise.all([
    studentsOfClasses([klass.id]),
    supabaseAdmin
      .from('sessions')
      .select('id, date')
      .eq('class_id', klass.id)
      .gte('date', since),
    supabaseAdmin
      .from('homework')
      .select('id, title, due_date')
      .eq('class_id', klass.id)
      .gte('due_date', today)
      .order('due_date')
      .limit(5),
    supabaseAdmin
      .from('controls_plan')
      .select('id, name, date')
      .eq('class_id', klass.id)
      .gte('date', today)
      .order('date')
      .limit(3),
  ]);

  const sessionIds = (sessions || []).map((s) => s.id);
  const tracking = sessionIds.length
    ? await selectInChunksSafe(sessionIds, (part) =>
        supabaseAdmin
          .from('session_tracking')
          .select('student_id, presence')
          .in('session_id', part))
    : [];

  const total = tracking.length;
  const present = tracking.filter((t) => t.presence === 'present').length;
  const late = tracking.filter((t) => t.presence === 'late').length;
  const rate = pct(present, total);

  // Élèves les plus absents sur la période
  const absByStudent = new Map();
  tracking.filter((t) => t.presence === 'absent').forEach((t) => {
    absByStudent.set(t.student_id, (absByStudent.get(t.student_id) || 0) + 1);
  });
  const nameById = new Map(students.map((s) => [s.id, fullName(s)]));
  const worst = [...absByStudent.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sid, n]) => `   • ${nameById.get(sid) || 'Élève'} — ${n} absence${n > 1 ? 's' : ''}`);

  const parts = [
    `👥 Effectif : *${students.length}* élèves`,
    total > 0
      ? `${presenceIcon(rate)} Présence (30 j) : *${rate}%* sur ${sessions.length} séance${sessions.length > 1 ? 's' : ''}${late > 0 ? ` — ⏰ ${late} retard${late > 1 ? 's' : ''}` : ''}`
      : `📊 Aucun suivi de séance enregistré sur les 30 derniers jours`,
  ];

  if (worst.length) parts.push(`\n🔴 *Absences à surveiller :*\n${worst.join('\n')}`);

  if (homework?.length) {
    const hw = homework.map((h) => `   • ${h.title} — _à rendre le ${fmtDate(h.due_date)}_`);
    parts.push(`\n✍️ *Devoirs en cours :*\n${hw.join('\n')}`);
  } else {
    parts.push(`\n✍️ Aucun devoir en cours.`);
  }

  if (controls?.length) {
    const ct = controls.map((c) => `   • ${c.name} — _${fmtDate(c.date)}_`);
    parts.push(`\n📋 *Contrôles à venir :*\n${ct.join('\n')}`);
  }

  return `${header(`${klass.name}${klass.level ? ` — ${klass.level}` : ''}`, '🏫')}\n\n${parts.join('\n')}\n\n_Tapez le *nom d'un élève* pour sa fiche._${footer(schoolName)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Fiche élève
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fiche de synthèse d'un élève : assiduité, comportement, dernières notes,
 * devoirs non rendus et contact du parent.
 *
 * L'appelant DOIT avoir vérifié que l'élève appartient au périmètre du
 * professeur (voir `studentsOfClasses`).
 */
export async function getStudentSheet(student, scope, schoolName) {
  const since = daysAgoISO(30);
  const today = todayISO();
  const klass = scope.classById.get(student.class_id);

  const [{ data: sessions }, { data: controls }, { data: homework }, { data: links }] = await Promise.all([
    supabaseAdmin.from('sessions').select('id').eq('class_id', student.class_id).gte('date', since),
    supabaseAdmin
      .from('controls_plan')
      .select('id, name, date')
      .eq('class_id', student.class_id)
      .lte('date', today)
      .order('date', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('homework')
      .select('id, title, due_date')
      .eq('class_id', student.class_id)
      .gte('due_date', daysAgoISO(30))
      .order('due_date', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('parent_students')
      .select('parent:parent_id(first_name, last_name, phone)')
      .eq('student_id', student.id)
      .limit(3),
  ]);

  // Assiduité + comportement sur 30 jours
  const sessionIds = (sessions || []).map((s) => s.id);
  const tracking = sessionIds.length
    ? await selectInChunksSafe(sessionIds, (part) =>
        supabaseAdmin
          .from('session_tracking')
          .select('presence, participation, discipline, comment')
          .eq('student_id', student.id)
          .in('session_id', part))
    : [];

  const total = tracking.length;
  const present = tracking.filter((t) => t.presence === 'present').length;
  const absent = tracking.filter((t) => t.presence === 'absent').length;
  const late = tracking.filter((t) => t.presence === 'late').length;
  const goodPart = tracking.filter((t) => ['excellent', 'bonne'].includes(t.participation)).length;
  const badDisc = tracking.filter((t) => ['agite', 'perturbateur', 'bad'].includes(t.discipline)).length;

  const parts = [];
  parts.push(`🏫 Classe : *${klass?.name || '—'}*`);

  if (total > 0) {
    const rate = pct(present, total);
    let l = `${presenceIcon(rate)} Présence (30 j) : *${rate}%* (${present}/${total})`;
    if (absent > 0) l += `\n   ❌ ${absent} absence${absent > 1 ? 's' : ''}`;
    if (late > 0) l += `\n   ⏰ ${late} retard${late > 1 ? 's' : ''}`;
    parts.push(l);
    parts.push(`👋 Bonne participation : *${pct(goodPart, total)}%*${badDisc > 0 ? `\n⚠️ Discipline signalée : *${badDisc}* fois` : ''}`);
  } else {
    parts.push(`📊 Aucun suivi de séance sur les 30 derniers jours.`);
  }

  // Dernières notes du professeur sur les contrôles de la classe
  const controlIds = (controls || []).map((c) => c.id);
  if (controlIds.length) {
    const notes = await selectInChunksSafe(controlIds, (part) =>
      supabaseAdmin
        .from('control_notes')
        .select('control_id, note')
        .eq('student_id', student.id)
        .in('control_id', part));
    const byControl = new Map(notes.map((n) => [n.control_id, n.note]));
    const lines = (controls || [])
      .filter((c) => byControl.has(c.id))
      .slice(0, 4)
      .map((c) => `   • ${c.name} — *${byControl.get(c.id)}/20* _(${fmtDate(c.date)})_`);
    if (lines.length) parts.push(`\n📝 *Dernières notes :*\n${lines.join('\n')}`);
  }

  // Devoirs non rendus
  const hwIds = (homework || []).map((h) => h.id);
  if (hwIds.length) {
    const submissions = await selectInChunksSafe(hwIds, (part) =>
      supabaseAdmin
        .from('homework_submissions')
        .select('homework_id, status')
        .eq('student_id', student.id)
        .in('homework_id', part));
    const submitted = new Set(
      submissions.filter((s) => s.status === 'submitted').map((s) => s.homework_id)
    );
    const missing = (homework || []).filter((h) => !submitted.has(h.id)).slice(0, 5);
    if (missing.length) {
      parts.push(`\n📕 *Devoirs non rendus :*\n${missing.map((h) => `   • ${h.title} _(${fmtDate(h.due_date)})_`).join('\n')}`);
    }
  }

  // Dernier commentaire de suivi
  const lastComment = tracking.find((t) => t.comment && String(t.comment).trim());
  if (lastComment) parts.push(`\n💬 _« ${String(lastComment.comment).slice(0, 200)} »_`);

  // Contact parent : le professeur peut appeler directement depuis WhatsApp
  const parents = (links || []).map((l) => l.parent).filter(Boolean);
  if (parents.length) {
    const contacts = parents.map((p) => {
      const tel = p.phone ? `${p.phone} — wa.me/${String(p.phone).replace(/[^0-9]/g, '')}` : 'numéro non renseigné';
      return `   • ${fullName(p)} : ${tel}`;
    });
    parts.push(`\n👨‍👩‍👧 *Contact parent :*\n${contacts.join('\n')}`);
  }

  return `${header(fullName(student), '🎓')}\n\n${parts.join('\n')}${footer(schoolName)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Devoirs en cours
// ─────────────────────────────────────────────────────────────────────────

/** Devoirs à échéance future sur toutes les classes du professeur, + taux de rendu. */
export async function getActiveHomework(scope, schoolName) {
  if (scope.classIds.length === 0) {
    return `${header('Devoirs en cours', '✍️')}\n\nAucune classe ne vous est affectée.${footer(schoolName)}`;
  }

  const rows = await selectInChunksSafe(scope.classIds, (part) =>
    supabaseAdmin
      .from('homework')
      .select('id, title, class_id, due_date, type')
      .in('class_id', part)
      .gte('due_date', todayISO()));

  if (rows.length === 0) {
    return `${header('Devoirs en cours', '✍️')}\n\nAucun devoir en cours dans vos classes.${footer(schoolName)}`;
  }

  const homework = rows
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 10);

  const [students, submissions] = await Promise.all([
    studentsOfClasses(scope.classIds),
    selectInChunksSafe(homework.map((h) => h.id), (part) =>
      supabaseAdmin
        .from('homework_submissions')
        .select('homework_id, status')
        .in('homework_id', part)),
  ]);

  const sizeByClass = new Map();
  students.forEach((s) => sizeByClass.set(s.class_id, (sizeByClass.get(s.class_id) || 0) + 1));

  const doneByHw = new Map();
  submissions
    .filter((s) => s.status === 'submitted')
    .forEach((s) => doneByHw.set(s.homework_id, (doneByHw.get(s.homework_id) || 0) + 1));

  const lines = homework.map((h) => {
    const cls = scope.classById.get(h.class_id);
    const size = sizeByClass.get(h.class_id) || 0;
    const done = doneByHw.get(h.id) || 0;
    const ratio = size > 0 ? `${done}/${size} rendus` : `${done} rendu${done > 1 ? 's' : ''}`;
    return `📌 *${h.title}*\n   🏫 ${cls?.name || 'Classe'} — 📅 ${fmtDate(h.due_date)}\n   📥 ${ratio}`;
  });

  return `${header('Devoirs en cours', '✍️')}\n\n${lines.join('\n\n')}${footer(schoolName)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Contrôles
// ─────────────────────────────────────────────────────────────────────────

/** Contrôles planifiés à venir + contrôles passés dont les notes manquent. */
export async function getControls(teacher, scope, schoolName) {
  const today = todayISO();

  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabaseAdmin
      .from('controls_plan')
      .select('id, name, class_id, date, start_time')
      .eq('teacher_id', teacher.id)
      .gte('date', today)
      .order('date')
      .limit(8),
    supabaseAdmin
      .from('controls_plan')
      .select('id, name, class_id, date')
      .eq('teacher_id', teacher.id)
      .lt('date', today)
      .gte('date', daysAgoISO(45))
      .order('date', { ascending: false })
      .limit(8),
  ]);

  const parts = [];

  if (upcoming?.length) {
    const lines = upcoming.map((c) => {
      const cls = scope.classById.get(c.class_id);
      return `📋 *${c.name}*\n   🏫 ${cls?.name || 'Classe'} — 📅 ${fmtDate(c.date)}${c.start_time ? ` à ${fmtTime(c.start_time)}` : ''}`;
    });
    parts.push(`*À venir :*\n${lines.join('\n')}`);
  } else {
    parts.push(`Aucun contrôle planifié à venir.`);
  }

  // Notes manquantes : comparaison effectif de la classe / notes saisies
  if (past?.length) {
    const students = await studentsOfClasses([...new Set(past.map((c) => c.class_id))]);
    const sizeByClass = new Map();
    students.forEach((s) => sizeByClass.set(s.class_id, (sizeByClass.get(s.class_id) || 0) + 1));

    const notes = await selectInChunksSafe(past.map((c) => c.id), (part) =>
      supabaseAdmin.from('control_notes').select('control_id').in('control_id', part));
    const countByControl = new Map();
    notes.forEach((n) => countByControl.set(n.control_id, (countByControl.get(n.control_id) || 0) + 1));

    const pending = past
      .map((c) => ({ c, saisies: countByControl.get(c.id) || 0, size: sizeByClass.get(c.class_id) || 0 }))
      .filter((r) => r.size > 0 && r.saisies < r.size);

    if (pending.length) {
      const lines = pending.map(({ c, saisies, size }) => {
        const cls = scope.classById.get(c.class_id);
        return `   • ${c.name} — ${cls?.name || 'Classe'} : *${saisies}/${size}* notes saisies`;
      });
      parts.push(`\n⚠️ *Notes à compléter :*\n${lines.join('\n')}\n\n_La saisie des notes se fait dans l'application._`);
    }
  }

  return `${header('Mes contrôles', '📋')}\n\n${parts.join('\n')}${footer(schoolName)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Rendez-vous parents
// ─────────────────────────────────────────────────────────────────────────

/**
 * Demandes de rendez-vous adressées à ce professeur et encore ouvertes.
 * La RÉPONSE (proposition de créneau) reste gérée par `chatbot/appointments.js`,
 * qui interprète le créneau en langage naturel — ici on ne fait qu'afficher.
 */
export async function getAppointments(teacher, schoolName) {
  const { data } = await supabaseAdmin
    .from('appointment_requests')
    .select('id, subject, status, created_at, proposed_at, parent:profiles!appointment_requests_parent_id_fkey(first_name, last_name), student:profiles!appointment_requests_student_id_fkey(first_name, last_name)')
    .eq('teacher_id', teacher.id)
    .in('status', ['en_attente', 'propose'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data?.length) {
    return `${header('Rendez-vous parents', '📅')}\n\nAucune demande en attente.${footer(schoolName)}`;
  }

  const lines = data.map((a) => {
    const who = fullName(a.parent) || 'Parent';
    const kid = fullName(a.student);
    const state = a.status === 'propose'
      ? `🕐 Créneau proposé — en attente de validation`
      : `🔔 *En attente de votre proposition*`;
    return `👤 ${who}${kid ? ` _(élève : ${kid})_` : ''}\n   📝 ${a.subject || 'Sans objet'}\n   ${state}`;
  });

  return `${header('Rendez-vous parents', '📅')}\n\n${lines.join('\n\n')}\n\n_Pour proposer un créneau, répondez simplement ici (ex. « mardi 10h30 »)._${footer(schoolName)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// 7. Emploi du temps de la semaine
// ─────────────────────────────────────────────────────────────────────────

/** Emploi du temps hebdomadaire du professeur, groupé par jour. */
export async function getWeekTimetable(teacher, scope, schoolName) {
  const { data: slots } = await supabaseAdmin
    .from('class_timetable')
    .select('class_id, day_of_week, start_time, end_time, room, subject:subjects(name)')
    .eq('teacher_id', teacher.id);

  if (!slots?.length) {
    return `${header('Mon emploi du temps', '🗓️')}\n\nAucun créneau ne vous est attribué.\n_Contactez l'administration de l'école._${footer(schoolName)}`;
  }

  const byDay = new Map();
  slots.forEach((s) => {
    if (!byDay.has(s.day_of_week)) byDay.set(s.day_of_week, []);
    byDay.get(s.day_of_week).push(s);
  });

  const blocks = WEEK_ORDER.filter((d) => byDay.has(d)).map((d) => {
    const lines = byDay.get(d)
      .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
      .map((s) => {
        const cls = scope.classById.get(s.class_id);
        let l = `   ${fmtTime(s.start_time)}–${fmtTime(s.end_time)} · ${cls?.name || 'Classe'}`;
        if (s.subject?.name) l += ` (${s.subject.name})`;
        if (s.room) l += ` · 📍${s.room}`;
        return l;
      });
    return `*${DAY_LABELS[d] || d}*\n${lines.join('\n')}`;
  });

  const totalHours = slots.length;
  return `${header('Mon emploi du temps', '🗓️')}\n\n${blocks.join('\n\n')}\n\n📊 *${totalHours}* créneau${totalHours > 1 ? 'x' : ''} par semaine${footer(schoolName)}`;
}
