import { supabaseAdmin } from '../config/supabase.js';
import OpenAI from 'openai';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || ''
});

const WASENDER_BASE = 'https://www.wasenderapi.com';

// Fonction principale appelée par le webhook
export async function handleIncomingWhatsAppMessage(messageInfo) {
  const { from: phoneNumber, text: messageText, id: messageId, sessionId } = messageInfo;
  
  console.log(`[Chatbot] Traitement message de ${phoneNumber}: ${messageText}`);
  
  try {
    // 1. Normaliser le numéro de téléphone (format international)
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    
    // 1.5. Récupérer le school_id de la session WhatsApp si disponible
    let sessionSchoolId = null;
    if (sessionId) {
      const { data: session } = await supabaseAdmin
        .from('whatsapp_school_sessions')
        .select('school_id')
        .eq('wasender_session_id', sessionId)
        .single();
      sessionSchoolId = session?.school_id;
    }
    
    // 2. Identifier le parent et l'école
    const parentInfo = await getParentByPhone(normalizedPhone, sessionSchoolId);
    if (!parentInfo) {
      console.log('[Chatbot] Numéro non autorisé:', normalizedPhone);
      // Ne pas répondre aux numéros non enregistrés
      return;
    }
    
    console.log('[Chatbot] Parent identifié:', parentInfo.parent_name, '- École:', parentInfo.school_name);
    
    // 3. Enregistrer le message entrant
    const { data: incomingMsg } = await supabaseAdmin
      .from('whatsapp_incoming_messages')
      .insert({
        phone_e164: normalizedPhone,
        parent_id: parentInfo.parent_id,
        school_id: parentInfo.school_id,
        message_text: messageText,
        wasender_message_id: messageId,
        processed: false
      })
      .select()
      .single();
    
    // 4. Identifier l'élève concerné par le message (via IA)
    const studentInfo = await identifyStudentFromMessage(messageText, parentInfo);
    
    if (!studentInfo) {
      console.log('[Chatbot] Impossible d\'identifier l\'élève dans le message');
      // Envoyer un message demandant de préciser
      await sendClarificationMessage(normalizedPhone, parentInfo, messageText);
      return;
    }
    
    console.log('[Chatbot] Élève identifié:', studentInfo.first_name, studentInfo.last_name);
    
    // 5. Collecter les données de l'élève
    const studentData = await collectStudentData(studentInfo.id, parentInfo.school_id);
    
    // 6. Générer la réponse IA
    const aiResponse = await generateAIResponse(messageText, studentInfo, studentData, parentInfo);
    
    // 7. Envoyer la réponse via WhatsApp
    await sendWhatsAppResponse(normalizedPhone, aiResponse, parentInfo.school_id);
    
    // 8. Mettre à jour le message comme traité
    await supabaseAdmin
      .from('whatsapp_incoming_messages')
      .update({
        processed: true,
        ai_response_sent: true,
        ai_response_text: aiResponse,
        student_id: studentInfo.id
      })
      .eq('id', incomingMsg.id);
    
    console.log('[Chatbot] Réponse envoyée avec succès');
    
  } catch (error) {
    console.error('[Chatbot] Erreur:', error);
    
    // Enregistrer l'erreur
    await supabaseAdmin
      .from('whatsapp_incoming_messages')
      .update({
        processed: true,
        error_message: error.message
      })
      .eq('wasender_message_id', messageId);
  }
}

// Normaliser le numéro de téléphone
function normalizePhoneNumber(phone) {
  // Supprimer @s.whatsapp.net si présent
  let cleaned = phone.replace('@s.whatsapp.net', '').replace('@c.us', '');
  
  // Ajouter + si absent
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
}

