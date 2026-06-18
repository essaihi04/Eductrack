/**
 * Scheduler dédié aux parents ayant défini des préférences personnelles
 * de notifications WhatsApp (rapports IA).
 *
 * - S'exécute toutes les minutes.
 * - Pour chaque parent dont `preferred_time` == heure courante (Africa/Casablanca) :
 *     • daily  → envoie le rapport quotidien de chaque enfant
 *     • weekly → si aujourd'hui == weekly_day, envoie un rapport hebdo
 *                (résumé IA des 7 derniers jours)
 *
 * Les parents SANS ligne dans `parent_report_preferences` ne sont PAS gérés
 * ici — ils restent gérés par le scheduler école standard (`dailyReports.js`).
 */

import cron from 'node-cron';
import OpenAI from 'openai';
import { supabaseAdmin } from '../config/supabase.js';
import { sendText, getStatus } from './whatsapp/index.js';
import { routeNotification } from './notificationRouter.js';
import {
  collectStudentDailyData,
  calculateDailyStats,
  generateReport,
  sendReportWhatsApp,
} from './dailyReports.js';

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
});

const isSessionReady = (schoolId) => {
  if (!schoolId) return false;
  return getStatus(schoolId).connected;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers temps Africa/Casablanca
// ─────────────────────────────────────────────────────────────────────────

function nowInCasablanca() {
  const now = new Date();
  const tz = 'Africa/Casablanca';
  const hhmm = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  });
  // getDay() en zone locale du serveur ≠ Casablanca ; recalcul via Intl
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = dayMap[parts.find((p) => p.type === 'weekday')?.value] ?? now.getDay();
  const year = parts.find((p) => p.type === 'year').value;
  const month = parts.find((p) => p.type === 'month').value;
  const day = parts.find((p) => p.type === 'day').value;
  return { hhmm, weekday, dateIso: `${year}-${month}-${day}` };
}

function isoDateMinusDays(dateIso, days) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────
// Rapport hebdomadaire : agrège 7 jours et résume via DeepSeek
// ─────────────────────────────────────────────────────────────────────────

/**
 * Collecte les données des 7 derniers jours pour un élève
 * (jour J = aujourd'hui inclus, donc J-6 → J).
 * @returns {Promise<{ student, weekStart, weekEnd, dailyData: Array, aggregateStats }>}
 */
async function collectStudentWeeklyData(studentId, todayIso, schoolId) {
  const weekStart = isoDateMinusDays(todayIso, 6);
  const weekEnd = todayIso;

  // Récupère un dataset par jour (réutilise la collecte quotidienne)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = isoDateMinusDays(todayIso, i);
    const data = await collectStudentDailyData(studentId, d, schoolId);
    if (data) days.push({ date: d, data });
  }

  if (days.length === 0) return null;

  // Agrégation : moyenne pondérée des stats journalières
  let totalSessions = 0;
  let presentTotal = 0;
  const participationVals = [];
  const vigilanceVals = [];
  let homeworkTotal = 0, homeworkDone = 0;
  let cahierTotal = 0, cahierPresent = 0;
  const subjectsTouched = new Set();
  const topicsByDay = [];

  for (const { date, data } of days) {
    const tracked = data.sessions.filter((s) => s.tracking);
    totalSessions += tracked.length;
    presentTotal += tracked.filter((s) => s.tracking.presence === 'present').length;

    const partMap = { excellent: 100, bon: 80, good: 80, moyen: 60, average: 60, faible: 30, poor: 30 };
    const vigMap = { concentre: 100, excellent: 100, good: 80, moyen: 60, average: 60, distrait: 30, poor: 30 };
    for (const s of tracked) {
      const p = partMap[s.tracking.participation?.toLowerCase()];
      if (p != null) participationVals.push(p);
      const v = vigMap[s.tracking.discipline?.toLowerCase()];
      if (v != null) vigilanceVals.push(v);
      if (s.tracking.homework_done != null) {
        homeworkTotal++;
        if (s.tracking.homework_done === true) homeworkDone++;
      }
      if (s.tracking.cahier_present != null) {
        cahierTotal++;
        if (s.tracking.cahier_present === true) cahierPresent++;
      }
      if (s.subject) subjectsTouched.add(s.subject);
    }

    topicsByDay.push({
      date,
      sessions: data.sessions.map((s) => ({
        subject: s.subject,
        topic: s.topic,
        presence: s.tracking?.presence,
      })),
    });
  }

  const avg = (arr) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const aggregateStats = {
    presence_percent: totalSessions ? Math.round((presentTotal / totalSessions) * 100) : 0,
    participation_percent: avg(participationVals),
    vigilance_percent: avg(vigilanceVals),
    homework_percent: homeworkTotal ? Math.round((homeworkDone / homeworkTotal) * 100) : null,
    cahier_percent: cahierTotal ? Math.round((cahierPresent / cahierTotal) * 100) : null,
    total_sessions: totalSessions,
    present_count: presentTotal,
    homework_done: homeworkDone,
    homework_total: homeworkTotal,
    subjects_count: subjectsTouched.size,
  };

  return {
    student: days[0].data.student,
    weekStart,
    weekEnd,
    dailyData: days,
    aggregateStats,
    topicsByDay,
  };
}

