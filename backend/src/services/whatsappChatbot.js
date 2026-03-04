import { supabaseAdmin } from '../config/supabase.js';
import OpenAI from 'openai';
import { extractDateFromMessage, extractMonthFromMessage } from './dateExtractor.js';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || ''
});

const WASENDER_BASE = 'https://www.wasenderapi.com';

// ═══════════════════════════════════════════════════════════
// 🎨 FONCTIONS DE FORMATAGE VISUEL
// ═══════════════════════════════════════════════════════════

/**
 * Génère une barre de progression visuelle
 * @param {number} percentage - Pourcentage (0-100)
 * @param {number} length - Longueur de la barre (défaut: 10)
 * @returns {string} Barre de progression
 */
function createProgressBar(percentage, length = 10) {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Formate un score avec emoji et couleur visuelle
 * @param {number} score - Note sur 20
 * @returns {object} {emoji, bar, color}
 */
function formatScore(score) {
  const percentage = (score / 20) * 100;
  let emoji = '🔴';
  let color = 'rouge';
  
  if (percentage >= 90) { emoji = '🟢'; color = 'excellent'; }
  else if (percentage >= 75) { emoji = '🟡'; color = 'bien'; }
  else if (percentage >= 60) { emoji = '🟠'; color = 'moyen'; }
  
  return {
    emoji,
    bar: createProgressBar(percentage, 8),
    percentage: percentage.toFixed(0),
    color
  };
}

/**
 * Crée un en-tête visuel pour une section
 * @param {string} title - Titre de la section
 * @param {string} emoji - Emoji principal
 * @returns {string} En-tête formaté
 */
function createSectionHeader(title, emoji = '📊') {
  return `\n╔═══════════════════════╗\n${emoji} *${title}*\n╚═══════════════════════╝\n`;
}

/**
 * Crée une ligne de statistique avec icône
 * @param {string} label - Label
 * @param {string} value - Valeur
 * @param {string} icon - Icône
 * @returns {string} Ligne formatée
 */
function createStatLine(label, value, icon = '▸') {
  return `${icon} *${label}:* ${value}`;
}

/**
 * Formate une liste de notes avec barres de progression
 * @param {Array} grades - Tableau de notes
 * @param {boolean} isArabic - Langue arabe
 * @returns {string} Liste formatée
 */
function formatGradesList(grades, isArabic = false) {
  if (!grades || grades.length === 0) {
    return isArabic ? '📭 لا توجد نقاط متاحة' : '📭 Aucune note disponible';
  }
  
  let result = '';
  grades.forEach((grade, index) => {
    const score = formatScore(Number(grade.note) || 0);
    const subjectName = grade.controls_plan?.subjects?.name || (isArabic ? 'مادة' : 'Matière');
    const controlName = grade.controls_plan?.name || '';
    
    result += `\n┌─────────────────────\n`;
    result += `│ ${score.emoji} *${subjectName}*\n`;
    if (controlName) result += `│ 📝 ${controlName}\n`;
    result += `│ ${score.bar} ${grade.note}/20 (${score.percentage}%)\n`;
    result += `└─────────────────────\n`;
  });
  
  return result;
}

/**
 * Crée un résumé de présence avec graphique
 * @param {number} present - Nombre de présences
 * @param {number} total - Total de séances
 * @param {boolean} isArabic - Langue arabe
 * @returns {string} Résumé formaté
 */
function formatPresenceSummary(present, total, isArabic = false) {
  const percentage = total > 0 ? ((present / total) * 100).toFixed(0) : 0;
  const bar = createProgressBar(percentage, 12);
  
  let emoji = '✅';
  if (percentage < 70) emoji = '⚠️';
  if (percentage < 50) emoji = '❌';
  
  return isArabic
    ? `${emoji} *الحضور:* ${present}/${total} حصص\n${bar} ${percentage}%`
    : `${emoji} *Présence:* ${present}/${total} séances\n${bar} ${percentage}%`;
}

// Fonction principale appelée par le webhook
export async function handleIncomingWhatsAppMessage(messageInfo) {
  const { from: phoneNumber, text: messageText, id: messageId, sessionId } = messageInfo;
  
  console.log(`[Chatbot] Traitement message de ${phoneNumber}: ${messageText}`);
  
  try {
    // 0. Déduplication - ignorer les messages déjà traités
    const { data: existingMsg } = await supabaseAdmin
      .from('whatsapp_incoming_messages')
      .select('id, processed')
      .eq('wasender_message_id', messageId)
      .single();
    if (existingMsg?.processed) {
      console.log('[Chatbot] Message déjà traité, ignoré:', messageId);
      return;
    }

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
      const isArabicMsg = /[\u0600-\u06FF]/.test(messageText);
      let simpleResponse = '';
      
      if (needsAIResponse.reason === 'greeting') {
        const menuMessage = await buildWelcomeMenu(parentInfo, normalizedPhone);
        await sendWhatsAppResponse(normalizedPhone, menuMessage, parentInfo.school_id);
      } else if (needsAIResponse.reason === 'thanks') {
        simpleResponse = isArabicMsg
          ? `العفو 🙏 نحن هنا لمساعدتك دائماً`
          : `De rien 🙏 Nous sommes toujours là pour vous aider`;
        await sendWhatsAppResponse(normalizedPhone, simpleResponse, parentInfo.school_id);
      } else if (needsAIResponse.reason === 'simple_response') {
        simpleResponse = isArabicMsg
          ? `✅ تم. أرسل سؤالك الدراسي مباشرة (نقط، حضور، واجبات، سلوك).`
          : `✅ D'accord. Envoyez directement votre question scolaire (notes, présence, devoirs, comportement).`;
        await sendWhatsAppResponse(normalizedPhone, simpleResponse, parentInfo.school_id);
      } else if (needsAIResponse.reason === 'off_topic') {
        await sendWhatsAppResponse(
          normalizedPhone,
          buildEducationalRedirectMessage(parentInfo, isArabicMsg, 'off_topic'),
          parentInfo.school_id
        );
      } else if (needsAIResponse.reason === 'sensitive_offdomain') {
        await sendWhatsAppResponse(
          normalizedPhone,
          buildEducationalRedirectMessage(parentInfo, isArabicMsg, 'sensitive'),
          parentInfo.school_id
        );
      } else if (needsAIResponse.reason === 'short_accidental') {
        // Message trop court/accidentel - ignorer silencieusement
        console.log('[Chatbot] Message accidentel ignoré:', messageText);
      }
      
      await supabaseAdmin
        .from('whatsapp_incoming_messages')
        .update({ processed: true, ai_response_sent: false })
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
    
    // 8. AGENT 1: MÉMOIRE - Construire l'état de la conversation
    const conversationHistory = await getConversationHistory(normalizedPhone, parentInfo.parent_id, studentInfo.id);
    const conversationState = buildConversationState(conversationHistory);
    console.log('[Chatbot] État conversation:', JSON.stringify({ lang: conversationState.preferredLanguage, topic: conversationState.lastTopic, subject: conversationState.activeSubject, msgs: conversationState.messageCount }));

    // 9. AGENT 2: RÉSOLVEUR - Enrichir les messages courts/ambigus avec le contexte
    const enrichedMessage = resolveFollowUpContext(messageText, conversationHistory, conversationState);
    if (enrichedMessage !== messageText) {
      console.log(`[Chatbot] Message enrichi: "${messageText}" → "${enrichedMessage}"`);
    }

    // 9.5 DÉTECTION LETTRES PRÉDÉFINIES - Bypass agent si c'est une lettre du menu rapide
    const predefinedLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'أ', 'ب', 'ج', 'د', 'ه', 'و'];
    const trimmedMessage = messageText.trim().toLowerCase();
    const isPredefinedLetter = predefinedLetters.includes(trimmedMessage);
    
    let response;
    let agentDecision;
    
    if (isPredefinedLetter) {
      // Forcer le mode DIRECT pour les lettres prédéfinies
      console.log(`[Chatbot] Lettre prédéfinie détectée: "${trimmedMessage}" → Mode DIRECT forcé`);
      agentDecision = { mode: 'DIRECT', intents: ['predefined'], summary: 'Menu rapide' };
      response = await generateDirectResponse(enrichedMessage, studentInfo, studentData, parentInfo);
      if (!response) {
        console.log('[Chatbot] Fallback sécurisé depuis lettre prédéfinie');
        response = buildEducationalRedirectMessage(parentInfo, /[\u0600-\u06FF]/.test(messageText), 'off_topic');
      }
    } else {
      // 10. AGENT DÉCIDEUR IA - Analyse le message enrichi et décide comment répondre
      agentDecision = await decideWithAgent(enrichedMessage, parentInfo, studentInfo, conversationHistory);
      console.log('[Chatbot] Décision agent:', JSON.stringify(agentDecision));
    
      if (agentDecision.mode === 'DIRECT') {
        // Réponse directe scriptée - questions factuelles simples depuis la DB
        console.log('[Chatbot] Mode DIRECT - Réponse scriptée depuis DB');
        response = await generateDirectResponse(enrichedMessage, studentInfo, studentData, parentInfo);
        if (!response) {
          console.log('[Chatbot] DIRECT sans correspondance → redirection pédagogique stricte');
          response = buildEducationalRedirectMessage(parentInfo, /[\u0600-\u06FF]/.test(messageText), 'off_topic');
        }
      } else {
        // Mode IA - DeepSeek répond avec contexte ciblé
        console.log('[Chatbot] Mode AI_FOCUSED - DeepSeek avec contexte ciblé:', agentDecision.intents);
        response = await generateAIResponse(enrichedMessage, studentInfo, studentData, parentInfo, conversationHistory, agentDecision);
      }

      // 11. AGENT 3: GARDE-FOU - Vérifier la réponse IA contre les données réelles
      if (agentDecision.mode !== 'DIRECT') {
        const validation = validateAIResponse(response, studentData, studentInfo);
        if (!validation.valid && validation.severity === 'high') {
          console.warn('[Chatbot] Réponse IA rejetée par le garde-fou, régénération...');
          // Régénérer avec un prompt plus strict
          const strictDecision = { ...agentDecision, intents: [...agentDecision.intents], summary: agentDecision.summary + ' [STRICT: données vérifiées uniquement]' };
          response = await generateAIResponse(enrichedMessage, studentInfo, studentData, parentInfo, conversationHistory, strictDecision);
        }

        if (response && response.trim() === '__OFF_TOPIC__') {
          response = buildEducationalRedirectMessage(parentInfo, /[\u0600-\u06FF]/.test(messageText), 'off_topic');
        }
      }
    }
    
    // Ajouter le menu de questions rapides seulement toutes les 5 interactions
    const isArabic = /[\u0600-\u06FF]/.test(messageText);
    const messageCount = conversationHistory.length + 1;
    const showMenu = messageCount <= 1 || messageCount % 5 === 0;
    const quickMenu = showMenu
      ? (isArabic
          ? `\n\n╔═══════════════════════╗\n📋 *أسئلة سريعة*\n╚═══════════════════════╝\n\n📅 أ. كيف حاله اليوم؟\n📚 ب. ما الدروس المدروسة؟\n✍️ ج. هل هناك واجبات؟\n📝 د. ما آخر النقط؟\n🎯 ه. كيف سلوكه؟\n📆 و. برنامج الأسبوع؟\n\n━━━━━━━━━━━━━━━\n💬 أو اكتب سؤالك مباشرة`
          : `\n\n╔═══════════════════════╗\n📋 *Menu Rapide*\n╚═══════════════════════╝\n\n📅 A. Comment va-t-il aujourd'hui ?\n📚 B. Quelles leçons étudiées ?\n✍️ C. Y a-t-il des devoirs ?\n📝 D. Dernières notes ?\n🎯 E. Son comportement ?\n📆 F. Programme de la semaine ?\n\n━━━━━━━━━━━━━━━\n💬 Ou écrivez votre question`)
      : '';
    
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

function buildEducationalRedirectMessage(parentInfo, isArabic = false, reason = 'off_topic') {
  const intro = isArabic
    ? (reason === 'sensitive'
      ? `🔒 *لا يمكنني معالجة معلومات شخصية أو بنكية هنا.*\nهذا البوت مخصص حصراً للمتابعة الدراسية.`
      : `🎓 *هذا البوت مخصص فقط للمتابعة التربوية والدراسية.*`)
    : (reason === 'sensitive'
      ? `🔒 *Je ne peux pas traiter des informations personnelles/bancaires ici.*\nCe bot est réservé au suivi scolaire.`
      : `🎓 *Ce bot est strictement réservé au suivi pédagogique et scolaire.*`);

  const menu = isArabic
    ? `\n\n📋 *أسئلة سريعة:*\n📅 أ. كيف حاله اليوم؟\n📚 ب. ما الدروس المدروسة؟\n✍️ ج. هل هناك واجبات؟\n📝 د. ما آخر النقط؟\n🎯 ه. كيف سلوكه؟\n📆 و. برنامج الأسبوع؟`
    : `\n\n📋 *Questions rapides:*\n📅 A. Comment va-t-il aujourd'hui ?\n📚 B. Quelles leçons étudiées ?\n✍️ C. Y a-t-il des devoirs ?\n📝 D. Dernières notes ?\n🎯 E. Son comportement ?\n📆 F. Programme de la semaine ?`;

  return `${intro}${menu}\n\n━━━━━━━━━━━━━━━\n👥 *${parentInfo.school_name}*`;
}

// Vérifier si le message nécessite une réponse IA
async function shouldRespondWithAI(messageText, phone, parentId) {
  const lowerText = messageText.toLowerCase().trim();

  // Messages sociaux simples (traités sans IA)
  const greetings = [
    'سلام', 'مرحبا', 'صباح', 'مساء',
    'bonjour', 'bonsoir', 'salut', 'hello', 'hi',
    'salam', 'slm', 'slt', 'wslm', 'assalam',
    'ahlan', 'mrhba', 'sbah'
  ];
  const thanks = ['شكرا', 'merci', 'thanks', 'thank you', 'بارك الله فيك', 'shukran', 'chokran', 'barak'];
  const simple = ['ok', 'okay', 'd\'accord', 'حسنا', 'نعم', 'oui', 'yes', 'waw', 'mzyn', 'mlih'];

  // Autoriser les lettres/menu rapides
  if (/^([a-fأبجدهو]|\d)$/.test(lowerText)) {
    return { respond: true, reason: 'menu_letter' };
  }

  // Bloquer demandes sensibles hors périmètre scolaire
  const sensitivePatterns = [
    /code\s*(carte|guichet|pin|otp)/i,
    /\b(pin|otp|cvv|iban|rib|virement|bank|banque|carte)\b/i,
    /\bcommande|livraison|paiement|transaction\b/i,
    /\bmot\s*de\s*passe\b/i
  ];
  if (sensitivePatterns.some((p) => p.test(messageText))) {
    return { respond: false, reason: 'sensitive_offdomain' };
  }

  // Scope strictement pédagogique/éducatif
  const educationalKeywords = [
    'élève', 'enfant', 'fils', 'fille', 'student', 'parent',
    'note', 'notes', 'نقطة', 'نقط', 'moyenne', 'معدل',
    'absence', 'absent', 'présence', 'presence', 'حضور', 'غياب', 'retard',
    'devoir', 'devoirs', 'واجب', 'واجبات', 'rendu',
    'cours', 'leçon', 'leçons', 'lesson', 'درس', 'دروس', 'programme', 'semaine',
    'comportement', 'discipline', 'participation', 'سلوك',
    'classe', 'matière', 'matiere', 'svt', 'math', 'physique',
    'comment va', 'kif', 'كيف', 'chno', 'شنو'
  ];

  const hasEducationalSignal = educationalKeywords.some((kw) => lowerText.includes(kw));
  
  // Messages accidentels très courts (1-2 chars, probablement envoi accidentel)
  if (lowerText.length <= 2 && !/^[a-fأبجدهو]$/.test(lowerText)) {
    return { respond: false, reason: 'short_accidental' };
  }

  // Vérifier les salutations simples (mais pas "hier" qui contient "hi")
  if (greetings.some(g => lowerText.includes(g)) && lowerText.length < 20 && !lowerText.includes('hier') && !lowerText.includes('leçon') && !lowerText.includes('cours')) {
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

  const looksLikeChitChat = /\b(cv|salam|mzyan|bikhir|nta|nti|jou3|tajine|jama3|pipo)\b/i.test(lowerText);
  if (!hasEducationalSignal && lowerText.length >= 3 && looksLikeChitChat) {
    return { respond: false, reason: 'off_topic' };
  }
  if (!hasEducationalSignal && lowerText.length >= 4) {
    return { respond: false, reason: 'off_topic' };
  }
  
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

// ═══════════════════════════════════════════════════════
// AGENT 1: MÉMOIRE CONVERSATIONNELLE - État de la discussion
// ═══════════════════════════════════════════════════════
function buildConversationState(conversationHistory) {
  const state = {
    preferredLanguage: null, // 'fr', 'ar', 'darija'
    lastTopic: null,         // dernier sujet discuté
    lastIntents: [],         // derniers intents détectés
    activeSubject: null,     // matière en cours de discussion
    messageCount: conversationHistory.length,
    isReturningUser: conversationHistory.length > 3
  };

  if (conversationHistory.length === 0) return state;

  // Analyser les 5 derniers échanges pour extraire l'état
  const recent = conversationHistory.slice(-5);

  // Détecter la langue préférée
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i].parent_message.toLowerCase();
    if (/\b(b français|en français|dwi.*français|parle.*français)\b/i.test(msg)) {
      state.preferredLanguage = 'fr';
      break;
    }
    if (/\b(b darija|b arabe|hdrt.*darija)\b/i.test(msg)) {
      state.preferredLanguage = 'darija';
      break;
    }
  }
  // Si pas de demande explicite, détecter depuis le dernier message
  if (!state.preferredLanguage) {
    const lastParentMsg = recent[recent.length - 1]?.parent_message || '';
    state.preferredLanguage = /[\u0600-\u06FF]/.test(lastParentMsg) ? 'darija' : 'fr';
  }

  // Extraire le dernier sujet discuté (depuis la dernière réponse IA)
  const lastResponse = recent[recent.length - 1]?.ai_response?.toLowerCase() || '';
  const lastMsg = recent[recent.length - 1]?.parent_message?.toLowerCase() || '';
  
  const topicKeywords = {
    'notes': ['note', 'نقط', 'moyenne', 'معدل', 'contrôle'],
    'presence': ['présence', 'حضور', 'absent', 'غياب', 'présent'],
    'homework': ['devoir', 'واجب', 'exercice', 'rendu'],
    'lessons': ['leçon', 'درس', 'cours', 'دروس', 'étudi'],
    'behavior': ['comportement', 'سلوك', 'discipline', 'participation', 'téléphone'],
    'schedule': ['programme', 'برنامج', 'semaine', 'أسبوع']
  };

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(kw => lastMsg.includes(kw) || lastResponse.includes(kw))) {
      state.lastTopic = topic;
      break;
    }
  }

  // Détecter une matière active dans les derniers messages
  const subjectPatterns = [
    'math', 'physique', 'svt', 'sciences', 'français', 'arabe', 'anglais',
    'histoire', 'géo', 'philosophie', 'informatique', 'sport', 'éducation',
    'islamique', 'رياضيات', 'فيزياء', 'علوم', 'فرنسية', 'عربية', 'إنجليزية'
  ];
  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i].parent_message.toLowerCase();
    const found = subjectPatterns.find(s => msg.includes(s));
    if (found) {
      state.activeSubject = found;
      break;
    }
  }

  return state;
}

