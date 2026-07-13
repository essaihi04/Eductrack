import { supabaseAdmin } from '../config/supabase.js';
import { selectInChunksSafe } from '../utils/chunkedQueries.js';
import OpenAI from 'openai';
import cron from 'node-cron';
import { sendText, getStatus } from './whatsapp/index.js';
import { getEstablishmentConfig } from './establishmentHeader.js';
import { routeNotification } from './notificationRouter.js';

// DeepSeek client (OpenAI-compatible API)
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || ''
});

// Vérifie qu'une session Baileys est connectée pour cette école
const isSessionReady = (schoolId) => {
  if (!schoolId) return false;
  return getStatus(schoolId).connected;
};

// ==================== COLLECT DAILY DATA ====================

export async function collectStudentDailyData(studentId, date, schoolId) {
  // Get student profile
  const { data: student } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, class_id, classes!fk_profiles_class(name, level, school_type)')
    .eq('id', studentId)
    .single();

  if (!student) return null;

  // Get school name
  let schoolName = '';
  if (schoolId) {
    const { data: school } = await supabaseAdmin
      .from('schools')
      .select('name')
      .eq('id', schoolId)
      .maybeSingle();
    schoolName = school?.name || '';
  }

  // Get all sessions for this student's class on this date
  const { data: sessions } = await supabaseAdmin
    .from('sessions')
    .select('id, topic, notes, subject_id, type, start_time, end_time, subjects(name)')
    .eq('class_id', student.class_id)
    .eq('date', date)
    .order('start_time', { ascending: true });

  if (!sessions || sessions.length === 0) return null;

  const sessionIds = sessions.map(s => s.id);

  // Get tracking records for this student in today's sessions
  const { data: trackingRecords } = await supabaseAdmin
    .from('session_tracking')
    .select('*')
    .eq('student_id', studentId)
    .in('session_id', sessionIds);

  // Get control tracking if any
  const controlSessions = sessions.filter(s => s.type === 'control');
  let controlData = [];
  if (controlSessions.length > 0) {
    const { data: controls } = await supabaseAdmin
      .from('control_tracking')
      .select('*')
      .eq('student_id', studentId)
      .in('session_id', controlSessions.map(s => s.id));
    controlData = controls || [];
  }

  // Get control notes/grades if any
  let gradeData = [];
  if (controlSessions.length > 0) {
    const { data: notes } = await supabaseAdmin
      .from('control_notes')
      .select('*')
      .eq('student_id', studentId)
      .in('control_id', controlSessions.map(s => s.id));
    gradeData = notes || [];
  }

  // Get homework submissions for today
  const { data: homeworkSubs } = await supabaseAdmin
    .from('homework_submissions')
    .select('*, homework(title, description, due_date)')
    .eq('student_id', studentId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`);

  // Build structured data
  const sessionDetails = sessions.map(session => {
    const tracking = (trackingRecords || []).find(t => t.session_id === session.id);
    const control = controlData.find(c => c.session_id === session.id);
    const grade = gradeData.find(g => g.control_id === session.id);

    return {
      subject: session.subjects?.name || 'Non spécifié',
      topic: session.topic || 'Non spécifié',
      type: session.type,
      time: `${session.start_time || ''} - ${session.end_time || ''}`,
      tracking: tracking ? {
        presence: tracking.presence,
        cahier_present: tracking.cahier_present,
        sleeping: tracking.sleeping,
        homework_done: tracking.homework,
        participation: tracking.participation,
        discipline: tracking.discipline,
        phone_use: tracking.phone_use,
        mini_eval: tracking.mini_eval,
        cahier_lesson: tracking.cahier_lesson,
        cahier_documents: tracking.cahier_documents,
        cahier_readability: tracking.cahier_readability,
        attitude: tracking.attitude,
        writing: tracking.writing,
        comment: tracking.comment,
        notes: tracking.notes
      } : null,
      control: control ? {
        presence: control.presence,
        material_status: control.material_status,
        discipline_status: control.discipline_status,
        copy_submitted: control.copy_submitted
      } : null,
      grade: grade ? { note: grade.note, max_note: grade.max_note } : null
    };
  });

  return {
    student: {
      firstName: student.first_name,
      lastName: student.last_name,
      className: student.classes?.name,
      level: student.classes?.level,
      schoolType: student.classes?.school_type,
      schoolName
    },
    date,
    sessions: sessionDetails,
    homeworkSubmissions: (homeworkSubs || []).map(h => ({
      title: h.homework?.title,
      status: h.status
    }))
  };
}

// ==================== CALCULATE DAILY STATS ====================

export function calculateDailyStats(studentData) {
  const sessions = studentData.sessions.filter(s => s.tracking);
  
  if (sessions.length === 0) {
    return {
      presenceBar: '⬜⬜⬜⬜⬜ 0%',
      participationBar: '⬜⬜⬜⬜⬜ 0%',
      vigilanceBar: '⬜⬜⬜⬜⬜ 0%',
      presenceText: 'Aucune donnée',
      participationText: 'Aucune donnée',
      vigilanceText: 'Aucune donnée'
    };
  }

  // Calculer la présence
  const presentCount = sessions.filter(s => s.tracking.presence === 'present').length;
  const presencePercent = Math.round((presentCount / sessions.length) * 100);

  // Calculer la participation moyenne
  const participationMap = { 'excellent': 100, 'bon': 80, 'good': 80, 'moyen': 60, 'average': 60, 'faible': 30, 'poor': 30 };
  const participations = sessions
    .map(s => participationMap[s.tracking.participation?.toLowerCase()] || null)
    .filter(v => v !== null);
  const participationPercent = participations.length > 0 
    ? Math.round(participations.reduce((a, b) => a + b, 0) / participations.length)
    : 0;

  // Calculer la vigilance (discipline) moyenne
  const vigilanceMap = { 'concentre': 100, 'excellent': 100, 'good': 80, 'moyen': 60, 'average': 60, 'distrait': 30, 'poor': 30 };
  const vigilances = sessions
    .map(s => vigilanceMap[s.tracking.discipline?.toLowerCase()] || null)
    .filter(v => v !== null);
  const vigilancePercent = vigilances.length > 0
    ? Math.round(vigilances.reduce((a, b) => a + b, 0) / vigilances.length)
    : 0;

  // Calculer le taux de devoirs faits
  const homeworkSessions = sessions.filter(s => s.tracking.homework_done !== null && s.tracking.homework_done !== undefined);
  const homeworkDone = homeworkSessions.filter(s => s.tracking.homework_done === true).length;
  const homeworkPercent = homeworkSessions.length > 0
    ? Math.round((homeworkDone / homeworkSessions.length) * 100)
    : null;

  // Calculer le taux de présence du cahier
  const cahierSessions = sessions.filter(s => s.tracking.cahier_present !== null && s.tracking.cahier_present !== undefined);
  const cahierPresent = cahierSessions.filter(s => s.tracking.cahier_present === true).length;
  const cahierPercent = cahierSessions.length > 0
    ? Math.round((cahierPresent / cahierSessions.length) * 100)
    : null;

  // Générer les barres de progression
  const createBar = (percent) => {
    const filled = Math.round(percent / 20); // 5 blocs max
    const empty = 5 - filled;
    return '🟩'.repeat(filled) + '⬜'.repeat(empty) + ` ${percent}%`;
  };

  return {
    presenceBar: createBar(presencePercent),
    participationBar: createBar(participationPercent),
    vigilanceBar: createBar(vigilancePercent),
    homeworkBar: homeworkPercent !== null ? createBar(homeworkPercent) : null,
    cahierBar: cahierPercent !== null ? createBar(cahierPercent) : null,
    presenceText: `${presentCount}/${sessions.length} séances présent (${presencePercent}%)`,
    participationText: participations.length > 0 ? `${participationPercent}%` : 'Non évalué',
    vigilanceText: vigilances.length > 0 ? `${vigilancePercent}%` : 'Non évalué',
    homeworkText: homeworkPercent !== null ? `${homeworkDone}/${homeworkSessions.length} devoirs faits (${homeworkPercent}%)` : 'Non évalué',
    cahierText: cahierPercent !== null ? `${cahierPresent}/${cahierSessions.length} séances avec cahier (${cahierPercent}%)` : 'Non évalué'
  };
}

// ==================== AI REPORT GENERATION ====================

export async function generateReport(studentData, language, settings) {
  if (!studentData || !studentData.sessions.length) return null;

  // Calculer les statistiques pour les barres de progression
  const stats = calculateDailyStats(studentData);
  const hasMultipleSubjects = studentData.sessions.length > 2;
  
  // Créer le résumé de présence par matière
  const subjectPresenceSummary = studentData.sessions
    .map(s => {
      if (!s.tracking) return null;
      const icon = s.tracking.presence === 'present' ? '✅' : 
                   s.tracking.presence === 'absent' ? '❌' : '⚠️';
      return `${icon} ${s.subject}`;
    })
    .filter(Boolean)
    .join('\n');

  const systemPrompt = `Tu es un conseiller pédagogique bienveillant et professionnel. Tu génères des rapports quotidiens pour les parents d'élèves.

RÈGLES ABSOLUES:
- Le ton doit être NEUTRE, ENCOURAGEANT et PROFESSIONNEL
- JAMAIS agressif, JAMAIS accusateur, JAMAIS culpabilisant
- Ne JAMAIS provoquer de réaction négative des parents envers l'administration
- Ne JAMAIS blesser les sentiments des parents concernant leur enfant
- Présenter les faits de manière objective et constructive
- Toujours terminer par des encouragements et des recommandations positives
- Utiliser un langage simple et accessible
- Le rapport doit ressembler à un compte-rendu bienveillant d'un pédagogue
- Si l'élève a des difficultés, les présenter comme des "axes d'amélioration" avec des solutions concrètes
- Valoriser TOUJOURS au moins un point positif, même minime
- GÉNÈRE DU CONTENU RÉEL, ne remplis PAS le message avec des lignes de séparation
${hasMultipleSubjects ? '- MESSAGE COURT: L\'élève a plusieurs matières aujourd\'hui, donc le rapport doit être CONCIS et RÉSUMÉ (pas de détails par matière)' : ''}

FORMAT DU RAPPORT:
${language === 'ar' ? `
- Écrire ENTIÈREMENT en arabe (dialecte marocain/arabe standard accessible)
- Utiliser des emojis appropriés pour rendre le message agréable
- Structure: Salutation → EN-TÊTE (Nom élève + Classe) → Nom de l'école → BARRES DE PROGRESSION → ${hasMultipleSubjects ? 'Résumé général de la journée' : 'Détails par matière'} → Points positifs → Recommandations courtes → Encouragement final → PIED DE PAGE (Équipe pédagogique + École)
` : language === 'fr' ? `
- Écrire ENTIÈREMENT en français
- Utiliser des emojis appropriés pour rendre le message agréable  
- Structure: Salutation → EN-TÊTE (Nom élève + Classe) → Nom de l'école → BARRES DE PROGRESSION → ${hasMultipleSubjects ? 'Résumé général de la journée' : 'Détails par matière'} → Points positifs → Recommandations courtes → Encouragement final → PIED DE PAGE (Équipe pédagogique + École)
` : `
- Écrire le rapport en DEUX parties: d'abord en français, puis en arabe
- Séparer les deux versions par une ligne "━━━━━━━━━━━━━━━"
- Utiliser des emojis appropriés pour rendre le message agréable
- Structure pour chaque langue: Salutation → EN-TÊTE (Nom élève + Classe) → Nom de l'école → BARRES DE PROGRESSION → ${hasMultipleSubjects ? 'Résumé général de la journée' : 'Détails par matière'} → Points positifs → Recommandations courtes → Encouragement final → PIED DE PAGE (Équipe pédagogique + École)
`}

EN-TÊTE OBLIGATOIRE (AU DÉBUT DU RAPPORT):
📋 *Élève:* ${studentData.student.firstName} ${studentData.student.lastName}
🎓 *Classe:* ${studentData.student.className}

PIED DE PAGE OBLIGATOIRE (À LA FIN DU RAPPORT):

━━━━━━━━━━━━━━━━━━━━━
👥 *L'équipe pédagogique*
🏫 *${studentData.student.schoolName || 'École'}*

ÉLÉMENTS VISUELS OBLIGATOIRES (APRÈS L'EN-TÊTE ET LE NOM DE L'ÉCOLE):

📊 *Présence:* ${stats.presenceBar}
🙋 *Participation:* ${stats.participationBar}
👁️ *Vigilance:* ${stats.vigilanceBar}
${stats.homeworkBar ? `📝 *Devoirs:* ${stats.homeworkBar}` : ''}
${stats.cahierBar ? `📓 *Cahier:* ${stats.cahierBar}` : ''}

📚 *Matières d'aujourd'hui:*
${subjectPresenceSummary}

UTILISE CES ICÔNES VISUELLES DANS LE RAPPORT:
- ✅ = Positif/Fait/Bon
- ❌ = Négatif/Non fait/Problème
- ⚠️ = Attention/À améliorer
- 📚 = Devoirs/Cahier
- 📝 = Notes/Évaluations
- 💯 = Excellente performance
- 👍 = Bien/Bon comportement
- 🎯 = Objectif/Recommandation
- 📖 = Chapitres étudiés
- ⭐ = Point fort/Félicitations
- 🔔 = Rappel important

PRÉSENTATION VISUELLE DES INFORMATIONS:
- Utilise des listes à puces avec icônes au lieu de paragraphes longs
- Chaque information importante doit avoir son icône
- Groupe les informations similaires ensemble
- Limite les phrases à 1-2 lignes maximum
- NE PAS utiliser de longues lignes de séparation (━━━)
- Utilise plutôt des sauts de ligne et des emojis pour structurer

CONTENU À INCLURE:
${settings.include_chapter_info ? '- Les chapitres/sujets étudiés' + (hasMultipleSubjects ? ' (résumé général)' : ' dans chaque matière avec les icônes appropriées') : ''}
${settings.include_homework_status ? '- Le statut des devoirs (faits ou non) avec ✅ ou ❌' : ''}
${settings.include_behavior ? '- Le comportement général (participation, discipline, attitude) avec les icônes 💯, 👍 ou ⚠️' : ''}
${settings.include_grades ? '- Les notes obtenues si disponibles avec icônes' : ''}
${settings.include_recommendations ? '- Des recommandations pédagogiques COURTES et personnalisées avec 🎯' : ''}
${hasMultipleSubjects ? '\n⚠️ IMPORTANT: Comme l\'élève a plusieurs matières, le rapport doit être COURT et RÉSUMÉ (max 10-12 lignes après les barres). Ne détaille PAS chaque matière séparément.' : '\n✅ IMPORTANT: L\'élève a peu de matières aujourd\'hui. Tu DOIS détailler chaque séance avec:\n- Le chapitre étudié 📖\n- La présence (✅/❌/⚠️)\n- Le cahier (✅/❌)\n- Les devoirs (✅/❌)\n- La participation (💯/👍/⚠️)\n- La discipline (💯/👍/⚠️)\n- Tout autre élément de suivi disponible\n- Les commentaires du professeur si présents 💬'}

RECOMMANDATIONS PÉDAGOGIQUES À INCLURE:
- Conseils pratiques COURTS pour les parents avec 🎯
- Encouragements adaptés au profil de l'élève avec ⭐

EXEMPLE DE FORMAT ATTENDU (après les barres de progression):

📖 *Séances d'aujourd'hui:*

Sciences de la Vie et de la Terre - Échange gazeux
✅ Présent avec cahier
💯 Bonne participation
👍 Discipline correcte

Physique-Chimie - [Sujet]
✅ Présent
[Autres détails...]

⭐ *Points positifs:*
- [Points forts observés]

🎯 *Recommandations:*
- [Conseils courts]

Continuez ainsi ! 💪`;

  // Build the data summary for the AI
  let dataSummary = `DONNÉES DE LA JOURNÉE DU ${studentData.date}:\n`;
  if (studentData.student.schoolName) dataSummary += `École: ${studentData.student.schoolName}\n`;
  dataSummary += `Élève: ${studentData.student.firstName} ${studentData.student.lastName}\n`;
  dataSummary += `Classe: ${studentData.student.className} (${studentData.student.level})\n`;
  dataSummary += `Nombre de matières: ${studentData.sessions.length}\n\n`;
  dataSummary += `STATISTIQUES GLOBALES:\n`;
  dataSummary += `Présence: ${stats.presenceText}\n`;
  dataSummary += `Participation moyenne: ${stats.participationText}\n`;
  dataSummary += `Vigilance moyenne: ${stats.vigilanceText}\n\n`;

  dataSummary += `SÉANCES DE LA JOURNÉE:\n`;
  studentData.sessions.forEach((session, i) => {
    dataSummary += `\n--- Séance ${i + 1}: ${session.subject} (${session.type === 'control' ? 'Contrôle' : 'Cours'}) ---\n`;
    dataSummary += `📖 Chapitre/Sujet: ${session.topic}\n`;
    dataSummary += `🕐 Horaire: ${session.time}\n`;

    if (session.tracking) {
      const t = session.tracking;
      // Présence avec icône
      const presenceIcon = t.presence === 'present' ? '✅' : t.presence === 'absent' ? '❌' : '⚠️';
      dataSummary += `${presenceIcon} Présence: ${t.presence === 'present' ? 'Présent' : t.presence === 'absent' ? 'Absent' : t.presence === 'late' ? 'En retard' : t.presence}\n`;
      
      // Cahier avec icône
      if (t.cahier_present !== null && t.cahier_present !== undefined) {
        dataSummary += `${t.cahier_present ? '✅' : '❌'} Cahier présent: ${t.cahier_present ? 'Oui' : 'Non'}\n`;
      }
      
      // Comportement avec icônes
      if (t.sleeping !== null && t.sleeping !== undefined && t.sleeping) {
        dataSummary += `⚠️ Dort en classe: Oui\n`;
      }
      
      // Devoir avec icône
      if (t.homework_done !== null && t.homework_done !== undefined) {
        dataSummary += `${t.homework_done ? '✅' : '❌'} Devoir fait: ${t.homework_done ? 'Oui' : 'Non'}\n`;
      }
      
      // Participation avec icône
      if (t.participation !== null && t.participation !== undefined) {
        const partIcon = ['excellent', 'bon', 'good'].includes(t.participation?.toLowerCase()) ? '💯' : 
                        ['moyen', 'average'].includes(t.participation?.toLowerCase()) ? '👍' : '⚠️';
        dataSummary += `${partIcon} Participation: ${t.participation}\n`;
      }
      
      // Discipline avec icône
      if (t.discipline !== null && t.discipline !== undefined) {
        const discIcon = ['concentre', 'excellent', 'good'].includes(t.discipline?.toLowerCase()) ? '💯' : 
                        ['moyen', 'average'].includes(t.discipline?.toLowerCase()) ? '👍' : '⚠️';
        dataSummary += `${discIcon} Discipline: ${t.discipline}\n`;
      }
      
      // Téléphone avec icône
      if (t.phone_use !== null && t.phone_use !== undefined && t.phone_use) {
        dataSummary += `⚠️ Utilisation téléphone: Oui\n`;
      }
      
      if (t.attitude) dataSummary += `👤 Attitude: ${t.attitude}\n`;
      if (t.writing) dataSummary += `✍️ Écriture: ${t.writing}\n`;
      
      // Mini-évaluation avec icône
      if (t.mini_eval !== null && t.mini_eval !== undefined) {
        const evalIcon = t.mini_eval >= 7 ? '💯' : t.mini_eval >= 5 ? '👍' : '⚠️';
        dataSummary += `${evalIcon} Mini-évaluation: ${t.mini_eval}/10\n`;
      }
      
      if (t.cahier_lesson !== null && t.cahier_lesson !== undefined) {
        dataSummary += `${t.cahier_lesson ? '✅' : '❌'} Leçon dans cahier: ${t.cahier_lesson ? 'Oui' : 'Non'}\n`;
      }
      if (t.cahier_documents !== null && t.cahier_documents !== undefined) {
        dataSummary += `${t.cahier_documents ? '✅' : '❌'} Documents dans cahier: ${t.cahier_documents ? 'Oui' : 'Non'}\n`;
      }
      if (t.cahier_readability) dataSummary += `📝 Lisibilité cahier: ${t.cahier_readability}\n`;
      if (t.comment) dataSummary += `💬 Commentaire du professeur: ${t.comment}\n`;
      if (t.notes) dataSummary += `📌 Notes du professeur: ${t.notes}\n`;
    }

    if (session.control) {
      dataSummary += `${session.control.copy_submitted ? '✅' : '❌'} [CONTRÔLE] Copie rendue: ${session.control.copy_submitted ? 'Oui' : 'Non'}\n`;
      dataSummary += `📦 Matériel: ${session.control.material_status}\n`;
    }

    if (session.grade) {
      const gradePercent = (session.grade.note / session.grade.max_note) * 100;
      const gradeIcon = gradePercent >= 70 ? '💯' : gradePercent >= 50 ? '👍' : '⚠️';
      dataSummary += `${gradeIcon} Note obtenue: ${session.grade.note}/${session.grade.max_note}\n`;
    }
  });

  if (studentData.homeworkSubmissions.length > 0) {
    dataSummary += `\n📚 DEVOIRS:\n`;
    studentData.homeworkSubmissions.forEach(h => {
      const icon = h.status === 'submitted' ? '✅' : '❌';
      dataSummary += `${icon} ${h.title}: ${h.status === 'submitted' ? 'Rendu' : 'Non rendu'}\n`;
    });
  }

  // Debug: Log the data being sent to AI
  console.log('[DailyReports] Data summary length:', dataSummary.length);
  console.log('[DailyReports] Sessions count:', studentData.sessions.length);
  console.log('[DailyReports] First 500 chars of dataSummary:', dataSummary.substring(0, 500));

  try {
    const maxTokens = language === 'both' ? 2000 : 1000;
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: dataSummary }
      ],
      max_tokens: maxTokens,
      temperature: 0.7
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    if (language === 'both') {
      // Chercher le séparateur principal entre les deux langues (ligne vide + ━━━ + ligne vide)
      // Cela évite de splitter sur les séparateurs décoratifs internes
      const mainSeparatorRegex = /\n\s*━{10,}\s*\n/;
      const parts = content.split(mainSeparatorRegex);
      
      if (parts.length >= 2) {
        const frPart = parts[0]?.trim() || '';
        const arPart = parts[1]?.trim() || '';
        console.log(`[DailyReports] Bilingual split: fr=${frPart.length} chars, ar=${arPart.length} chars`);
        return {
          fr: frPart,
          ar: arPart
        };
      } else {
        // Fallback: si pas de séparateur principal trouvé, retourner tout en FR
        console.warn('[DailyReports] No main separator found, returning full content as FR only');
        return {
          fr: content.trim(),
          ar: ''
        };
      }
    }

    return { [language]: content.trim() };
  } catch (error) {
    console.error('DeepSeek AI error:', error.message);
    return null;
  }
}

// ==================== SEND REPORT VIA WHATSAPP ====================

// L'anti-ban (délai humain, quota, presence) est intégré dans sendText.
// Le retry est conservé pour les erreurs réseau ponctuelles.
export async function sendReportWhatsApp(schoolId, phone, reportText, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await sendText(schoolId, phone, reportText);
      if (result.success) return { success: true, attempt, msgId: result.data?.msgId };
      // Si la raison est anti-ban (quota / horaires), inutile de retry
      if (result.reason === 'daily_quota_exceeded' || result.reason === 'out_of_hours' || result.reason === 'paused') {
        return { success: false, attempt, error: result.message };
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    } catch (error) {
      console.error(`[WhatsApp] Attempt ${attempt}/${retries} error:`, error.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
  }
  return { success: false, attempt: retries };
}

// ==================== QUEUE SYSTEM ====================
// Note : l'anti-ban applique déjà un délai humain entre 2 envois sur la même
// session. La queue garde un comportement séquentiel (concurrency = 1) pour
// rester prévisible.

class MessageQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.queue = [];
    this.processing = 0;
  }

  async add(task) {
    return new Promise((resolve) => {
      this.queue.push({ task, resolve });
      this.process();
    });
  }

  async process() {
    if (this.processing >= this.concurrency || this.queue.length === 0) return;
    this.processing++;
    const { task, resolve } = this.queue.shift();
    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      resolve({ success: false, error: error.message });
    }
    this.processing--;
    this.process();
  }
}

// ==================== PROCESS SINGLE SCHOOL (PARALLEL-SAFE) ====================

async function processSchoolReports(settings, today, scopedClassIds = null) {
  console.log(`[DailyReports] 🏫 Processing school ${settings.school_id}${scopedClassIds ? ` (scoped to ${scopedClassIds.length} classes)` : ''}...`);
  
  const queue = new MessageQueue(1);
  let processed = 0, sent = 0, failed = 0;

  try {
    // Vérifie session Baileys connectée
    if (!isSessionReady(settings.school_id)) {
      console.error(`[DailyReports] ❌ No connected WhatsApp session for school ${settings.school_id}`);
      return { processed: 0, sent: 0, failed: 0, schoolId: settings.school_id };
    }

    // Get all students in this school (optionally restricted to scoped classes)
    let studentsQuery = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id')
      .eq('role', 'student')
      .eq('school_id', settings.school_id);
    if (scopedClassIds && scopedClassIds.length > 0) {
      studentsQuery = studentsQuery.in('class_id', scopedClassIds);
    } else if (scopedClassIds && scopedClassIds.length === 0) {
      return { processed: 0, sent: 0, failed: 0, schoolId: settings.school_id };
    }
    const { data: students } = await studentsQuery;

    console.log(`[DailyReports] 👥 Found ${students?.length || 0} students`);
    if (!students?.length) return { processed: 0, sent: 0, failed: 0, schoolId: settings.school_id };

    // Get parent links — par LOTS : une école de 400+ élèves dépasse la limite
    // d'URL d'un seul .in() (échec silencieux → aucun rapport envoyé).
    const studentIds = students.map(s => s.id);
    const parentLinks = await selectInChunksSafe(studentIds, (part) => supabaseAdmin
      .from('parent_students')
      .select('parent_id, student_id')
      .in('student_id', part));

    console.log(`[DailyReports] 👨‍👩‍👧 Found ${parentLinks?.length || 0} parent-student links`);
    if (!parentLinks?.length) return { processed: 0, sent: 0, failed: 0, schoolId: settings.school_id };

    const parentIds = [...new Set(parentLinks.map(l => l.parent_id))];

    // ─── Exclure les parents qui ont défini des préférences personnelles ─────
    // Ceux-ci sont gérés par le scheduler parent dédié (parentReportScheduler.js).
    const explicitPrefs = await selectInChunksSafe(parentIds, (part) => supabaseAdmin
      .from('parent_report_preferences')
      .select('parent_id')
      .in('parent_id', part));
    const parentsWithExplicitPrefs = new Set((explicitPrefs || []).map(p => p.parent_id));
    if (parentsWithExplicitPrefs.size > 0) {
      console.log(`[DailyReports] ⏭️  ${parentsWithExplicitPrefs.size} parent(s) avec préférences personnelles → ignorés ici (gérés par parentReportScheduler)`);
    }

    // Get parent WhatsApp contacts (par lots, même raison)
    const contacts = await selectInChunksSafe(parentIds, (part) => supabaseAdmin
      .from('parent_contacts')
      .select('parent_id, phone_e164, is_primary')
      .in('parent_id', part)
      .eq('channel', 'whatsapp')
      .order('is_primary', { ascending: false }));

    console.log(`[DailyReports] 📱 Found ${contacts?.length || 0} WhatsApp contacts`);

    // Build maps
    const parentPhoneMap = {};
    (contacts || []).forEach(c => {
      if (!parentPhoneMap[c.parent_id]) parentPhoneMap[c.parent_id] = c.phone_e164;
    });

    const studentParentMap = {};
    parentLinks.forEach(l => {
      if (!studentParentMap[l.student_id]) studentParentMap[l.student_id] = [];
      studentParentMap[l.student_id].push(l.parent_id);
    });

    // Track statistics
    let skippedNoParents = 0, skippedAlreadySent = 0, skippedNoSessions = 0;

    // Create all tasks upfront
    const tasks = [];
    
    for (const student of students) {
      const parents = studentParentMap[student.id] || [];
      if (parents.length === 0) {
        skippedNoParents++;
        continue;
      }

      // Check if already sent
      const { data: existing } = await supabaseAdmin
        .from('daily_reports')
        .select('id')
        .eq('student_id', student.id)
        .eq('report_date', today)
        .limit(1);

      if (existing?.length > 0) {
        skippedAlreadySent++;
        continue;
      }

      // Collect data
      const studentData = await collectStudentDailyData(student.id, today, settings.school_id);
      if (!studentData || studentData.sessions.length === 0) {
        skippedNoSessions++;
        continue;
      }

      processed++;

      // Generate report
      const report = await generateReport(studentData, settings.language, settings);
      if (!report) {
        failed++;
        continue;
      }

      // Build message
      let finalMessage = '';
      if (report.fr) finalMessage += report.fr;
      if (report.fr && report.ar) finalMessage += '\n\n━━━━━━━━━━━━━━━\n\n';
      if (report.ar) finalMessage += report.ar;

      // Create tasks for each parent (queued)
      for (const parentId of parents) {
        // Skip parents who have explicit preferences (handled by parentReportScheduler)
        if (parentsWithExplicitPrefs.has(parentId)) continue;
        const phone = parentPhoneMap[parentId];
        if (!phone) continue;

        tasks.push(
          queue.add(async () => {
            // Routage : push gratuit si le parent a l'app, sinon WhatsApp
            // (sauf opt-out). Réduit le coût des envois proactifs.
            const routed = await routeNotification({
              parentId,
              schoolId: settings.school_id,
              phone,
              push: {
                title: `📊 Suivi de ${student.first_name}`,
                body: 'Nouveau rapport quotidien disponible. Touchez pour l\'ouvrir.',
                url: '/parent',
                tag: `report-${student.id}-${today}`,
              },
              whatsappText: finalMessage,
            });

            const waFailed = routed.channel.startsWith('whatsapp') && !routed.success;
            if (waFailed) {
              console.warn(`[DailyReports] ❌ Échec WhatsApp à ${phone} (school=${settings.school_id})`);
            }

            // Log to database
            await supabaseAdmin.from('daily_reports').insert({
              school_id: settings.school_id,
              student_id: student.id,
              parent_id: parentId,
              phone_e164: phone,
              report_date: today,
              report_content_fr: report.fr || null,
              report_content_ar: report.ar || null,
              tracking_data: studentData,
              channel: routed.channel,
              status: waFailed ? 'failed' : 'sent',
              error_message: waFailed ? 'WhatsApp échoué' : null,
              sent_at: routed.success ? new Date().toISOString() : null
            });

            return routed;
          })
        );
      }
    }

    // Execute all tasks in parallel (with queue rate limiting)
    console.log(`[DailyReports] 🚀 Sending ${tasks.length} messages via queue...`);
    const results = await Promise.all(tasks);
    
    // Count results
    sent = results.filter(r => r.success).length;
    failed = results.filter(r => !r.success).length;

    console.log(`[DailyReports] ✅ School ${settings.school_id} done: ${sent} sent, ${failed} failed`);
    console.log(`[DailyReports] 📊 Skipped: ${skippedNoParents} (no parents), ${skippedAlreadySent} (already sent), ${skippedNoSessions} (no sessions)`);
    
    return { processed, sent, failed, schoolId: settings.school_id };
    
  } catch (error) {
    console.error(`[DailyReports] ❌ Error processing school ${settings.school_id}:`, error.message);
    return { processed, sent, failed, schoolId: settings.school_id, error: error.message };
  }
}

// ==================== MAIN: PROCESS DAILY REPORTS (PARALLEL BY SCHOOL) ====================

export async function processDailyReports(schoolId = null, scopedClassIds = null) {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[DailyReports] 📅 Processing reports for ${today}...`);

  // Get enabled settings
  let settingsQuery = supabaseAdmin
    .from('daily_report_settings')
    .select('*')
    .eq('enabled', true);

  if (schoolId) settingsQuery = settingsQuery.eq('school_id', schoolId);

  const { data: allSettings, error: settingsError } = await settingsQuery;
  if (settingsError || !allSettings?.length) {
    console.log('[DailyReports] No enabled settings found.');
    return { processed: 0, sent: 0, failed: 0 };
  }

  console.log(`[DailyReports] 🏫 Processing ${allSettings.length} school(s) in PARALLEL...`);

  // Process all schools in parallel
  const schoolResults = await Promise.all(
    allSettings.map(settings => processSchoolReports(settings, today, scopedClassIds))
  );

  // Aggregate results
  const totalProcessed = schoolResults.reduce((sum, r) => sum + r.processed, 0);
  const totalSent = schoolResults.reduce((sum, r) => sum + r.sent, 0);
  const totalFailed = schoolResults.reduce((sum, r) => sum + r.failed, 0);

  console.log(`[DailyReports] 🎉 ALL SCHOOLS DONE: Processed=${totalProcessed}, Sent=${totalSent}, Failed=${totalFailed}`);
  
  return { processed: totalProcessed, sent: totalSent, failed: totalFailed, schools: schoolResults };
}

