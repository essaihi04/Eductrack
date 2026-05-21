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

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
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
5. Réponse COURTE et structurée (maximum 6 lignes), avec des emojis pertinents (📊 📝 ✅ ⚠️ 🎓).
6. Pour toute question hors-sujet (politique, médical, opinions, autre élève, etc.), redirige poliment dans la langue du parent.
7. Tu ne divulgues jamais d'informations bancaires, mots de passe, ni informations sur d'autres élèves.
8. NE TERMINE PAS par "Tapez menu..." — un message automatique sera ajouté par le système.
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

/**
 * Construit un mini-contexte factuel sur l'élève à passer à DeepSeek.
 * Limité aux données strictement nécessaires (compact).
 */
async function buildStudentContext(student, parentInfo, { includeFinance = false } = {}) {
  const ctx = {
    student: {
      name: `${student.first_name} ${student.last_name}`,
      class: student.class_name || null,
    },
    school: parentInfo.school_name,
  };

  // Suivi pédagogique récent (5 dernières séances tracées par les profs)
  // C'est la VRAIE source de données : présence, comportement, participation.
  const { data: tracking } = await supabaseAdmin
    .from('session_tracking')
    .select('presence, participation, discipline, attitude, homework, comment, session:sessions(date, subjects(name))')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })
    .limit(10);
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

  // Stats globales de présence (sur les 200 dernières séances)
  const { data: allTracking } = await supabaseAdmin
    .from('session_tracking')
    .select('presence')
    .eq('student_id', student.id)
    .limit(200);
  if (allTracking?.length) {
    const total = allTracking.length;
    const present = allTracking.filter((t) => t.presence === 'present').length;
    const absent = allTracking.filter((t) => t.presence === 'absent').length;
    const late = allTracking.filter((t) => t.presence === 'late').length;
    ctx.attendance_stats = {
      total_sessions: total,
      present,
      absent,
      late,
      presence_rate: Math.round((present / total) * 100) + '%',
    };
  }

  // Devoirs en cours
  const today = new Date().toISOString().slice(0, 10);
  const { data: hw } = await supabaseAdmin
    .from('homework')
    .select('title, due_date')
    .eq('class_id', student.class_id)
    .gte('due_date', today)
    .limit(5);
  ctx.pending_homework = (hw || []).map((h) => ({ title: h.title, due: h.due_date }));

  // Solde finance (résumé) — UNIQUEMENT si la question concerne la finance.
  // Sinon on ne l'inclut PAS dans le contexte, pour éviter que l'IA ne
  // mentionne les impayés dans des réponses purement pédagogiques.
  if (includeFinance) {
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('total, amount_paid, status')
      .eq('student_id', student.id)
      .neq('status', 'cancelled');
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
    const wantsFinance = isFinanceQuery(messageText);
    const isArabic = isArabicText(messageText);
    const studentContext = await buildStudentContext(student, parentInfo, { includeFinance: wantsFinance });

    // Directive de langue forte, en plus du système — DeepSeek mélange souvent
    // les langues si on ne le martèle pas explicitement avant la question.
    const langDirective = isArabic
      ? 'IMPORTANT: السؤال بالعربية. أجب حصراً بالعربية الفصحى، بدون أي كلمة بالفرنسية أو الإنجليزية، ولا حتى "menu" أو "école".'
      : 'IMPORTANT : la question est en français/darija latine. Réponds dans la MÊME langue, sans aucun mot arabe.';

    const topicDirective = wantsFinance
      ? 'TOPIC: La question concerne la finance. Ne parle QUE de finance, ignore les données pédagogiques.'
      : 'TOPIC: La question concerne la pédagogie. Ne mentionne AUCUNE information financière (montants, factures, impayés), même brièvement.';

    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: langDirective },
        { role: 'system', content: topicDirective },
        {
          role: 'system',
          content: `DONNÉES DE L'ÉLÈVE (utilise UNIQUEMENT ces données) :\n${JSON.stringify(studentContext, null, 2)}`,
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