// Récupérer les informations du parent par numéro de téléphone
async function getParentByPhone(phoneNumber, schoolId = null) {
  let query = supabaseAdmin
    .from('profiles')
    .select(`
      id,
      first_name,
      last_name,
      phone,
      school_id,
      schools(id, name)
    `)
    .eq('role', 'parent')
    .eq('phone', phoneNumber);
  
  // Si school_id fourni, filtrer par école
  if (schoolId) {
    query = query.eq('school_id', schoolId);
  }
  
  const { data: parents } = await query;
  
  if (!parents || parents.length === 0) return null;
  
  // Prendre le premier parent trouvé
  const parent = parents[0];
  
  if (parents.length > 1) {
    console.log(`[Chatbot] ⚠️  Plusieurs parents trouvés avec le numéro ${phoneNumber}, utilisation du premier`);
  }
  
  return {
    parent_id: parent.id,
    parent_name: `${parent.first_name} ${parent.last_name}`,
    school_id: parent.school_id,
    school_name: parent.schools?.name || 'École'
  };
}

// Identifier l'élève mentionné dans le message via IA
async function identifyStudentFromMessage(messageText, parentInfo) {
  try {
    // Récupérer tous les enfants de ce parent via la table parent_students
    console.log('[Chatbot] Recherche enfants pour parent_id:', parentInfo.parent_id);
    
    const { data: studentParents, error: childrenError } = await supabaseAdmin
      .from('parent_students')
      .select(`
        student_id,
        students:profiles!parent_students_student_id_fkey(
          id,
          first_name,
          last_name,
          class_id,
          classes!fk_profiles_class(name, level)
        )
      `)
      .eq('parent_id', parentInfo.parent_id);
    
    console.log('[Chatbot] Résultat requête enfants:', { 
      count: studentParents?.length || 0, 
      error: childrenError,
      data: studentParents 
    });
    
    if (childrenError) {
      console.error('[Chatbot] Erreur récupération enfants:', childrenError);
    }
    
    if (!studentParents || studentParents.length === 0) {
      console.log('[Chatbot] Aucun enfant trouvé pour ce parent');
      return null;
    }
    
    // Extraire les profils des élèves
    const children = studentParents.map(sp => sp.students).filter(Boolean);
    
    // Si un seul enfant, le retourner directement
    if (children.length === 1) {
      return children[0];
    }
    
    // Si plusieurs enfants, utiliser l'IA pour identifier lequel est mentionné
    const childrenList = children.map(c => 
      `- ${c.first_name} ${c.last_name} (Classe: ${c.classes?.name || 'N/A'})`
    ).join('\n');
    
    const prompt = `Tu es un assistant qui identifie quel élève est mentionné dans un message de parent.

Enfants de ce parent:
${childrenList}

Message du parent: "${messageText}"

Réponds UNIQUEMENT avec le prénom de l'enfant mentionné, ou "TOUS" si le parent parle de tous ses enfants, ou "INCONNU" si tu ne peux pas déterminer.`;
    
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 50
    });
    
    const aiAnswer = response.choices[0]?.message?.content?.trim().toLowerCase();
    
    // Trouver l'enfant correspondant
    const matchedChild = children.find(c => 
      c.first_name.toLowerCase() === aiAnswer || 
      aiAnswer.includes(c.first_name.toLowerCase())
    );
    
    return matchedChild || children[0]; // Par défaut, retourner le premier enfant
    
  } catch (error) {
    console.error('[Chatbot] Erreur identification élève:', error);
    // En cas d'erreur, retourner le premier enfant
    const { data: firstChild } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, class_id, classes(name, level)')
      .eq('parent_id', parentInfo.parent_id)
      .eq('role', 'student')
      .limit(1)
      .single();
    
    return firstChild;
  }
}

