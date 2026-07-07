/**
 * Chatbot « Réceptionniste » — assistant IA DeepSeek au niveau ÉCOLE.
 *
 * Jumeau de ai.js, mais au lieu de répondre sur UN élève (vue parent), il
 * répond sur l'ENSEMBLE de l'école (vue direction/accueil) : effectifs,
 * assiduité, réussite, finance/trésorerie, « état de santé » global.
 *
 * Le destinataire est un numéro déclaré dans la table school_receptionists.
 * Les chiffres proviennent UNIQUEMENT des données réelles agrégées, scopées
 * sur l'année scolaire en cours.
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '../../../config/supabase.js';
import { getDefaultYearBounds, getCurrentAcademicYear } from '../../bulletins/schoolCalendar.js';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  // Conversation temps réel : mieux vaut basculer vite sur le message de
  // repli que laisser l'admin attendre (défaut SDK : 10 min).
  timeout: 45_000,
  maxRetries: 1,
});

const SYSTEM_PROMPT = `Tu es l'assistant de direction d'une école marocaine, accessible via WhatsApp à l'accueil/la réception et à la direction.

RÈGLES STRICTES :
1. Tu réponds UNIQUEMENT à partir des STATISTIQUES GLOBALES de l'école qui te sont fournies en contexte.
2. Tu n'inventes JAMAIS un chiffre. Si une donnée n'est pas dans le contexte, dis-le simplement (ex : "Cette donnée n'est pas disponible.").
3. LANGUE : Réponds OBLIGATOIREMENT dans la MÊME langue/écriture que la question.
   - Question en arabe (ou darija écrite en arabe) → réponse 100% en arabe, aucun mot français.
   - Question en français → réponse en français.
   - Question en darija latine (3robi) → réponse en darija latine.
   Ne mélange JAMAIS les langues dans une même réponse.
4. CONFIDENTIALITÉ : tu donnes des AGRÉGATS (totaux, taux, moyennes). Tu ne divulgues JAMAIS de données nominatives d'un élève, parent ou employé précis (nom, note individuelle, situation personnelle). Si on te le demande, redirige vers l'application.
5. ⚠️ ASSIDUITÉ : un *retard* (late) = élève présent. Le "taux de présence" = (présent + retard) / total. Le "taux d'absence" = absent / total. Ne compte JAMAIS un retard comme une absence.
6. Réponse COURTE, claire et structurée, avec des emojis pertinents (📊 👨‍🎓 🧑‍🏫 💰 ✅ ⚠️). Donne les chiffres exacts du contexte (avec l'unité : élèves, %, MAD).
7. Pour la finance, "reste à recouvrer" = montant dû non encore encaissé ; "taux de recouvrement" = encaissé / facturé.
8. Pour toute question hors-sujet (politique, médical, opinions, autre établissement…), redirige poliment dans la langue de l'utilisateur.
9. NE TERMINE PAS par "Tapez menu..." — un message automatique est ajouté par le système.`;

// Détecte l'écriture arabe (≥ 30 % de caractères arabes dans le texte non-vide).
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
function isArabicText(text) {
  if (!text) return false;
  const arabic = (text.match(ARABIC_RE) || []).length;
  const letters = (text.match(/[\p{L}]/gu) || []).length;
  return letters > 0 && arabic / letters >= 0.3;
}

/**
 * Récupère le réceptionniste actif correspondant à un numéro pour une école.
 * @returns {Promise<{ id, school_id, school_name, name }|null>}
 */
export async function getReceptionistByPhone(phone, schoolId = null) {
  let q = supabaseAdmin
    .from('school_receptionists')
    .select('id, school_id, name, phone_e164, active')
    .eq('phone_e164', phone)
    .eq('active', true);
  if (schoolId) q = q.eq('school_id', schoolId);
  const { data, error } = await q.limit(1);
  if (error || !data || data.length === 0) return null;

  const row = data[0];
  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('name')
    .eq('id', row.school_id)
    .maybeSingle();

  return {
    id: row.id,
    school_id: row.school_id,
    school_name: school?.name || 'École',
    name: row.name || null,
  };
}