// ==================== COMPREHENSIVE PERIOD REPORT ====================

async function collectStudentPeriodData(studentId, startDate, endDate, schoolId) {
  // Get student profile
  const { data: student } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, class_id, classes!fk_profiles_class(name, level, school_type, academic_year)')
    .eq('id', studentId)
    .single();

  if (!student) return null;

  // Get school name
  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .maybeSingle();

  // En-tête officiel établissement (académie / direction / établissement / année)
  const establishment = schoolId
    ? await getEstablishmentConfig(schoolId, student.classes?.academic_year)
    : null;

  // Get all sessions for this student's class in the period
  const { data: sessions } = await supabaseAdmin
    .from('sessions')
    .select('id, topic, notes, subject_id, teacher_id, type, date, start_time, end_time, subjects(name)')
    .eq('class_id', student.class_id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (!sessions || sessions.length === 0) return { student, sessions: [], tracking: [], controls: [], grades: [], homework: [], stats: null };

  // Resolve subject names for sessions with null subject_id via teacher_subjects
  const sessionsWithoutSubject = sessions.filter(s => !s.subjects?.name && !s.subject_id);
  if (sessionsWithoutSubject.length > 0) {
    const teacherIds = [...new Set(sessions.map(s => s.teacher_id).filter(Boolean))];
    if (teacherIds.length > 0) {
      const { data: teacherSubjects } = await supabaseAdmin
        .from('teacher_subjects')
        .select('teacher_id, subjects(id, name)')
        .in('teacher_id', teacherIds);
      if (teacherSubjects && teacherSubjects.length > 0) {
        // If a teacher teaches only one subject, assign it to their sessions
        const teacherSubjectMap = {};
        teacherSubjects.forEach(ts => {
          if (!teacherSubjectMap[ts.teacher_id]) teacherSubjectMap[ts.teacher_id] = [];
          if (ts.subjects?.name) teacherSubjectMap[ts.teacher_id].push(ts.subjects);
        });
        sessionsWithoutSubject.forEach(s => {
          const subjects = teacherSubjectMap[s.teacher_id];
          if (subjects && subjects.length === 1) {
            s.subjects = { name: subjects[0].name };
            s.subject_id = subjects[0].id;
          }
        });
      }
    }
  }

  console.log(`[ComprehensiveReport] Student: ${student.first_name} ${student.last_name}, class_id: ${student.class_id}`);
  console.log(`[ComprehensiveReport] Found ${sessions.length} sessions from ${startDate} to ${endDate}`);
  sessions.forEach(s => console.log(`  Session: ${s.id} | type=${s.type} | date=${s.date} | subject_id=${s.subject_id} | subject=${s.subjects?.name} | topic=${s.topic}`));

  const sessionIds = sessions.map(s => s.id);

  // Get all tracking records (batch if needed)
  let allTracking = [];
  for (let i = 0; i < sessionIds.length; i += 100) {
    const chunk = sessionIds.slice(i, i + 100);
    const { data } = await supabaseAdmin
      .from('session_tracking')
      .select('*')
      .eq('student_id', studentId)
      .in('session_id', chunk);
    if (data) allTracking = allTracking.concat(data);
  }

  // Get control tracking
  const controlSessions = sessions.filter(s => s.type === 'control');
  const controlSessionIds = controlSessions.map(s => s.id);
  let allControls = [];
  if (controlSessionIds.length > 0) {
    for (let i = 0; i < controlSessionIds.length; i += 100) {
      const chunk = controlSessionIds.slice(i, i + 100);
      const { data } = await supabaseAdmin
        .from('control_tracking')
        .select('*')
        .eq('student_id', studentId)
        .in('session_id', chunk);
      if (data) allControls = allControls.concat(data);
    }
  }

  console.log(`[ComprehensiveReport] session_tracking records: ${allTracking.length}`);
  if (allTracking.length > 0) allTracking.forEach(t => console.log(`  Tracking: session=${t.session_id} presence=${t.presence} participation=${t.participation} discipline=${t.discipline} mini_eval=${t.mini_eval} homework=${t.homework} phone=${t.phone_use} sleeping=${t.sleeping}`));
  console.log(`[ComprehensiveReport] control_tracking records: ${allControls.length}`);
  if (allControls.length > 0) allControls.forEach(c => console.log(`  Control tracking: session=${c.session_id} presence=${c.presence} discipline=${c.discipline_status} copy=${c.copy_submitted}`));

  // Get control notes/grades via controls_plan
  // control_notes.control_id references controls_plan.id, NOT sessions.id
  // Fetch ALL controls_plan for this class in the date range
  let allGrades = [];
  let controlPlanToSessionMap = {}; // maps controls_plan.id -> session.id
  {
    const { data: controlPlans, error: cpError } = await supabaseAdmin
      .from('controls_plan')
      .select('id, date, class_id, name, status')
      .eq('class_id', student.class_id)
      .gte('date', startDate)
      .lte('date', endDate);

    if (cpError) console.error(`[ComprehensiveReport] controls_plan ERROR:`, cpError);
    console.log(`[ComprehensiveReport] controls_plan query: class_id=${student.class_id}, date ${startDate}..${endDate}`);
    console.log(`[ComprehensiveReport] controls_plan found: ${controlPlans?.length || 0}`);
    if (controlPlans) controlPlans.forEach(cp => console.log(`  Plan: ${cp.id} | date=${cp.date} | name=${cp.name} | status=${cp.status}`));

    if (controlPlans && controlPlans.length > 0) {
      // Map each controls_plan to the matching session (by date + name match, or just date)
      controlPlans.forEach(cp => {
        const matchingSession = controlSessions.find(s =>
          s.date === cp.date && s.topic && cp.name && s.topic.toLowerCase().includes(cp.name.toLowerCase())
        ) || controlSessions.find(s => s.date === cp.date)
          || sessions.find(s => s.date === cp.date && s.topic && cp.name && s.topic.toLowerCase().includes(cp.name.toLowerCase()));
        if (matchingSession) {
          controlPlanToSessionMap[cp.id] = matchingSession.id;
        }
      });

      console.log(`[ComprehensiveReport] controlPlan->session map:`, JSON.stringify(controlPlanToSessionMap));

      const planIds = controlPlans.map(cp => cp.id);
      for (let i = 0; i < planIds.length; i += 100) {
        const chunk = planIds.slice(i, i + 100);
        const { data } = await supabaseAdmin
          .from('control_notes')
          .select('*')
          .eq('student_id', studentId)
          .in('control_id', chunk);
        if (data) {
          // Enrich each grade with the mapped session_id
          data.forEach(g => {
            g._session_id = controlPlanToSessionMap[g.control_id] || null;
          });
          allGrades = allGrades.concat(data);
        }
      }
    }
  }

  console.log(`[ComprehensiveReport] control_notes (grades) found: ${allGrades.length}`);
  if (allGrades.length > 0) allGrades.forEach(g => console.log(`  Grade: control_id=${g.control_id} note=${g.note} _session_id=${g._session_id}`));

  // Get homework submissions in the period
  const { data: homeworkSubs } = await supabaseAdmin
    .from('homework_submissions')
    .select('*, homework(title, description, due_date, subject_id, subjects(name))')
    .eq('student_id', studentId)
    .gte('created_at', `${startDate}T00:00:00`)
    .lte('created_at', `${endDate}T23:59:59`);

  // Map text enums to numeric scores
  const participationToNum = (val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const map = { 'excellent': 5, 'bon': 4, 'good': 4, 'moyen': 3, 'average': 3, 'faible': 1, 'poor': 1 };
    return map[String(val).toLowerCase()] ?? null;
  };
  const disciplineToNum = (val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const map = { 'concentre': 5, 'excellent': 5, 'good': 4, 'moyen': 3, 'average': 3, 'distrait': 1, 'poor': 1, 'very_poor': 0 };
    return map[String(val).toLowerCase()] ?? null;
  };
  const disciplineStatusToNum = (status) => {
    const map = { 'excellent': 5, 'good': 4, 'average': 3, 'poor': 2, 'very_poor': 1 };
    return map[status] || null;
  };

  // Build enriched session details
  const sessionDetails = sessions.map(session => {
    const tracking = allTracking.find(t => t.session_id === session.id);
    const control = allControls.find(c => c.session_id === session.id);
    const grade = allGrades.find(g => g._session_id === session.id);

    // For control sessions, build a unified tracking object from control_tracking
    let unifiedTracking = null;
    if (tracking) {
      unifiedTracking = {
        presence: tracking.presence,
        cahier_present: tracking.cahier_present,
        sleeping: tracking.sleeping,
        homework_done: tracking.homework,
        participation: tracking.participation,
        discipline: tracking.discipline,
        phone_use: tracking.phone_use,
        mini_eval: tracking.mini_eval,
        cahier_lesson: tracking.cahier_lesson,
        cahier_documents: tracking.cahier_documents,
        cahier_readability: tracking.cahier_readability,
        attitude: tracking.attitude,
        writing: tracking.writing,
        comment: tracking.comment,
        notes: tracking.notes
      };
    } else if (control) {
      // Map control_tracking fields to unified format
      unifiedTracking = {
        presence: control.presence || 'present',
        cahier_present: null,
        sleeping: null,
        homework_done: null,
        participation: null,
        discipline: disciplineStatusToNum(control.discipline_status),
        phone_use: control.phone_use || false,
        mini_eval: null,
        cahier_lesson: null,
        cahier_documents: null,
        cahier_readability: null,
        attitude: null,
        writing: null,
        comment: null,
        notes: null,
        copy_submitted: control.copy_submitted,
        material_status: control.material_status
      };
    }

    return {
      id: session.id,
      subject: session.subjects?.name || 'Non spécifié',
      subjectId: session.subject_id,
      topic: session.topic || 'Non spécifié',
      type: session.type,
      date: session.date,
      time: `${session.start_time || ''} - ${session.end_time || ''}`,
      tracking: unifiedTracking,
      control: control ? {
        presence: control.presence,
        material_status: control.material_status,
        discipline_status: control.discipline_status,
        copy_submitted: control.copy_submitted
      } : null,
      grade: grade ? { note: grade.note, max_note: grade.max_note || 20 } : null
    };
  });

  // ========== COMPUTE STATISTICS ==========
  const subjects = [...new Set(sessions.map(s => s.subjects?.name).filter(Boolean))];
  const dates = [...new Set(sessions.map(s => s.date))].sort();

  // Per-subject stats
  const subjectStats = {};
  subjects.forEach(subj => {
    const subjSessions = sessionDetails.filter(s => s.subject === subj);
    const tracked = subjSessions.filter(s => s.tracking);
    const totalPresent = tracked.filter(s => s.tracking.presence === 'present').length;
    const totalAbsent = tracked.filter(s => s.tracking.presence === 'absent').length;
    const totalLate = tracked.filter(s => s.tracking.presence === 'late').length;
    const participations = tracked.map(s => participationToNum(s.tracking.participation)).filter(v => v !== null);
    const disciplines = tracked.map(s => disciplineToNum(s.tracking.discipline)).filter(v => v !== null);
    const miniEvals = tracked.map(s => s.tracking.mini_eval).filter(v => v !== null && v !== undefined && !isNaN(v));
    const homeworkDone = tracked.filter(s => s.tracking.homework_done === true || s.tracking.homework_done === 'done').length;
    const homeworkTotal = tracked.filter(s => s.tracking.homework_done !== null && s.tracking.homework_done !== undefined).length;
    const phoneUse = tracked.filter(s => s.tracking.phone_use === true).length;
    const sleeping = tracked.filter(s => s.tracking.sleeping === true).length;
    const grades = subjSessions.filter(s => s.grade).map(s => ({ note: s.grade.note, max: s.grade.max_note, date: s.date }));
    const topics = [...new Set(subjSessions.map(s => s.topic).filter(t => t && t !== 'Non spécifié'))];

    // Cahier stats
    const cahierPresent = tracked.filter(s => s.tracking.cahier_present === true).length;
    const cahierTotal = tracked.filter(s => s.tracking.cahier_present !== null && s.tracking.cahier_present !== undefined).length;
    const cahierLesson = tracked.filter(s => s.tracking.cahier_lesson === true || s.tracking.cahier_lesson === 'oui').length;
    const cahierLessonTotal = tracked.filter(s => s.tracking.cahier_lesson !== null && s.tracking.cahier_lesson !== undefined).length;
    const cahierDocs = tracked.filter(s => s.tracking.cahier_documents === true || s.tracking.cahier_documents === 'oui').length;
    const cahierDocsTotal = tracked.filter(s => s.tracking.cahier_documents !== null && s.tracking.cahier_documents !== undefined).length;
    const cahierReadable = tracked.filter(s => s.tracking.cahier_readability === true || s.tracking.cahier_readability === 'oui' || s.tracking.cahier_readability === 'bon').length;
    const cahierReadableTotal = tracked.filter(s => s.tracking.cahier_readability !== null && s.tracking.cahier_readability !== undefined).length;
    // Attitude & writing
    const attitudeGood = tracked.filter(s => s.tracking.attitude === 'bon' || s.tracking.attitude === 'excellent' || s.tracking.attitude === true).length;
    const attitudeTotal = tracked.filter(s => s.tracking.attitude !== null && s.tracking.attitude !== undefined).length;
    const writingGood = tracked.filter(s => s.tracking.writing === 'bon' || s.tracking.writing === 'excellent' || s.tracking.writing === true).length;
    const writingTotal = tracked.filter(s => s.tracking.writing !== null && s.tracking.writing !== undefined).length;

    subjectStats[subj] = {
      totalSessions: subjSessions.length,
      totalTracked: tracked.length,
      presence: { present: totalPresent, absent: totalAbsent, late: totalLate },
      avgParticipation: participations.length > 0 ? +(participations.reduce((a, b) => a + b, 0) / participations.length).toFixed(1) : null,
      avgDiscipline: disciplines.length > 0 ? +(disciplines.reduce((a, b) => a + b, 0) / disciplines.length).toFixed(1) : null,
      avgMiniEval: miniEvals.length > 0 ? +(miniEvals.reduce((a, b) => a + Number(b), 0) / miniEvals.length).toFixed(1) : null,
      homeworkRate: homeworkTotal > 0 ? Math.round((homeworkDone / homeworkTotal) * 100) : null,
      phoneUseCount: phoneUse,
      sleepingCount: sleeping,
      cahierRate: cahierTotal > 0 ? Math.round((cahierPresent / cahierTotal) * 100) : null,
      cahierLessonRate: cahierLessonTotal > 0 ? Math.round((cahierLesson / cahierLessonTotal) * 100) : null,
      cahierDocsRate: cahierDocsTotal > 0 ? Math.round((cahierDocs / cahierDocsTotal) * 100) : null,
      cahierReadabilityRate: cahierReadableTotal > 0 ? Math.round((cahierReadable / cahierReadableTotal) * 100) : null,
      attitudeRate: attitudeTotal > 0 ? Math.round((attitudeGood / attitudeTotal) * 100) : null,
      writingRate: writingTotal > 0 ? Math.round((writingGood / writingTotal) * 100) : null,
      grades,
      topics
    };
  });

  // Daily evolution data (for charts)
  const dailyEvolution = dates.map(date => {
    const daySessions = sessionDetails.filter(s => s.date === date);
    const dayTracked = daySessions.filter(s => s.tracking);
    const presentCount = dayTracked.filter(s => s.tracking.presence === 'present').length;
    const participations = dayTracked.map(s => participationToNum(s.tracking.participation)).filter(v => v !== null);
    const disciplines = dayTracked.map(s => disciplineToNum(s.tracking.discipline)).filter(v => v !== null);
    const miniEvals = dayTracked.map(s => s.tracking.mini_eval).filter(v => v !== null && v !== undefined && !isNaN(v));
    const homeworkDone = dayTracked.filter(s => s.tracking.homework_done === true || s.tracking.homework_done === 'done').length;
    const homeworkTotal = dayTracked.filter(s => s.tracking.homework_done !== null && s.tracking.homework_done !== undefined).length;

    return {
      date,
      totalSessions: daySessions.length,
      presenceRate: dayTracked.length > 0 ? Math.round((presentCount / dayTracked.length) * 100) : null,
      avgParticipation: participations.length > 0 ? +(participations.reduce((a, b) => a + b, 0) / participations.length).toFixed(1) : null,
      avgDiscipline: disciplines.length > 0 ? +(disciplines.reduce((a, b) => a + b, 0) / disciplines.length).toFixed(1) : null,
      avgMiniEval: miniEvals.length > 0 ? +(miniEvals.reduce((a, b) => a + Number(b), 0) / miniEvals.length).toFixed(1) : null,
      homeworkRate: homeworkTotal > 0 ? Math.round((homeworkDone / homeworkTotal) * 100) : null
    };
  });

  // Overall stats
  const allTracked = sessionDetails.filter(s => s.tracking);
  const overallPresent = allTracked.filter(s => s.tracking.presence === 'present').length;
  const overallAbsent = allTracked.filter(s => s.tracking.presence === 'absent').length;
  const overallLate = allTracked.filter(s => s.tracking.presence === 'late').length;
  const allParticipations = allTracked.map(s => participationToNum(s.tracking.participation)).filter(v => v !== null);
  const allDisciplines = allTracked.map(s => disciplineToNum(s.tracking.discipline)).filter(v => v !== null);
  const allMiniEvals = allTracked.map(s => s.tracking.mini_eval).filter(v => v !== null && v !== undefined && !isNaN(v));
  const allHomeworkDone = allTracked.filter(s => s.tracking.homework_done === true || s.tracking.homework_done === 'done').length;
  const allHomeworkTotal = allTracked.filter(s => s.tracking.homework_done !== null && s.tracking.homework_done !== undefined).length;
  const allGradesList = sessionDetails.filter(s => s.grade).map(s => ({ note: s.grade.note, max: s.grade.max_note, subject: s.subject, date: s.date, topic: s.topic }));

  // Identify difficulty subjects (low avg participation or low grades)
  const difficultySubjects = Object.entries(subjectStats)
    .filter(([, stats]) => {
      const lowParticipation = stats.avgParticipation !== null && stats.avgParticipation < 3;
      const lowGrades = stats.grades.length > 0 && stats.grades.some(g => g.max > 0 && (g.note / g.max) < 0.5);
      const lowMiniEval = stats.avgMiniEval !== null && stats.avgMiniEval < 5;
      return lowParticipation || lowGrades || lowMiniEval;
    })
    .map(([name]) => name);

  const overallStats = {
    totalSessions: sessions.length,
    totalDays: dates.length,
    presence: { present: overallPresent, absent: overallAbsent, late: overallLate, total: allTracked.length },
    presenceRate: allTracked.length > 0 ? Math.round((overallPresent / allTracked.length) * 100) : null,
    avgParticipation: allParticipations.length > 0 ? +(allParticipations.reduce((a, b) => a + b, 0) / allParticipations.length).toFixed(1) : null,
    avgDiscipline: allDisciplines.length > 0 ? +(allDisciplines.reduce((a, b) => a + b, 0) / allDisciplines.length).toFixed(1) : null,
    avgMiniEval: allMiniEvals.length > 0 ? +(allMiniEvals.reduce((a, b) => a + Number(b), 0) / allMiniEvals.length).toFixed(1) : null,
    homeworkRate: allHomeworkTotal > 0 ? Math.round((allHomeworkDone / allHomeworkTotal) * 100) : null,
    grades: allGradesList,
    difficultySubjects
  };

  return {
    student: {
      id: student.id,
      firstName: student.first_name,
      lastName: student.last_name,
      className: student.classes?.name,
      level: student.classes?.level,
      schoolType: student.classes?.school_type,
      schoolName: establishment?.establishment || school?.name || '',
      academy: establishment?.academy || '',
      provincialDirection: establishment?.provincial_direction || '',
      academicYear: student.classes?.academic_year || establishment?.academic_year || '',
      logoBuffer: establishment?.logoBuffer || null
    },
    period: { startDate, endDate },
    sessions: sessionDetails,
    subjects,
    subjectStats,
    dailyEvolution,
    overallStats,
    homeworkSubmissions: (homeworkSubs || []).map(h => ({
      title: h.homework?.title,
      subject: h.homework?.subjects?.name,
      status: h.status,
      dueDate: h.homework?.due_date
    }))
  };
}

async function generateComprehensiveReport(periodData, language) {
  if (!periodData || periodData.sessions.length === 0) return null;

  const isBoth = language === 'both';
  const langInstr = language === 'ar'
    ? 'Écrire ENTIÈREMENT en arabe standard accessible.'
    : language === 'fr'
      ? 'Écrire ENTIÈREMENT en français.'
      : 'Écrire en DEUX parties: d\'abord en français, puis OBLIGATOIREMENT en arabe. Séparer par la ligne "━━━━━━━━━━━━━━━". La partie arabe est OBLIGATOIRE et doit être une traduction complète.';

  // Prompt orienté PARENT : phrases courtes, conseils concrets, ton expert pédagogue.
  // Pas d'abréviations télégraphiques ni de pavé d'emojis — le texte doit rester
  // lisible même quand affiché dans un PDF (Latin1) sans emojis.
  const systemPrompt = `Tu es un *conseiller pédagogique expert*. Tu rédiges un rapport CLAIR et UTILE destiné directement au PARENT (qui n'est pas spécialiste de l'éducation).

OBJECTIF :
Le parent doit comprendre en 30 secondes :
  1. Comment va son enfant cette période ?
  2. Qu'est-ce qui va bien ? Qu'est-ce qui ne va pas ?
  3. Que doit-il FAIRE concrètement à la maison pour aider ?

RÈGLES DE RÉDACTION :
- Phrases COMPLÈTES et SIMPLES (sujet + verbe + complément), pas de télégramme.
- Vocabulaire ACCESSIBLE : pas de jargon pédagogique. Si tu cites une matière, dis-le clairement.
- Donne TOUJOURS des chiffres concrets ("absent 2 fois sur 7 séances", pas "X%").
- Conseils ACTIONNABLES : "vérifier le cahier chaque soir", "limiter le téléphone après 20h", etc.
- Bienveillant mais HONNÊTE : ne pas masquer les difficultés.
- Pas plus de 2-3 emojis par section, et UNIQUEMENT comme petites puces (✅ ⚠️ 💡). PAS d'emojis pour remplacer des mots.
- Pas de markdown lourd (\`*gras*\` autorisé pour les titres).
- ${isBoth ? 'Max 1800 caractères par langue.' : 'Max 1800 caractères.'}
- *INTERDICTION ABSOLUE* dans la section française : aucun caractère arabe, aucun mot arabe. De même, dans la section arabe : aucun mot français.
- *NE JAMAIS écrire le nom ou le prénom de l'élève dans le corps du texte*. Le PDF affiche déjà le nom dans son en-tête. Utilisez à la place : "votre enfant", "il" ou "elle" en français ; "ابنك", "هو" ou "هي" en arabe.

STRUCTURE OBLIGATOIRE (utilise EXACTEMENT ces titres) :

*Synthèse*
[2-3 phrases : comment se porte l'enfant globalement. Ton de pédiatre bienveillant.]

*Ce qui va bien*
- [point fort 1, avec chiffre]
- [point fort 2 si applicable]

*Ce qui doit s'améliorer*
- [problème concret avec chiffre, ex : "absent 3 séances de Maths sur 7"]
- [autre problème si applicable]
(Si aucun problème : écrire "Pas de point d'inquiétude cette période.")

*Conseils pour la maison*
1. [action concrète et précise pour le parent]
2. [2e action si pertinente]
3. [3e action si pertinente]
(Conseils adaptés AUX problèmes identifiés ci-dessus, pas génériques.)

*Mot pour votre enfant*
[1 phrase courte, encourageante, qui s'adresse directement à l'enfant en le tutoyant ("Tu es..."). Sans citer son prénom.]

CONTEXTE (à NE PAS recopier dans le rapport) : Classe ${periodData.student.className || ''}, école ${periodData.student.schoolName || ''}.

FORMAT LINGUISTIQUE : ${langInstr}`;

  // Build concise data summary — only include sections with actual data
  const os = periodData.overallStats;
  let dataSummary = '';
  if (periodData.student.schoolName) dataSummary += `École: ${periodData.student.schoolName}\n`;
  dataSummary += `Élève: ${periodData.student.firstName} ${periodData.student.lastName}\n`;
  dataSummary += `Classe: ${periodData.student.className} (${periodData.student.level})\n`;
  dataSummary += `Période: ${periodData.period.startDate} au ${periodData.period.endDate}\n`;
  dataSummary += `${os.totalSessions} séances, ${os.totalDays} jours\n`;
  dataSummary += `Présence: ${os.presenceRate}%`;
  if (os.presence.absent > 0) dataSummary += ` (${os.presence.absent} absence(s))`;
  if (os.presence.late > 0) dataSummary += ` (${os.presence.late} retard(s))`;
  dataSummary += '\n';
  if (os.avgParticipation !== null) dataSummary += `Participation: ${os.avgParticipation}/5\n`;
  if (os.avgDiscipline !== null) dataSummary += `Discipline: ${os.avgDiscipline}/5\n`;
  if (os.avgMiniEval !== null) dataSummary += `Mini-éval: ${os.avgMiniEval}/10\n`;

  // Per-subject with ALL tracking elements
  for (const [subj, stats] of Object.entries(periodData.subjectStats)) {
    dataSummary += `\n--- ${subj} (${stats.totalSessions} séances) ---\n`;
    if (stats.topics.length > 0) dataSummary += `Chapitres: ${stats.topics.join(', ')}\n`;
    dataSummary += `Présence: ${stats.presence.present}/${stats.totalTracked}`;
    if (stats.presence.absent > 0) dataSummary += ` (${stats.presence.absent} abs)`;
    if (stats.presence.late > 0) dataSummary += ` (${stats.presence.late} retard)`;
    dataSummary += '\n';
    if (stats.avgParticipation !== null) dataSummary += `Participation: ${stats.avgParticipation}/5\n`;
    if (stats.avgDiscipline !== null) dataSummary += `Discipline: ${stats.avgDiscipline}/5\n`;
    if (stats.cahierRate !== null) dataSummary += `Cahier présent: ${stats.cahierRate}%\n`;
    if (stats.cahierLessonRate !== null) dataSummary += `Cahier leçons: ${stats.cahierLessonRate}%\n`;
    if (stats.cahierDocsRate !== null) dataSummary += `Cahier documents: ${stats.cahierDocsRate}%\n`;
    if (stats.cahierReadabilityRate !== null) dataSummary += `Cahier lisibilité: ${stats.cahierReadabilityRate}%\n`;
    if (stats.attitudeRate !== null) dataSummary += `Attitude positive: ${stats.attitudeRate}%\n`;
    if (stats.writingRate !== null) dataSummary += `Écriture soignée: ${stats.writingRate}%\n`;
    if (stats.homeworkRate !== null) dataSummary += `Devoirs faits: ${stats.homeworkRate}%\n`;
    if (stats.avgMiniEval !== null) dataSummary += `Mini-éval: ${stats.avgMiniEval}/10\n`;
    if (stats.phoneUseCount > 0) dataSummary += `Téléphone: ${stats.phoneUseCount} incident(s)\n`;
    if (stats.sleepingCount > 0) dataSummary += `Dort en classe: ${stats.sleepingCount} incident(s)\n`;
    if (stats.grades.length > 0) {
      stats.grades.forEach(g => { dataSummary += `Note: ${g.note}/${g.max} (${g.date})\n`; });
    }
  }

  // Grades summary
  if (os.grades.length > 0) {
    dataSummary += '\nNotes: ' + os.grades.map(g => `${g.subject} ${g.note}/${g.max} (${g.date})`).join(', ') + '\n';
  }

  // Homework
  if (periodData.homeworkSubmissions.length > 0) {
    dataSummary += '\nDevoirs: ' + periodData.homeworkSubmissions.map(h => `${h.title}: ${h.status === 'submitted' ? 'Rendu' : 'Non rendu'}`).join(', ') + '\n';
  }

  // Difficulty
  if (os.difficultySubjects.length > 0) dataSummary += `\nDifficulté: ${os.difficultySubjects.join(', ')}\n`;

  try {
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: dataSummary }
      ],
      max_tokens: isBoth ? 3500 : 2000,
      temperature: 0.4
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    if (language === 'both') {
      const parts = content.split('━━━━━━━━━━━━━━━');
      const fr = parts[0]?.trim() || content;
      let ar = parts[1]?.trim() || '';

      // Fallback: if Arabic part is missing, make a separate call to translate
      if (!ar) {
        console.log('[Report] Arabic part missing, making separate translation call...');
        try {
          const arCompletion = await deepseek.chat.completions.create({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: 'ترجم التقرير التالي إلى العربية الفصحى. حافظ على نفس التنسيق والرموز التعبيرية. ترجمة مباشرة وموجزة.' },
              { role: 'user', content: fr }
            ],
            max_tokens: 2000,
            temperature: 0.3
          });
          ar = arCompletion.choices[0]?.message?.content?.trim() || '';
        } catch (arErr) {
          console.error('[Report] Arabic translation fallback error:', arErr.message);
        }
      }

      return { fr, ar };
    }
    return { [language]: content.trim() };
  } catch (error) {
    console.error('DeepSeek AI error (comprehensive):', error.message);
    return null;
  }
}