// Collecter les données de l'élève (notes, présence, comportement, etc.)
async function collectStudentData(studentId, schoolId) {
  const today = new Date().toISOString().split('T')[0];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Récupérer les données des 7 derniers jours
  const [studentProfile, recentSessions, recentTracking, recentGrades, recentHomework] = await Promise.all([
    // Profil de l'élève
    supabaseAdmin
      .from('profiles')
      .select('*, classes(name, level, school_type)')
      .eq('id', studentId)
      .single(),
    
    // Sessions récentes de sa classe
    supabaseAdmin
      .from('sessions')
      .select('id, date, topic, type, subjects(name)')
      .eq('class_id', (await supabaseAdmin.from('profiles').select('class_id').eq('id', studentId).single()).data?.class_id)
      .gte('date', oneWeekAgo)
      .lte('date', today)
      .order('date', { ascending: false }),
    
    // Tracking de présence et comportement
    supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(date, subjects(name))')
      .eq('student_id', studentId)
      .gte('sessions.date', oneWeekAgo)
      .lte('sessions.date', today),
    
    // Notes récentes
    supabaseAdmin
      .from('control_notes')
      .select('*, controls(title, date, subjects(name))')
      .eq('student_id', studentId)
      .gte('controls.date', oneWeekAgo)
      .order('controls.date', { ascending: false })
      .limit(10),
    
    // Devoirs récents
    supabaseAdmin
      .from('homework_submissions')
      .select('*, homework(title, due_date, subjects(name))')
      .eq('student_id', studentId)
      .gte('homework.due_date', oneWeekAgo)
      .order('homework.due_date', { ascending: false })
      .limit(10)
  ]);
  
  return {
    profile: studentProfile.data,
    sessions: recentSessions.data || [],
    tracking: recentTracking.data || [],
    grades: recentGrades.data || [],
    homework: recentHomework.data || []
  };
}

// Générer la réponse IA personnalisée
async function generateAIResponse(question, studentInfo, studentData, parentInfo) {
  try {
    // Préparer le contexte pour l'IA
    const context = buildContextForAI(studentInfo, studentData);
    
    const systemPrompt = `Tu es un conseiller pédagogique expert travaillant pour ${parentInfo.school_name}. 
Tu réponds aux questions des parents concernant leurs enfants de manière professionnelle, bienveillante et précise.

RÈGLES IMPORTANTES:
- Réponds UNIQUEMENT avec les données réelles fournies
- Si tu n'as pas l'information, dis-le clairement
- Sois encourageant et constructif
- Utilise un ton professionnel mais chaleureux
- Réponds en français ou en arabe selon la langue de la question
- Limite ta réponse à 10-15 lignes maximum
- Utilise des emojis appropriés pour rendre le message agréable

DONNÉES DE L'ÉLÈVE:
${context}

Réponds maintenant à la question du parent de manière claire et précise.`;
    
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    let aiResponse = response.choices[0]?.message?.content || 'Désolé, je n\'ai pas pu générer une réponse.';
    
    // Ajouter signature
    aiResponse += `\n\n━━━━━━━━━━━━━━━\n👥 *L'équipe pédagogique*\n🏫 *${parentInfo.school_name}*`;
    
    return aiResponse;
    
  } catch (error) {
    console.error('[Chatbot] Erreur génération IA:', error);
    return `Bonjour,\n\nNous avons bien reçu votre message concernant ${studentInfo.first_name}. Notre équipe pédagogique reviendra vers vous dans les plus brefs délais.\n\nCordialement,\n👥 L'équipe pédagogique\n🏫 ${parentInfo.school_name}`;
  }
}

