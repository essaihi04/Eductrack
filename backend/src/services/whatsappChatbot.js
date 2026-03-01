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
    
    // 5. Vérifier salutations/remerciements simples
    const aiCheck = await shouldRespondWithAI(messageText, normalizedPhone, parentInfo.parent_id);
    if (!aiCheck.respond) {
      const isArabic = /[\u0600-\u06FF]/.test(messageText);
      let simpleResponse = '';
      if (aiCheck.reason === 'greeting') {
        simpleResponse = isArabic 
          ? `وعليكم السلام 👋\n\nكيف يمكنني مساعدتك؟`
          : `Bonjour 👋\n\nComment puis-je vous aider ?`;
      } else if (aiCheck.reason === 'thanks') {
        simpleResponse = isArabic
          ? `العفو 🙏 نحن هنا لمساعدتك دائماً`
          : `De rien 🙏 Nous sommes toujours là pour vous aider`;
      } else {
        simpleResponse = isArabic ? `حسناً 👍` : `D'accord 👍`;
      }
      await sendWhatsAppResponse(normalizedPhone, simpleResponse, parentInfo.school_id);
      await supabaseAdmin
        .from('whatsapp_incoming_messages')
        .update({ processed: true, ai_response_sent: true, ai_response_text: simpleResponse })
        .eq('id', incomingMsg.id);
      return;
    }

    // 6. Vérifier si c'est une sélection d'enfant (numéro)
    const childSelection = await handleChildSelection(messageText, normalizedPhone, parentInfo);
    if (childSelection.handled) {
      await supabaseAdmin
        .from('whatsapp_incoming_messages')
        .update({ processed: true, ai_response_sent: false })
        .eq('id', incomingMsg.id);
      return;
    }
    
    // 7. Identifier l'élève concerné par le message
    const studentInfo = await identifyStudentFromMessage(messageText, parentInfo);
    
    if (!studentInfo) {
      console.log('[Chatbot] Impossible d\'identifier l\'élève dans le message');
      await sendChildSelectionMenu(normalizedPhone, parentInfo);
      return;
    }
    
    console.log('[Chatbot] Élève identifié:', studentInfo.first_name, studentInfo.last_name);
    
    // 9. Collecter les données complètes de l'élève
    const studentData = await collectStudentData(studentInfo.id, parentInfo.school_id);
    console.log('[Chatbot] Données collectées:', {
      sessions: studentData.sessions?.length || 0,
      tracking: studentData.tracking?.length || 0,
      grades: studentData.grades?.length || 0,
      homework: studentData.homework?.length || 0,
      absences: studentData.absences?.length || 0
    });
    
    // 8. ARCHITECTURE HYBRIDE - Classifier la question
    const questionType = classifyQuestion(messageText);
    console.log('[Chatbot] Type de question:', questionType);
    
    let response;
    
    if (questionType === 'FACTUAL') {
      // Réponse directe depuis la DB (pas d'IA)
      console.log('[Chatbot] Question factuelle - Réponse directe');
      response = await generateDirectResponse(messageText, studentInfo, studentData, parentInfo);

      // Fallback intelligent: si la réponse factuelle ne comprend pas, basculer vers l'IA
      if (!response) {
        console.log('[Chatbot] Fallback IA - question factuelle non comprise');
        const conversationHistory = await getConversationHistory(normalizedPhone, parentInfo.parent_id, studentInfo.id);
        response = await generateAIResponse(
          messageText,
          studentInfo,
          studentData,
          parentInfo,
          conversationHistory
        );
      }
    } else {
      // Question complexe - Activation de l'IA
      console.log('[Chatbot] Question analytique - Activation IA');
      const conversationHistory = await getConversationHistory(normalizedPhone, parentInfo.parent_id, studentInfo.id);
      response = await generateAIResponse(
        messageText, 
        studentInfo, 
        studentData, 
        parentInfo, 
        conversationHistory
      );
    }
    
    // Ajouter le menu de questions rapides après la réponse (langue du parent)
    const isArabic = /[\u0600-\u06FF]/.test(messageText);
    const quickMenu = isArabic
      ? `\n\n━━━━━━━━━━━━━━━\n📋 *أسئلة سريعة:*\n\nأ. كيف حاله اليوم؟\nب. ما الدروس المدروسة؟\nج. هل هناك واجبات؟\nد. ما آخر النقط؟\nه. كيف سلوكه؟\nو. برنامج الأسبوع؟\n\n💬 أو اكتب سؤالك مباشرة`
      : `\n\n━━━━━━━━━━━━━━━\n📋 *Questions rapides:*\n\nA. Comment va-t-il aujourd'hui ?\nB. Quelles leçons étudiées ?\nC. Y a-t-il des devoirs ?\nD. Dernières notes ?\nE. Son comportement ?\nF. Programme de la semaine ?\n\n💬 Ou écrivez votre question`;
    
    const aiResponse = response + quickMenu;
    
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
  
  return (history || []).reverse(); // Chronologique: plus ancien en premier
}