export async function generateComprehensivePreview(studentId, schoolId, startDate, endDate) {
  const { data: settings } = await supabaseAdmin
    .from('daily_report_settings')
    .select('*')
    .eq('school_id', schoolId)
    .maybeSingle();

  const language = settings?.language || 'both';

  const periodData = await collectStudentPeriodData(studentId, startDate, endDate, schoolId);
  if (!periodData || periodData.sessions.length === 0) {
    return { error: 'Aucune donnée de suivi trouvée pour cet élève dans cette période.' };
  }

  const report = await generateComprehensiveReport(periodData, language);
  if (!report) return { error: 'Erreur lors de la génération du rapport IA.' };

  return {
    success: true,
    report,
    periodData: {
      student: periodData.student,
      period: periodData.period,
      subjects: periodData.subjects,
      subjectStats: periodData.subjectStats,
      dailyEvolution: periodData.dailyEvolution,
      overallStats: periodData.overallStats,
      homeworkSubmissions: periodData.homeworkSubmissions
    }
  };
}

// ==================== GENERATE PREVIEW (single student) ====================

export async function generatePreview(studentId, schoolId) {
  const today = new Date().toISOString().split('T')[0];

  const { data: settings } = await supabaseAdmin
    .from('daily_report_settings')
    .select('*')
    .eq('school_id', schoolId)
    .single();

  const effectiveSettings = settings || {
    language: 'both',
    include_recommendations: true,
    include_chapter_info: true,
    include_homework_status: true,
    include_behavior: true,
    include_grades: false
  };

  const studentData = await collectStudentDailyData(studentId, today, schoolId);
  if (!studentData || studentData.sessions.length === 0) {
    return { error: 'Aucune donnée de suivi trouvée pour cet élève aujourd\'hui.' };
  }

  const report = await generateReport(studentData, effectiveSettings.language, effectiveSettings);
  if (!report) return { error: 'Erreur lors de la génération du rapport IA.' };

  return { success: true, report, studentData };
}

