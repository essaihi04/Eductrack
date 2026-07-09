/**
 * Mode IA DeepSeek — uniquement appelé pour les questions LIBRES
 * (hors menu prédéfini).
 *
 * On reste strictement scolaire/éducatif et on s'appuie sur les données
 * réelles de l'élève passées en contexte.
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '../../../config/supabase.js';
import * as A from './answers.js';
import { getDefaultYearBounds, getCurrentAcademicYear } from '../../bulletins/schoolCalendar.js';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  // Conversation temps réel : mieux vaut basculer vite sur le message de
  // repli que laisser le parent attendre (défaut SDK : 10 min).
  timeout: 45_000,
  maxRetries: 1,
});

const SYSTEM_PROMPT = `Tu es l'assistant pédagogique officiel d'une école marocaine, accessible via WhatsApp aux parents.

RÈGLES STRICTES :
1. Tu réponds UNIQUEMENT sur le suivi scolaire de l'élève dont les données te sont fournies.
2. Tu n'inventes JAMAIS de notes, devoirs, présences ou montants. Si une donnée n'est pas dans le contexte fourni, dis-le simplement.
3. LANGUE : Tu réponds OBLIGATOIREMENT dans la MÊME langue/écriture que la question du parent.
   - Question en arabe (ou darija écrite en arabe) → réponse 100% en arabe, AUCUN mot français.
   - Question en français → réponse en français.
   - Question en darija latine (3robi) → réponse en darija latine.
   Ne mélange JAMAIS les langues dans une même réponse.
4. SUJET DE LA RÉPONSE :
   - Si la question concerne la PÉDAGOGIE (présence, absences, notes, devoirs, comportement, participation), ne parle QUE de pédagogie.
   - Si la question concerne la FINANCE (paiement, facture, frais, مال, دفع, أداء), ne parle QUE de finance.
   - N'AJOUTE JAMAIS d'information financière dans une réponse pédagogique, et inversement, sauf si le parent le demande explicitement.
5. Réponse COURTE et structurée, avec des emojis pertinents (📊 📝 ✅ ⚠️ 🎓).
   - Pour les notes : si la question concerne les notes/résultats, utilise le champ "grades_by_subject" et présente TOUTES les matières (moyenne par matière, meilleure note, nombre de contrôles). N'affiche PAS uniquement la dernière note.
   - Pour les devoirs : utilise "pending_homework" (à rendre), "overdue_homework" (en retard) et "homework_stats". Mentionne explicitement les compteurs.
   - Maximum ~10 lignes, sois exhaustif quand le parent demande "les notes" ou "les devoirs".
6. ⚠️ ASSIDUITÉ — RÈGLES IMPÉRATIVES :
   - Un *retard* (late) = élève PRÉSENT, juste en retard. NE LE COMPTE JAMAIS comme une absence.
   - Le "taux de présence" = (présent + retard) / total. Donc 100% si l'élève n'a jamais été absent, même avec des retards.
   - Si un retard apparaît, mentionne-le séparément (ex: "Aucune absence — mais 3 retards").
7. ⚠️ FILTRAGE PAR SEMESTRE — RÈGLE IMPÉRATIVE :
   - Si la question mentionne "semestre 1", "S1", "الأول", "الدورة الأولى" → utilise UNIQUEMENT les champs ".s1" du contexte (attendance_stats.s1, etc.), JAMAIS le total.
   - Si la question mentionne "semestre 2", "S2", "الثاني", "الدورة الثانية" → utilise UNIQUEMENT les champs ".s2".
   - Sinon, utilise le total. NE MÉLANGE JAMAIS S1 et S2 quand le parent demande explicitement un semestre.
8. Pour toute question hors-sujet (politique, médical, opinions, autre élève, etc.), redirige poliment dans la langue du parent.
9. Tu ne divulgues jamais d'informations bancaires ni d'informations sur d'autres élèves. Si on te demande login/mot de passe/identifiants, NE RÉPONDS PAS à la question : un module dédié s'en occupe automatiquement.
10. NE TERMINE PAS par "Tapez menu..." — un message automatique sera ajouté par le système.
`;

// Détecte l'écriture arabe (≥ 30 % de caractères arabes dans le texte non-vide)
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
function isArabicText(text) {
  if (!text) return false;
  const arabic = (text.match(ARABIC_RE) || []).length;
  const letters = (text.match(/[\p{L}]/gu) || []).length;
  return letters > 0 && arabic / letters >= 0.3;
}

// Mots-clés finance (FR + AR + darija). Si présents → on inclut le contexte finance.
const FINANCE_KEYWORDS_RE = new RegExp(
  [
    'finance', 'financ', 'paiement', 'paye', 'payer', 'payé', 'paid',
    'facture', 'invoice', 'frais', 'scolarité', 'tarif', 'montant',
    'solde', 'dette', 'reste', 'à payer', 'a payer', 'dirham', 'mad', 'dh',
    // Arabe
    'مال', 'مالي', 'مالية', 'أداء', 'الأداء', 'دفع', 'الدفع', 'دفعت', 'فاتورة',
    'الفاتورة', 'مستحق', 'مستحقة', 'متأخر', 'درهم', 'تكلفة', 'الرسوم', 'الواجب',
    'باقي علي', 'كم باقي', 'كم يجب',
    // Darija latine
    'flouss', 'khlas', '5las', 'khelass', 'lflous', 'cha khaslo',
  ].join('|'),
  'i',
);
function isFinanceQuery(text) {
  return FINANCE_KEYWORDS_RE.test(text || '');
}

// Mots-clés emploi du temps
const TIMETABLE_KEYWORDS_RE = new RegExp(
  [
    'emploi du temps', 'emploi de temps', 'edt', 'planning', 'programme', 'horaire', 'cours de demain',
    'cours aujourd', "cours d'aujourd", 'cours ce matin', 'cours cet aprem', 'cours demain',
    'séance', 'seance', 'matière demain', 'matiere demain', 'quels cours',
    // Arabe
    'التوقيت', 'الجدول', 'جدول الدروس', 'جدول الحصص', 'الحصص', 'الدروس غدا', 'الدروس اليوم',
    'برنامج', 'جدول زمني',
    // Darija
    'lwaqt', 'jadwal', 'hissa', 'ghda lkours', 'cours dyal ghda',
  ].join('|'),
  'i',
);
export function isTimetableQuery(text) {
  return TIMETABLE_KEYWORDS_RE.test(text || '');
}

// Détecte si un jour précis est mentionné (demain, lundi, aujourd'hui…)
const SPECIFIC_DAY_RE = /demain|aujourd|ce (matin|soir|midi|aprem)|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday|اليوم|غدا|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت|الأحد/i;
export function isSpecificDayTimetableQuery(text) {
  return SPECIFIC_DAY_RE.test(text || '');
}
// Semaine entière = requête emploi du temps SANS jour spécifique → génère le PDF
export function isFullWeekTimetableQuery(text) {
  return isTimetableQuery(text) && !isSpecificDayTimetableQuery(text);
}

// Mots-clés "bulletin" : déclenche aussi l'envoi des PDFs en pièce jointe.
const BULLETIN_KEYWORDS_RE = new RegExp(
  [
    'bulletin', 'bulletins', 'releve de note', 'relevé de note', 'relevé de notes',
    'relve', 'releve',
    // Arabe
    'بوليتان', 'كشف النقط', 'كشف الدرجات', 'كشف نقط', 'كشف العلامات', 'النتائج', 'التقرير',
    // Darija
    'lboultan', 'l9rt', 'natija', 'natijati', 'kachf', 'kashf',
  ].join('|'),
  'i',
);
export function isBulletinQuery(text) {
  return BULLETIN_KEYWORDS_RE.test(text || '');
}

// Mots-clés "code Massar" : le parent demande le code Massar / code secret de
// son enfant en texte libre (FR / arabe / darija). Déclenche une réponse
// déterministe avec getMassarCode au lieu de passer par l'IA (qui n'a pas ces
// codes dans son contexte).
const MASSAR_KEYWORDS_RE = new RegExp(
  [
    // Français / latin
    'massar', 'masar', 'code de l[\'\\s]?[eé]l[eè]ve', 'code [eé]l[eè]ve', 'code secret',
    'rmz', 'code massar', 'numero massar', 'num[eé]ro massar',
    // Arabe standard
    'مسار', 'ماسار', 'كود مسار', 'الكود', 'رقم التلميذ', 'رقم مسار',
    'الرمز السري', 'الرمز', 'رقم مسار', 'كود ماسار',
    // Darija (translittérée)
    'kod masar', 'code masar', 'l?kod dyal masar', 'raqm masar', 'rmz sir',
  ].join('|'),
  'i',
);
export function isMassarQuery(text) {
  return MASSAR_KEYWORDS_RE.test(text || '');
}

/**
 * Détecte si la question vise un semestre précis.
 * Retourne 1, 2 ou null.
 */
