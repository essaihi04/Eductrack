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
    
    // 4. Vérifier si le message nécessite une réponse IA
    const needsAIResponse = await shouldRespondWithAI(messageText, normalizedPhone, parentInfo.parent_id);
    
    if (!needsAIResponse.respond) {
      console.log('[Chatbot] Message ne nécessite pas de réponse IA:', needsAIResponse.reason);
      
      // Envoyer une réponse simple si c'est une salutation
      if (needsAIResponse.reason === 'greeting') {
        const menuMessage = await buildWelcomeMenu(parentInfo, normalizedPhone);
        await sendWhatsAppResponse(normalizedPhone, menuMessage, parentInfo.school_id);
      } else if (needsAIResponse.reason === 'thanks') {
        await sendWhatsAppResponse(normalizedPhone, `العفو! نحن دائماً في خدمتكم 🙏`, parentInfo.school_id);
      }
      
      await supabaseAdmin
        .from('whatsapp_incoming_messages')
        .update({ processed: true, ai_response_sent: false })
        .eq('id', incomingMsg.id);
      return;
    }
    
    // 5. Vérifier si c'est une sélection d'enfant (numéro)
    const childSelection = await handleChildSelection(messageText, normalizedPhone, parentInfo);
    if (childSelection.handled) {
      await supabaseAdmin
        .from('whatsapp_incoming_messages')
        .update({ processed: true, ai_response_sent: false })
        .eq('id', incomingMsg.id);
      return;
    }
    
    // 6. Vérifier si c'est une question prédéfinie
    const predefinedQuestion = detectPredefinedQuestion(messageText);
    
    // 7. Identifier l'élève concerné par le message
    const studentInfo = await identifyStudentFromMessage(messageText, parentInfo);
    
    if (!studentInfo) {
      console.log('[Chatbot] Impossible d\'identifier l\'élève dans le message');
      await sendChildSelectionMenu(normalizedPhone, parentInfo);
      return;
    }
    
    console.log('[Chatbot] Élève identifié:', studentInfo.first_name, studentInfo.last_name);
    
    // 8. Collecter les données complètes de l'élève
    const studentData = await collectStudentData(studentInfo.id, parentInfo.school_id);
    
    // 9. Générer la réponse IA avec historique
    const conversationHistory = await getConversationHistory(normalizedPhone, parentInfo.parent_id, studentInfo.id);
    const aiResponse = await generateAIResponse(
      predefinedQuestion || messageText, 
      studentInfo, 
      studentData, 
      parentInfo, 
      conversationHistory,
      predefinedQuestion ? 'predefined' : 'custom'
    );
    
    // 8. Envoyer la réponse via WhatsApp
    await sendWhatsAppResponse(normalizedPhone, aiResponse, parentInfo.school_id);
    
    // 9. Enregistrer la conversation avec conversation_id
    const conversationId = `${parentInfo.parent_id}_${studentInfo.id}_${Date.now()}`;
    await supabaseAdmin
      .from('whatsapp_conversations')
      .insert({
        conversation_id: conversationId,
        parent_id: parentInfo.parent_id,
        student_id: studentInfo.id,
        school_id: parentInfo.school_id,
        parent_message: messageText,
        ai_response: aiResponse,
        phone_e164: normalizedPhone
      });
    
    // 10. Mettre à jour le message comme traité
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

// Vérifier si le message nécessite une réponse IA
async function shouldRespondWithAI(messageText, phone, parentId) {
  const lowerText = messageText.toLowerCase().trim();
  
  // Messages qui ne nécessitent pas de réponse IA
  const greetings = ['سلام', 'مرحبا', 'صباح', 'مساء', 'bonjour', 'bonsoir', 'salut', 'hello', 'hi'];
  const thanks = ['شكرا', 'merci', 'thanks', 'thank you', 'بارك الله فيك'];
  const simple = ['ok', 'okay', 'd\'accord', 'حسنا', 'نعم', 'oui', 'yes'];
  
  // Vérifier les salutations simples
  if (greetings.some(g => lowerText.includes(g)) && lowerText.length < 20) {
    return { respond: false, reason: 'greeting' };
  }
  
  // Vérifier les remerciements
  if (thanks.some(t => lowerText.includes(t)) && lowerText.length < 30) {
    return { respond: false, reason: 'thanks' };
  }
  
  // Vérifier les réponses simples
  if (simple.some(s => lowerText === s)) {
    return { respond: false, reason: 'simple_response' };
  }
  
  // Cooldown supprimé - réponse immédiate pour toutes les questions
  
  return { respond: true, reason: 'needs_ai' };
}