// Construire le contexte pour l'IA
function buildContextForAI(studentInfo, studentData) {
  let context = `Élève: ${studentInfo.first_name} ${studentInfo.last_name}\n`;
  context += `Classe: ${studentData.profile?.classes?.name || 'N/A'}\n`;
  context += `Niveau: ${studentData.profile?.classes?.level || 'N/A'}\n\n`;
  
  // Statistiques de présence
  const totalSessions = studentData.tracking.length;
  const presentCount = studentData.tracking.filter(t => t.presence === 'present').length;
  const absentCount = studentData.tracking.filter(t => t.presence === 'absent').length;
  
  if (totalSessions > 0) {
    context += `📊 PRÉSENCE (7 derniers jours):\n`;
    context += `- Présent: ${presentCount}/${totalSessions} séances\n`;
    context += `- Absent: ${absentCount}/${totalSessions} séances\n\n`;
  }
  
  // Comportement et participation
  const avgParticipation = calculateAverage(studentData.tracking, 'participation');
  const avgDiscipline = calculateAverage(studentData.tracking, 'discipline');
  
  if (avgParticipation || avgDiscipline) {
    context += `👤 COMPORTEMENT:\n`;
    if (avgParticipation) context += `- Participation: ${avgParticipation}\n`;
    if (avgDiscipline) context += `- Discipline: ${avgDiscipline}\n\n`;
  }
  
  // Devoirs
  const homeworkDone = studentData.homework.filter(h => h.status === 'submitted').length;
  const homeworkTotal = studentData.homework.length;
  
  if (homeworkTotal > 0) {
    context += `📝 DEVOIRS (7 derniers jours):\n`;
    context += `- Rendus: ${homeworkDone}/${homeworkTotal}\n\n`;
  }
  
  // Notes récentes
  if (studentData.grades.length > 0) {
    context += `📈 NOTES RÉCENTES:\n`;
    studentData.grades.slice(0, 5).forEach(grade => {
      context += `- ${grade.controls?.subjects?.name || 'Matière'}: ${grade.note}/20 (${grade.controls?.title || 'Contrôle'})\n`;
    });
    context += `\n`;
  }
  
  return context;
}

// Calculer la moyenne d'un champ
function calculateAverage(data, field) {
  const values = data.map(d => d[field]).filter(Boolean);
  if (values.length === 0) return null;
  
  const map = { 'excellent': 5, 'bon': 4, 'good': 4, 'moyen': 3, 'average': 3, 'faible': 2, 'poor': 2 };
  const numericValues = values.map(v => map[v.toLowerCase()] || 0);
  const avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
  
  if (avg >= 4.5) return 'Excellent';
  if (avg >= 3.5) return 'Bon';
  if (avg >= 2.5) return 'Moyen';
  return 'À améliorer';
}

// Envoyer un message de clarification
async function sendClarificationMessage(phoneNumber, parentInfo, originalMessage) {
  const message = `Bonjour,\n\nMerci pour votre message. Pour mieux vous répondre, pourriez-vous préciser de quel élève il s'agit ?\n\nCordialement,\n👥 L'équipe pédagogique\n🏫 ${parentInfo.school_name}`;
  
  await sendWhatsAppResponse(phoneNumber, message, parentInfo.school_id);
}

// Envoyer la réponse via WhatsApp
async function sendWhatsAppResponse(phoneNumber, message, schoolId) {
  try {
    // Récupérer la session API key de l'école
    const sessionApiKey = await getSchoolSessionApiKey(schoolId);
    
    if (!sessionApiKey) {
      console.error('[Chatbot] Pas de session WhatsApp active pour cette école');
      return;
    }
    
    // Formater le numéro (supprimer le +)
    const cleanPhone = phoneNumber.replace('+', '');
    
    // Envoyer via WasenderAPI
    const response = await fetch(`${WASENDER_BASE}/api/send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: cleanPhone,
        text: message
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('[Chatbot] Message envoyé avec succès à', phoneNumber);
    } else {
      console.error('[Chatbot] Erreur envoi message:', data);
    }
    
  } catch (error) {
    console.error('[Chatbot] Erreur envoi WhatsApp:', error);
  }
}

// Récupérer la clé API de session pour une école
async function getSchoolSessionApiKey(schoolId) {
  const globalKey = process.env.WASENDER_API_KEY;
  if (!globalKey) return null;
  
  // Récupérer le session_id de l'école
  const { data: schoolSession } = await supabaseAdmin
    .from('whatsapp_school_sessions')
    .select('wasender_session_id')
    .eq('school_id', schoolId)
    .single();
  
  if (!schoolSession?.wasender_session_id) return null;
  
  // Récupérer les détails de la session pour obtenir l'API key
  const response = await fetch(`${WASENDER_BASE}/api/whatsapp-sessions/${schoolSession.wasender_session_id}`, {
    headers: { 'Authorization': `Bearer ${globalKey}` }
  });
  
  const data = await response.json();
  
  if (data.success && data.data?.api_key && data.data.status === 'connected') {
    return data.data.api_key;
  }
  
  return null;
}
