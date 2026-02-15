import { supabaseAdmin } from '../config/supabase.js';
import OpenAI from 'openai';
import cron from 'node-cron';

const WASENDER_BASE = 'https://www.wasenderapi.com';

// DeepSeek client (OpenAI-compatible API)
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || ''
});

// Safe JSON parse
const safeJson = async (response) => {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { return { success: false, message: `HTTP ${response.status}` }; }
};

// Global Wasender API key — shared by all schools
const getGlobalApiKey = () => process.env.WASENDER_API_KEY || null;

// Get the Wasender session ID mapped to a specific school from our DB
const getSchoolSessionId = async (schoolId) => {
  if (!schoolId) return null;
  const { data } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('wasender_session_id')
    .eq('school_id', schoolId)
    .single();
  return data?.wasender_session_id || null;
};

// Get WasenderAPI session API key for a specific school's mapped session
const getSessionApiKey = async (schoolId = null) => {
  const globalKey = getGlobalApiKey();
  if (!globalKey) return null;

  const mappedSessionId = await getSchoolSessionId(schoolId);
  if (!mappedSessionId) return null;

  const detailRes = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions/${mappedSessionId}`, {
    headers: { 'Authorization': `Bearer ${globalKey}` }
  });
  const detailData = await safeJson(detailRes);
  if (detailData.success && detailData.data?.api_key && detailData.data.status === 'connected') {
    return detailData.data.api_key;
  }
  return null;
};

// ==================== COLLECT DAILY DATA ====================

async function collectStudentDailyData(studentId, date, schoolId) {
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

// ==================== AI REPORT GENERATION ====================

async function generateReport(studentData, language, settings) {
  if (!studentData || !studentData.sessions.length) return null;

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

FORMAT DU RAPPORT:
${language === 'ar' ? `
- Écrire ENTIÈREMENT en arabe (dialecte marocain/arabe standard accessible)
- Utiliser des emojis appropriés pour rendre le message agréable
- Structure: Salutation → Nom de l'école → Résumé de la journée → Détails par matière → Points positifs → Recommandations → Encouragement final
- TOUJOURS mentionner le nom de l'école au début du rapport
` : language === 'fr' ? `
- Écrire ENTIÈREMENT en français
- Utiliser des emojis appropriés pour rendre le message agréable  
- Structure: Salutation → Nom de l'école → Résumé de la journée → Détails par matière → Points positifs → Recommandations → Encouragement final
- TOUJOURS mentionner le nom de l'école au début du rapport
` : `
- Écrire le rapport en DEUX parties: d'abord en français, puis en arabe
- Séparer les deux versions par une ligne "━━━━━━━━━━━━━━━"
- Utiliser des emojis appropriés pour rendre le message agréable
- Structure pour chaque langue: Salutation → Nom de l'école → Résumé de la journée → Détails par matière → Points positifs → Recommandations → Encouragement final
- TOUJOURS mentionner le nom de l'école au début du rapport
`}

CONTENU À INCLURE:
${settings.include_chapter_info ? '- Les chapitres/sujets étudiés dans chaque matière' : ''}
${settings.include_homework_status ? '- Le statut des devoirs (faits ou non)' : ''}
${settings.include_behavior ? '- Le comportement général (participation, discipline, attitude)' : ''}
${settings.include_grades ? '- Les notes obtenues si disponibles' : ''}
${settings.include_recommendations ? '- Des recommandations pédagogiques personnalisées pour aider l\'élève à progresser' : ''}

RECOMMANDATIONS PÉDAGOGIQUES À INCLURE:
- Conseils pratiques pour les parents (comment aider à la maison)
- Suggestions d'activités complémentaires si pertinent
- Rappels sur l'importance du sommeil, de l'organisation, etc.
- Encouragements adaptés au profil de l'élève`;

  // Build the data summary for the AI
  let dataSummary = `DONNÉES DE LA JOURNÉE DU ${studentData.date}:\n`;
  if (studentData.student.schoolName) dataSummary += `École: ${studentData.student.schoolName}\n`;
  dataSummary += `Élève: ${studentData.student.firstName} ${studentData.student.lastName}\n`;
  dataSummary += `Classe: ${studentData.student.className} (${studentData.student.level})\n\n`;

  dataSummary += `SÉANCES DE LA JOURNÉE:\n`;
  studentData.sessions.forEach((session, i) => {
    dataSummary += `\n--- Séance ${i + 1}: ${session.subject} (${session.type === 'control' ? 'Contrôle' : 'Cours'}) ---\n`;
    dataSummary += `Chapitre/Sujet: ${session.topic}\n`;
    dataSummary += `Horaire: ${session.time}\n`;

    if (session.tracking) {
      const t = session.tracking;
      dataSummary += `Présence: ${t.presence === 'present' ? 'Présent' : t.presence === 'absent' ? 'Absent' : t.presence === 'late' ? 'En retard' : t.presence}\n`;
      if (t.cahier_present !== null && t.cahier_present !== undefined) dataSummary += `Cahier présent: ${t.cahier_present ? 'Oui' : 'Non'}\n`;
      if (t.sleeping !== null && t.sleeping !== undefined) dataSummary += `Dort en classe: ${t.sleeping ? 'Oui' : 'Non'}\n`;
      if (t.homework_done !== null && t.homework_done !== undefined) dataSummary += `Devoir fait: ${t.homework_done ? 'Oui' : 'Non'}\n`;
      if (t.participation !== null && t.participation !== undefined) dataSummary += `Participation: ${t.participation}\n`;
      if (t.discipline !== null && t.discipline !== undefined) dataSummary += `Discipline: ${t.discipline}\n`;
      if (t.phone_use !== null && t.phone_use !== undefined) dataSummary += `Utilisation téléphone: ${t.phone_use ? 'Oui' : 'Non'}\n`;
      if (t.attitude) dataSummary += `Attitude: ${t.attitude}\n`;
      if (t.writing) dataSummary += `Écriture: ${t.writing}\n`;
      if (t.mini_eval !== null && t.mini_eval !== undefined) dataSummary += `Mini-évaluation: ${t.mini_eval}/10\n`;
      if (t.cahier_lesson !== null && t.cahier_lesson !== undefined) dataSummary += `Leçon dans cahier: ${t.cahier_lesson ? 'Oui' : 'Non'}\n`;
      if (t.cahier_documents !== null && t.cahier_documents !== undefined) dataSummary += `Documents dans cahier: ${t.cahier_documents ? 'Oui' : 'Non'}\n`;
      if (t.cahier_readability) dataSummary += `Lisibilité cahier: ${t.cahier_readability}\n`;
      if (t.comment) dataSummary += `Commentaire du professeur: ${t.comment}\n`;
      if (t.notes) dataSummary += `Notes du professeur: ${t.notes}\n`;
    }

    if (session.control) {
      dataSummary += `[CONTRÔLE] Copie rendue: ${session.control.copy_submitted ? 'Oui' : 'Non'}\n`;
      dataSummary += `Matériel: ${session.control.material_status}\n`;
    }

    if (session.grade) {
      dataSummary += `Note obtenue: ${session.grade.note}/${session.grade.max_note}\n`;
    }
  });

  if (studentData.homeworkSubmissions.length > 0) {
    dataSummary += `\nDEVOIRS:\n`;
    studentData.homeworkSubmissions.forEach(h => {
      dataSummary += `- ${h.title}: ${h.status === 'submitted' ? 'Rendu' : 'Non rendu'}\n`;
    });
  }

  try {
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: dataSummary }
      ],
      max_tokens: 2000,
      temperature: 0.7
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    if (language === 'both') {
      const parts = content.split('━━━━━━━━━━━━━━━');
      return {
        fr: parts[0]?.trim() || content,
        ar: parts[1]?.trim() || ''
      };
    }

    return { [language]: content.trim() };
  } catch (error) {
    console.error('DeepSeek AI error:', error.message);
    return null;
  }
}