export function detectSemester(text) {
  const t = (text || '').toLowerCase();
  // Semestre 2 (à tester avant car peut contenir "semestre 1" en sous-chaîne après accent)
  if (/\b(s2|sem(estre)?\s*2|deuxi[eè]me\s*semestre|2[eè]me\s*sem(estre)?)\b/i.test(t)) return 2;
  if (/الدورة\s*الثانية|الفصل\s*الثاني|السداسي\s*الثاني|الثانية/.test(t)) return 2;
  // Semestre 1
  if (/\b(s1|sem(estre)?\s*1|premier\s*semestre|1er\s*sem(estre)?|1[eè]re?\s*sem(estre)?)\b/i.test(t)) return 1;
  if (/الدورة\s*الأولى|الفصل\s*الأول|السداسي\s*الأول|الأولى/.test(t)) return 1;
  return null;
}

/**
 * Construit un mini-contexte factuel sur l'élève à passer à DeepSeek.
 * Limité aux données strictement nécessaires (compact).
 */
async function buildStudentContext(student, parentInfo, { includeFinance = false, includeBulletins = false, includeTimetable = false } = {}) {
  const ctx = {
    student: {
      name: `${student.first_name} ${student.last_name}`,
      class: student.class_name || null,
    },
    school: parentInfo.school_name,
  };

  // Les données pédagogiques ne sont chargées que si la question les concerne :
  // pour finance / emploi du temps / bulletin, les directives interdisent de
  // s'en servir → les charger ralentirait pour rien (DB + taille du prompt).
  const includePedagogy = !includeFinance && !includeBulletins && !includeTimetable;

  const today = new Date().toISOString().slice(0, 10);
  const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const none = Promise.resolve({ data: null });

  // ⚡ Toutes les requêtes de base en PARALLÈLE (avant : 6-8 allers-retours
  // séquentiels vers Supabase = ~1 s perdue avant même d'appeler l'IA).
  const [
    { data: tracking },
    { data: allTracking },
    { data: hwAll },
    { data: gradeRows },
    { data: ttSlots },
    { data: bulletinRows },
    { data: invoiceRows },
  ] = await Promise.all([
    includePedagogy ? supabaseAdmin
      .from('session_tracking')
      .select('presence, participation, discipline, attitude, homework, comment, session:sessions(date, subjects(name))')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(10) : none,
    includePedagogy ? supabaseAdmin
      .from('session_tracking')
      .select('presence, session:sessions(date)')
      .eq('student_id', student.id)
      .limit(500) : none,
    includePedagogy ? supabaseAdmin
      .from('homework')
      .select('id, title, due_date, target_type, created_by, subjects(name), homework_students(student_id), homework_submissions(student_id, status, submission_date, grade)')
      .eq('class_id', student.class_id)
      .gte('due_date', threeMonthsAgo)
      .order('due_date', { ascending: false })
      .limit(40) : none,
    includePedagogy ? supabaseAdmin
      .from('control_notes')
      .select('note, appreciation, controls_plan!inner(id, name, date, class_id, teacher_id)')
      .eq('student_id', student.id)
      .eq('controls_plan.class_id', student.class_id)
      .gte('controls_plan.date', '2000-01-01')
      .order('controls_plan(date)', { ascending: false })
      .limit(60) : none,
    includeTimetable ? supabaseAdmin
      .from('class_timetable')
      .select('day_of_week, slot_order, start_time, end_time, room, subject:subjects(name), teacher:profiles!class_timetable_teacher_id_fkey(first_name, last_name)')
      .eq('class_id', student.class_id)
      .order('slot_order', { ascending: true }) : none,
    includeBulletins ? supabaseAdmin
      .from('bulletins')
      .select('academic_year, semester, general_average, general_rank, total_students_in_class, mention, status')
      .eq('student_id', student.id)
      .in('status', ['published', 'sent'])
      .order('academic_year', { ascending: false })
      .order('semester', { ascending: false })
      .limit(4) : none,
    includeFinance ? supabaseAdmin
      .from('invoices')
      .select('total, amount_paid, status')
      .eq('student_id', student.id)
      .neq('status', 'cancelled') : none,
  ]);

  if (includePedagogy) {
  ctx.recent_tracking = (tracking || [])
    .filter((t) => t.session)
    .map((t) => ({
      subject: t.session.subjects?.name || null,
      date: t.session.date,
      presence: t.presence,
      participation: t.participation,
      discipline: t.discipline,
      attitude: t.attitude,
      homework_done: t.homework,
      teacher_comment: t.comment ? String(t.comment).slice(0, 150) : null,
    }));

  // Stats de présence avec ventilation par semestre (S1 / S2 / total)
  // Important : un RETARD (late) compte comme PRÉSENT pour le taux d'assiduité.
  if (allTracking?.length) {
    // Bornes des semestres pour l'année en cours
    const academicYear = getCurrentAcademicYear();
    const bounds = getDefaultYearBounds(academicYear);

    const computeStats = (rows) => {
      const total = rows.length;
      if (total === 0) return null;
      const absent  = rows.filter((t) => t.presence === 'absent').length;
      const late    = rows.filter((t) => t.presence === 'late').length;
      const present = rows.filter((t) => t.presence === 'present').length;
      const excused = rows.filter((t) => t.presence === 'excused').length;
      // Taux de présence : retards inclus comme présents (élève présent, juste en retard)
      const attended = present + late;
      return {
        total_sessions: total,
        present,
        absent,
        late,
        excused,
        attendance_rate: Math.round((attended / total) * 100) + '%',
        explanation: 'Le retard (late) est compté comme présent pour le taux d\'assiduité.',
      };
    };

    const inRange = (date, start, end) => date && date >= start && date <= end;
    const s1Rows = allTracking.filter((t) => inRange(t.session?.date, bounds.s1_start, bounds.s1_end));
    const s2Rows = allTracking.filter((t) => inRange(t.session?.date, bounds.s2_start, bounds.s2_end));

    ctx.attendance_stats = {
      academic_year: academicYear,
      total: computeStats(allTracking),
      s1: computeStats(s1Rows),
      s2: computeStats(s2Rows),
      semester_dates: {
        s1: { start: bounds.s1_start, end: bounds.s1_end },
        s2: { start: bounds.s2_start, end: bounds.s2_end },
      },
    };
  }

  // ───── Devoirs (3 derniers mois) avec statut de soumission par élève ─────
  // Un devoir est "non soumis" si l'élève n'a aucune homework_submissions
  // avec status ∈ ('submitted', 'graded'). Les autres status (pending,
  // late, missing) ou l'absence totale comptent comme non soumis.
  const isAssignedToStudent = (h) =>
    h.target_type === 'all' ||
    (h.homework_students || []).some((hs) => hs.student_id === student.id);

  // Le formulaire devoir ne demande PAS la matière (homework.subject_id est
  // souvent NULL). On infère donc la matière via le professeur qui a créé le
  // devoir (teacher_subjects), comme le fait la notification WhatsApp.
  const assignedHw = (hwAll || []).filter(isAssignedToStudent);
  const teacherIdsForHw = [
    ...new Set(assignedHw.filter((h) => !h.subjects?.name && h.created_by).map((h) => h.created_by)),
  ];
  // ⚡ Une SEULE requête teacher_subjects pour les devoirs ET les notes
  // (avant : 2 requêtes séquentielles).
  const teacherIdsForGrades = [...new Set((gradeRows || []).map((g) => g.controls_plan?.teacher_id).filter(Boolean))];
  const allTeacherIds = [...new Set([...teacherIdsForHw, ...teacherIdsForGrades])];
  const teacherSubjectMap = {}; // teacher_id -> [subjects]
  if (allTeacherIds.length > 0) {
    const { data: tSubs } = await supabaseAdmin
      .from('teacher_subjects')
      .select('teacher_id, subjects(name)')
      .in('teacher_id', allTeacherIds);
    (tSubs || []).forEach((ts) => {
      const name = ts.subjects?.name;
      if (!name) return;
      if (!teacherSubjectMap[ts.teacher_id]) teacherSubjectMap[ts.teacher_id] = [];
      if (!teacherSubjectMap[ts.teacher_id].includes(name)) teacherSubjectMap[ts.teacher_id].push(name);
    });
  }
  const hwTeacherSubjectMap = teacherSubjectMap;

  const myHw = assignedHw.map((h) => {
    const mySub = (h.homework_submissions || []).find((s) => s.student_id === student.id);
    const submitted = mySub && (mySub.status === 'submitted' || mySub.status === 'graded');
    // Matière : valeur directe sinon inférée via le prof (1 seule matière enseignée)
    let subject = h.subjects?.name || null;
    if (!subject && h.created_by) {
      const subs = hwTeacherSubjectMap[h.created_by];
      if (subs && subs.length === 1) subject = subs[0];
    }
    return {
      id: h.id,
      title: h.title,
      subject,
      due: h.due_date,
      overdue: h.due_date < today && !submitted,
      submitted: !!submitted,
      status: mySub?.status || 'not_submitted',
      grade: mySub?.grade ?? null,
    };
  });

  ctx.pending_homework = myHw.filter((h) => !h.submitted && h.due >= today);
  ctx.overdue_homework = myHw.filter((h) => h.overdue);
  ctx.recent_homework_submitted = myHw.filter((h) => h.submitted).slice(0, 5);
  ctx.homework_stats = {
    total_assigned_3m: myHw.length,
    submitted: myHw.filter((h) => h.submitted).length,
    not_submitted: myHw.filter((h) => !h.submitted).length,
    overdue: myHw.filter((h) => h.overdue).length,
  };

  // ───── Notes de contrôles (control_notes via controls_plan) ─────
  // Note: controls_plan n'a pas de subject_id, on infère la matière via :
  //   1. teacher_subjects (si le prof enseigne une seule matière dans la classe)
  //   2. match du nom du contrôle avec les noms de matières connues
  //   3. fallback : nom du contrôle
  const allClassSubjects = [...new Set(Object.values(teacherSubjectMap).flat())];

  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const inferSubject = (controlName, teacherId) => {
    const teacherSubs = teacherSubjectMap[teacherId] || [];
    if (teacherSubs.length === 1) return teacherSubs[0];
    const cn = norm(controlName);
    if (cn) {
      const candidates = teacherSubs.length > 0 ? teacherSubs : allClassSubjects;
      const matched = candidates.find((s) => {
        const ns = norm(s);
        return ns && (cn.includes(ns) || ns.includes(cn));
      });
      if (matched) return matched;
    }
    return controlName || 'Contrôle';
  };

  const allGrades = (gradeRows || []).map((g) => ({
    control: g.controls_plan?.name || null,
    subject: inferSubject(g.controls_plan?.name, g.controls_plan?.teacher_id),
    date: g.controls_plan?.date || null,
    note: Number(g.note),
    max: 20,
    appreciation: g.appreciation || null,
  }));
  // ⚡ Prompt allégé : le détail complet vit dans grades_by_subject ; on ne
  // garde ici que les 10 dernières notes (avant : 60 notes envoyées en double).
  ctx.recent_grades = allGrades.slice(0, 10);

  // Groupage par matière
  const bySubject = {};
  allGrades.forEach((g) => {
    const key = g.subject || 'Autre';
    if (!bySubject[key]) bySubject[key] = [];
    bySubject[key].push({ control: g.control, date: g.date, note: g.note, max: g.max });
  });
  ctx.grades_by_subject = Object.entries(bySubject).map(([subject, grades]) => {
    const notes = grades.map((g) => g.note);
    const sum = notes.reduce((a, b) => a + b, 0);
    return {
      subject,
      count: grades.length,
      average: Math.round((sum / grades.length) * 10) / 10,
      best: Math.max(...notes),
      worst: Math.min(...notes),
      grades, // détail
    };
  }).sort((a, b) => b.count - a.count);

  if (allGrades.length > 0) {
    const sum = allGrades.reduce((s, g) => s + g.note, 0);
    ctx.grade_stats = {
      count: allGrades.length,
      average: Math.round((sum / allGrades.length) * 10) / 10,
      best: Math.max(...allGrades.map((g) => g.note)),
      worst: Math.min(...allGrades.map((g) => g.note)),
    };
  }
  } // fin includePedagogy

  // ───── Emploi du temps — UNIQUEMENT si la question concerne le planning ─────
  if (includeTimetable) {
    const slots = ttSlots;
    const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const DAY_FR = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi' };

    const byDay = {};
    (slots || []).forEach((s) => {
      const day = s.day_of_week;
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push({
        slot: s.slot_order,
        start: s.start_time?.slice(0, 5) || '',
        end: s.end_time?.slice(0, 5) || '',
        subject: s.subject?.name || null,
        teacher: s.teacher ? `${s.teacher.first_name} ${s.teacher.last_name}`.trim() : null,
        room: s.room || null,
      });
    });

    ctx.timetable = DAY_ORDER
      .filter((d) => byDay[d])
      .map((d) => ({ day: DAY_FR[d], day_key: d, slots: byDay[d] }));

    // Contexte temporel : aujourd'hui et demain (utile pour "cours de demain")
    const now = new Date();
    const jsDay = now.getDay(); // 0=dim, 1=lun …
    const JS_TO_KEY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayKey = JS_TO_KEY[jsDay];
    const tomorrowKey = JS_TO_KEY[(jsDay + 1) % 7];
    ctx.today = { day_key: todayKey, day_fr: DAY_FR[todayKey] || 'Dimanche', date: now.toISOString().slice(0, 10) };
    ctx.tomorrow = { day_key: tomorrowKey, day_fr: DAY_FR[tomorrowKey] || 'Dimanche' };
  }

  // ───── Bulletins publiés — UNIQUEMENT si la question concerne le bulletin ─────
  if (includeBulletins) {
    const bulletins = bulletinRows;
    ctx.published_bulletins = (bulletins || []).map(b => ({
      academic_year: b.academic_year,
      semester: b.semester,
      general_average: b.general_average,
      mention: b.mention,
      rank: b.general_rank
        ? `${b.general_rank}/${b.total_students_in_class || '?'}`
        : null,
    }));
  }

  // Solde finance (résumé) — UNIQUEMENT si la question concerne la finance.
  // Sinon on ne l'inclut PAS dans le contexte, pour éviter que l'IA ne
  // mentionne les impayés dans des réponses purement pédagogiques.
  if (includeFinance) {
    const invoices = invoiceRows;
    const totalDue = (invoices || []).reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid || 0)), 0);
    ctx.finance = {
      total_due: totalDue,
      has_overdue: (invoices || []).some((i) => i.status === 'overdue'),
    };
  }

  return ctx;
}