// Récupérer l'historique de conversation (5-10 derniers messages)
async function getConversationHistory(phone, parentId, studentId, limit = 10) {
  const { data: history } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('conversation_id, parent_message, ai_response, created_at')
    .eq('parent_id', parentId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  return history || [];
}

// Construire le menu de bienvenue avec enfants et questions
async function buildWelcomeMenu(parentInfo, phone) {
  // Récupérer les enfants du parent
  const { data: children } = await supabaseAdmin
    .from('parent_students')
    .select(`
      student_id,
      students:profiles!parent_students_student_id_fkey(
        id,
        first_name,
        last_name,
        classes!fk_profiles_class(name)
      )
    `)
    .eq('parent_id', parentInfo.parent_id);
  
  const isArabic = parentInfo.parent_name && /[\u0600-\u06FF]/.test(parentInfo.parent_name);
  
  let message = isArabic 
    ? `السلام عليكم ${parentInfo.parent_name.split(' ')[0]} 👋\n\n` 
    : `Bonjour ${parentInfo.parent_name.split(' ')[0]} 👋\n\n`;
  
  if (children && children.length > 0) {
    message += isArabic ? '📚 *أبناؤك:*\n' : '📚 *Vos enfants:*\n';
    children.forEach((child, idx) => {
      const student = child.students;
      message += `${idx + 1}. ${student.first_name} ${student.last_name} - ${student.classes?.name || 'N/A'}\n`;
    });
    message += '\n';
  }
  
  message += isArabic 
    ? '*📋 أسئلة سريعة:*\n\n'
    : '*📋 Questions rapides:*\n\n';
  
  if (isArabic) {
    message += 'أ. كيف حال ولدي اليوم؟\n';
    message += 'ب. ما هي الدروس المدروسة؟\n';
    message += 'ج. هل هناك واجبات منزلية؟\n';
    message += 'د. ما هي آخر النقط؟\n';
    message += 'ه. كيف سلوكه في القسم؟\n';
  } else {
    message += 'A. Comment va mon enfant aujourd\'hui ?\n';
    message += 'B. Quelles leçons ont été étudiées ?\n';
    message += 'C. Y a-t-il des devoirs ?\n';
    message += 'D. Quelles sont les dernières notes ?\n';
    message += 'E. Comment est son comportement ?\n';
  }
  
  message += '\n' + (isArabic 
    ? '💬 أو اكتب سؤالك مباشرة' 
    : '💬 Ou écrivez votre question directement');
  
  return message;
}

// Gérer la sélection d'enfant
async function handleChildSelection(messageText, phone, parentInfo) {
  const trimmed = messageText.trim();
  
  // Vérifier si c'est un numéro (1, 2, 3...)
  if (/^[0-9]$/.test(trimmed)) {
    const childIndex = parseInt(trimmed) - 1;
    
    // Récupérer les enfants
    const { data: children } = await supabaseAdmin
      .from('parent_students')
      .select(`
        student_id,
        students:profiles!parent_students_student_id_fkey(
          id,
          first_name,
          last_name,
          classes!fk_profiles_class(name)
        )
      `)
      .eq('parent_id', parentInfo.parent_id);
    
    if (children && children[childIndex]) {
      const student = children[childIndex].students;
      
      // Enregistrer la sélection dans une table temporaire ou session
      await supabaseAdmin
        .from('whatsapp_conversations')
        .insert({
          parent_id: parentInfo.parent_id,
          student_id: student.id,
          school_id: parentInfo.school_id,
          parent_message: `Sélection: ${student.first_name}`,
          ai_response: 'Enfant sélectionné',
          phone_e164: phone
        });
      
      const isArabic = /[\u0600-\u06FF]/.test(student.first_name);
      const quickMenu = isArabic
        ? `✅ تم اختيار: *${student.first_name} ${student.last_name}*\n\n📋 *أسئلة سريعة:*\n\nأ. كيف حاله اليوم؟\nب. ما الدروس المدروسة؟\nج. هل هناك واجبات؟\nد. ما آخر النقط؟\nه. كيف سلوكه؟\n\n💬 أو اكتب سؤالك`
        : `✅ Sélectionné: *${student.first_name} ${student.last_name}*\n\n📋 *Questions rapides:*\n\nA. Comment va-t-il aujourd'hui ?\nB. Quelles leçons étudiées ?\nC. Y a-t-il des devoirs ?\nD. Dernières notes ?\nE. Son comportement ?\n\n💬 Ou écrivez votre question`;
      
      await sendWhatsAppResponse(phone, quickMenu, parentInfo.school_id);
      return { handled: true };
    }
  }
  
  return { handled: false };
}

// Envoyer le menu de sélection d'enfant
async function sendChildSelectionMenu(phone, parentInfo) {
  const { data: children } = await supabaseAdmin
    .from('parent_students')
    .select(`
      student_id,
      students:profiles!parent_students_student_id_fkey(
        id,
        first_name,
        last_name,
        classes!fk_profiles_class(name)
      )
    `)
    .eq('parent_id', parentInfo.parent_id);
  
  if (!children || children.length === 0) {
    await sendWhatsAppResponse(phone, 'Aucun enfant trouvé.', parentInfo.school_id);
    return;
  }
  
  if (children.length === 1) {
    // Un seul enfant, pas besoin de menu
    return;
  }
  
  const isArabic = /[\u0600-\u06FF]/.test(children[0].students.first_name);
  let message = isArabic 
    ? '👨‍👩‍👧‍👦 *اختر الطفل:*\n\n' 
    : '👨‍👩‍👧‍👦 *Choisissez l\'enfant:*\n\n';
  
  children.forEach((child, idx) => {
    const student = child.students;
    message += `${idx + 1}. ${student.first_name} ${student.last_name} - ${student.classes?.name || 'N/A'}\n`;
  });
  
  message += '\n' + (isArabic 
    ? '📝 أرسل الرقم (1، 2، 3...)' 
    : '📝 Envoyez le numéro (1, 2, 3...)');
  
  await sendWhatsAppResponse(phone, message, parentInfo.school_id);
}

// Détecter les questions prédéfinies
function detectPredefinedQuestion(messageText) {
  const lower = messageText.toLowerCase().trim();
  
  // Questions en arabe
  if (lower === 'أ' || lower.includes('كيف حال') || lower.includes('كيف داير')) {
    return 'Comment va mon enfant aujourd\'hui ? Donne-moi un résumé de sa journée.';
  }
  if (lower === 'ب' || lower.includes('الدروس المدروسة') || lower.includes('ماذا درس')) {
    return 'Quelles leçons ont été étudiées aujourd\'hui ?';
  }
  if (lower === 'ج' || lower.includes('واجبات') || lower.includes('فروض منزلية')) {
    return 'Y a-t-il des devoirs à faire ?';
  }
  if (lower === 'د' || lower.includes('النقط') || lower.includes('العلامات')) {
    return 'Quelles sont les dernières notes de mon enfant ?';
  }
  if (lower === 'ه' || lower.includes('سلوك') || lower.includes('تصرف')) {
    return 'Comment est le comportement de mon enfant en classe ?';
  }
  
  // Questions en français
  if (lower === 'a' || (lower.includes('comment') && lower.includes('aujourd'))) {
    return 'Comment va mon enfant aujourd\'hui ? Donne-moi un résumé de sa journée.';
  }
  if (lower === 'b' || (lower.includes('leçon') || lower.includes('étudié'))) {
    return 'Quelles leçons ont été étudiées aujourd\'hui ?';
  }
  if (lower === 'c' || lower.includes('devoir')) {
    return 'Y a-t-il des devoirs à faire ?';
  }
  if (lower === 'd' || (lower.includes('note') || lower.includes('résultat'))) {
    return 'Quelles sont les dernières notes de mon enfant ?';
  }
  if (lower === 'e' || lower.includes('comportement')) {
    return 'Comment est le comportement de mon enfant en classe ?';
  }
  
  return null;
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

// Collecter les données complètes de l'élève
async function collectStudentData(studentId, schoolId) {
  const today = new Date().toISOString().split('T')[0];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Récupérer toutes les données de l'élève
  const [studentProfile, recentSessions, recentTracking, recentGrades, recentHomework, allGrades, absences] = await Promise.all([
    // Profil de l'élève
    supabaseAdmin
      .from('profiles')
      .select('*, classes(name, level, school_type)')
      .eq('id', studentId)
      .single(),
    
    // Sessions récentes de sa classe avec cahier de texte
    supabaseAdmin
      .from('sessions')
      .select('id, date, topic, type, lesson_content, subjects(name)')
      .eq('class_id', (await supabaseAdmin.from('profiles').select('class_id').eq('id', studentId).single()).data?.class_id)
      .gte('date', oneWeekAgo)
      .lte('date', today)
      .order('date', { ascending: false }),
    
    // Tracking de présence et comportement avec incidents
    supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(date, subjects(name), lesson_content)')
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
      .limit(10),
    
    // Toutes les notes (pour calculer les moyennes)
    supabaseAdmin
      .from('control_notes')
      .select('*, controls(title, date, subjects(name))')
      .eq('student_id', studentId)
      .gte('controls.date', oneMonthAgo)
      .order('controls.date', { ascending: false }),
    
    // Absences du mois
    supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(date, subjects(name))')
      .eq('student_id', studentId)
      .eq('presence', 'absent')
      .gte('sessions.date', oneMonthAgo)
  ]);
  
  return {
    profile: studentProfile.data,
    sessions: recentSessions.data || [],
    tracking: recentTracking.data || [],
    grades: recentGrades.data || [],
    homework: recentHomework.data || [],
    allGrades: allGrades.data || [],
    absences: absences.data || []
  };
}

// Générer la réponse IA personnalisée avec historique
async function generateAIResponse(question, studentInfo, studentData, parentInfo, conversationHistory = [], questionType = 'custom') {
  try {
    // Préparer le contexte pour l'IA
    const context = buildContextForAI(studentInfo, studentData);
    
    // Préparer l'historique de conversation
    let historyContext = '';
    if (conversationHistory.length > 0) {
      historyContext = '\n\nHISTORIQUE DE CONVERSATION (messages récents):\n';
      conversationHistory.reverse().forEach((conv, idx) => {
        historyContext += `\n${idx + 1}. Parent: ${conv.parent_message}\n   Réponse: ${conv.ai_response.substring(0, 100)}...\n`;
      });
    }
    
    // Détecter la langue du message
    const isArabic = /[\u0600-\u06FF]/.test(question);
    const language = isArabic ? 'arabe' : 'français';
    
    const systemPrompt = `Tu es un conseiller pédagogique expert travaillant pour ${parentInfo.school_name}. 
Tu réponds aux questions des parents concernant leurs enfants de manière professionnelle, bienveillante et précise.

🚨 RÈGLES STRICTES - SYSTÈME RAG (Retrieval-Augmented Generation):

1. SOURCE DE DONNÉES UNIQUE:
   - Tu DOIS répondre UNIQUEMENT à partir des données fournies ci-dessous
   - INTERDICTION ABSOLUE d'inventer, supposer ou extrapoler des informations
   - Si une donnée n'est PAS dans le contexte, tu DOIS dire "Je n'ai pas cette information"

2. VÉRIFICATION DES DONNÉES:
   - Avant de mentionner une note, vérifie qu'elle existe dans "NOTES RÉCENTES"
   - Avant de parler de présence, vérifie "PRÉSENCE" ou "AUJOURD'HUI"
   - Avant de mentionner un incident, vérifie "INCIDENTS"
   - Avant de parler de leçons, vérifie "Leçon étudiée"

3. RÉPONSES COURTES ET PRÉCISES:
   - Maximum 8-10 lignes
   - Réponds UNIQUEMENT à la question posée
   - Pas d'informations supplémentaires non demandées
   - 2-3 emojis maximum

4. LANGUE:
   - Réponds OBLIGATOIREMENT en ${language}

5. FORMAT:
   - Réponds DIRECTEMENT sans introduction longue
   - Structure claire avec tirets ou numéros si plusieurs points
   - ${questionType === 'predefined' ? 'Question prédéfinie: réponds de manière concise et structurée' : ''}

6. SI DONNÉES MANQUANTES:
   - Dis clairement: "Je n'ai pas cette information pour le moment"
   - Propose de contacter l'enseignant pour plus de détails
   - N'invente JAMAIS de données

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DONNÉES INJECTÉES (SOURCE UNIQUE DE VÉRITÉ):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${context}

${historyContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Réponds maintenant UNIQUEMENT avec les données ci-dessus, de manière COURTE et PRÉCISE EN ${language.toUpperCase()}.`;
    
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
  const today = new Date().toISOString().split('T')[0];
  
  let context = `Élève: ${studentInfo.first_name} ${studentInfo.last_name}\n`;
  context += `Classe: ${studentData.profile?.classes?.name || 'N/A'}\n`;
  context += `Niveau: ${studentData.profile?.classes?.level || 'N/A'}\n\n`;
  
  // Données d'aujourd'hui
  const todayTracking = studentData.tracking.filter(t => t.sessions?.date === today);
  if (todayTracking.length > 0) {
    context += `📅 AUJOURD'HUI (${today}):\n`;
    todayTracking.forEach(t => {
      context += `- Matière: ${t.sessions?.subjects?.name || 'N/A'}\n`;
      if (t.sessions?.lesson_content) context += `  • Leçon étudiée: ${t.sessions.lesson_content}\n`;
      context += `  • Présence: ${t.presence === 'present' ? '✅ Présent' : t.presence === 'absent' ? '❌ Absent' : '⚠️ Retard'}\n`;
      if (t.participation) context += `  • Participation: ${t.participation}\n`;
      if (t.discipline) context += `  • Discipline: ${t.discipline}\n`;
      if (t.vigilance) context += `  • Vigilance: ${t.vigilance}\n`;
      if (t.cahier) context += `  • Cahier: ${t.cahier}\n`;
      
      // Incidents comportementaux détaillés
      if (t.incidents && t.incidents.length > 0) {
        const incidentDetails = [];
        if (t.incidents.includes('telephone')) incidentDetails.push('📱 Utilisation du téléphone');
        if (t.incidents.includes('sommeil')) incidentDetails.push('😴 Sommeil en classe');
        if (t.incidents.includes('bavardage')) incidentDetails.push('💬 Bavardage');
        if (t.incidents.includes('retard')) incidentDetails.push('⏰ Retard');
        if (t.incidents.includes('absence_materiel')) incidentDetails.push('📚 Absence de matériel');
        if (t.incidents.includes('insolence')) incidentDetails.push('😠 Insolence');
        if (t.incidents.includes('violence')) incidentDetails.push('⚠️ Violence');
        
        // Ajouter les incidents non mappés
        t.incidents.forEach(inc => {
          if (!['telephone', 'sommeil', 'bavardage', 'retard', 'absence_materiel', 'insolence', 'violence'].includes(inc)) {
            incidentDetails.push(`⚠️ ${inc}`);
          }
        });
        
        if (incidentDetails.length > 0) {
          context += `  • ⚠️ INCIDENTS: ${incidentDetails.join(', ')}\n`;
        }
      }
    });
    context += `\n`;
  }
  
  // Statistiques de présence (7 derniers jours)
  const totalSessions = studentData.tracking.length;
  const presentCount = studentData.tracking.filter(t => t.presence === 'present').length;
  const absentCount = studentData.tracking.filter(t => t.presence === 'absent').length;
  
  if (totalSessions > 0) {
    context += `📊 PRÉSENCE (7 derniers jours):\n`;
    context += `- Présent: ${presentCount}/${totalSessions} séances\n`;
    context += `- Absent: ${absentCount}/${totalSessions} séances\n\n`;
  }
  
  // Comportement et participation (moyenne)
  const avgParticipation = calculateAverage(studentData.tracking, 'participation');
  const avgDiscipline = calculateAverage(studentData.tracking, 'discipline');
  
  if (avgParticipation || avgDiscipline) {
    context += `👤 COMPORTEMENT (moyenne):\n`;
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