/** Exécute une requête .in(...) par lots de 100 et concatène les lignes. */
async function fetchInChunks(table, column, values, select) {
  let rows = [];
  for (let i = 0; i < values.length; i += 100) {
    const chunk = values.slice(i, i + 100);
    const { data } = await supabaseAdmin.from(table).select(select).in(column, chunk);
    if (data) rows = rows.concat(data);
  }
  return rows;
}

/**
 * Construit le contexte factuel agrégé de l'école pour DeepSeek.
 * Tous les indicateurs sont scopés sur l'année scolaire en cours.
 */
export async function buildSchoolContext(schoolId) {
  const academicYear = getCurrentAcademicYear();
  const bounds = getDefaultYearBounds(academicYear);
  const today = new Date().toISOString().slice(0, 10);

  const ctx = { academic_year: academicYear, as_of: today };

  // ───── Effectifs ─────
  const countRole = async (role) => {
    const { count } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', role)
      .eq('school_id', schoolId);
    return count || 0;
  };
  const classesCount = async () => {
    const { count } = await supabaseAdmin
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId);
    return count || 0;
  };
  const [students, teachers, parents, classes] = await Promise.all([
    countRole('student'), countRole('teacher'), countRole('parent'), classesCount(),
  ]);
  ctx.effectifs = {
    eleves: students,
    professeurs: teachers,
    parents,
    classes,
    ratio_eleves_par_prof: teachers > 0 ? Math.round((students / teachers) * 10) / 10 : null,
  };

  // ───── Assiduité (table attendance, scopée école + année) ─────
  // Règle : un retard (late) compte comme présent pour le taux de présence.
  const { data: att } = await supabaseAdmin
    .from('attendance')
    .select('status')
    .eq('school_id', schoolId)
    .gte('date', bounds.year_start)
    .lte('date', bounds.year_end)
    .limit(50000);
  if (att && att.length) {
    const total = att.length;
    const present = att.filter((a) => a.status === 'present').length;
    const late = att.filter((a) => a.status === 'late').length;
    const absent = att.filter((a) => a.status === 'absent').length;
    const excused = att.filter((a) => a.status === 'excused').length;
    const attended = present + late;
    ctx.assiduite = {
      total_pointages: total,
      present,
      retard: late,
      absent,
      justifie: excused,
      taux_presence: Math.round((attended / total) * 1000) / 10 + '%',
      taux_absence: Math.round((absent / total) * 1000) / 10 + '%',
      note: 'Le retard (late) est compté comme présent. Taux de présence = (présent+retard)/total.',
    };
  } else {
    ctx.assiduite = { disponible: false, note: "Aucun pointage d'assiduité enregistré pour cette année." };
  }

  // ───── Classes de l'école (pour bulletins) ─────
  const { data: schoolClasses } = await supabaseAdmin
    .from('classes')
    .select('id')
    .eq('school_id', schoolId);
  const classIds = (schoolClasses || []).map((c) => c.id);

  // ───── Réussite (bulletins publiés) ─────
  if (classIds.length) {
    const bulletins = await fetchInChunks(
      'bulletins', 'class_id', classIds,
      'general_average, status, academic_year',
    );
    const published = bulletins.filter(
      (b) => (b.status === 'published' || b.status === 'sent') &&
             b.general_average != null &&
             (!b.academic_year || b.academic_year === academicYear),
    );
    if (published.length) {
      const avgs = published.map((b) => Number(b.general_average)).filter((n) => Number.isFinite(n));
      const passed = avgs.filter((a) => a >= 10).length;
      const mean = avgs.reduce((s, a) => s + a, 0) / avgs.length;
      ctx.reussite = {
        bulletins_publies: avgs.length,
        admis_moyenne_sup_10: passed,
        taux_reussite: Math.round((passed / avgs.length) * 1000) / 10 + '%',
        moyenne_generale_ecole: Math.round(mean * 100) / 100 + '/20',
      };
    } else {
      ctx.reussite = { disponible: false, note: 'Aucun bulletin publié pour cette année.' };
    }
  } else {
    ctx.reussite = { disponible: false };
  }

  // ───── Finance / trésorerie (invoices + payments, scopées école + année) ─────
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('total, amount_paid, status, due_date')
    .eq('school_id', schoolId)
    .neq('status', 'cancelled')
    .gte('issue_date', bounds.year_start)
    .lte('issue_date', bounds.year_end)
    .limit(50000);
  const inv = invoices || [];
  const billed = inv.reduce((s, r) => s + Number(r.total || 0), 0);
  const collected = inv.reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const outstanding = billed - collected;
  const overdueRows = inv.filter(
    (r) => r.due_date && r.due_date < today &&
           ['issued', 'partial', 'overdue'].includes(r.status),
  );
  const overdueAmount = overdueRows.reduce((s, r) => s + (Number(r.total || 0) - Number(r.amount_paid || 0)), 0);
  ctx.finance = {
    devise: 'MAD',
    total_facture: Math.round(billed),
    total_encaisse: Math.round(collected),
    reste_a_recouvrer: Math.round(outstanding),
    taux_recouvrement: billed > 0 ? Math.round((collected / billed) * 1000) / 10 + '%' : '0%',
    factures_en_retard: overdueRows.length,
    montant_en_retard: Math.round(overdueAmount),
  };

  // ───── Synthèse « état de santé » ─────
  ctx.etat_de_sante = {
    taux_presence: ctx.assiduite?.taux_presence ?? 'n/d',
    taux_reussite: ctx.reussite?.taux_reussite ?? 'n/d',
    taux_recouvrement: ctx.finance.taux_recouvrement,
    note: "Synthèse des 3 indicateurs clés (assiduité, réussite, recouvrement).",
  };

  return ctx;
}