function progressBar(percent) {
  if (percent == null) return '—';
  const filled = Math.max(0, Math.min(5, Math.round(percent / 20)));
  return '🟩'.repeat(filled) + '⬜'.repeat(5 - filled) + ` ${percent}%`;
}

/**
 * Génère le texte du rapport hebdomadaire via DeepSeek.
 */
async function generateWeeklyReport(weeklyData, language, settings) {
  const stats = weeklyData.aggregateStats;
  const subjectList = [...new Set(weeklyData.topicsByDay.flatMap(d => d.sessions.map(s => s.subject)))]
    .filter(Boolean)
    .slice(0, 10);

  const formatDate = (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const systemPrompt = `Tu es un conseiller pédagogique bienveillant qui rédige un RAPPORT HEBDOMADAIRE pour les parents d'élèves.

RÈGLES ABSOLUES:
- Ton NEUTRE, ENCOURAGEANT, PROFESSIONNEL.
- JAMAIS agressif, accusateur, ou culpabilisant.
- Présente les difficultés comme des "axes d'amélioration" avec solutions concrètes.
- Valorise toujours au moins un point positif.
- Le rapport doit être CONCIS (max 15 lignes par langue) — c'est une synthèse, pas un détail jour par jour.

FORMAT:
${language === 'ar' ? '- Écrire ENTIÈREMENT en arabe (standard accessible).' :
  language === 'fr' ? '- Écrire ENTIÈREMENT en français.' :
  '- Écrire d\'abord en français, puis en arabe. Séparer par une ligne "━━━━━━━━━━━━━━━".'}

STRUCTURE OBLIGATOIRE:
📅 *Rapport hebdomadaire*
📋 *Élève:* ${weeklyData.student.firstName} ${weeklyData.student.lastName}
🎓 *Classe:* ${weeklyData.student.className}
🗓️ *Période:* du ${formatDate(weeklyData.weekStart)} au ${formatDate(weeklyData.weekEnd)}

📊 *Présence:* ${progressBar(stats.presence_percent)}
🙋 *Participation:* ${progressBar(stats.participation_percent)}
👁️ *Vigilance:* ${progressBar(stats.vigilance_percent)}
${stats.homework_percent != null ? `📝 *Devoirs:* ${progressBar(stats.homework_percent)}` : ''}
${stats.cahier_percent != null ? `📓 *Cahier:* ${progressBar(stats.cahier_percent)}` : ''}

[CONTENU IA — synthèse pédagogique courte de la semaine, points forts et axes d'amélioration]

━━━━━━━━━━━━━━━━━━━━━
👥 *L'équipe pédagogique*
🏫 *${weeklyData.student.schoolName || 'École'}*

UTILISE CES ICÔNES: ✅ ❌ ⚠️ 💯 👍 🎯 ⭐ 📚 📝 📖

CONTENU À INCLURE DANS LA SYNTHÈSE:
${settings.include_chapter_info ? '- Mentionner les principaux chapitres/matières abordés' : ''}
${settings.include_homework_status ? '- Statut des devoirs sur la semaine' : ''}
${settings.include_behavior ? '- Comportement, participation, attitude générale' : ''}
${settings.include_grades ? '- Notes / évaluations si disponibles' : ''}
${settings.include_recommendations ? '- 1 à 2 recommandations CONCRÈTES pour la semaine à venir avec 🎯' : ''}
- TOUJOURS terminer par un encouragement positif.`;

  const userPrompt = `DONNÉES AGRÉGÉES DE LA SEMAINE:
- Séances suivies: ${stats.total_sessions}
- Présence: ${stats.present_count}/${stats.total_sessions} (${stats.presence_percent}%)
- Participation moyenne: ${stats.participation_percent ?? 'NE'}%
- Vigilance moyenne: ${stats.vigilance_percent ?? 'NE'}%
- Devoirs faits: ${stats.homework_done}/${stats.homework_total}
- Matières abordées: ${subjectList.join(', ') || 'Non renseigné'}

DÉTAIL PAR JOUR (matières + chapitres):
${weeklyData.topicsByDay.map(d => `\n${formatDate(d.date)}:\n${d.sessions.map(s => `  - ${s.subject}: ${s.topic || '—'} (${s.presence || 'NE'})`).join('\n')}`).join('\n')}

Rédige le rapport hebdomadaire en respectant strictement la structure et la langue demandée.`;

  try {
    const maxTokens = language === 'both' ? 1800 : 900;
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return null;

    if (language === 'both') {
      const sep = /\n\s*━{10,}\s*\n/;
      const parts = content.split(sep);
      if (parts.length >= 2) {
        return { fr: parts[0].trim(), ar: parts[1].trim() };
      }
      return { fr: content.trim(), ar: '' };
    }
    return { [language]: content.trim() };
  } catch (e) {
    console.error('[parentReportScheduler] DeepSeek weekly error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Traitement d'un parent
// ─────────────────────────────────────────────────────────────────────────

async function processParent(prefs, todayIso, weekday) {
  // 1. Récupère les enfants du parent + son numéro WhatsApp
  const { data: links } = await supabaseAdmin
    .from('parent_students')
    .select('student_id, student:profiles!parent_students_student_id_fkey(id, school_id, first_name, last_name)')
    .eq('parent_id', prefs.parent_id);

  if (!links?.length) return { sent: 0, failed: 0 };

  const { data: contacts } = await supabaseAdmin
    .from('parent_contacts')
    .select('phone_e164, is_primary')
    .eq('parent_id', prefs.parent_id)
    .eq('channel', 'whatsapp')
    .order('is_primary', { ascending: false })
    .limit(1);

  const phone = contacts?.[0]?.phone_e164;
  if (!phone) {
    console.log(`[parentReportScheduler] ⚠️ Pas de numéro WhatsApp pour parent ${prefs.parent_id}`);
    return { sent: 0, failed: 0 };
  }

  let sent = 0, failed = 0;

  for (const link of links) {
    const student = link.student;
    if (!student?.school_id) continue;
    // Note : on ne bloque plus sur la session Baileys ici. Le routage décidera
    // (push gratuit si le parent a l'app, sinon WhatsApp — Baileys OU Cloud API).

    // Récupère les settings école (langue, options de contenu)
    const { data: schoolSettings } = await supabaseAdmin
      .from('daily_report_settings')
      .select('*')
      .eq('school_id', student.school_id)
      .maybeSingle();
    if (!schoolSettings?.enabled) {
      // Rapports désactivés au niveau école → on ne force pas l'envoi
      console.log(`[parentReportScheduler] ⏭️ École ${student.school_id} a désactivé les rapports`);
      continue;
    }

    // ─── Idempotence + génération ────────────────────────────────────
    if (prefs.frequency === 'daily') {
      const { data: already } = await supabaseAdmin
        .from('daily_reports')
        .select('id')
        .eq('student_id', student.id)
        .eq('parent_id', prefs.parent_id)
        .eq('report_date', todayIso)
        .limit(1);
      if (already?.length) {
        console.log(`[parentReportScheduler] ⏭️ Rapport quotidien déjà envoyé pour ${student.id}`);
        continue;
      }

      const studentData = await collectStudentDailyData(student.id, todayIso, student.school_id);
      if (!studentData || studentData.sessions.length === 0) {
        console.log(`[parentReportScheduler] ⏭️ Aucune séance aujourd'hui pour ${student.id}`);
        continue;
      }

      const report = await generateReport(studentData, schoolSettings.language, schoolSettings);
      if (!report) { failed++; continue; }

      let msg = '';
      if (report.fr) msg += report.fr;
      if (report.fr && report.ar) msg += '\n\n━━━━━━━━━━━━━━━\n\n';
      if (report.ar) msg += report.ar;

      const routed = await routeNotification({
        parentId: prefs.parent_id,
        schoolId: student.school_id,
        phone,
        push: {
          title: `📊 Suivi de ${student.first_name}`,
          body: 'Nouveau rapport quotidien disponible. Touchez pour l\'ouvrir.',
          url: '/parent',
          tag: `report-${student.id}-${todayIso}`,
        },
        whatsappText: msg,
      });
      const waFailed = routed.channel.startsWith('whatsapp') && !routed.success;
      await supabaseAdmin.from('daily_reports').insert({
        school_id: student.school_id,
        student_id: student.id,
        parent_id: prefs.parent_id,
        phone_e164: phone,
        report_date: todayIso,
        report_content_fr: report.fr || null,
        report_content_ar: report.ar || null,
        tracking_data: studentData,
        channel: routed.channel,
        status: waFailed ? 'failed' : 'sent',
        error_message: waFailed ? 'WhatsApp échoué' : null,
        sent_at: routed.success ? new Date().toISOString() : null,
      });
      if (routed.success) sent++; else if (routed.channel !== 'optout') failed++;

    } else if (prefs.frequency === 'weekly') {
      if (prefs.weekly_day !== weekday) continue;

      const weekStart = isoDateMinusDays(todayIso, 6);
      const { data: already } = await supabaseAdmin
        .from('weekly_reports')
        .select('id')
        .eq('student_id', student.id)
        .eq('parent_id', prefs.parent_id)
        .eq('week_start', weekStart)
        .limit(1);
      if (already?.length) {
        console.log(`[parentReportScheduler] ⏭️ Rapport hebdo déjà envoyé pour ${student.id}`);
        continue;
      }

      const weeklyData = await collectStudentWeeklyData(student.id, todayIso, student.school_id);
      if (!weeklyData || weeklyData.aggregateStats.total_sessions === 0) {
        console.log(`[parentReportScheduler] ⏭️ Aucune séance cette semaine pour ${student.id}`);
        continue;
      }

      const report = await generateWeeklyReport(weeklyData, schoolSettings.language, schoolSettings);
      if (!report) { failed++; continue; }

      let msg = '';
      if (report.fr) msg += report.fr;
      if (report.fr && report.ar) msg += '\n\n━━━━━━━━━━━━━━━\n\n';
      if (report.ar) msg += report.ar;

      const routed = await routeNotification({
        parentId: prefs.parent_id,
        schoolId: student.school_id,
        phone,
        push: {
          title: `📅 Bilan hebdo de ${student.first_name}`,
          body: 'Nouveau rapport hebdomadaire disponible. Touchez pour l\'ouvrir.',
          url: '/parent',
          tag: `weekly-${student.id}-${weeklyData.weekStart}`,
        },
        whatsappText: msg,
      });
      const waFailed = routed.channel.startsWith('whatsapp') && !routed.success;
      await supabaseAdmin.from('weekly_reports').insert({
        school_id: student.school_id,
        student_id: student.id,
        parent_id: prefs.parent_id,
        phone_e164: phone,
        week_start: weeklyData.weekStart,
        week_end: weeklyData.weekEnd,
        report_content_fr: report.fr || null,
        report_content_ar: report.ar || null,
        tracking_data: weeklyData.aggregateStats,
        channel: routed.channel,
        status: waFailed ? 'failed' : 'sent',
        error_message: waFailed ? 'WhatsApp échoué' : null,
        sent_at: routed.success ? new Date().toISOString() : null,
      });
      if (routed.success) sent++; else if (routed.channel !== 'optout') failed++;
    }
  }

  return { sent, failed };
}

// ─────────────────────────────────────────────────────────────────────────
// Cron scheduler
// ─────────────────────────────────────────────────────────────────────────

let cronJob = null;

export function startParentReportScheduler() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.log('[parentReportScheduler] DEEPSEEK_API_KEY absent, scheduler désactivé.');
    return;
  }

  cronJob = cron.schedule('* * * * *', async () => {
    try {
      const { hhmm, weekday, dateIso } = nowInCasablanca();

      // Récupère les parents dont l'heure correspond
      const { data: prefs, error } = await supabaseAdmin
        .from('parent_report_preferences')
        .select('*')
        .eq('enabled', true);
      if (error) {
        console.error('[parentReportScheduler] Erreur lecture prefs:', error.message);
        return;
      }
      if (!prefs?.length) return;

      const matching = prefs.filter((p) => {
        const t = String(p.preferred_time || '').substring(0, 5);
        if (t !== hhmm) return false;
        if (p.frequency === 'weekly' && p.weekly_day !== weekday) return false;
        return true;
      });

      if (matching.length === 0) return;

      console.log(`[parentReportScheduler] ⏰ ${hhmm} → ${matching.length} parent(s) à traiter (weekday=${weekday})`);

      // Traitement séquentiel pour éviter de saturer DeepSeek + Baileys
      for (const p of matching) {
        try {
          const { sent, failed } = await processParent(p, dateIso, weekday);
          if (sent || failed) {
            console.log(`[parentReportScheduler] parent ${p.parent_id} (${p.frequency}): sent=${sent} failed=${failed}`);
          }
        } catch (e) {
          console.error(`[parentReportScheduler] erreur parent ${p.parent_id}:`, e.message);
        }
      }
    } catch (e) {
      console.error('[parentReportScheduler] Cron error:', e.message);
    }
  });

  console.log('[parentReportScheduler] Scheduler parent démarré (vérification chaque minute).');
}

export function stopParentReportScheduler() {
  if (cronJob) { cronJob.stop(); cronJob = null; }
}