// ==================== CRON SCHEDULER ====================

let cronJob = null;

export function startDailyReportScheduler() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.log('[DailyReports] DEEPSEEK_API_KEY not set, scheduler disabled.');
    return;
  }

  // Run every minute, check if any school's send_time matches current time
  cronJob = cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-GB', { 
        hour: '2-digit', minute: '2-digit', hour12: false, 
        timeZone: 'Africa/Casablanca' 
      }); // Format: HH:MM

      console.log(`[DailyReports] Checking at ${currentTime}`);

      // Get all enabled settings and check manually (to handle both HH:MM and HH:MM:SS formats)
      const { data: allSettings } = await supabaseAdmin
        .from('daily_report_settings')
        .select('school_id, send_time')
        .eq('enabled', true);

      if (allSettings?.length > 0) {
        for (const setting of allSettings) {
          // Normalize send_time to HH:MM format (remove seconds if present)
          const sendTime = setting.send_time?.substring(0, 5); // Get first 5 chars (HH:MM)
          
          if (sendTime === currentTime) {
            console.log(`[DailyReports] ✅ Triggered for school ${setting.school_id} at ${currentTime}`);
            processDailyReports(setting.school_id).catch(err => {
              console.error('[DailyReports] Scheduler error:', err.message);
            });
          }
        }
      }
    } catch (err) {
      console.error('[DailyReports] Cron error:', err.message);
    }
  });

  console.log('[DailyReports] Scheduler started (checks every minute).');
}

export function stopDailyReportScheduler() {
  if (cronJob) { cronJob.stop(); cronJob = null; }
}