// Détecter le mode conversationnel de la question
function detectConversationMode(messageText, conversationHistory) {
  const lower = messageText.toLowerCase().trim();
  const isArabic = /[\u0600-\u06FF]/.test(messageText);

  // Mode SUIVI: question de suivi d'une réponse précédente
  const followUpIndicators = [
    'كيفاش', 'كيف نقدر', 'واش', 'اش كنعمل', 'شنو خاصني', 'علاش', 'فكيفاش',
    'comment faire', 'que faire', 'comment je peux', 'comment l\'aider',
    'et alors', 'et donc', 'et ensuite', 'qu\'est-ce que je dois',
    'نتحاور', 'نساعده', 'ندير', 'نعمل معاه'
  ];
  const isFollowUp = followUpIndicators.some(kw => lower.includes(kw)) ||
    (conversationHistory.length > 0 && lower.length < 60 && !lower.includes('note') && !lower.includes('absence'));

  // Mode DONNÉES: question factuelle sur notes, absences, présence
  const dataIndicators = [
    'note', 'نقطة', 'نقط', 'absence', 'غياب', 'présence', 'حضور',
    'moyenne', 'معدل', 'matière', 'مادة', 'devoir', 'واجب',
    'ضعيف', 'faible', 'résultat', 'نتيجة', 'classe', 'القسم'
  ];
  const isData = dataIndicators.some(kw => lower.includes(kw));

  // Mode CONSEIL: demande de conseils pédagogiques
  const adviceIndicators = [
    'نصيحة', 'conseil', 'recommande', 'améliorer', 'يقرا', 'مردودية',
    'motivation', 'تحفيز', 'pourquoi', 'لماذا', 'soutien', 'مساعدة',
    'comportement', 'سلوك', 'باغيش', 'يرفض', 'يكره'
  ];
  const isAdvice = adviceIndicators.some(kw => lower.includes(kw));

  if (isData && !isAdvice) return 'DATA';
  if (isAdvice || isFollowUp) return 'ADVICE';
  return 'ADVICE'; // Défaut vers conseil
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
    message += 'و. برنامج الأسبوع؟\n';
  } else {
    message += 'A. Comment va mon enfant aujourd\'hui ?\n';
    message += 'B. Quelles leçons ont été étudiées ?\n';
    message += 'C. Y a-t-il des devoirs ?\n';
    message += 'D. Quelles sont les dernières notes ?\n';
    message += 'E. Comment est son comportement ?\n';
    message += 'F. Programme de la semaine ?\n';
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
        ? `✅ تم اختيار: *${student.first_name} ${student.last_name}*\n\n📋 *أسئلة سريعة:*\n\nأ. كيف حاله اليوم؟\nب. ما الدروس المدروسة؟\nج. هل هناك واجبات؟\nد. ما آخر النقط؟\nه. كيف سلوكه؟\nو. برنامج الأسبوع؟\n\n💬 أو اكتب سؤالك مباشرة`
        : `✅ Sélectionné: *${student.first_name} ${student.last_name}*\n\n📋 *Questions rapides:*\n\nA. Comment va-t-il aujourd'hui ?\nB. Quelles leçons étudiées ?\nC. Y a-t-il des devoirs ?\nD. Dernières notes ?\nE. Son comportement ?\nF. Programme de la semaine ?\n\n💬 Ou écrivez votre question`;
      
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

// CLASSIFICATEUR DE QUESTIONS - Architecture hybride
function classifyQuestion(messageText) {
  const lower = messageText.toLowerCase().trim();

  // PRIORITÉ 1: Questions analytiques (IA obligatoire)
  const analyticalPatterns = [
    // Questions "comment" analytiques
    /كيف يمكن|كيف نقدر|كيفاش ن|كيف أساعد|كيف نحسن|comment puis-je|comment faire|comment l'aider|comment améliorer/,
    // Questions "pourquoi"
    /لماذا|علاش|pourquoi|pour quelle raison/,
    // Questions de prédiction/possibilité
    /هل يمكن|هل سي|هل يستطيع|هل سينجح|peut-il|pourra-t-il|va-t-il réussir|risque de/,
    // Conseils et recommandations
    /نصيحة|ماذا أفعل|ماذا يجب|شنو خاصني|conseil|recommandation|que dois-je|que faire/,
    // Analyse et évaluation
    /تحليل|تقييم|مقارنة|analyse|évaluation|comparaison|évolution/,
    // Questions ouvertes complexes
    /كيف دالك|كيف داير|كيف حال|comment va|comment se passe/
  ];

  if (analyticalPatterns.some(p => p.test(lower))) return 'ANALYTICAL';

  // PRIORITÉ 2: Questions factuelles simples (DB directe)
  const factualPatterns = [
    // Présence / absences (sans "comment" ni "pourquoi")
    /^(كم|ما|combien|quel).{0,20}(غياب|حضور|absence|présence)/,
    // Notes simples
    /^(كم|ما|شنو|combien|quel).{0,20}(نقط|معدل|note|moyenne)/,
    // Devoirs simples
    /^(هل|واش|y a-t-il|a-t-il).{0,20}(واجب|devoir)/,
    // Leçons (aujourd'hui, hier, titres)
    /الدروس|درس|دروس|leçon|leçons|cours|البارحة.*درس|hier.*leçon|titres.*leçon|étudié/,
    // Planning/programme
    /^(ما|شنو|quel).{0,20}(برنامج|programme|planning)/,
    // Bilan mensuel
    /بيلان.*الشهر|bilan.*mois|résumé.*mois/
  ];

  if (factualPatterns.some(p => p.test(lower))) return 'FACTUAL';

  // PRIORITÉ 3: Mots-clés factuels isolés (sans contexte analytique)
  const simpleFactualKeywords = /^و$|^[a-f]$|^أ$|^ب$|^ج$|^د$|^ه$|^الدروس$|^دروس$/;
  if (simpleFactualKeywords.test(lower)) return 'FACTUAL';

  // Par défaut → IA analytique pour être sûr
  return 'ANALYTICAL';
}

// Générer une réponse directe (sans IA) pour questions factuelles
async function generateDirectResponse(question, studentInfo, studentData, parentInfo) {
  const lower = question.toLowerCase().trim();
  const isArabic = /[\u0600-\u06FF]/.test(question);
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.slice(0, 7);
  const normalizeText = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  const toMonthKey = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.slice(0, 7);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 7);
  };
  const toSparkline = (values) => {
    const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    if (!values || values.length === 0) return '';
    return values
      .map((v) => {
        const normalized = Math.max(0, Math.min(100, Number(v) || 0));
        const idx = Math.min(7, Math.floor(normalized / 12.5));
        return blocks[idx];
      })
      .join('');
  };
  const inferControlSubject = (grade) => {
    const allSessions = studentData.allSessions || [];
    const subjectPool = [...new Set(allSessions.map((s) => s?.subjects?.name).filter(Boolean))];
    const controlName = normalizeText(grade?.controls_plan?.name);

    // 1) Essayer d'inférer via le nom du contrôle
    const matchedByName = subjectPool.find((subject) => {
      const normalizedSubject = normalizeText(subject);
      return normalizedSubject && (controlName.includes(normalizedSubject) || normalizedSubject.includes(controlName));
    });
    if (matchedByName) return matchedByName;

    // 2) Essayer via la date du contrôle (matières de cette date)
    const controlDate = grade?.controls_plan?.date;
    if (controlDate) {
      const sameDaySubjects = [...new Set(
        allSessions
          .filter((s) => s?.date === controlDate)
          .map((s) => s?.subjects?.name)
          .filter(Boolean)
      )];
      if (sameDaySubjects.length === 1) return sameDaySubjects[0];
      if (sameDaySubjects.length > 1) return sameDaySubjects.join(' / ');

      const controlTs = new Date(controlDate).getTime();
      if (!Number.isNaN(controlTs)) {
        const closestSessions = allSessions
          .map((s) => ({
            subject: s?.subjects?.name,
            distance: Math.abs(new Date(s?.date).getTime() - controlTs)
          }))
          .filter((x) => x.subject && Number.isFinite(x.distance))
          .sort((a, b) => a.distance - b.distance);

        if (closestSessions.length > 0) {
          const minDistance = closestSessions[0].distance;
          const nearbySubjects = [...new Set(
            closestSessions
              .filter((x) => x.distance === minDistance && x.distance <= 7 * 24 * 60 * 60 * 1000)
              .map((x) => x.subject)
          )];
          if (nearbySubjects.length === 1) return nearbySubjects[0];
          if (nearbySubjects.length > 1) return nearbySubjects.join(' / ');
        }
      }
    }

    // 3) S'il n'y a qu'une seule matière observée, on la retourne
    if (subjectPool.length === 1) return subjectPool[0];

    return null;
  };
  
  let response = '';

  // Mots-clés indiquant une demande de leçons/cours (à vérifier AVANT le bilan mensuel)
  const lessonsKeywords = [
    'درس', 'دروس', 'cours', 'leçon', 'leçons', 'lesson',
    'قرأ', 'يقرا', 'يدرس', 'دراسة', 'étudié', 'étudi',
    'عنوان', 'موضوع', 'topic', 'programme', 'contenu'
  ];
  const isLessonsQuery = lessonsKeywords.some(kw => lower.includes(kw));

  // LEÇONS / COURS DU MOIS (doit être vérifié AVANT le bilan mensuel)
  if (
    isLessonsQuery &&
    (
      lower.includes('الشهر') || lower.includes('هد الشهر') || lower.includes('هذا الشهر') ||
      lower.includes('ce mois') || lower.includes('du mois') || lower.includes('mensuel') ||
      lower.includes('مدروسة') || lower.includes('درست') || lower.includes('دراسة')
    )
  ) {
    const allSessions = studentData.allSessions || [];
    const currentMonthSessions = allSessions.filter(s => toMonthKey(s.date) === currentMonth);
    const sourceSessions = currentMonthSessions.length > 0 ? currentMonthSessions : allSessions.slice(0, 20);

    // Grouper les topics par matière
    const subjectTopics = {};
    sourceSessions.forEach(s => {
      const subject = s?.subjects?.name || 'Autre';
      if (!subjectTopics[subject]) subjectTopics[subject] = [];
      if (s.topic && !subjectTopics[subject].includes(s.topic)) {
        subjectTopics[subject].push(s.topic);
      }
    });

    const subjectList = Object.keys(subjectTopics);
    if (subjectList.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد دروس مسجلة هذا الشهر.`
        : `ℹ️ Aucune leçon enregistrée ce mois.`;
    } else {
      const period = currentMonthSessions.length > 0 ? currentMonth : 'récente';
      response = isArabic
        ? `📚 *الدروس المدروسة (${period}):*\n\n`
        : `📚 *Leçons étudiées (${period}):*\n\n`;

      subjectList.forEach(subject => {
        const topics = subjectTopics[subject];
        response += `📌 *${subject}*\n`;
        if (topics.length > 0) {
          topics.slice(0, 4).forEach(t => {
            response += `  • ${t}\n`;
          });
        } else {
          response += isArabic ? `  • (لا عنوان مسجل)\n` : `  • (pas de titre enregistré)\n`;
        }
      });
    }
  }

  // BILAN DU MOIS
  else if (
    lower.includes('ce mois') ||
    lower.includes('du mois') ||
    lower.includes('mensuel') ||
    lower.includes('mois') ||
    lower.includes('الشهر') ||
    lower.includes('شهري')
  ) {
    let monthTracking = (studentData.allTracking || []).filter(t => toMonthKey(t.sessions?.date) === currentMonth);
    const monthAbsences = (studentData.absences || []).filter(a => toMonthKey(a.sessions?.date) === currentMonth);
    let monthGrades = (studentData.allGrades || []).filter(g => toMonthKey(g.controls_plan?.date) === currentMonth);

    // Fallback: si le format de date est hétérogène, ne pas perdre les métriques
    if (monthTracking.length === 0 && (studentData.allTracking || []).length > 0) {
      monthTracking = studentData.allTracking || [];
    }
    if (monthTracking.length === 0 && (studentData.tracking || []).length > 0) {
      monthTracking = studentData.tracking || [];
    }
    if (monthGrades.length === 0 && (studentData.allGrades || []).length > 0) {
      monthGrades = studentData.allGrades || [];
    }

    if (monthTracking.length === 0 && monthGrades.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد بيانات كافية لهذا الشهر حتى الآن.`
        : `ℹ️ Pas encore assez de données pour ce mois.`;
    } else {
      const totalSessions = monthTracking.length;
      const presentCount = monthTracking.filter(t => t.presence === 'present').length;
      const absentCount = monthTracking.filter(t => t.presence === 'absent').length;
      const lateCount = monthTracking.filter(t => t.presence === 'late').length;
      const homeworkReadyCount = monthTracking.filter(t => t.cahier_present === true).length;

      const incidents = [];
      monthTracking.forEach(t => {
        if (t.phone_use) incidents.push('téléphone');
        if (t.sleeping) incidents.push('somnolence');
      });
      const incidentCount = incidents.length;

      const avgNote = monthGrades.length > 0
        ? (monthGrades.reduce((sum, g) => sum + (g.note || 0), 0) / monthGrades.length).toFixed(2)
        : null;

      response = isArabic
        ? `📅 *ملخص الشهر الحالي (${currentMonth}):*\n\n`
        : `📅 *Bilan du mois (${currentMonth}):*\n\n`;

      if (totalSessions > 0) {
        response += isArabic
          ? `• الحضور: *${presentCount}/${totalSessions}*\n`
          : `• Présence: *${presentCount}/${totalSessions}*\n`;
        response += isArabic
          ? `• الغيابات: *${absentCount}*\n`
          : `• Absences: *${absentCount}*\n`;
        response += isArabic
          ? `• التأخر: *${lateCount}*\n`
          : `• Retards: *${lateCount}*\n`;
        response += isArabic
          ? `• حضور الدفتر: *${homeworkReadyCount}/${totalSessions}*\n`
          : `• Cahier présent: *${homeworkReadyCount}/${totalSessions}*\n`;
      }

      if (monthAbsences.length > 0) {
        response += isArabic
          ? `• عدد أيام الغياب المسجلة: *${monthAbsences.length}*\n`
          : `• Jours d'absence enregistrés: *${monthAbsences.length}*\n`;
      }

      if (avgNote !== null) {
        response += isArabic
          ? `• معدل النقط هذا الشهر: *${avgNote}/20*\n`
          : `• Moyenne des notes du mois: *${avgNote}/20*\n`;
      }

      // Courbe d'évolution (4 semaines) basée sur présence + participation
      const weekBuckets = {};
      monthTracking.forEach((t) => {
        const rawDate = t.sessions?.date;
        if (!rawDate) return;
        const d = new Date(rawDate);
        if (Number.isNaN(d.getTime())) return;
        const weekIndex = Math.floor((d.getUTCDate() - 1) / 7) + 1;
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-S${weekIndex}`;
        if (!weekBuckets[key]) {
          weekBuckets[key] = { total: 0, present: 0, partSum: 0, partCount: 0 };
        }
        weekBuckets[key].total += 1;
        if (t.presence === 'present') weekBuckets[key].present += 1;
        if (t.participation) {
          const map = { excellent: 5, good: 4, average: 3, poor: 2, weak: 2 };
          const score = map[String(t.participation).toLowerCase()] || 0;
          if (score > 0) {
            weekBuckets[key].partSum += score;
            weekBuckets[key].partCount += 1;
          }
        }
      });

      const sortedWeeks = Object.keys(weekBuckets).sort();
      if (sortedWeeks.length > 0) {
        const lastWeeks = sortedWeeks.slice(-4);
        const presenceSeries = lastWeeks.map((w) => Math.round((weekBuckets[w].present / Math.max(1, weekBuckets[w].total)) * 100));
        const participationSeries = lastWeeks.map((w) => {
          if (weekBuckets[w].partCount === 0) return 0;
          return Math.round((weekBuckets[w].partSum / weekBuckets[w].partCount / 5) * 100);
        });

        response += isArabic
          ? `\n📈 تطور الأسابيع (${lastWeeks.length}):\n`
          : `\n📈 Courbe d'évolution (${lastWeeks.length} semaines):\n`;
        response += isArabic
          ? `• الحضور: ${toSparkline(presenceSeries)} (${presenceSeries.join('% - ')}%)\n`
          : `• Présence: ${toSparkline(presenceSeries)} (${presenceSeries.join('% - ')}%)\n`;
        response += isArabic
          ? `• المشاركة: ${toSparkline(participationSeries)} (${participationSeries.join('% - ')}%)\n`
          : `• Participation: ${toSparkline(participationSeries)} (${participationSeries.join('% - ')}%)\n`;
      }

      response += isArabic
        ? `• الحوادث: *${incidentCount}*`
        : `• Incidents relevés: *${incidentCount}*`;
    }
  }
  
  // ABSENCES
  else if (lower.includes('absence') || lower.includes('غياب') || lower.includes('combien') && lower.includes('absent')) {
    const absenceCount = studentData.absences?.length || 0;
    response = isArabic
      ? `📊 *عدد الغيابات:*\n\n${studentInfo.first_name} لديه *${absenceCount} غياب* هذا الشهر.`
      : `📊 *Nombre d'absences:*\n\n${studentInfo.first_name} a *${absenceCount} absence(s)* ce mois.`;
    
    if (absenceCount > 0 && studentData.absences.length <= 3) {
      response += '\n\n' + (isArabic ? '📅 *التواريخ:*\n' : '📅 *Dates:*\n');
      studentData.absences.forEach(abs => {
        response += `• ${abs.sessions?.date} - ${abs.sessions?.subjects?.name || 'N/A'}\n`;
      });
    }
  }
  
  // PRÉSENCE AUJOURD'HUI
  else if (lower.includes('présent') || lower.includes('حاضر') || lower.includes('aujourd\'hui') || lower.includes('اليوم')) {
    const todayTracking = studentData.tracking.filter(t => t.sessions?.date === today);
    
    if (todayTracking.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد بيانات حضور لهذا اليوم بعد.`
        : `ℹ️ Pas encore de données de présence pour aujourd'hui.`;
    } else {
      const presentCount = todayTracking.filter(t => t.presence === 'present').length;
      const totalSessions = todayTracking.length;
      
      response = isArabic
        ? `✅ *الحضور اليوم:*\n\n${studentInfo.first_name} حاضر في *${presentCount}/${totalSessions}* حصص.`
        : `✅ *Présence aujourd'hui:*\n\n${studentInfo.first_name} est présent dans *${presentCount}/${totalSessions}* séances.`;
    }
  }
  
  // STATISTIQUES DE CLASSE (moyenne / meilleure note)
  else if (
    (lower.includes('classe') || lower.includes('القسم')) &&
    (
      lower.includes('moyenne') ||
      lower.includes('moyen') ||
      lower.includes('meilleure') ||
      lower.includes('meilleur') ||
      lower.includes('max') ||
      (lower.includes('note') && lower.includes('classe')) ||
      lower.includes('معدل') ||
      lower.includes('أفضل')
    )
  ) {
    const classGrades = studentData.classGrades || [];
    if (classGrades.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد نقاط كافية للقسم حالياً.`
        : `ℹ️ Pas encore assez de notes de classe disponibles.`;
    } else {
      const classAverage = (classGrades.reduce((sum, g) => sum + (Number(g.note) || 0), 0) / classGrades.length).toFixed(2);
      const bestGrade = classGrades.reduce((best, current) => {
        if (!best) return current;
        return (Number(current.note) || 0) > (Number(best.note) || 0) ? current : best;
      }, null);

      if (isArabic) {
        response = `🏫 *إحصائيات القسم:*

• معدل القسم: *${classAverage}/20*`;
        if (bestGrade) {
          response += `
• أفضل نقطة: *${bestGrade.note}/20* (${bestGrade.controls_plan?.name || 'اختبار'})`;
        }
      } else {
        response = `🏫 *Statistiques de la classe:*

• Note moyenne de la classe: *${classAverage}/20*`;
        if (bestGrade) {
          response += `
• Meilleure note de la classe: *${bestGrade.note}/20* (${bestGrade.controls_plan?.name || 'Contrôle'})`;
        }
      }
    }
  }

  // NOTES / MOYENNE
  else if (lower.includes('note') || lower.includes('نقطة') || lower.includes('moyenne') || lower.includes('معدل')) {
    if (!studentData.grades || studentData.grades.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد نقط حديثة متاحة.`
        : `ℹ️ Pas de notes récentes disponibles.`;
    } else {
      const recentGrades = studentData.grades.slice(0, 5);
      response = isArabic
        ? `📝 *آخر النقط:*\n\n`
        : `📝 *Dernières notes:*\n\n`;
      
      recentGrades.forEach(grade => {
        const inferredSubject = inferControlSubject(grade);
        const controlTitle = grade.controls_plan?.name || 'Contrôle';
        response += `• ${controlTitle}${inferredSubject ? ` (${inferredSubject})` : ''}: *${grade.note}/20*\n`;
      });
      
      // Calculer moyenne si possible
      if (studentData.allGrades && studentData.allGrades.length > 0) {
        const avg = (studentData.allGrades.reduce((sum, g) => sum + (g.note || 0), 0) / studentData.allGrades.length).toFixed(2);
        response += '\n' + (isArabic
          ? `📊 المعدل العام: *${avg}/20*`
          : `📊 Moyenne générale: *${avg}/20*`);
      }
    }
  }

  // MATIÈRE FAIBLE / DIFFICILE
  else if (
    lower.includes('ضعيف') ||
    lower.includes('faible') ||
    lower.includes('difficile') ||
    lower.includes('mauvais') ||
    lower.includes('مشكل') ||
    (lower.includes('matière') && (lower.includes('faible') || lower.includes('ضعيف') || lower.includes('difficile')))
  ) {
    const allGrades = studentData.allGrades || [];
    if (allGrades.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد نقط كافية لتحديد المادة الأضعف.`
        : `ℹ️ Pas assez de notes pour identifier la matière faible.`;
    } else {
      // Grouper les notes par matière inférée
      const subjectNotes = {};
      allGrades.forEach((grade) => {
        const subjectName = (() => {
          const allSessions = studentData.allSessions || [];
          const subjectPool = [...new Set(allSessions.map((s) => s?.subjects?.name).filter(Boolean))];
          const controlName = String(grade?.controls_plan?.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
          const matched = subjectPool.find((s) => {
            const ns = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
            return ns && (controlName.includes(ns) || ns.includes(controlName));
          });
          if (matched) return matched;
          const controlDate = grade?.controls_plan?.date;
          if (controlDate) {
            const sameDay = [...new Set(allSessions.filter((s) => s?.date === controlDate).map((s) => s?.subjects?.name).filter(Boolean))];
            if (sameDay.length === 1) return sameDay[0];
          }
          if (subjectPool.length === 1) return subjectPool[0];
          return null;
        })();
        if (!subjectName) return;
        if (!subjectNotes[subjectName]) subjectNotes[subjectName] = [];
        subjectNotes[subjectName].push(Number(grade.note) || 0);
      });

      const subjectAverages = Object.entries(subjectNotes).map(([subject, notes]) => ({
        subject,
        avg: notes.reduce((s, n) => s + n, 0) / notes.length,
        count: notes.length
      })).sort((a, b) => a.avg - b.avg);

      if (subjectAverages.length === 0) {
        response = isArabic
          ? `ℹ️ لا يمكن ربط النقط بالمواد حالياً.`
          : `ℹ️ Impossible de relier les notes aux matières actuellement.`;
      } else {
        const weakest = subjectAverages[0];
        response = isArabic
          ? `📉 *المادة الأضعف:*\n\n• *${weakest.subject}*: معدل ${weakest.avg.toFixed(2)}/20 (${weakest.count} اختبار)\n`
          : `📉 *Matière la plus faible:*\n\n• *${weakest.subject}*: moyenne ${weakest.avg.toFixed(2)}/20 (${weakest.count} contrôle(s))\n`;

        if (subjectAverages.length > 1) {
          response += isArabic ? `\n📊 *كل المواد:*\n` : `\n📊 *Toutes les matières:*\n`;
          subjectAverages.forEach(({ subject, avg }) => {
            response += `• ${subject}: ${avg.toFixed(2)}/20\n`;
          });
        }
      }
    }
  }

  // MATIÈRE DU CONTRÔLE
  else if (
    lower.includes('matière') ||
    lower.includes('matiere') ||
    lower.includes('مادة') ||
    lower.includes('شناهي المادة') ||
    (lower.includes('contrôle') && lower.includes('quel')) ||
    (lower.includes('controle') && lower.includes('quel'))
  ) {
    if (!studentData.grades || studentData.grades.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد نقط حديثة لربطها بالمادة.`
        : `ℹ️ Pas de notes récentes pour identifier la matière du contrôle.`;
    } else {
      const recentGrades = studentData.grades.slice(0, 5);
      response = isArabic
        ? `📚 *مواد الاختبارات الأخيرة:*\n\n`
        : `📚 *Matières des derniers contrôles:*\n\n`;

      recentGrades.forEach((grade) => {
        const subject = inferControlSubject(grade);
        const controlTitle = grade.controls_plan?.name || 'Contrôle';
        response += isArabic
          ? `• ${controlTitle}: ${subject || 'غير محددة'} (${grade.note}/20)\n`
          : `• ${controlTitle}: ${subject || 'Non précisée'} (${grade.note}/20)\n`;
      });
    }
  }
  
  // DEVOIRS
  else if (lower.includes('devoir') || lower.includes('واجب')) {
    if (!studentData.homework || studentData.homework.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد واجبات منزلية حالياً.`
        : `ℹ️ Pas de devoirs en cours actuellement.`;
    } else {
      const pendingHomework = studentData.homework.filter(hw => hw.status !== 'submitted');
      
      if (pendingHomework.length === 0) {
        response = isArabic
          ? `✅ جميع الواجبات مسلمة!`
          : `✅ Tous les devoirs sont rendus !`;
      } else {
        response = isArabic
          ? `📚 *الواجبات المنزلية:*\n\n`
          : `📚 *Devoirs à faire:*\n\n`;
        
        pendingHomework.slice(0, 3).forEach(hw => {
          response += `• ${hw.homework?.subjects?.name || 'N/A'}: ${hw.homework?.title}\n`;
          response += `  ${isArabic ? 'الموعد النهائي' : 'Échéance'}: ${hw.homework?.due_date}\n`;
        });
      }
    }
  }
  
  // LEÇONS (aujourd'hui ou hier)
  else if (
    lower.includes('leçon') || lower.includes('درس') || lower.includes('étudié') ||
    lower.includes('cours') || lower.includes('البارحة') || lower.includes('hier') ||
    lower.includes('أمس') || lower.includes('yesterday') || lower.includes('titres')
  ) {
    // Détecter si c'est pour hier ou aujourd'hui
    const isYesterday = lower.includes('hier') || lower.includes('البارحة') || lower.includes('أمس') || lower.includes('yesterday');
    const targetDate = isYesterday 
      ? new Date(new Date(today).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : today;
    
    const targetSessions = studentData.sessions.filter(s => s.date === targetDate);
    
    if (targetSessions.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد دروس مسجلة ${isYesterday ? 'للبارحة' : 'لهذا اليوم'}.`
        : `ℹ️ Pas de leçons enregistrées ${isYesterday ? 'pour hier' : 'pour aujourd\'hui'}.`;
    } else {
      const dateLabel = isYesterday 
        ? (isArabic ? 'البارحة' : 'hier')
        : (isArabic ? 'اليوم' : 'aujourd\'hui');
      
      response = isArabic
        ? `📖 *الدروس ${dateLabel}:*\n\n`
        : `📖 *Leçons ${dateLabel}:*\n\n`;
      
      targetSessions.forEach(session => {
        response += `📚 *${session.subjects?.name || 'N/A'}*\n`;
        if (session.topic) {
          response += `   📌 ${session.topic}\n`;
        }
        if (session.notes) {
          const content = session.notes.substring(0, 150);
          response += `   📝 ${content}${session.notes.length > 150 ? '...' : ''}\n`;
        }
        response += `\n`;
      });
    }
  }
  
  // COMPORTEMENT / DISCIPLINE / INCIDENTS
  else if (
    lower.includes('سلوك') || lower.includes('comportement') ||
    lower.includes('discipline') || lower.includes('انضباط') ||
    lower.includes('هاتف') || lower.includes('téléphone') ||
    lower.includes('نعاس') || lower.includes('somnol') ||
    lower.includes('incident') || lower.includes('حادث') || lower.includes('مشكل') ||
    lower.includes('retard') || lower.includes('تأخر')
  ) {
    const allTracking = studentData.allTracking || studentData.tracking || [];
    const phoneCount = allTracking.filter(t => t.phone_use).length;
    const sleepCount = allTracking.filter(t => t.sleeping).length;
    const lateCount = allTracking.filter(t => t.presence === 'late').length;
    const totalIncidents = phoneCount + sleepCount + lateCount;

    const participationMap = { excellent: 5, good: 4, average: 3, poor: 2, weak: 1 };
    const partScores = allTracking.filter(t => t.participation).map(t => participationMap[String(t.participation).toLowerCase()] || 3);
    const partAvg = partScores.length > 0 ? partScores.reduce((a, b) => a + b, 0) / partScores.length : 0;
    const partLabel = partAvg >= 4.5 ? (isArabic ? 'ممتاز' : 'Excellent') :
      partAvg >= 3.5 ? (isArabic ? 'جيد' : 'Bon') :
      partAvg >= 2.5 ? (isArabic ? 'متوسط' : 'Moyen') :
      (isArabic ? 'يحتاج تحسين' : 'À améliorer');

    const discScores = allTracking.filter(t => t.discipline).map(t => participationMap[String(t.discipline).toLowerCase()] || 3);
    const discAvg = discScores.length > 0 ? discScores.reduce((a, b) => a + b, 0) / discScores.length : 0;
    const discLabel = discAvg >= 4.5 ? (isArabic ? 'ممتاز' : 'Excellent') :
      discAvg >= 3.5 ? (isArabic ? 'جيد' : 'Bon') :
      discAvg >= 2.5 ? (isArabic ? 'متوسط' : 'Moyen') :
      (isArabic ? 'يحتاج تحسين' : 'À améliorer');

    if (isArabic) {
      response = `🎭 *سلوك ${studentInfo.first_name} في القسم:*\n\n`;
      response += `• المشاركة: *${partLabel}*\n`;
      response += `• الانضباط: *${discLabel}*\n`;
      if (totalIncidents > 0) {
        response += `\n⚠️ *الحوادث (${allTracking.length > 7 ? '3 أشهر' : '7 أيام'}):*\n`;
        if (phoneCount > 0) response += `• استخدام الهاتف: *${phoneCount} مرة*\n`;
        if (sleepCount > 0) response += `• النعاس في القسم: *${sleepCount} مرة*\n`;
        if (lateCount > 0) response += `• التأخر: *${lateCount} مرة*\n`;
      } else {
        response += `\n✅ لا توجد حوادث مسجلة.\n`;
      }
    } else {
      response = `🎭 *Comportement de ${studentInfo.first_name}:*\n\n`;
      response += `• Participation: *${partLabel}*\n`;
      response += `• Discipline: *${discLabel}*\n`;
      if (totalIncidents > 0) {
        response += `\n⚠️ *Incidents (${allTracking.length > 7 ? '3 mois' : '7 jours'}):*\n`;
        if (phoneCount > 0) response += `• Utilisation téléphone: *${phoneCount} fois*\n`;
        if (sleepCount > 0) response += `• Somnolence en classe: *${sleepCount} fois*\n`;
        if (lateCount > 0) response += `• Retards: *${lateCount} fois*\n`;
      } else {
        response += `\n✅ Aucun incident signalé.\n`;
      }
    }
  }

  // PLANNING / PROGRAMME DE LA SEMAINE
  else if (
    lower.includes('semaine') || lower.includes('أسبوع') ||
    lower.includes('planning') || lower.includes('برنامج') ||
    lower.includes('bilan') && lower.includes('semaine') ||
    lower.includes('ملخص') && lower.includes('أسبوع')
  ) {
    const weekSessions = studentData.sessions || [];
    if (weekSessions.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد حصص مسجلة هذا الأسبوع.`
        : `ℹ️ Pas de séances enregistrées cette semaine.`;
    } else {
      response = isArabic
        ? `📅 *برنامج الأسبوع (7 أيام):*\n\n`
        : `📅 *Programme de la semaine (7 jours):*\n\n`;
      const byDate = {};
      weekSessions.forEach(s => {
        const d = s.date || 'N/A';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(s);
      });
      Object.keys(byDate).sort().slice(-5).forEach(date => {
        const dayName = new Date(date).toLocaleDateString(isArabic ? 'ar-MA' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
        response += `📆 *${dayName}*\n`;
        byDate[date].forEach(s => {
          response += `  • ${s.subjects?.name || 'N/A'}${s.topic ? `: ${s.topic}` : ''}\n`;
        });
      });
    }
  }

  // DEVOIRS RENDUS / SOUMISSIONS
  else if (
    lower.includes('واجب') || lower.includes('devoir') ||
    lower.includes('فرض') || lower.includes('سلم') || lower.includes('rendu') ||
    lower.includes('soumis') || lower.includes('travail')
  ) {
    const hw = studentData.homework || [];
    if (hw.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد واجبات مسجلة حالياً.`
        : `ℹ️ Aucun devoir enregistré actuellement.`;
    } else {
      const submitted = hw.filter(h => h.status === 'submitted');
      const pending = hw.filter(h => h.status !== 'submitted');
      if (isArabic) {
        response = `📋 *الواجبات المنزلية:*\n\n`;
        response += `✅ مسلمة: *${submitted.length}/${hw.length}*\n`;
        if (pending.length > 0) {
          response += `\n⏳ *غير مسلمة:*\n`;
          pending.slice(0, 4).forEach(h => {
            response += `• ${h.homework?.subjects?.name || 'N/A'}: ${h.homework?.title || 'N/A'}\n`;
            if (h.homework?.due_date) response += `  الموعد: ${h.homework.due_date}\n`;
          });
        }
      } else {
        response = `📋 *Devoirs:*\n\n`;
        response += `✅ Rendus: *${submitted.length}/${hw.length}*\n`;
        if (pending.length > 0) {
          response += `\n⏳ *Non rendus:*\n`;
          pending.slice(0, 4).forEach(h => {
            response += `• ${h.homework?.subjects?.name || 'N/A'}: ${h.homework?.title || 'N/A'}\n`;
            if (h.homework?.due_date) response += `  Échéance: ${h.homework.due_date}\n`;
          });
        }
      }
    }
  }

  // CONTACT PROFESSEUR
  else if (
    lower.includes('أستاذ') || lower.includes('professeur') ||
    lower.includes('enseignant') || lower.includes('contact') ||
    lower.includes('اتصل') || lower.includes('تواصل') || lower.includes('joindre')
  ) {
    const className = studentData.profile?.classes?.name || 'N/A';
    response = isArabic
      ? `📞 *التواصل مع الفريق التربوي:*\n\n${studentInfo.first_name} في القسم *${className}*.\n\nللتواصل مع الأساتذة أو الإدارة، يرجى:\n• التوجه إلى ${parentInfo.school_name} مباشرة\n• طلب موعد عبر الإدارة\n• انتظار التقارير الدورية عبر هذا التطبيق`
      : `📞 *Contacter l'équipe pédagogique:*\n\n${studentInfo.first_name} est en classe *${className}*.\n\nPour contacter les enseignants ou l'administration:\n• Rendez-vous directement à ${parentInfo.school_name}\n• Demandez un rendez-vous via l'administration\n• Consultez les rapports périodiques via cette application`;
  }

  // RÉSUMÉ GLOBAL (demande générale sur l'élève)
  else if (
    lower.includes('كيفاش') || lower.includes('كيف داير') || lower.includes('كيف حال') ||
    lower.includes('comment va') || lower.includes('comment il va') ||
    lower.includes('résumé') || lower.includes('ملخص') || lower.includes('بيلان')
  ) {
    return null; // → Toujours IA pour le résumé global
  }

  // Si aucune correspondance → fallback IA
  else {
    return null;
  }
  
  // Ajouter signature
  response += `\n\n━━━━━━━━━━━━━━━\n👥 *L'équipe pédagogique*\n🏫 *${parentInfo.school_name}*`;
  
  return response;
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

// Collecter les données complètes de l'élève (TOUTES LES PÉRIODES)
async function collectStudentData(studentId, schoolId) {
  const today = new Date().toISOString().split('T')[0];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  console.log('[collectStudentData] Début collecte pour student_id:', studentId);
  
  // 1. D'abord récupérer le profil pour avoir class_id
  const { data: studentProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('*, classes!fk_profiles_class(name, level, school_type)')
    .eq('id', studentId)
    .single();
  
  if (profileError) {
    console.error('[collectStudentData] Erreur profil:', profileError);
  }
  
  const classId = studentProfile?.class_id;
  console.log('[collectStudentData] class_id:', classId);
  
  if (!classId) {
    console.warn('[collectStudentData] Pas de class_id trouvé pour l\'élève');
    return {
      profile: studentProfile,
      sessions: [],
      allSessions: [],
      tracking: [],
      allTracking: [],
      grades: [],
      homework: [],
      allGrades: [],
      classGrades: [],
      absences: []
    };
  }
  
  // 2. Récupérer toutes les autres données en parallèle (TOUTES LES PÉRIODES)
  const [recentSessions, allTracking, recentTracking, recentGrades, recentHomework, allGrades, absences, allSessions, classGrades] = await Promise.all([
    // Sessions récentes de sa classe
    supabaseAdmin
      .from('sessions')
      .select('id, date, topic, notes, type, subjects(name)')
      .eq('class_id', classId)
      .gte('date', oneWeekAgo)
      .lte('date', today)
      .order('date', { ascending: false }),
    
    // Tout le tracking (3 derniers mois) avec incidents
    supabaseAdmin
      .from('session_tracking')
      .select('presence, participation, discipline, cahier_present, sleeping, phone_use, notes, sessions!inner(date, topic, subjects(name))')
      .eq('student_id', studentId)
      .gte('sessions.date', threeMonthsAgo),
    
    // Tracking récent (7 jours) avec incidents
    supabaseAdmin
      .from('session_tracking')
      .select('presence, participation, discipline, cahier_present, sleeping, phone_use, notes, sessions!inner(date, topic, subjects(name))')
      .eq('student_id', studentId)
      .gte('sessions.date', oneWeekAgo)
      .lte('sessions.date', today),
    
    // Notes récentes
    supabaseAdmin
      .from('control_notes')
      .select('note, control_id, controls_plan!inner(name, date)')
      .eq('student_id', studentId)
      .gte('controls_plan.date', oneWeekAgo)
      .limit(10),
    
    // Devoirs récents
    supabaseAdmin
      .from('homework_submissions')
      .select('*, homework!inner(title, due_date, subjects(name))')
      .eq('student_id', studentId)
      .gte('homework.due_date', oneWeekAgo)
      .limit(10),
    
    // Toutes les notes (pour calculer les moyennes)
    supabaseAdmin
      .from('control_notes')
      .select('note, control_id, controls_plan!inner(name, date)')
      .eq('student_id', studentId)
      .gte('controls_plan.date', threeMonthsAgo),
    
    // Absences (3 derniers mois)
    supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(date, subjects(name))')
      .eq('student_id', studentId)
      .eq('presence', 'absent')
      .gte('sessions.date', threeMonthsAgo),
    
    // Toutes les sessions (3 derniers mois)
    supabaseAdmin
      .from('sessions')
      .select('id, date, topic, notes, type, subjects(name)')
      .eq('class_id', classId)
      .gte('date', threeMonthsAgo)
      .lte('date', today)
      .order('date', { ascending: false })
    ,

    // Notes de la classe (3 derniers mois) pour stats comparatives
    supabaseAdmin
      .from('control_notes')
      .select('note, student_id, controls_plan!inner(class_id, name, date)')
      .eq('controls_plan.class_id', classId)
      .gte('controls_plan.date', threeMonthsAgo)
  ]);
  
  console.log('[collectStudentData] Résultats:', {
    profile: !!studentProfile,
    sessions: recentSessions.data?.length || 0,
    tracking: recentTracking.data?.length || 0,
    allTracking: allTracking.data?.length || 0,
    grades: recentGrades.data?.length || 0,
    homework: recentHomework.data?.length || 0,
    allGrades: allGrades.data?.length || 0,
    absences: absences.data?.length || 0
  });
  
  if (recentSessions.error) console.error('[collectStudentData] Erreur sessions:', recentSessions.error);
  if (allTracking.error) console.error('[collectStudentData] Erreur allTracking:', allTracking.error);
  if (recentTracking.error) console.error('[collectStudentData] Erreur tracking:', recentTracking.error);
  if (recentGrades.error) console.error('[collectStudentData] Erreur grades:', recentGrades.error);
  if (allGrades.error) console.error('[collectStudentData] Erreur allGrades:', allGrades.error);
  if (classGrades.error) console.error('[collectStudentData] Erreur classGrades:', classGrades.error);
  if (recentHomework.error) console.error('[collectStudentData] Erreur homework:', recentHomework.error);
  
  return {
    profile: studentProfile,
    sessions: recentSessions.data || [],
    allSessions: allSessions.data || [],
    tracking: recentTracking.data || [],
    allTracking: allTracking.data || [],
    grades: recentGrades.data || [],
    homework: recentHomework.data || [],
    allGrades: allGrades.data || [],
    classGrades: classGrades.data || [],
    absences: absences.data || []
  };
}

// Générer la réponse IA personnalisée// Générer une réponse IA
async function generateAIResponse(question, studentInfo, studentData, parentInfo, conversationHistory) {
  try {
    // Préparer le contexte pour l'IA
    const context = buildContextForAI(studentInfo, studentData);
    console.log('[Chatbot] Contexte IA généré, longueur:', context.length, 'caractères');
    
    // Détecter le mode conversationnel
    const convMode = detectConversationMode(question, conversationHistory);
    console.log('[Chatbot] Mode conversationnel:', convMode);

    // Détecter la langue du message
    const isArabic = /[\u0600-\u06FF]/.test(question);
    const language = isArabic ? 'arabe (dialecte marocain darija ou arabe standard)' : 'français';

    // Construire l'historique pour les messages OpenAI (multi-turn)
    const messages = [];

    // Instructions selon le mode
    let modeInstructions = '';
    if (convMode === 'DATA') {
      modeInstructions = `MODE: EXTRACTION DE DONNÉES
- Réponds UNIQUEMENT avec les données du contexte ci-dessous
- Cite les chiffres exacts (notes, taux de présence, dates)
- Si la donnée n'existe pas, dis-le clairement
- INTERDICTION d'inventer ou d'extrapoler`;
    } else if (convMode === 'ADVICE') {
      modeInstructions = `MODE: CONSEIL PÉDAGOGIQUE
- Utilise les données du contexte pour APPUYER tes conseils
- Donne des conseils CONCRETS, PRATIQUES et APPLICABLES
- Adapte les conseils aux incidents et comportements observés
- Reste bienveillant et positif, encourage le parent
- Tu PEUX enrichir avec des conseils pédagogiques généraux basés sur les problèmes détectés`;
    } else {
      modeInstructions = `MODE: SUIVI CONVERSATIONNEL
- C'est une question de suivi de la conversation précédente
- Tiens compte du contexte de la discussion
- Donne des conseils pratiques et personnalisés
- Reste dans le fil de la conversation`;
    }

    const systemPrompt = `Tu es Nour, conseiller pédagogique expert de ${parentInfo.school_name}.
Ton rôle: accompagner les parents avec bienveillance, expertise et précision pour le suivi scolaire.

${modeInstructions}

📋 RÈGLES ABSOLUES:
1. Réponds OBLIGATOIREMENT en ${language}. Si le parent écrit en darija marocaine, réponds en darija ou arabe standard fluide.
2. Maximum 12 lignes. Sois direct, humain et chaleureux - comme un vrai conseiller.
3. 2-3 emojis contextuels maximum - pas de surcharge.
4. Ne commence JAMAIS par "Bien sûr", "D'accord", "Voici", "بالطبع" ou toute formule vide.
5. Tu parles TOUJOURS des données réelles de l'élève. Jamais de généralités sans lien avec les données.
6. Si tu donnes des conseils, ils doivent être ADAPTÉS aux problèmes spécifiques détectés dans les données.
7. N'invente JAMAIS de données. Si une info manque, dis-le clairement et propose une alternative.
8. Ton ton: professionnel mais proche, encourage le parent, ne le culpabilise pas.

💡 LOGIQUE DE RÉPONSE SELON LE MODE:
- DATA: Chiffres exacts + interprétation courte ("12/15 présences = bien, mais 3 absences méritent attention")
- ADVICE: Observe les INCIDENTS et COMPORTEMENT dans les données, puis donne 2-3 conseils CONCRETS et PERSONNALISÉS
- FOLLOWUP: Continue la conversation naturellement, enrichis avec de nouvelles informations si pertinent

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOSSIER DE L'ÉLÈVE ${studentInfo.first_name.toUpperCase()} ${studentInfo.last_name?.toUpperCase() || ''}:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${context}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    messages.push({ role: 'system', content: systemPrompt });

    // Injecter l'historique dans les messages (multi-turn réel)
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-5); // 5 derniers échanges
      recentHistory.forEach((conv) => {
        messages.push({ role: 'user', content: conv.parent_message });
        messages.push({ role: 'assistant', content: conv.ai_response.replace(/\n\n━━━.*$/s, '').trim() });
      });
    }

    // Question actuelle
    messages.push({ role: 'user', content: question });
    
    console.log('[Chatbot] Envoi requête à DeepSeek (mode:', convMode, ', messages:', messages.length, ')...');
    const response = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      temperature: convMode === 'DATA' ? 0.15 : 0.75,
      max_tokens: 700
    });
    console.log('[Chatbot] Réponse DeepSeek reçue');
    
    let aiResponse = response.choices[0]?.message?.content || 'Désolé, je n\'ai pas pu générer une réponse.';
    
    // Ajouter signature
    aiResponse += `\n\n━━━━━━━━━━━━━━━\n👥 *L'équipe pédagogique*\n🏫 *${parentInfo.school_name}*`;
    
    return aiResponse;
    
  } catch (error) {
    console.error('[Chatbot] Erreur génération IA:', error);
    return `Bonjour,\n\nNous avons bien reçu votre message concernant ${studentInfo.first_name}. Notre équipe pédagogique reviendra vers vous dans les plus brefs délais.\n\nCordialement,\n👥 L'équipe pédagogique\n🏫 ${parentInfo.school_name}`;
  }
}

// Construire le contexte pour l'IA avec rapport détaillé
function buildContextForAI(studentInfo, studentData) {
  const today = new Date().toISOString().split('T')[0];
  
  console.log('[buildContextForAI] Construction du contexte pour:', studentInfo.first_name);
  console.log('[buildContextForAI] Données disponibles:', {
    profile: !!studentData.profile,
    sessions: studentData.sessions?.length || 0,
    tracking: studentData.tracking?.length || 0,
    grades: studentData.grades?.length || 0,
    homework: studentData.homework?.length || 0
  });
  
  let context = `📋 RAPPORT JOURNALIER\n\n`;
  context += `👤 Élève: ${studentInfo.first_name} ${studentInfo.last_name}\n`;
  context += `🎓 Classe: ${studentData.profile?.classes?.name || 'N/A'}\n`;
  context += `📚 Niveau: ${studentData.profile?.classes?.level || 'N/A'}\n\n`;
  
  // Données d'aujourd'hui avec statistiques visuelles
  const todayTracking = studentData.tracking.filter(t => t.sessions?.date === today);
  
  if (todayTracking.length > 0) {
    // Calculer les statistiques
    const totalSessions = todayTracking.length;
    const presentCount = todayTracking.filter(t => t.presence === 'present').length;
    const presencePercent = Math.round((presentCount / totalSessions) * 100);
    
    // Calculer moyennes participation, discipline et cahier
    const participationScores = todayTracking.filter(t => t.participation).map(t => {
      if (t.participation === 'excellent') return 5;
      if (t.participation === 'good') return 4;
      if (t.participation === 'average') return 3;
      if (t.participation === 'weak') return 2;
      return 1;
    });
    const participationAvg = participationScores.length > 0 
      ? Math.round((participationScores.reduce((a, b) => a + b, 0) / participationScores.length / 5) * 100)
      : 0;
    
    const disciplineScores = todayTracking.filter(t => t.discipline).map(t => {
      if (t.discipline === 'excellent') return 5;
      if (t.discipline === 'good') return 4;
      if (t.discipline === 'average') return 3;
      if (t.discipline === 'poor' || t.discipline === 'weak') return 2;
      return 1;
    });
    const vigilanceAvg = disciplineScores.length > 0
      ? Math.round((disciplineScores.reduce((a, b) => a + b, 0) / disciplineScores.length / 5) * 100)
      : 0;
    
    const cahierPresentCount = todayTracking.filter(t => t.cahier_present === true).length;
    const cahierAvg = Math.round((cahierPresentCount / totalSessions) * 100);
    
    context += `📊 STATISTIQUES D'AUJOURD'HUI (${today}):\n\n`;
    context += `📊 Présence: ${generateProgressBar(presencePercent)} ${presencePercent}%\n`;
    if (participationAvg > 0) context += `🙋 Participation: ${generateProgressBar(participationAvg)} ${participationAvg}%\n`;
    if (vigilanceAvg > 0) context += `👁️ Vigilance: ${generateProgressBar(vigilanceAvg)} ${vigilanceAvg}%\n`;
    context += `📓 Cahier: ${generateProgressBar(cahierAvg)} ${cahierAvg}%\n`;
    context += `\n`;
    
    // Matières d'aujourd'hui
    const subjects = [...new Set(todayTracking.map(t => t.sessions?.subjects?.name).filter(Boolean))];
    if (subjects.length > 0) {
      context += `📚 Matières d'aujourd'hui:\n`;
      subjects.forEach(subject => {
        context += `✅ ${subject}\n`;
      });
      context += `\n`;
    }
    
    // Résumé de la journée avec titres des leçons
    context += `📝 Résumé de la journée:\n`;
    todayTracking.forEach(t => {
      const subjectName = t.sessions?.subjects?.name || 'N/A';
      const lessonTopic = t.sessions?.topic;
      
      context += `- ${subjectName}${lessonTopic ? `: ${lessonTopic}` : ''}\n`;
      context += `  Présence: ${t.presence === 'present' ? '✅' : t.presence === 'absent' ? '❌' : '⚠️'}\n`;
      if (t.participation) context += `  Participation: ${t.participation}\n`;
      if (t.discipline) context += `  Discipline: ${t.discipline}\n`;
      if (t.cahier_present !== undefined) context += `  Cahier: ${t.cahier_present ? '✅ Présent' : '❌ Non présent'}\n`;
      
      // Afficher les incidents dérivés s'il y en a
      const incidents = [];
      if (t.phone_use) incidents.push('utilisation téléphone');
      if (t.sleeping) incidents.push('somnolence');
      if (t.presence === 'late') incidents.push('retard');
      if (incidents.length > 0) {
        context += `  ⚠️ Incidents: ${incidents.join(', ')}\n`;
      }
    });
    context += `\n`;
    
    // Points positifs
    const positivePoints = [];
    if (presencePercent === 100) positivePoints.push('✅ Excellente présence tout au long de la journée');
    if (participationAvg >= 80) positivePoints.push('✅ Bonne participation active en cours');
    if (vigilanceAvg >= 80) positivePoints.push('✅ Excellente vigilance et attention');
    if (cahierAvg >= 80) positivePoints.push('✅ Cahier toujours présent et bien tenu');
    
    if (positivePoints.length > 0) {
      context += `⭐ Points positifs:\n`;
      positivePoints.forEach(point => context += `${point}\n`);
      context += `\n`;
    }
    
    // Incidents
    const allIncidents = todayTracking.flatMap(t => {
      const incidents = [];
      if (t.phone_use) incidents.push('utilisation téléphone');
      if (t.sleeping) incidents.push('somnolence');
      if (t.presence === 'late') incidents.push('retard');
      return incidents;
    });
    if (allIncidents.length > 0) {
      context += `⚠️ INCIDENTS:\n`;
      const incidentCounts = {};
      allIncidents.forEach(inc => {
        incidentCounts[inc] = (incidentCounts[inc] || 0) + 1;
      });
      Object.entries(incidentCounts).forEach(([inc, count]) => {
        context += `- ${inc}: ${count} fois\n`;
      });
      context += `\n`;
    }
  } else {
    context += `ℹ️ Pas de données de suivi pour aujourd'hui.\n\n`;
  }
  
  // Statistiques de présence (7 derniers jours)
  const totalSessions = studentData.tracking.length;
  const presentCount = studentData.tracking.filter(t => t.presence === 'present').length;
  const absentCount = studentData.tracking.filter(t => t.presence === 'absent').length;
  const lateCount7 = studentData.tracking.filter(t => t.presence === 'late').length;

  if (totalSessions > 0) {
    const pct = Math.round(presentCount / totalSessions * 100);
    const icon = pct >= 90 ? '✅' : pct >= 75 ? '🔶' : '❌';
    context += `📊 PRÉSENCE (7 derniers jours):\n`;
    context += `${icon} Présent: ${presentCount}/${totalSessions} (${pct}%)\n`;
    if (absentCount > 0) context += `❌ Absent: ${absentCount} séance(s)\n`;
    if (lateCount7 > 0) context += `⏰ Retard: ${lateCount7} fois\n`;
    context += `\n`;
  }

  // Statistiques du mois avec analyse
  const monthTracking = studentData.allTracking || [];
  const monthTotal = monthTracking.length;
  const monthPresent = monthTracking.filter(t => t.presence === 'present').length;
  const monthAbsent = monthTracking.filter(t => t.presence === 'absent').length;
  const monthLate = monthTracking.filter(t => t.presence === 'late').length;
  const monthPhoneUse = monthTracking.filter(t => t.phone_use).length;
  const monthSleeping = monthTracking.filter(t => t.sleeping).length;
  const totalMonthIncidents = monthPhoneUse + monthSleeping;

  if (monthTotal > 0) {
    const monthPct = Math.round(monthPresent / monthTotal * 100);
    const presenceStatus = monthPct >= 90 ? 'Excellent' : monthPct >= 75 ? 'Correct' : 'Préoccupant';
    context += `📊 STATISTIQUES DU MOIS (${monthTotal} séances):\n`;
    context += `- Présences: ${monthPresent} (${monthPct}%) - ${presenceStatus}\n`;
    context += `- Absences: ${monthAbsent}\n`;
    if (monthLate > 0) context += `- Retards: ${monthLate}\n`;
    if (totalMonthIncidents > 0) {
      context += `- INCIDENTS CE MOIS:\n`;
      if (monthPhoneUse > 0) context += `  ⚠️ Téléphone en classe: ${monthPhoneUse} fois\n`;
      if (monthSleeping > 0) context += `  ⚠️ Somnolence: ${monthSleeping} fois\n`;
    } else {
      context += `- Incidents: Aucun \u2705\n`;
    }
    context += `\n`;
  }

  // Comportement détaillé
  const allBehaviorData = studentData.allTracking || studentData.tracking || [];
  const avgParticipation = calculateAverage(allBehaviorData, 'participation');
  const avgDiscipline = calculateAverage(allBehaviorData, 'discipline');
  const cahierCount = allBehaviorData.filter(t => t.cahier_present === true).length;
  const cahierPct = allBehaviorData.length > 0 ? Math.round(cahierCount / allBehaviorData.length * 100) : 0;

  context += `👤 COMPORTEMENT ET ATTITUDE:\n`;
  if (avgParticipation) context += `- Participation: ${avgParticipation}\n`;
  if (avgDiscipline) context += `- Discipline: ${avgDiscipline}\n`;
  context += `- Cahier présent: ${cahierPct}% des séances\n`;
  const totalIncidentsAll = allBehaviorData.filter(t => t.phone_use || t.sleeping).length;
  if (totalIncidentsAll > 0) {
    context += `- ⚠️ ALERTE: ${totalIncidentsAll} séance(s) avec incidents (téléphone/somnolence)\n`;
  }
  context += `\n`;

  // Devoirs avec détails
  const homeworkDone = studentData.homework.filter(h => h.status === 'submitted').length;
  const homeworkTotal = studentData.homework.length;
  const homeworkPending = studentData.homework.filter(h => h.status !== 'submitted');

  if (homeworkTotal > 0) {
    const hwPct = Math.round(homeworkDone / homeworkTotal * 100);
    const hwStatus = hwPct >= 80 ? 'Bon' : hwPct >= 50 ? 'Moyen' : 'Insuffisant';
    context += `📝 DEVOIRS (7 derniers jours):\n`;
    context += `- Rendus: ${homeworkDone}/${homeworkTotal} (${hwPct}%) - ${hwStatus}\n`;
    if (homeworkPending.length > 0) {
      context += `- Non rendus:\n`;
      homeworkPending.slice(0, 3).forEach(h => {
        context += `  • ${h.homework?.subjects?.name || 'N/A'}: ${h.homework?.title || 'N/A'} (${h.homework?.due_date || 'N/A'})\n`;
      });
    }
    context += `\n`;
  }
  
  // Notes récentes avec matière inférée
  if (studentData.grades.length > 0 || (studentData.allGrades && studentData.allGrades.length > 0)) {
    const gradesToShow = (studentData.allGrades && studentData.allGrades.length > 0 ? studentData.allGrades : studentData.grades).slice(0, 8);
    const allSessions = studentData.allSessions || [];
    const subjectPool = [...new Set(allSessions.map((s) => s?.subjects?.name).filter(Boolean))];

    // Calculer moyennes par matière
    const subjectMap = {};
    gradesToShow.forEach(grade => {
      const controlName = String(grade?.controls_plan?.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      let subjectName = subjectPool.find((s) => {
        const ns = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return ns && (controlName.includes(ns) || ns.includes(controlName));
      });
      if (!subjectName) {
        const controlDate = grade?.controls_plan?.date;
        if (controlDate) {
          const sameDay = [...new Set(allSessions.filter((s) => s?.date === controlDate).map((s) => s?.subjects?.name).filter(Boolean))];
          if (sameDay.length === 1) subjectName = sameDay[0];
        }
      }
      if (!subjectName && subjectPool.length === 1) subjectName = subjectPool[0];
      const key = subjectName || grade.controls_plan?.name || 'Contrôle';
      if (!subjectMap[key]) subjectMap[key] = [];
      subjectMap[key].push(Number(grade.note) || 0);
    });

    context += `📈 NOTES PAR MATIÈRE:\n`;
    Object.entries(subjectMap).sort((a, b) => {
      const avgA = a[1].reduce((s, n) => s + n, 0) / a[1].length;
      const avgB = b[1].reduce((s, n) => s + n, 0) / b[1].length;
      return avgA - avgB; // Plus faible en premier
    }).forEach(([subject, notes]) => {
      const avg = (notes.reduce((s, n) => s + n, 0) / notes.length).toFixed(2);
      const icon = Number(avg) >= 14 ? '✅' : Number(avg) >= 10 ? '🔶' : '❌';
      context += `- ${icon} ${subject}: ${avg}/20 (${notes.length} contrôle${notes.length > 1 ? 's' : ''})\n`;
    });
    context += `\n`;
  }
  
  return context;
}

// Générer une barre de progression visuelle
function generateProgressBar(percent) {
  const filled = Math.round(percent / 20); // 5 blocs max
  const empty = 5 - filled;
  return '🟩'.repeat(filled) + '⬜'.repeat(empty);
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