/**
 * Réponse IA pour une question libre du réceptionniste sur l'école.
 */
export async function answerSchoolAI({ messageText, schoolInfo }) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return `📊 Le mode question libre est temporairement indisponible.`;
  }

  try {
    const isArabic = isArabicText(messageText);
    const schoolContext = await buildSchoolContext(schoolInfo.school_id);

    const langDirective = isArabic
      ? 'IMPORTANT: السؤال بالعربية. أجب حصراً بالعربية الفصحى، بدون أي كلمة بالفرنسية أو الإنجليزية.'
      : 'IMPORTANT : la question est en français/darija latine. Réponds dans la MÊME langue, sans aucun mot arabe.';

    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: langDirective },
        {
          role: 'system',
          // JSON compact : l'indentation multipliait les tokens du prompt sans gain
          content: `ÉCOLE : ${schoolInfo.school_name}\nSTATISTIQUES (utilise UNIQUEMENT ces données) :\n${JSON.stringify(schoolContext)}`,
        },
        { role: 'user', content: messageText },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) return `🤔 Je n'ai pas pu traiter votre question. Réessayez.`;
    return response;
  } catch (e) {
    console.error('[chatbot/adminAi] Erreur DeepSeek:', e.message);
    return `⚠️ Le service IA est temporairement indisponible. Réessayez plus tard.`;
  }
}

/** Message d'accueil + exemples, adapté à la langue. */
export function receptionistWelcome(schoolInfo, text = '') {
  if (isArabicText(text)) {
    return [
      `🏫 *مساعد إدارة ${schoolInfo.school_name}*`,
      '━━━━━━━━━━━━━━━━━━━',
      'اطرح سؤالك حول إحصائيات المدرسة، وسأجيبك بالأرقام الحقيقية.',
      '',
      'أمثلة:',
      '• كم عدد التلاميذ؟',
      '• ما هي نسبة الغياب؟',
      '• كم المبلغ المتبقي للتحصيل؟',
      '• ما هي نسبة النجاح؟',
    ].join('\n');
  }
  return [
    `🏫 *Assistant direction — ${schoolInfo.school_name}*`,
    '━━━━━━━━━━━━━━━━━━━',
    'Posez votre question sur les statistiques de l\'école, je réponds avec les chiffres réels.',
    '',
    'Exemples :',
    '• Combien d\'élèves avons-nous ?',
    '• Quel est le taux d\'absence ?',
    '• Combien reste-t-il à recouvrer ?',
    '• Quel est le taux de réussite ?',
    '• Quel est l\'état de santé de l\'école ?',
  ].join('\n');
}

/** Footer adapté à la langue. */
export function receptionistFooter(text = '') {
  if (isArabicText(text)) {
    return '_تابع طرح أسئلتك حول المدرسة._';
  }
  return '_Continuez à poser vos questions sur l\'école._';
}