// ═══════════════════════════════════════════════════════
// AGENT 2: RÉSOLVEUR DE CONTEXTE - Comprend les follow-ups
// ═══════════════════════════════════════════════════════
function resolveFollowUpContext(messageText, conversationHistory, conversationState) {
  const lower = messageText.toLowerCase().trim();
  
  // Si le message est assez long et explicite, pas besoin d'enrichir
  if (lower.length > 40) return messageText;
  
  // Si pas d'historique, rien à résoudre
  if (conversationHistory.length === 0) return messageText;

  const lastParentMsg = conversationHistory[conversationHistory.length - 1]?.parent_message?.toLowerCase() || '';
  const lastAiResponse = conversationHistory[conversationHistory.length - 1]?.ai_response?.toLowerCase() || '';

  // Cas 1: Juste un nom de matière → lier au dernier sujet
  const subjectNames = [
    'math', 'maths', 'physique', 'svt', 'sciences', 'français', 'arabe', 
    'anglais', 'histoire', 'géo', 'philo', 'informatique', 'sport',
    'رياضيات', 'فيزياء', 'علوم', 'فرنسية', 'عربية', 'إنجليزية'
  ];
  const isJustSubject = subjectNames.some(s => lower === s || lower === s + 's');
  if (isJustSubject && conversationState.lastTopic) {
    const topicToQuestion = {
      'notes': `note de ${messageText}`,
      'lessons': `leçons de ${messageText}`,
      'homework': `devoirs de ${messageText}`,
      'behavior': `comportement en ${messageText}`,
      'presence': `présence en ${messageText}`,
      'schedule': `programme de ${messageText}`
    };
    const enriched = topicToQuestion[conversationState.lastTopic] || `${conversationState.lastTopic} ${messageText}`;
    console.log(`[FollowUp] Message enrichi: "${messageText}" → "${enriched}" (topic: ${conversationState.lastTopic})`);
    return enriched;
  }

  // Cas 2: Questions de suivi courtes qui font référence au contexte précédent
  const followUpPatterns = [
    { pattern: /^et (les |la |le |l')?(.+)\??$/i, resolve: (m) => m[2] },
    { pattern: /^(wach|wash|est.?ce qu|ya?til|kayn)\s+(.+)/i, resolve: (m) => m[2] },
    { pattern: /^(combien|chhal|ch7al)\s+(.+)/i, resolve: (m) => `combien ${m[2]}` },
    { pattern: /^(dernière?|akher|آخر)\s+(.+)/i, resolve: (m) => `dernière ${m[2]}` },
  ];
  
  for (const { pattern, resolve } of followUpPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const resolved = resolve(match);
      console.log(`[FollowUp] Pattern détecté: "${messageText}" → enrichi avec contexte`);
      return messageText; // Garde le message original mais le log aide au debug
    }
  }

  // Cas 3: Message très court (< 15 chars) sans mot-clé clair → ajouter le contexte du dernier sujet
  if (lower.length < 15 && conversationState.activeSubject && !isJustSubject) {
    // Vérifier si le message est une question implicite
    const questionIndicators = ['wch', 'chno', 'kif', 'fin', 'quoi', 'quel', 'comment', 'كيف', 'شنو', 'فين'];
    if (questionIndicators.some(q => lower.includes(q))) {
      const enriched = `${messageText} (en rapport avec ${conversationState.activeSubject})`;
      console.log(`[FollowUp] Question enrichie: "${messageText}" → "${enriched}"`);
      return enriched;
    }
  }

  return messageText;
}

// ═══════════════════════════════════════════════════════
// AGENT 3: GARDE-FOU - Vérifie la réponse IA contre les données réelles
// ═══════════════════════════════════════════════════════
function validateAIResponse(response, studentData, studentInfo) {
  const issues = [];
  const lower = response.toLowerCase();

  // 1. Vérifier les notes mentionnées - sont-elles dans les données réelles ?
  const notePattern = /(\d{1,2})[\/\\]20/g;
  const mentionedNotes = [];
  let match;
  while ((match = notePattern.exec(response)) !== null) {
    mentionedNotes.push(Number(match[1]));
  }
  
  if (mentionedNotes.length > 0) {
    const realNotes = [
      ...(studentData.grades || []).map(g => Number(g.note)),
      ...(studentData.allGrades || []).map(g => Number(g.note))
    ].filter(n => !isNaN(n));
    
    for (const note of mentionedNotes) {
      if (realNotes.length > 0 && !realNotes.includes(note)) {
        issues.push(`note_inventée:${note}/20`);
      }
    }
  }

  // 2. Vérifier les pourcentages de présence extrêmes
  const presencePattern = /(\d{2,3})%\s*(de\s+)?pr[ée]sence/i;
  const presenceMatch = response.match(presencePattern);
  if (presenceMatch) {
    const mentionedPct = Number(presenceMatch[1]);
    const tracking = studentData.tracking || [];
    if (tracking.length > 0) {
      const realPresent = tracking.filter(t => t.presence === 'present').length;
      const realPct = Math.round(realPresent / tracking.length * 100);
      if (Math.abs(mentionedPct - realPct) > 15) {
        issues.push(`présence_incohérente:${mentionedPct}% vs réel ${realPct}%`);
      }
    }
  }

  // 3. Vérifier si la réponse contient des noms de chapitres/leçons non dans les données
  const allTopics = [
    ...(studentData.sessions || []).map(s => s.topic),
    ...(studentData.allSessions || []).map(s => s.topic)
  ].filter(Boolean).map(t => t.toLowerCase());

  // Détection basique de chapitres inventés (entre guillemets)
  const quotedPattern = /["«»""]([^"«»""]+)["«»""]/g;
  let quotedMatch;
  while ((quotedMatch = quotedPattern.exec(response)) !== null) {
    const quoted = quotedMatch[1].toLowerCase().trim();
    if (quoted.length > 5 && !allTopics.some(t => t.includes(quoted) || quoted.includes(t))) {
      // Pourrait être un chapitre inventé
      issues.push(`chapitre_suspect:"${quotedMatch[1]}"`);
    }
  }

  if (issues.length > 0) {
    console.warn('[Guard] ⚠️ Problèmes détectés dans la réponse IA:', issues.join(', '));
  }
  
  return {
    valid: issues.length === 0,
    issues,
    severity: issues.some(i => i.startsWith('note_inventée')) ? 'high' : 'low'
  };
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
    ? `╔═══════════════════════╗\n👋 *مرحبا ${parentInfo.parent_name.split(' ')[0]}*\n╚═══════════════════════╝\n\n` 
    : `╔═══════════════════════╗\n👋 *Bienvenue ${parentInfo.parent_name.split(' ')[0]}*\n╚═══════════════════════╝\n\n`;
  
  if (children && children.length > 0) {
    message += isArabic ? '📚 *أبناؤك:*\n\n' : '📚 *Vos enfants:*\n\n';
    children.forEach((child, idx) => {
      const student = child.students;
      message += `${idx + 1}. 👤 *${student.first_name} ${student.last_name}*\n   📖 ${student.classes?.name || 'N/A'}\n`;
    });
    message += '\n';
  }
  
  message += isArabic 
    ? '╔═══════════════════════╗\n📋 *أسئلة سريعة*\n╚═══════════════════════╝\n\n'
    : '╔═══════════════════════╗\n📋 *Menu Rapide*\n╚═══════════════════════╝\n\n';
  
  if (isArabic) {
    message += '📅 أ. كيف حال ولدي اليوم؟\n';
    message += '📚 ب. ما هي الدروس المدروسة؟\n';
    message += '✍️ ج. هل هناك واجبات منزلية؟\n';
    message += '📝 د. ما هي آخر النقط؟\n';
    message += '🎯 ه. كيف سلوكه في القسم؟\n';
    message += '📆 و. برنامج الأسبوع؟\n';
  } else {
    message += '📅 A. Comment va mon enfant aujourd\'hui ?\n';
    message += '📚 B. Quelles leçons ont été étudiées ?\n';
    message += '✍️ C. Y a-t-il des devoirs ?\n';
    message += '📝 D. Quelles sont les dernières notes ?\n';
    message += '🎯 E. Comment est son comportement ?\n';
    message += '📆 F. Programme de la semaine ?\n';
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
        ? `✅ *تم الاختيار:* ${student.first_name} ${student.last_name}\n\n╔═══════════════════════╗\n📋 *أسئلة سريعة*\n╚═══════════════════════╝\n\n📅 أ. كيف حاله اليوم؟\n📚 ب. ما الدروس المدروسة؟\n✍️ ج. هل هناك واجبات؟\n📝 د. ما آخر النقط؟\n🎯 ه. كيف سلوكه؟\n📆 و. برنامج الأسبوع؟\n\n━━━━━━━━━━━━━━━\n💬 أو اكتب سؤالك مباشرة`
        : `✅ *Sélectionné:* ${student.first_name} ${student.last_name}\n\n╔═══════════════════════╗\n📋 *Menu Rapide*\n╚═══════════════════════╝\n\n📅 A. Comment va-t-il aujourd'hui ?\n📚 B. Quelles leçons étudiées ?\n✍️ C. Y a-t-il des devoirs ?\n📝 D. Dernières notes ?\n🎯 E. Son comportement ?\n📆 F. Programme de la semaine ?\n\n━━━━━━━━━━━━━━━\n💬 Ou écrivez votre question`;
      
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

// ═══════════════════════════════════════════════════════
// AGENT DÉCIDEUR - DeepSeek analyse l'intent et décide
// ═══════════════════════════════════════════════════════
async function decideWithAgent(messageText, parentInfo, studentInfo, conversationHistory) {
  // Messages courts/prédéfinis → décision directe sans appel IA
  const lower = messageText.trim().toLowerCase();
  const predefinedDirect = /^([a-fأبجدهو]|\d)$/.test(lower);
  if (predefinedDirect) {
    return { mode: 'DIRECT', intents: ['predefined'], summary: 'Sélection menu prédéfini' };
  }

  // Construire un résumé de l'historique récent pour l'agent
  const historySnippet = conversationHistory.slice(-3).map(c =>
    `Parent: ${c.parent_message.slice(0, 80)}\nAssistant: ${c.ai_response.slice(0, 100)}`
  ).join('\n---\n');

  const agentPrompt = `Tu es un agent classificateur pour un chatbot scolaire WhatsApp.
Analyse le message d'un parent et retourne UNIQUEMENT un objet JSON valide.

Contexte:
- Parent: ${parentInfo.parent_name}
- Élève: ${studentInfo.first_name} ${studentInfo.last_name || ''}
- École: ${parentInfo.school_name}
${historySnippet ? `- Historique récent:\n${historySnippet}` : ''}

Message reçu: "${messageText}"

Règles de décision:
- mode "DIRECT": questions factuelles simples (notes exactes, absences du jour, liste devoirs, leçons du jour, leçons pendant absences, programme semaine). Réponse depuis base de données.
- mode "AI_FOCUSED": tout le reste (analyse, conseils, comportement, motivation, évolution, questions ouvertes, questions complexes, suivi conversation). Réponse par IA.

intents possibles (tableau): ["presence", "absences", "grades", "homework", "lessons", "missed_lessons", "schedule", "behavior", "advice", "comparison", "wellbeing", "other"]

Note: Si le parent demande "leçons pendant absences" ou "leçons manquées" → mode DIRECT avec intent "missed_lessons"

Retourne STRICTEMENT ce JSON (rien d'autre):
{
  "mode": "DIRECT" ou "AI_FOCUSED",
  "intents": [liste des intents détectés],
  "needsToday": true/false,
  "needsGrades": true/false,
  "needsHomework": true/false,
  "needsBehavior": true/false,
  "needsSchedule": true/false,
  "summary": "résumé en 1 phrase de ce que le parent veut savoir"
}`;

  try {
    const result = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: agentPrompt }],
      temperature: 0.1,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(result.choices[0]?.message?.content || '{}');
    return {
      mode: parsed.mode === 'DIRECT' ? 'DIRECT' : 'AI_FOCUSED',
      intents: Array.isArray(parsed.intents) ? parsed.intents : ['other'],
      needsToday: parsed.needsToday !== false,
      needsGrades: parsed.needsGrades === true,
      needsHomework: parsed.needsHomework === true,
      needsBehavior: parsed.needsBehavior === true,
      needsSchedule: parsed.needsSchedule === true,
      summary: parsed.summary || ''
    };
  } catch (err) {
    console.error('[Agent] Erreur décision:', err.message);
    // Fallback : tout passer en AI_FOCUSED avec tout le contexte
    return { mode: 'AI_FOCUSED', intents: ['other'], needsToday: true, needsGrades: true, needsHomework: true, needsBehavior: true, needsSchedule: false, summary: '' };
  }
}

// Générer une réponse directe (sans IA) pour questions factuelles
async function generateDirectResponse(question, studentInfo, studentData, parentInfo) {
  const lower = question.toLowerCase().trim();
  const isArabic = /[\u0600-\u06FF]/.test(question);
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.slice(0, 7);
  
  // Mapper les lettres prédéfinies aux questions complètes (case-insensitive)
  const predefinedMap = {
    'أ': 'كيف حاله اليوم',
    'ب': 'الدروس',
    'ج': 'واجبات',
    'د': 'النقط',
    'ه': 'سلوك',
    'و': 'برنامج الأسبوع',
    'a': 'comment va aujourd\'hui',
    'b': 'leçons',
    'c': 'devoirs',
    'd': 'notes',
    'e': 'comportement',
    'f': 'programme semaine'
  };
  
  // Si c'est une lettre prédéfinie, utiliser la question mappée
  const trimmedLower = lower.trim();
  const mappedQuestion = predefinedMap[trimmedLower];
  const searchText = mappedQuestion || lower;
  
  // Extraire une date ou un mois spécifique du message
  const extractedDate = extractDateFromMessage(question);
  const extractedMonth = !extractedDate ? extractMonthFromMessage(question) : null;
  const targetDate = extractedDate || today;
  const targetMonthKey = extractedMonth
    ? `${extractedMonth.year}-${String(extractedMonth.month).padStart(2, '0')}`
    : currentMonth;
  console.log('[generateDirectResponse] Date extraite:', extractedDate, '| Mois extrait:', extractedMonth, '| Date cible:', targetDate);
  
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
  const pct = (value, total) => Math.round((value / Math.max(1, total)) * 100);
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
  const isLessonsQuery = lessonsKeywords.some(kw => searchText.includes(kw));

  // LEÇONS / COURS DU MOIS (doit être vérifié AVANT le bilan mensuel)
  if (
    isLessonsQuery &&
    (
      searchText.includes('الشهر') || searchText.includes('هد الشهر') || searchText.includes('هذا الشهر') ||
      searchText.includes('ce mois') || searchText.includes('du mois') || searchText.includes('mensuel') ||
      searchText.includes('مدروسة') || searchText.includes('درست') || searchText.includes('دراسة')
    )
  ) {
    const allSessions = studentData.allSessions || [];
    const currentMonthSessions = allSessions.filter(s => toMonthKey(s.date) === targetMonthKey);
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
      const period = currentMonthSessions.length > 0 ? targetMonthKey : 'récente';
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
    extractedMonth ||
    searchText.includes('ce mois') ||
    searchText.includes('du mois') ||
    searchText.includes('mensuel') ||
    searchText.includes('mois') ||
    searchText.includes('الشهر') ||
    searchText.includes('شهري')
  ) {
    const monthLabel = targetMonthKey;
    let monthTracking = (studentData.allTracking || []).filter(t => toMonthKey(t.sessions?.date) === targetMonthKey);
    const monthAbsences = (studentData.absences || []).filter(a => toMonthKey(a.sessions?.date) === targetMonthKey);
    let monthGrades = (studentData.allGrades || []).filter(g => toMonthKey(g.controls_plan?.date) === targetMonthKey);

    // Fallback: si le format de date est hétérogène, ne pas perdre les métriques
    if (!extractedMonth && monthTracking.length === 0 && (studentData.allTracking || []).length > 0) {
      monthTracking = studentData.allTracking || [];
    }
    if (!extractedMonth && monthTracking.length === 0 && (studentData.tracking || []).length > 0) {
      monthTracking = studentData.tracking || [];
    }
    if (!extractedMonth && monthGrades.length === 0 && (studentData.allGrades || []).length > 0) {
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
        ? `📅 *ملخص الشهر (${monthLabel}):*\n\n`
        : `📅 *Bilan du mois (${monthLabel}):*\n\n`;

      if (totalSessions > 0) {
        const presencePct = pct(presentCount, totalSessions);
        const cahierPct = pct(homeworkReadyCount, totalSessions);
        response += isArabic
          ? `• ✅ الحضور: *${presentCount}/${totalSessions}* (${presencePct}%) ${generateProgressBar(presencePct)}\n`
          : `• ✅ Présence: *${presentCount}/${totalSessions}* (${presencePct}%) ${generateProgressBar(presencePct)}\n`;
        response += isArabic
          ? `• ❌ الغيابات: *${absentCount}*\n`
          : `• ❌ Absences: *${absentCount}*\n`;
        response += isArabic
          ? `• ⏰ التأخر: *${lateCount}*\n`
          : `• ⏰ Retards: *${lateCount}*\n`;
        response += isArabic
          ? `• 📘 حضور الدفتر: *${homeworkReadyCount}/${totalSessions}* (${cahierPct}%) ${generateProgressBar(cahierPct)}\n`
          : `• 📘 Cahier présent: *${homeworkReadyCount}/${totalSessions}* (${cahierPct}%) ${generateProgressBar(cahierPct)}\n`;
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
  
  // ABSENCES (exclure si on demande les leçons pendant les absences)
  else if (
    (searchText.includes('absence') || searchText.includes('غياب') || (searchText.includes('combien') && searchText.includes('absent'))) &&
    !(searchText.includes('leçon') || searchText.includes('cours') || searchText.includes('درس') || searchText.includes('دروس'))
  ) {
    const allAbsences = studentData.absences || [];
    const absencesByDate = extractedDate
      ? allAbsences.filter(abs => abs.sessions?.date === extractedDate)
      : allAbsences;
    const absencesByMonth = !extractedDate && extractedMonth
      ? allAbsences.filter(abs => toMonthKey(abs.sessions?.date) === targetMonthKey)
      : absencesByDate;
    const finalAbsences = absencesByMonth;
    const absenceCount = finalAbsences.length;

    if (extractedDate) {
      const dateLabel = new Date(extractedDate + 'T00:00:00').toLocaleDateString(isArabic ? 'ar-MA' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      response = isArabic
        ? `📅 *غيابات ${dateLabel}:*\n\n${absenceCount > 0 ? `❌ مسجل *${absenceCount}* غياب.` : '✅ لا يوجد غياب في هذا التاريخ.'}`
        : `📅 *Absences du ${dateLabel}:*\n\n${absenceCount > 0 ? `❌ *${absenceCount}* absence(s) enregistrée(s).` : '✅ Aucune absence à cette date.'}`;
    } else {
      const scopeLabel = extractedMonth ? targetMonthKey : (isArabic ? 'هذا الشهر' : 'ce mois');
      response = isArabic
        ? `📊 *عدد الغيابات (${scopeLabel}):*\n\n${studentInfo.first_name} لديه *${absenceCount} غياب*.`
        : `📊 *Nombre d'absences (${scopeLabel}):*\n\n${studentInfo.first_name} a *${absenceCount} absence(s)*.`;
    }

    if (absenceCount > 0 && absenceCount <= 5) {
      response += '\n\n' + (isArabic ? '📅 *التواريخ:*\n' : '📅 *Dates:*\n');
      finalAbsences.forEach(abs => {
        response += `• ${abs.sessions?.date} - ${abs.sessions?.subjects?.name || 'N/A'}\n`;
      });
    }
  }
  
  // PRÉSENCE AUJOURD'HUI
  else if (
    searchText.includes('présent') ||
    searchText.includes('présence') ||
    searchText.includes('presence') ||
    searchText.includes('حاضر') ||
    searchText.includes('حضور') ||
    searchText.includes('aujourd\'hui') ||
    searchText.includes('اليوم') ||
    searchText.includes('comment va')
  ) {
    const sourceTracking = extractedDate ? (studentData.allTracking || []) : (studentData.tracking || []);
    const dayTracking = sourceTracking.filter(t => t.sessions?.date === targetDate);
    const dateLabel = extractedDate
      ? new Date(targetDate + 'T00:00:00').toLocaleDateString(isArabic ? 'ar-MA' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      : (isArabic ? 'اليوم' : 'aujourd\'hui');

    if (dayTracking.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد بيانات حضور لـ ${dateLabel}.`
        : `ℹ️ Pas de données de présence pour ${dateLabel}.`;
    } else {
      const presentCount = dayTracking.filter(t => t.presence === 'present').length;
      const totalSessions = dayTracking.length;
      const presencePct = pct(presentCount, totalSessions);
      
      // En-tête visuel
      response = isArabic
        ? createSectionHeader(`الحضور - ${dateLabel}`, '📅')
        : createSectionHeader(`Présence - ${dateLabel}`, '📅');
      
      // Résumé de présence avec graphique
      response += '\n' + formatPresenceSummary(presentCount, totalSessions, isArabic);
      
      // Détails des séances
      if (dayTracking.length > 0 && dayTracking.length <= 6) {
        response += '\n\n' + (isArabic ? '📚 *تفاصيل الحصص:*' : '📚 *Détails des séances:*');
        dayTracking.forEach(t => {
          const icon = t.presence === 'present' ? '✅' : '❌';
          const subjectName = t.sessions?.subjects?.name || (isArabic ? 'مادة' : 'Matière');
          response += `\n${icon} ${subjectName}`;
        });
      }
    }
  }
  
  // STATISTIQUES DE CLASSE (moyenne / meilleure note)
  else if (
    (searchText.includes('classe') || searchText.includes('القسم')) &&
    (
      searchText.includes('moyenne') ||
      searchText.includes('moyen') ||
      searchText.includes('meilleure') ||
      searchText.includes('meilleur') ||
      searchText.includes('max') ||
      (searchText.includes('note') && searchText.includes('classe')) ||
      searchText.includes('معدل') ||
      searchText.includes('أفضل')
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

  // NOTES / MOYENNE (avec support filtrage par matière)
  else if (searchText.includes('note') || searchText.includes('نقطة') || searchText.includes('moyenne') || searchText.includes('معدل') || searchText.includes('النقط')) {
    // Détecter si une matière spécifique est demandée
    const allSessions = studentData.allSessions || [];
    const subjectPool = [...new Set(allSessions.map(s => s?.subjects?.name).filter(Boolean))];
    const requestedSubject = subjectPool.find(subject => {
      const normalized = normalizeText(subject);
      return normalized && lower.includes(normalized);
    });

    const allGrades = studentData.allGrades?.length ? studentData.allGrades : (studentData.grades || []);
    
    // Filtrer par matière si demandée
    let relevantGrades = allGrades;
    if (requestedSubject) {
      relevantGrades = allGrades.filter(grade => {
        const inferredSubject = inferControlSubject(grade);
        return inferredSubject && normalizeText(inferredSubject).includes(normalizeText(requestedSubject));
      });
    }

    if (relevantGrades.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد نقط${requestedSubject ? ` في ${requestedSubject}` : ' حديثة'} متاحة.`
        : `ℹ️ Pas de notes${requestedSubject ? ` en ${requestedSubject}` : ' récentes'} disponibles.`;
    } else {
      const recentGrades = relevantGrades.slice(0, 5);
      const subjectLabel = requestedSubject ? ` ${requestedSubject}` : '';
      
      // En-tête visuel
      response = isArabic
        ? createSectionHeader(`آخر النقط${subjectLabel}`, '📝')
        : createSectionHeader(`Dernières Notes${subjectLabel}`, '📝');
      
      // Afficher chaque note avec barre de progression
      recentGrades.forEach((grade, index) => {
        const score = formatScore(Number(grade.note) || 0);
        const inferredSubject = inferControlSubject(grade);
        const controlTitle = grade.controls_plan?.name || (isArabic ? 'اختبار' : 'Contrôle');
        const subjectInfo = inferredSubject && !requestedSubject ? ` (${inferredSubject})` : '';
        
        response += `\n${score.emoji} *${controlTitle}${subjectInfo}*\n`;
        response += `   ${score.bar} *${grade.note}/20* (${score.percentage}%)\n`;
      });

      // Tendance visuelle
      const trendSeries = recentGrades
        .map((g) => Math.round(((Number(g.note) || 0) / 20) * 100))
        .reverse();
      if (trendSeries.length >= 2) {
        response += '\n' + (isArabic
          ? `📈 *التطور:* ${toSparkline(trendSeries)}\n   ${trendSeries.join('% → ')}%`
          : `📈 *Évolution:* ${toSparkline(trendSeries)}\n   ${trendSeries.join('% → ')}%`);
      }
      
      // Calculer et afficher moyenne avec barre
      if (relevantGrades.length > 0) {
        const avg = (relevantGrades.reduce((sum, g) => sum + (g.note || 0), 0) / relevantGrades.length).toFixed(2);
        const avgScore = formatScore(Number(avg));
        response += '\n\n' + (isArabic
          ? `╔═══════════════════════╗\n📊 *المعدل${requestedSubject ? ` في ${requestedSubject}` : ' العام'}*\n${avgScore.bar} *${avg}/20* (${avgScore.percentage}%)\n╚═══════════════════════╝`
          : `╔═══════════════════════╗\n📊 *Moyenne${requestedSubject ? ` en ${requestedSubject}` : ' Générale'}*\n${avgScore.bar} *${avg}/20* (${avgScore.percentage}%)\n╚═══════════════════════╝`);
      }
    }
  }

  // MATIÈRE FAIBLE / DIFFICILE
  else if (
    searchText.includes('ضعيف') ||
    searchText.includes('faible') ||
    searchText.includes('difficile') ||
    searchText.includes('mauvais') ||
    searchText.includes('مشكل') ||
    (searchText.includes('matière') && (searchText.includes('faible') || searchText.includes('ضعيف') || searchText.includes('difficile')))
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
    searchText.includes('matière') ||
    searchText.includes('matiere') ||
    searchText.includes('مادة') ||
    searchText.includes('شناهي المادة') ||
    (searchText.includes('contrôle') && searchText.includes('quel')) ||
    (searchText.includes('controle') && searchText.includes('quel'))
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
  else if (searchText.includes('devoir') || searchText.includes('واجب')) {
    if (!studentData.homework || studentData.homework.length === 0) {
      response = isArabic
        ? `ℹ️ لا توجد واجبات منزلية حالياً.`
        : `ℹ️ Pas de devoirs en cours actuellement.`;
    } else {
      // Filtrer les devoirs pour cet élève spécifiquement
      const homeworkList = studentData.homework.map(hw => {
        const submission = hw.homework_submissions?.find(sub => sub.student_id === studentInfo.id);
        return {
          ...hw,
          status: submission?.status || 'pending',
          submission_date: submission?.submission_date
        };
      });
      
      const pendingHomework = homeworkList.filter(hw => hw.status !== 'submitted');
      
      if (pendingHomework.length === 0) {
        response = isArabic
          ? `✅ جميع الواجبات مسلمة!`
          : `✅ Tous les devoirs sont rendus !`;
      } else {
        response = isArabic
          ? `📚 *الواجبات المنزلية:*\n\n`
          : `📚 *Devoirs à faire:*\n\n`;
        
        pendingHomework.slice(0, 5).forEach(hw => {
          const dueDate = new Date(hw.due_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
          const typeLabel = hw.type ? (isArabic ? hw.type : hw.type.charAt(0).toUpperCase() + hw.type.slice(1)) : 'Devoir';
          response += `• ${typeLabel}: ${hw.title}\n`;
          response += `  ${isArabic ? 'الموعد النهائي' : 'Échéance'}: ${dueDate}\n`;
          if (hw.description) response += `  ${isArabic ? 'الوصف' : 'Description'}: ${hw.description}\n`;
        });
      }
    }
  }
  
  // LEÇONS PENDANT LES ABSENCES (nouveau cas spécifique)
  else if (
    (searchText.includes('leçon') || searchText.includes('cours') || searchText.includes('درس') || searchText.includes('دروس') || searchText.includes('الدروس')) &&
    (searchText.includes('absence') || searchText.includes('غياب') || searchText.includes('absent') || searchText.includes('غائب') || 
     searchText.includes('manqu') || searchText.includes('raté') || searchText.includes('فات') || searchText.includes('ضاع') ||
     searchText.includes('pendant') || searchText.includes('durant') || searchText.includes('lors') || searchText.includes('أثناء') || searchText.includes('ces'))
  ) {
    const allAbsences = studentData.absences || [];
    const allSessions = studentData.allSessions || [];
    
    if (allAbsences.length === 0) {
      response = isArabic
        ? `✅ لا توجد غيابات مسجلة.`
        : `✅ Aucune absence enregistrée.`;
    } else {
      // Récupérer les dates d'absence
      const absenceDates = allAbsences.map(abs => abs.sessions?.date).filter(Boolean);
      
      // Récupérer les leçons de ces dates
      const missedLessons = allSessions.filter(s => absenceDates.includes(s.date));
      
      if (missedLessons.length === 0) {
        response = isArabic
          ? `ℹ️ لا توجد دروس مسجلة في تواريخ الغياب.`
          : `ℹ️ Pas de leçons enregistrées aux dates d'absence.`;
      } else {
        response = isArabic
          ? `📖 *الدروس التي فاتت بسبب الغياب:*\n\n`
          : `📖 *Leçons manquées pendant les absences:*\n\n`;
        
        // Grouper par date
        const byDate = {};
        missedLessons.forEach(s => {
          if (!byDate[s.date]) byDate[s.date] = [];
          byDate[s.date].push(s);
        });
        
        // Afficher par date (ordre chronologique inverse)
        Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a)).slice(0, 10).forEach(([date, sessions]) => {
          const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString(isArabic ? 'ar-MA' : 'fr-FR', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long' 
          });
          response += `📅 *${dateLabel}* (${isArabic ? 'غائب' : 'absent'})\n`;
          sessions.forEach(session => {
            response += `  📚 *${session.subjects?.name || 'N/A'}*`;
            if (session.topic) response += `\n     📌 ${session.topic}`;
            if (session.notes) {
              const content = session.notes.substring(0, 100);
              response += `\n     📝 ${content}${session.notes.length > 100 ? '...' : ''}`;
            }
            response += `\n`;
          });
          response += `\n`;
        });
        
        if (Object.keys(byDate).length > 10) {
          response += isArabic
            ? `\n_عرض آخر 10 تواريخ فقط_`
            : `\n_Affichage des 10 dernières dates uniquement_`;
        }
      }
    }
  }
  
  // LEÇONS (aujourd'hui, hier, date spécifique ou mois entier)
  else if (
    searchText.includes('leçon') || searchText.includes('درس') || searchText.includes('الدروس') || searchText.includes('دروس') || searchText.includes('étudié') ||
    searchText.includes('cours') || searchText.includes('البارحة') || searchText.includes('hier') ||
    searchText.includes('أمس') || searchText.includes('yesterday') || searchText.includes('titres')
  ) {
    if (extractedMonth) {
      // Affichage par MOIS entier
      const { month, year } = extractedMonth;
      const allSessions = studentData.allSessions || [];
      const monthSessions = allSessions.filter(s => {
        if (!s.date) return false;
        const d = new Date(s.date + 'T00:00:00');
        return d.getMonth() + 1 === month && d.getFullYear() === year;
      });
      const monthNames = isArabic
        ? ['يناير','فبراير','مارس','أبريل','ماي','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نونبر','دجنبر']
        : ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
      const monthLabel = `${monthNames[month - 1]} ${year}`;

      if (monthSessions.length === 0) {
        response = isArabic
          ? `ℹ️ لا توجد دروس مسجلة لشهر ${monthLabel}.`
          : `ℹ️ Pas de leçons enregistrées pour ${monthLabel}.`;
      } else {
        response = isArabic
          ? `📖 *دروس شهر ${monthLabel}:*\n\n`
          : `📖 *Leçons de ${monthLabel}:*\n\n`;
        // Regrouper par date
        const byDate = {};
        monthSessions.forEach(s => {
          if (!byDate[s.date]) byDate[s.date] = [];
          byDate[s.date].push(s);
        });
        Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, sessions]) => {
          const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString(isArabic ? 'ar-MA' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
          response += `📅 *${dayLabel}*\n`;
          sessions.forEach(session => {
            response += `  📚 *${session.subjects?.name || 'N/A'}*`;
            if (session.topic) response += ` - ${session.topic}`;
            response += `\n`;
          });
          response += `\n`;
        });
      }
    } else {
      // Affichage par DATE (jour précis)
      const targetSessions = (extractedDate ? (studentData.allSessions || []) : studentData.sessions)
        .filter(s => s.date === targetDate);
      
      const dateLabel = extractedDate 
        ? new Date(extractedDate + 'T00:00:00').toLocaleDateString(isArabic ? 'ar-MA' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
        : (isArabic ? 'اليوم' : 'aujourd\'hui');
      
      if (targetSessions.length === 0) {
        response = isArabic
          ? `ℹ️ لا توجد دروس مسجلة لـ ${dateLabel}.`
          : `ℹ️ Pas de leçons enregistrées pour ${dateLabel}.`;
      } else {
        response = isArabic
          ? `📖 *الدروس (${dateLabel}):*\n\n`
          : `📖 *Leçons du ${dateLabel}:*\n\n`;
        
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
  }
  
  // COMPORTEMENT / DISCIPLINE / INCIDENTS
  else if (
    searchText.includes('سلوك') || searchText.includes('comportement') ||
    searchText.includes('discipline') || searchText.includes('انضباط') ||
    searchText.includes('هاتف') || searchText.includes('téléphone') ||
    searchText.includes('نعاس') || searchText.includes('somnol') ||
    searchText.includes('incident') || searchText.includes('حادث') || searchText.includes('مشكل') ||
    searchText.includes('retard') || searchText.includes('تأخر')
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
    searchText.includes('semaine') || searchText.includes('أسبوع') ||
    searchText.includes('planning') || searchText.includes('برنامج') ||
    searchText.includes('bilan') && searchText.includes('semaine') ||
    searchText.includes('ملخص') && searchText.includes('أسبوع') ||
    searchText.includes('programme semaine')
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
    searchText.includes('واجب') || searchText.includes('devoir') ||
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
    
    // Devoirs assignés à la classe (avec ou sans soumission)
    supabaseAdmin
      .from('homework')
      .select('id, title, due_date, description, type, homework_submissions!left(student_id, status, submission_date)')
      .eq('class_id', classId)
      .gte('due_date', oneWeekAgo)
      .order('due_date', { ascending: true })
      .limit(20),
    
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

// ═══════════════════════════════════════════════════════
// GÉNÉRATION IA - Réponse humaine naturelle
// ═══════════════════════════════════════════════════════
async function generateAIResponse(question, studentInfo, studentData, parentInfo, conversationHistory, agentDecision = null) {
  try {
    // Construire un contexte CIBLÉ selon ce que l'agent a détecté
    const context = buildTargetedContext(studentInfo, studentData, agentDecision);
    console.log('[Chatbot] Contexte ciblé généré, longueur:', context.length, 'caractères');

    const isArabic = /[\u0600-\u06FF]/.test(question);
    
    // Détecter la langue préférée du parent (persistance de langue)
    let preferredLanguage = isArabic ? 'darija marocaine ou arabe standard' : 'français';
    const parentAsksForFrench = /\b(b français|en français|b franc|parle.*français|dwi.*français|speak.*french)\b/i.test(question);
    const parentAsksForArabic = /\b(b darija|b arabe|parle.*arabe|hdrt.*darija)\b/i.test(question);
    if (parentAsksForFrench) {
      preferredLanguage = 'français';
    } else if (!parentAsksForArabic && conversationHistory.length > 0) {
      // Vérifier si le parent a demandé le français dans les 3 derniers messages
      const recentMessages = conversationHistory.slice(-3).map(c => c.parent_message.toLowerCase());
      if (recentMessages.some(m => /\b(b français|en français|dwi.*français|speak.*french)\b/i.test(m))) {
        preferredLanguage = 'français';
      }
    }

    const intents = agentDecision?.intents || [];
    const summary = agentDecision?.summary || '';

    // Construire le prompt système humain et naturel
    const systemPrompt = `Tu es Nour, assistant pédagogique strict de ${parentInfo.school_name}.
Tu réponds UNIQUEMENT dans le périmètre scolaire/éducatif de l'élève.

🎯 Ce que le parent veut: ${summary || question}
📌 Domaines concernés: ${intents.join(', ') || 'général'}

RÈGLES DE RÉPONSE (OBLIGATOIRES):
1. Langue: réponds OBLIGATOIREMENT en ${preferredLanguage}. Ne change PAS de langue même si le dossier est en français.
2. NOM DE L'ÉLÈVE: utilise EXACTEMENT le prénom "${studentInfo.first_name}" tel quel. Ne traduis PAS, ne convertis PAS en majuscules, ne latinise PAS les noms arabes.
3. Format STRICT (court et structuré, 3 blocs max):
   📌 *Réponse* (1-2 lignes max)
   📊 *Données* (2-4 puces max avec chiffres réels)
   ➡️ *Action* (1 recommandation concrète ou une question de précision)
4. Longueur: 5 à 8 lignes max. Pas de paragraphe long.
5. Données: utilise uniquement les données du dossier fourni.
6. Jamais de formule vide en début: pas de "Bien sûr!", "Voici les informations", "بالطبع".
7. Si tu donnes des conseils: max 2-3 conseils concrets, adaptés aux vraies données de l'élève.
8. Si une info manque dans le dossier: dis-le simplement sans t'excuser.
9. 1-3 emojis seulement, placés intelligemment.
10. N'invente JAMAIS de données absentes du dossier. Un booléen 'téléphone en classe' = signalement, pas 'il a quitté la séance'.
11. RÈGLE ABSOLUE: Ne partage JAMAIS de données (notes, absences, comportement) que le parent n'a PAS demandées explicitement. Si la question est vague ou générale, demande ce qu'il veut savoir. Ne commence pas un résumé spontané.
12. Si le parent mentionne une MATIÈRE (ex: 'SVT', 'maths') mais que le dossier ne contient AUCUNE donnée pour cette matière, dis simplement 'Pas de données disponibles pour [matière]'. N'invente PAS de leçons, notes ou comportements.
13. Si la question est HORS domaine pédagogique (banque, achats, code carte, vie personnelle, etc.), réponds EXACTEMENT: __OFF_TOPIC__
14. Termine par une question courte de suivi si pertinent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOSSIER ${studentInfo.first_name} ${studentInfo.last_name || ''}:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${context}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const messages = [{ role: 'system', content: systemPrompt }];

    // Historique conversationnel (5 derniers échanges, sans le menu en bas)
    if (conversationHistory.length > 0) {
      conversationHistory.slice(-5).forEach(conv => {
        messages.push({ role: 'user', content: conv.parent_message });
        messages.push({ role: 'assistant', content: conv.ai_response.replace(/\n\n━━━.*$/s, '').trim() });
      });
    }

    messages.push({ role: 'user', content: question });

    console.log('[Chatbot] Appel DeepSeek (intents:', intents.join(','), ', messages:', messages.length, ')...');
    const result = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      temperature: 0.2,
      max_tokens: 320
    });
    console.log('[Chatbot] Réponse DeepSeek reçue');

    let aiResponse = result.choices[0]?.message?.content?.trim() || 'Désolé, je n\'ai pas pu générer une réponse.';
    aiResponse += `\n\n━━━━━━━━━━━━━━━\n👥 *${parentInfo.school_name}*`;

    return aiResponse;

  } catch (error) {
    console.error('[Chatbot] Erreur génération IA:', error);
    return `Nous avons bien reçu votre message concernant ${studentInfo.first_name}. Notre équipe pédagogique reviendra vers vous très bientôt 🙏\n\n🏫 *${parentInfo.school_name}*`;
  }
}

// ═══════════════════════════════════════════════════════
// CONTEXTE CIBLÉ - Seulement les données pertinentes
// ═══════════════════════════════════════════════════════
function buildTargetedContext(studentInfo, studentData, agentDecision) {
  const today = new Date().toISOString().split('T')[0];
  const d = agentDecision || { needsToday: true, needsGrades: true, needsHomework: true, needsBehavior: true };

  let context = `Élève: ${studentInfo.first_name} ${studentInfo.last_name || ''} | Classe: ${studentData.profile?.classes?.name || 'N/A'}\n\n`;

  // Données du jour
  if (d.needsToday) {
    const todayTracking = (studentData.tracking || []).filter(t => t.sessions?.date === today);
    if (todayTracking.length > 0) {
      const present = todayTracking.filter(t => t.presence === 'present').length;
      const total = todayTracking.length;
      const subjects = [...new Set(todayTracking.map(t => t.sessions?.subjects?.name).filter(Boolean))];
      const incidents = todayTracking.flatMap(t => [
        t.phone_use ? 'téléphone' : null,
        t.sleeping ? 'somnolence' : null,
        t.presence === 'late' ? 'retard' : null
      ].filter(Boolean));
      const lessons = todayTracking.map(t => t.sessions?.topic).filter(Boolean);

      context += `AUJOURD'HUI (${today}):\n`;
      context += `- Présence: ${present}/${total} séances\n`;
      if (subjects.length) context += `- Matières: ${subjects.join(', ')}\n`;
      if (lessons.length) context += `- Leçons: ${lessons.join(', ')}\n`;
      if (incidents.length) context += `- ⚠️ Incidents: ${incidents.join(', ')}\n`;
      const partScores = todayTracking.map(t => ({ excellent: 5, good: 4, average: 3, weak: 2 })[t.participation] || 0).filter(s => s > 0);
      if (partScores.length) {
        const avg = Math.round(partScores.reduce((a, b) => a + b, 0) / partScores.length / 5 * 100);
        context += `- Participation: ${avg}%\n`;
      }
      context += `\n`;
    } else {
      context += `AUJOURD'HUI: Pas encore de données enregistrées.\n\n`;
    }

    // Présence 7 jours
    const tracking7 = studentData.tracking || [];
    if (tracking7.length > 0) {
      const p7 = tracking7.filter(t => t.presence === 'present').length;
      const a7 = tracking7.filter(t => t.presence === 'absent').length;
      const l7 = tracking7.filter(t => t.presence === 'late').length;
      context += `PRÉSENCE (7 jours): ${p7}/${tracking7.length} présent${a7 > 0 ? `, ${a7} absent(s)` : ''}${l7 > 0 ? `, ${l7} retard(s)` : ''}\n\n`;
    }
  }

  // Notes
  if (d.needsGrades) {
    const grades = studentData.allGrades?.length ? studentData.allGrades : (studentData.grades || []);
    if (grades.length > 0) {
      const allSessions = studentData.allSessions || [];
      const subjectPool = [...new Set(allSessions.map(s => s?.subjects?.name).filter(Boolean))];
      const subjectMap = {};
      grades.slice(0, 10).forEach(g => {
        const cn = String(g?.controls_plan?.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        let sub = subjectPool.find(s => { const ns = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return ns && (cn.includes(ns) || ns.includes(cn)); });
        if (!sub && g?.controls_plan?.date) {
          const sd = [...new Set(allSessions.filter(s => s?.date === g.controls_plan.date).map(s => s?.subjects?.name).filter(Boolean))];
          if (sd.length === 1) sub = sd[0];
        }
        if (!sub && subjectPool.length === 1) sub = subjectPool[0];
        const key = sub || g.controls_plan?.name || 'Contrôle';
        if (!subjectMap[key]) subjectMap[key] = [];
        subjectMap[key].push(Number(g.note) || 0);
      });
      context += `NOTES PAR MATIÈRE:\n`;
      Object.entries(subjectMap).forEach(([sub, notes]) => {
        const avg = (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1);
        const icon = Number(avg) >= 14 ? '✅' : Number(avg) >= 10 ? '🔶' : '❌';
        context += `- ${icon} ${sub}: ${avg}/20 (${notes.length} contrôle${notes.length > 1 ? 's' : ''})\n`;
      });
      context += `\n`;
    }
  }

  // Devoirs
  if (d.needsHomework) {
    const hw = studentData.homework || [];
    if (hw.length > 0) {
      const done = hw.filter(h => h.status === 'submitted').length;
      const pending = hw.filter(h => h.status !== 'submitted').slice(0, 3);
      context += `DEVOIRS: ${done}/${hw.length} rendus\n`;
      if (pending.length) {
        pending.forEach(h => {
          context += `  - Non rendu: ${h.homework?.subjects?.name || 'N/A'} - "${h.homework?.title || 'N/A'}" (échéance: ${h.homework?.due_date || 'N/A'})\n`;
        });
      }
      context += `\n`;
    }
  }

  // Comportement
  if (d.needsBehavior) {
    const allTracking = studentData.allTracking || studentData.tracking || [];
    if (allTracking.length > 0) {
      const phoneUse = allTracking.filter(t => t.phone_use).length;
      const sleeping = allTracking.filter(t => t.sleeping).length;
      const cahier = Math.round(allTracking.filter(t => t.cahier_present).length / allTracking.length * 100);
      const partValues = allTracking.map(t => ({ excellent: 5, good: 4, average: 3, weak: 2 })[t.participation] || 0).filter(s => s > 0);
      const partAvg = partValues.length ? Math.round(partValues.reduce((a, b) => a + b, 0) / partValues.length / 5 * 100) : null;

      context += `COMPORTEMENT (${allTracking.length} séances observées):\n`;
      if (partAvg !== null) context += `- Participation moyenne: ${partAvg}%\n`;
      context += `- Cahier présent: ${cahier}%\n`;
      if (phoneUse > 0) context += `- ⚠️ Téléphone en classe: ${phoneUse} fois\n`;
      if (sleeping > 0) context += `- ⚠️ Somnolence: ${sleeping} fois\n`;
      if (phoneUse === 0 && sleeping === 0) context += `- Aucun incident signalé ✅\n`;
      context += `\n`;
    }
  }

  // Planning/programme si demandé
  if (d.needsSchedule) {
    const sessions = (studentData.allSessions || []).slice(0, 10);
    if (sessions.length > 0) {
      const upcoming = sessions.filter(s => s.date >= new Date().toISOString().split('T')[0]).slice(0, 5);
      if (upcoming.length > 0) {
        context += `PROGRAMME À VENIR:\n`;
        upcoming.forEach(s => {
          context += `- ${s.date}: ${s.subjects?.name || 'N/A'}${s.topic ? ` — ${s.topic}` : ''}\n`;
        });
        context += `\n`;
      }
    }
  }

  return context || `Aucune donnée disponible pour ${studentInfo.first_name}.`;
}

// buildContextForAI supprimée — remplacée par buildTargetedContext (contexte ciblé par agent)
function buildContextForAI(studentInfo, studentData) {
  return buildTargetedContext(studentInfo, studentData, null);
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
export async function sendWhatsAppResponse(phoneNumber, message, schoolId) {
  try {
    // Récupérer la session API key de l'école
    const sessionApiKey = await getSchoolSessionApiKey(schoolId);
    
    if (!sessionApiKey) {
      console.error('[Chatbot] Pas de session WhatsApp active pour cette école');
      return false;
    }
    
    // Formater le numéro (supprimer le +)
    const cleanPhone = phoneNumber.replace('+', '');
    
    const sendRequest = async () => {
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

      let data;
      try {
        data = await response.json();
      } catch {
        data = { success: false, message: 'Réponse API non JSON' };
      }
      return { response, data };
    };

    let { data } = await sendRequest();

    // Retry en cas de rate limit/account protection
    for (let attempt = 0; attempt < 2 && !data?.success; attempt++) {
      const lowerMsg = String(data?.message || '').toLowerCase();
      const isRateLimited = Boolean(data?.retry_after) || lowerMsg.includes('account protection') || lowerMsg.includes('only send 1 message every 5 seconds');
      if (!isRateLimited) break;

      const retryAfterSec = Number(data?.retry_after);
      const waitMs = Math.max((Number.isFinite(retryAfterSec) ? retryAfterSec : 0) * 1000, 5000);
      console.warn(`[Chatbot] Rate limit WhatsApp, retry dans ${waitMs}ms pour ${phoneNumber}`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      ({ data } = await sendRequest());
    }

    if (data?.success) {
      console.log('[Chatbot] Message envoyé avec succès à', phoneNumber);
      return true;
    }

    console.error('[Chatbot] Erreur envoi message:', data);
    return false;
    
  } catch (error) {
    console.error('[Chatbot] Erreur envoi WhatsApp:', error);
    return false;
  }
}

/**
 * Envoyer un fichier via WhatsApp
 * @param {string} phoneNumber - Numéro de téléphone au format E.164
 * @param {string} filePath - Chemin du fichier à envoyer
 * @param {string} caption - Légende du fichier (optionnel)
 * @param {string} schoolId - ID de l'école
 * @returns {Promise<boolean>} - true si envoyé avec succès
 */
export async function sendWhatsAppFile(phoneNumber, filePath, caption, schoolId) {
  try {
    const sessionApiKey = await getSchoolSessionApiKey(schoolId);
    
    if (!sessionApiKey) {
      console.error('[WhatsApp] Pas de session WhatsApp active pour cette école');
      return false;
    }
    
    // Formater le numéro (supprimer le +)
    const cleanPhone = phoneNumber.replace('+', '');
    
    // Déterminer le type de média basé sur l'extension
    const ext = filePath.split('.').pop()?.toLowerCase();
    let mediaType = 'document';
    
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
      mediaType = 'image';
    } else if (ext === 'pdf') {
      mediaType = 'document';
    } else if (['mp4', 'avi', 'mov'].includes(ext)) {
      mediaType = 'video';
    }
    
    const FormData = (await import('form-data')).default;
    const fs = (await import('fs')).default;
    
    const formData = new FormData();
    formData.append('to', cleanPhone);
    formData.append('file', fs.createReadStream(filePath));
    if (caption) formData.append('caption', caption);
    
    const response = await fetch(`${WASENDER_BASE}/api/send-${mediaType}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionApiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    let data;
    try {
      data = await response.json();
    } catch {
      data = { success: false, message: 'Réponse API non JSON' };
    }

    if (data?.success) {
      console.log('[WhatsApp] Fichier envoyé avec succès à', phoneNumber);
      return true;
    }

    console.error('[WhatsApp] Erreur envoi fichier:', data);
    return false;
    
  } catch (error) {
    console.error('[WhatsApp] Erreur envoi fichier WhatsApp:', error);
    return false;
  }
}

// Récupérer la clé API de session pour une école
export async function getSchoolSessionApiKey(schoolId) {
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