// ==================== SEND REPORT VIA WHATSAPP ====================

async function sendReportWhatsApp(phone, reportText, sessionApiKey) {
  try {
    const res = await fetch(`${WASENDER_BASE}/api/send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to: phone, text: reportText })
    });
    const data = await safeJson(res);
    return data.success;
  } catch (error) {
    console.error('WhatsApp send error:', error.message);
    return false;
  }
}

// ==================== MAIN: PROCESS DAILY REPORTS ====================

export async function processDailyReports(schoolId = null) {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[DailyReports] Processing reports for ${today}...`);

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

  let totalProcessed = 0, totalSent = 0, totalFailed = 0;

  for (const settings of allSettings) {
    console.log(`[DailyReports] Processing school ${settings.school_id}...`);

    // Get session API key for THIS school
    const sessionApiKey = await getSessionApiKey(settings.school_id);
    if (!sessionApiKey) {
      console.error(`[DailyReports] No connected WhatsApp session for school ${settings.school_id}. Skipping.`);
      continue;
    }

    // Get all students in this school
    const { data: students } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id')
      .eq('role', 'student')
      .eq('school_id', settings.school_id);

    if (!students?.length) continue;

    // Get parent links for all students
    const studentIds = students.map(s => s.id);
    const { data: parentLinks } = await supabaseAdmin
      .from('parent_students')
      .select('parent_id, student_id')
      .in('student_id', studentIds);

    if (!parentLinks?.length) continue;

    const parentIds = [...new Set(parentLinks.map(l => l.parent_id))];

    // Get parent WhatsApp contacts
    const { data: contacts } = await supabaseAdmin
      .from('parent_contacts')
      .select('parent_id, phone_e164, is_primary')
      .in('parent_id', parentIds)
      .eq('channel', 'whatsapp')
      .order('is_primary', { ascending: false });

    // Build parent → phone map
    const parentPhoneMap = {};
    (contacts || []).forEach(c => {
      if (!parentPhoneMap[c.parent_id]) parentPhoneMap[c.parent_id] = c.phone_e164;
    });

    // Build student → parent map
    const studentParentMap = {};
    parentLinks.forEach(l => {
      if (!studentParentMap[l.student_id]) studentParentMap[l.student_id] = [];
      studentParentMap[l.student_id].push(l.parent_id);
    });

    // Process each student
    for (const student of students) {
      try {
        const parents = studentParentMap[student.id] || [];
        if (parents.length === 0) continue;

        // Check if report already exists for today
        const { data: existing } = await supabaseAdmin
          .from('daily_reports')
          .select('id')
          .eq('student_id', student.id)
          .eq('report_date', today)
          .limit(1);

        if (existing?.length > 0) continue;

        // Collect daily data
        const studentData = await collectStudentDailyData(student.id, today, settings.school_id);
        if (!studentData || studentData.sessions.length === 0) continue;

        totalProcessed++;

        // Generate AI report
        const report = await generateReport(studentData, settings.language, settings);
        if (!report) {
          totalFailed++;
          continue;
        }

        // Build final message
        let finalMessage = '';
        if (report.fr) finalMessage += report.fr;
        if (report.fr && report.ar) finalMessage += '\n\n━━━━━━━━━━━━━━━\n\n';
        if (report.ar) finalMessage += report.ar;

        // Send to each parent
        for (const parentId of parents) {
          const phone = parentPhoneMap[parentId];
          if (!phone) continue;

          const sent = await sendReportWhatsApp(phone, finalMessage, sessionApiKey);

          // Log the report
          await supabaseAdmin.from('daily_reports').insert({
            school_id: settings.school_id,
            student_id: student.id,
            parent_id: parentId,
            phone_e164: phone,
            report_date: today,
            report_content_fr: report.fr || null,
            report_content_ar: report.ar || null,
            tracking_data: studentData,
            status: sent ? 'sent' : 'failed',
            error_message: sent ? null : 'WhatsApp send failed',
            sent_at: sent ? new Date().toISOString() : null
          });

          if (sent) totalSent++;
          else totalFailed++;

          // Rate limit (2s between messages)
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        console.error(`[DailyReports] Error for student ${student.id}:`, err.message);
        totalFailed++;
      }
    }
  }

  console.log(`[DailyReports] Done. Processed: ${totalProcessed}, Sent: ${totalSent}, Failed: ${totalFailed}`);
  return { processed: totalProcessed, sent: totalSent, failed: totalFailed };
}

// ==================== COMPREHENSIVE PERIOD REPORT ====================

async function collectStudentPeriodData(studentId, startDate, endDate, schoolId) {
  // Get student profile
  const { data: student } = await supabaseAdmin
    .from('profiles')
    .select('id, first_name, last_name, class_id, classes!fk_profiles_class(name, level, school_type)')
    .eq('id', studentId)
    .single();

  if (!student) return null;

  // Get school name
  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .maybeSingle();

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
      schoolName: school?.name || ''
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

  const systemPrompt = `Tu es un conseiller pédagogique. Rapport ULTRA-CONCIS pour parents.

RÈGLES STRICTES:
- ZÉRO bavardage, ZÉRO phrase de remplissage
- Utiliser BEAUCOUP d'emojis pour remplacer les mots
- Afficher les données en % et chiffres, pas en phrases
- Ignorer toute section sans données
- Ton encourageant mais BREF
- TOUJOURS mentionner le nom de l'école au début du rapport
- ${isBoth ? 'Max 1500 caractères par langue (français + arabe)' : 'Max 2000 caractères'}

FORMAT: ${langInstr}

MODÈLE EXACT À SUIVRE:

🏫 *${periodData.student.schoolName || 'École'}*
📋 *${periodData.student.firstName}* — ${periodData.student.className}
📅 Période: [dates] | 📊 [nb] séances

✅ Présence: [X]% | ❌ [nb] abs | ⏰ [nb] retards

📚 *Par matière:*
▸ *[Matière]* ([nb] séances)
  ✅[présence%] 🙋[participation] 🎯[discipline] 📓[cahier%] ✍️[écriture%] 📝[devoirs%] 🧪[mini-éval]
  ${'{'}⚠️ téléphone/dort si incidents{'}'}

⚠️ *Attention:* [uniquement si problèmes: liste courte avec emojis]

💪 *Bravo:* [1 ligne positive] | 📌 *Conseil:* [1 conseil concret]

IMPORTANT: Chaque matière sur 1-2 lignes MAX avec emojis+chiffres. Pas de phrases complètes.`;

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
      });

      // Find settings where send_time matches current HH:MM
      const { data: matchingSettings } = await supabaseAdmin
        .from('daily_report_settings')
        .select('school_id')
        .eq('enabled', true)
        .eq('send_time', currentTime + ':00');

      if (matchingSettings?.length > 0) {
        for (const s of matchingSettings) {
          console.log(`[DailyReports] Triggered for school ${s.school_id} at ${currentTime}`);
          processDailyReports(s.school_id).catch(err => {
            console.error('[DailyReports] Scheduler error:', err.message);
          });
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