/**
 * Réponse IA pour question libre.
 * Si l'IA détecte hors-sujet → renvoie un message de redirection court.
 */
export async function answerWithAI({ messageText, student, parentInfo }) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return `🎓 Le mode question libre est temporairement indisponible.\n\n_Tapez *menu* pour voir les options disponibles._`;
  }

  try {
    // Si la question concerne le bulletin, on FORCE l'exclusion du contexte finance,
    // même si d'autres mots-clés finance sont présents (ex: "donne-moi le bulletin
    // et la facture" → traité comme bulletin uniquement, l'autre demande sera gérée séparément).
    const wantsBulletin = isBulletinQuery(messageText);
    const wantsTimetable = !wantsBulletin && isTimetableQuery(messageText);
    const wantsFinance = !wantsBulletin && !wantsTimetable && isFinanceQuery(messageText);
    const isArabic = isArabicText(messageText);
    const studentContext = await buildStudentContext(student, parentInfo, {
      includeFinance: wantsFinance,
      includeBulletins: wantsBulletin,
      includeTimetable: wantsTimetable,
    });

    // Directive de langue forte, en plus du système — DeepSeek mélange souvent
    // les langues si on ne le martèle pas explicitement avant la question.
    const langDirective = isArabic
      ? 'IMPORTANT: السؤال بالعربية. أجب حصراً بالعربية الفصحى، بدون أي كلمة بالفرنسية أو الإنجليزية، ولا حتى "menu" أو "école".'
      : 'IMPORTANT : la question est en français/darija latine. Réponds dans la MÊME langue, sans aucun mot arabe.';

    const topicDirective = wantsBulletin
      ? `TOPIC: Le parent demande le BULLETIN scolaire.\n` +
        `→ Donne UNIQUEMENT un résumé du/des bulletin(s) (moyenne générale, mention, rang).\n` +
        `→ INTERDIT : ne mentionne AUCUNE info financière (factures, paiements, impayés, montants), même brièvement.\n` +
        `→ INTERDIT : ne donne PAS de notes détaillées par contrôle ; le PDF complet est envoyé séparément en pièce jointe.\n` +
        `→ Termine par : "📎 Le bulletin PDF arrive juste après ce message." (adapté à la langue du parent).\n` +
        `→ Si le contexte ne contient AUCUN bulletin publié, dis "Aucun bulletin n'a encore été publié pour ${student.first_name}."`
      : wantsTimetable
      ? `TOPIC: Le parent demande l'EMPLOI DU TEMPS.\n` +
        `→ Utilise le champ "timetable" du contexte qui contient les créneaux par jour.\n` +
        `→ Aujourd'hui : ctx.today.day_fr (${studentContext.today?.day_fr || '?'}). Demain : ctx.tomorrow.day_fr (${studentContext.tomorrow?.day_fr || '?'}).\n` +
        `→ Si le parent demande "demain", affiche les cours du jour ctx.tomorrow.day_key.\n` +
        `→ Si aucun cours pour ce jour, dis-le clairement (week-end ou jour sans cours).\n` +
        `→ Affiche : Heure de début - fin, Matière, Professeur, Salle si disponible.\n` +
        `→ Si timetable est vide, indique que l'emploi du temps n'a pas encore été configuré.`
      : wantsFinance
      ? 'TOPIC: La question concerne la finance. Ne parle QUE de finance, ignore les données pédagogiques.'
      : 'TOPIC: La question concerne la pédagogie. Ne mentionne AUCUNE information financière (montants, factures, impayés), même brièvement.';

    const askedSemester = detectSemester(messageText);
    const semesterDirective = askedSemester
      ? `SEMESTRE DEMANDÉ : ${askedSemester}.\n` +
        `Le parent a explicitement demandé le SEMESTRE ${askedSemester}.\n` +
        `→ Pour les statistiques d'assiduité, utilise UNIQUEMENT \`attendance_stats.s${askedSemester}\`, JAMAIS \`attendance_stats.total\`.\n` +
        `→ Indique clairement "Semestre ${askedSemester}" dans ta réponse.\n` +
        `→ Si attendance_stats.s${askedSemester} est null, dis qu'il n'y a pas encore de données pour ce semestre.\n` +
        `→ Ne mentionne PAS les données de l'autre semestre, sauf si le parent compare explicitement.`
      : 'Aucun semestre spécifique demandé. Utilise les statistiques globales (attendance_stats.total) ou indique "année en cours".';

    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: langDirective },
        { role: 'system', content: topicDirective },
        { role: 'system', content: semesterDirective },
        {
          role: 'system',
          // JSON compact : l'indentation multipliait les tokens du prompt
          // (prefill plus long) sans rien apporter au modèle.
          content: `DONNÉES DE L'ÉLÈVE (utilise UNIQUEMENT ces données) :\n${JSON.stringify(studentContext)}`,
        },
        { role: 'user', content: messageText },
      ],
      temperature: 0.3,
      max_tokens: 400,
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      return `🤔 Je n'ai pas pu traiter votre question.\n\n_Tapez *menu* pour voir les options disponibles._`;
    }

    return response;
  } catch (e) {
    console.error('[chatbot/ai] Erreur DeepSeek:', e.message);
    return `⚠️ Le service IA est temporairement indisponible.\n\n_Tapez *menu* pour utiliser les questions prédéfinies._`;
  }
}

/**
 * Footer "Tapez menu..." adapté à la langue détectée du message d'origine.
 * Exporté pour que le handler chatbot puisse envoyer le bon message après
 * une réponse IA (sans mélanger AR/FR).
 */
export function menuFooterForText(text) {
  if (isArabicText(text)) {
    return '_اكتب *menu* للعودة إلى الخيارات، أو تابع طرح أسئلتك._';
  }
  return '_Tapez *menu* pour revenir aux options ou continuez à poser vos questions._';
}

/**
 * Détecte si un message est un trigger spécial (pour court-circuiter le menu).
 */
export function detectSpecialCommand(text) {
  const lower = String(text).trim().toLowerCase();
  if (['menu', 'القائمة', 'liste'].includes(lower)) return 'menu';
  if (['stop', 'désabonner', 'إيقاف'].includes(lower)) return 'stop';
  if (['aide', 'help', 'مساعدة', '?'].includes(lower)) return 'help';
  return null;
}
