/**
 * Réponses prédéfinies du chatbot — toutes les données viennent de Supabase.
 * Chaque fonction prend (studentId, parentInfo) et retourne un texte WhatsApp formaté.
 *
 * AUCUN appel IA ici : 100% déterministe, basé uniquement sur les infos de l'élève.
 */

import { supabaseAdmin } from '../../../config/supabase.js';

// ─────────────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};

const fmtMoney = (n, currency = 'MAD') => {
  const v = Number(n || 0);
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency}`;
};

const scoreEmoji = (score, max = 20) => {
  const pct = (Number(score) / max) * 100;
  if (pct >= 80) return '🟢';
  if (pct >= 60) return '🔵';
  if (pct >= 50) return '🟡';
  if (pct >= 35) return '🟠';
  return '🔴';
};

const header = (title, emoji) => `*${emoji} ${title}*\n━━━━━━━━━━━━━━━━━━━`;
const footer = (schoolName) => `\n━━━━━━━━━━━━━━━━━━━\n🏫 ${schoolName || 'École'}`;
const noClassMessage = (student, parentInfo, title, emoji) =>
  `${header(title, emoji)}\n\n` +
  `ℹ️ *${student.first_name}* n'est pas encore affecté(e) à une classe.\n\n` +
  `Les données de classe seront disponibles dès que l'établissement aura effectué cette affectation.` +
  footer(parentInfo.school_name);

// ─────────────────────────────────────────────────────────────────────────
// PÉDAGOGIE
// ─────────────────────────────────────────────────────────────────────────

// Helpers pour libellés du suivi pédagogique (alignés avec la fiche "Suivi rapide" du prof)
const presenceLabel = (p) => ({
  present: '✅ Présent',
  absent: '❌ Absent',
  late: '⏰ Retard',
}[p] || '—');

const disciplineLabel = (d) => ({
  excellent: '🟢 Excellent',
  concentre: '🟢 Concentré',
  good: '🟢 Bon',
  correct: '🔵 Correct',
  agite: '🟠 Agité',
  perturbateur: '🔴 Perturbateur',
  bad: '🔴 Mauvais',
}[d] || (d ? `▫️ ${d}` : '—'));

const participationLabel = (p) => ({
  excellent: '🟢 Excellente',
  bonne: '🔵 Bonne',
  moyenne: '🟡 Moyenne',
  faible: '🟠 Faible',
  passive: '🔴 Passive',
}[p] || (p ? `▫️ ${p}` : '—'));

/** P1 — Dernier suivi (5 dernières séances renseignées par les profs) */
export async function getLastControlGrades(student, parentInfo) {
  // Note : aucune table de notes/scores avec données en prod. On affiche à la
  // place le "Suivi rapide" récent des professeurs (session_tracking), qui
  // contient présence + comportement + participation par séance.
  const { data: tracking } = await supabaseAdmin
    .from('session_tracking')
    .select(`
      presence, participation, attitude, discipline, work_status, homework, comment,
      session:sessions(date, start_time, subjects(name), profiles(first_name, last_name))
    `)
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })
    .limit(5);

  const valid = (tracking || []).filter((t) => t.session);
  if (valid.length === 0) {
    return `${header('Dernier suivi', '📝')}\n\nAucun suivi enregistré pour le moment.${footer(parentInfo.school_name)}`;
  }

  // Trier par date décroissante (le filter created_at ci-dessus peut différer
  // de la date de séance si le prof saisit en retard)
  valid.sort((a, b) => (b.session.date || '').localeCompare(a.session.date || ''));

  const lines = valid.map((t) => {
    const subj = t.session.subjects?.name || 'Séance';
    const date = fmtDate(t.session.date);
    const teacher = t.session.profiles
      ? `${t.session.profiles.first_name || ''} ${t.session.profiles.last_name || ''}`.trim()
      : '';
    let block = `*${subj}* — _${date}_${teacher ? ` (${teacher})` : ''}\n`;
    block += `   ${presenceLabel(t.presence)}`;
    if (t.participation) block += `\n   👋 Participation : ${participationLabel(t.participation)}`;
    if (t.discipline) block += `\n   🧘 Discipline : ${disciplineLabel(t.discipline)}`;
    if (t.attitude) block += `\n   🙂 Attitude : ${disciplineLabel(t.attitude)}`;
    if (t.homework) block += `\n   📚 Devoirs : ${t.homework === 'fait' ? '✅ Fait' : t.homework === 'non_fait' ? '❌ Non fait' : t.homework}`;
    if (t.comment) block += `\n   💬 _${String(t.comment).slice(0, 120)}_`;
    return block;
  });

  return `${header(`Dernier suivi — ${student.first_name}`, '📝')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** P2 — Bilan par matière (statistiques sur le suivi par matière) */
export async function getAverageBySubject(student, parentInfo) {
  const { data: tracking } = await supabaseAdmin
    .from('session_tracking')
    .select('presence, participation, discipline, session:sessions(subjects(id, name))')
    .eq('student_id', student.id)
    .limit(500);

  const valid = (tracking || []).filter((t) => t.session?.subjects);
  if (valid.length === 0) {
    return `${header('Bilan par matière', '📊')}\n\nAucune donnée de suivi disponible pour le moment.${footer(parentInfo.school_name)}`;
  }

  const bySubject = {};
  valid.forEach((t) => {
    const name = t.session.subjects.name || 'Autre';
    if (!bySubject[name]) bySubject[name] = { total: 0, present: 0, absent: 0, late: 0, goodPart: 0, goodDisc: 0 };
    const s = bySubject[name];
    s.total += 1;
    if (t.presence === 'present') s.present += 1;
    if (t.presence === 'absent') s.absent += 1;
    if (t.presence === 'late') s.late += 1;
    if (['excellent', 'bonne'].includes(t.participation)) s.goodPart += 1;
    if (['excellent', 'concentre', 'good'].includes(t.discipline)) s.goodDisc += 1;
  });

  const lines = Object.entries(bySubject)
    .sort()
    .map(([name, s]) => {
      const presPct = Math.round((s.present / s.total) * 100);
      const partPct = Math.round((s.goodPart / s.total) * 100);
      const indic = presPct >= 90 ? '🟢' : presPct >= 75 ? '🔵' : presPct >= 60 ? '🟡' : '🔴';
      let line = `${indic} *${name}* — ${s.total} séance${s.total > 1 ? 's' : ''}\n`;
      line += `   ✅ Présence : *${presPct}%*`;
      if (s.absent > 0) line += `  ❌ ${s.absent} absence${s.absent > 1 ? 's' : ''}`;
      if (s.late > 0) line += `  ⏰ ${s.late} retard${s.late > 1 ? 's' : ''}`;
      if (s.goodPart > 0) line += `\n   👋 Bonne participation : ${partPct}%`;
      return line;
    });

  // Stats globales
  const total = valid.length;
  const presentTotal = valid.filter((t) => t.presence === 'present').length;
  const globalPct = total > 0 ? Math.round((presentTotal / total) * 100) : 0;

  return `${header(`Bilan — ${student.first_name}`, '📊')}\n\n${lines.join('\n\n')}\n\n━━━━━━━━━━━━━━━━━━━\n📈 *Présence globale : ${globalPct}%* (${total} séance${total > 1 ? 's' : ''})${footer(parentInfo.school_name)}`;
}

/** P3 — Présence / absences de la semaine en cours */
export async function getWeeklyAttendance(student, parentInfo) {
  // Lundi de la semaine en cours
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // PostgREST ne permet pas de filtrer .gte/.lte sur une colonne d'une
  // relation jointe. On récupère donc le tracking + session, puis on filtre
  // côté JS sur la date de séance.
  const { data: tracking } = await supabaseAdmin
    .from('session_tracking')
    .select('presence, session:sessions(date, subjects(name))')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const mondayISO = monday.toISOString().slice(0, 10);
  const sundayISO = sunday.toISOString().slice(0, 10);
  const valid = (tracking || []).filter(
    (t) => t.session?.date && t.session.date >= mondayISO && t.session.date <= sundayISO
  );
  if (valid.length === 0) {
    return `${header('Présence cette semaine', '📅')}\n\nAucune séance enregistrée cette semaine.${footer(parentInfo.school_name)}`;
  }

  const present = valid.filter((t) => t.presence === 'present').length;
  const absent = valid.filter((t) => t.presence === 'absent').length;
  const late = valid.filter((t) => t.presence === 'late').length;
  const total = valid.length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  const absences = valid
    .filter((t) => t.presence === 'absent')
    .map((t) => `   • ${fmtDate(t.session.date)} — ${t.session.subjects?.name || 'Séance'}`);

  let body = `✅ Présent : *${present}/${total}* (${pct}%)\n`;
  if (late > 0) body += `⏰ Retards : *${late}*\n`;
  if (absent > 0) {
    body += `❌ Absences : *${absent}*\n\n_Détail des absences :_\n${absences.join('\n')}`;
  }

  return `${header(`Présence — ${student.first_name}`, '📅')}\n\n${body}${footer(parentInfo.school_name)}`;
}

/**
 * Absences en attente de justification (justified NULL) — pousse le parent à
 * justifier en répondant. La justification est ensuite traitée par l'IA
 * (voir absenceJustification.js) et la liste se met à jour automatiquement.
 */
export async function getUnjustifiedAbsences(student, parentInfo) {
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const { data: tracking } = await supabaseAdmin
    .from('session_tracking')
    .select('id, presence, justified, session:sessions!inner(date, subjects(name))')
    .eq('student_id', student.id)
    .eq('presence', 'absent')
    .is('justified', null)
    .gte('session.date', since)
    .order('created_at', { ascending: false })
    .limit(60);

  const valid = (tracking || []).filter((t) => t.session?.date);
  if (valid.length === 0) {
    return `${header('Absences à justifier', '📝')}\n\n✅ Aucune absence en attente de justification pour *${student.first_name}*. Merci !${footer(parentInfo.school_name)}`;
  }

  // Regroupement par jour
  const byDate = {};
  valid.forEach((t) => { (byDate[t.session.date] ||= []).push(t.session.subjects?.name || 'Séance'); });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  let body = `Voici les absences de *${student.first_name}* en attente de justification :\n\n`;
  dates.forEach((d) => {
    const subjects = [...new Set(byDate[d])];
    body += `📅 *${fmtDate(d)}*\n   ${subjects.map((s) => `• ${s}`).join('\n   ')}\n`;
  });
  body += `\n📝 *Pour justifier*, répondez simplement à ce message en indiquant le motif (maladie, rendez-vous médical, raison familiale…). Votre justification sera enregistrée automatiquement.`;

  return `${header('Absences à justifier', '📝')}\n\n${body}${footer(parentInfo.school_name)}`;
}

/** P4 — Devoirs à faire (homework non rendus) */
export async function getPendingHomework(student, parentInfo) {
  if (!student.class_id) {
    return noClassMessage(student, parentInfo, 'Devoirs à faire', '✍️');
  }

  const today = new Date().toISOString().slice(0, 10);
  // Inclut les devoirs en retard (90 derniers jours) + à venir (aligné avec le contexte IA)
  const thirtyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { data: hw, error: hwErr } = await supabaseAdmin
    .from('homework')
    .select(`
      id, title, description, due_date, target_type, created_at,
      homework_students(student_id),
      homework_submissions(student_id, submission_date, status)
    `)
    .eq('class_id', student.class_id)
    .gte('due_date', thirtyDaysAgo)
    .order('due_date', { ascending: true })
    .limit(20);
  if (hwErr) console.error('[chatbot] getPendingHomework error:', hwErr.message);

  const filtered = (hw || []).filter((h) => {
    if (h.target_type === 'all') return true;
    return (h.homework_students || []).some((hs) => hs.student_id === student.id);
  }).filter((h) => {
    // Pas encore rendu par cet élève (soumis = status submitted/graded)
    return !(h.homework_submissions || []).some((s) =>
      s.student_id === student.id &&
      ['submitted', 'graded'].includes(s.status)
    );
  });

  if (filtered.length === 0) {
    return `${header('Devoirs à faire', '✍️')}\n\n🎉 Aucun devoir en attente !\nVotre enfant est à jour.${footer(parentInfo.school_name)}`;
  }

  const lines = filtered.map((h) => {
    const due = fmtDate(h.due_date);
    const isOverdue = h.due_date < today;
    const desc = h.description ? `\n   _${h.description.substring(0, 100)}${h.description.length > 100 ? '…' : ''}_` : '';
    const overdueTag = isOverdue ? '\n   ⚠️ *EN RETARD*' : '';
    return `📌 *${h.title}*\n   ⏰ ${isOverdue ? 'Était dû' : 'À rendre'} : *${due}*${overdueTag}${desc}`;
  });

  return `${header(`Devoirs — ${student.first_name}`, '✍️')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** P5 — Programme de demain (cours + devoirs à rendre + contrôles) */
export async function getTodaySchedule(student, parentInfo) {
  if (!student.class_id) {
    return noClassMessage(student, parentInfo, 'Programme de demain', '📆');
  }

  const JS_TO_KEY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAY_FR = { monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' };
  const tomorrow = new Date(Date.now() + 86400000);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);
  const tomorrowKey = JS_TO_KEY[tomorrow.getDay()];
  const tomorrowFR = DAY_FR[tomorrowKey] || fmtDate(tomorrowISO);

  const parts = [];

  // ── 1. Cours de demain (sessions ponctuelles ou emploi du temps hebdo) ──
  const { data: sessions } = await supabaseAdmin
    .from('sessions')
    .select('id, topic, type, start_time, end_time, subjects(name)')
    .eq('class_id', student.class_id)
    .eq('date', tomorrowISO)
    .order('start_time', { ascending: true });

  let coursLines = [];
  if (sessions && sessions.length > 0) {
    coursLines = sessions.map((s) => {
      const time = `${(s.start_time || '').slice(0, 5)} – ${(s.end_time || '').slice(0, 5)}`;
      const typeIcon = s.type === 'control' ? '📝' : s.type === 'exam' ? '📋' : '📚';
      const topic = s.topic ? ` — _${s.topic}_` : '';
      return `${typeIcon} *${time}* — ${s.subjects?.name || 'Cours'}${topic}`;
    });
  } else {
    // Fallback emploi du temps hebdomadaire
    const { data: slots } = await supabaseAdmin
      .from('class_timetable')
      .select('start_time, end_time, slot_order, room, subject:subjects(name), teacher:profiles!class_timetable_teacher_id_fkey(first_name, last_name)')
      .eq('class_id', student.class_id)
      .eq('day_of_week', tomorrowKey)
      .order('slot_order', { ascending: true });
    if (slots && slots.length > 0) {
      coursLines = slots.map((s) => {
        const time = `${(s.start_time || '').slice(0, 5)} – ${(s.end_time || '').slice(0, 5)}`;
        const teacherName = s.teacher ? ` — _${`${s.teacher.first_name} ${s.teacher.last_name}`.trim()}_` : '';
        const room = s.room ? ` _(${s.room})_` : '';
        return `📚 *${time}* — ${s.subject?.name || 'Cours'}${teacherName}${room}`;
      });
    }
  }

  if (coursLines.length > 0) {
    parts.push(`📅 *Cours du ${tomorrowFR} :*\n${coursLines.join('\n')}`);
  } else {
    parts.push(`📅 *Cours :* Aucune séance prévue ${tomorrowFR === 'Dimanche' || tomorrowFR === 'Samedi' ? '(week-end)' : 'demain'}.`);
  }

  // ── 2. Devoirs à rendre demain ──
  const { data: hwDue } = await supabaseAdmin
    .from('homework')
    .select('id, title, description, target_type, homework_students(student_id), homework_submissions(student_id, status)')
    .eq('class_id', student.class_id)
    .eq('due_date', tomorrowISO)
    .order('created_at', { ascending: true });

  const hwFiltered = (hwDue || []).filter((h) => {
    if (h.target_type === 'all') return true;
    return (h.homework_students || []).some((hs) => hs.student_id === student.id);
  }).filter((h) => {
    return !(h.homework_submissions || []).some((s) =>
      s.student_id === student.id && ['submitted', 'graded'].includes(s.status)
    );
  });

  if (hwFiltered.length > 0) {
    const hwLines = hwFiltered.map((h) => {
      const desc = h.description ? ` — _${h.description.substring(0, 80)}_` : '';
      return `   📌 *${h.title}*${desc}`;
    });
    parts.push(`✍️ *Devoirs à rendre demain :*\n${hwLines.join('\n')}`);
  } else {
    parts.push(`✍️ *Devoirs à rendre demain :* ✅ Aucun`);
  }

  // ── 3. Contrôles prévus demain ──
  const { data: controls } = await supabaseAdmin
    .from('controls_plan')
    .select('name, date, type, subjects(name)')
    .eq('class_id', student.class_id)
    .eq('date', tomorrowISO)
    .order('created_at', { ascending: true });

  if (controls && controls.length > 0) {
    const ctrlLines = controls.map((c) => {
      const subj = c.subjects?.name || c.name || 'Contrôle';
      const type = c.type ? ` _(${c.type})_` : '';
      return `   📝 *${subj}*${type}`;
    });
    parts.push(`⚠️ *Contrôles demain :*\n${ctrlLines.join('\n')}`);
  }

  return `${header(`Programme — ${tomorrowFR} ${fmtDate(tomorrowISO)}`, '📆')}\n\n${parts.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** P6 — Documents partagés par les profs */
export async function getRecentDocuments(student, parentInfo) {
  if (!student.class_id) {
    return noClassMessage(student, parentInfo, 'Documents partagés', '📎');
  }

  // La vraie table est `teaching_documents` (l'ancienne `documents` est vide).
  const { data: docs } = await supabaseAdmin
    .from('teaching_documents')
    .select('id, title, file_name, document_type, description, created_at, subjects(name), profiles!teacher_id(first_name, last_name)')
    .eq('class_id', student.class_id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!docs || docs.length === 0) {
    return `${header('Documents partagés', '📎')}\n\nAucun document partagé pour le moment.${footer(parentInfo.school_name)}`;
  }

  const typeLabel = {
    cours: 'Cours',
    exercice: 'Exercice',
    correction: 'Correction',
    support: 'Support',
    devoir: 'Devoir',
    rattrapage: 'Rattrapage',
    approfondissement: 'Approfondissement',
  };

  const lines = docs.map((d) => {
    const teacher = d.profiles
      ? `${d.profiles.first_name || ''} ${d.profiles.last_name || ''}`.trim()
      : 'Enseignant';
    const subj = d.subjects?.name ? ` — ${d.subjects.name}` : '';
    const type = typeLabel[d.document_type] || d.document_type || 'Document';
    return `📄 *${d.title || d.file_name}*\n   � ${type}${subj}\n   👨‍🏫 ${teacher}\n   📅 ${fmtDate(d.created_at)}`;
  });

  return `${header('Documents récents', '📎')}\n\n${lines.join('\n\n')}\n\n_Connectez-vous à l'application pour les télécharger._${footer(parentInfo.school_name)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// FINANCE
// ─────────────────────────────────────────────────────────────────────────

/** F1 — Solde global (factures + paiements) */
export async function getFinanceBalance(student, parentInfo) {
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('total, amount_paid, status, due_date, currency')
    .eq('student_id', student.id)
    .neq('status', 'cancelled');

  if (!invoices || invoices.length === 0) {
    return `${header('Situation financière', '💰')}\n\nAucune facture émise pour ${student.first_name}.${footer(parentInfo.school_name)}`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const totalDue = invoices.reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid || 0)), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const totalAll = invoices.reduce((s, i) => s + Number(i.total), 0);
  const overdue = invoices.filter((i) => i.due_date && i.due_date < today && (Number(i.total) - Number(i.amount_paid || 0)) > 0);
  const overdueAmount = overdue.reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid || 0)), 0);
  const currency = invoices[0]?.currency || 'MAD';

  const status = totalDue <= 0 ? '✅ À jour' : overdueAmount > 0 ? '⚠️ Impayés en retard' : '🟡 Reste à payer';

  let body = `${status}\n\n`;
  body += `💵 Total facturé : *${fmtMoney(totalAll, currency)}*\n`;
  body += `✅ Payé : *${fmtMoney(totalPaid, currency)}*\n`;
  body += `🔴 Reste dû : *${fmtMoney(totalDue, currency)}*\n`;
  if (overdueAmount > 0) {
    body += `\n⏰ *${overdue.length} facture${overdue.length > 1 ? 's' : ''} en retard*\n`;
    body += `Montant en retard : *${fmtMoney(overdueAmount, currency)}*`;
  }

  return `${header(`Finance — ${student.first_name}`, '💰')}\n\n${body}${footer(parentInfo.school_name)}`;
}

/** F2 — Dernière facture */
export async function getLastInvoice(student, parentInfo) {
  const { data: inv } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, period_label, total, amount_paid, status, due_date, currency, created_at, lines:invoice_lines(description, amount, quantity, unit_price)')
    .eq('student_id', student.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!inv) {
    return `${header('Dernière facture', '🧾')}\n\nAucune facture émise pour ${student.first_name}.${footer(parentInfo.school_name)}`;
  }

  const remaining = Number(inv.total) - Number(inv.amount_paid || 0);
  const statusLabel = {
    issued: '🟡 Émise',
    partial: '🟠 Partiellement payée',
    paid: '✅ Payée',
    overdue: '🔴 En retard',
  }[inv.status] || inv.status;

  let body = `📋 N° *${inv.invoice_number}*\n`;
  if (inv.period_label) body += `📅 Période : *${inv.period_label}*\n`;
  body += `\n${statusLabel}\n\n`;
  body += `💵 Total : *${fmtMoney(inv.total, inv.currency)}*\n`;
  body += `✅ Payé : *${fmtMoney(inv.amount_paid, inv.currency)}*\n`;
  body += `🔴 Reste : *${fmtMoney(remaining, inv.currency)}*\n`;
  if (inv.due_date) body += `⏰ Échéance : *${fmtDate(inv.due_date)}*\n`;

  if (inv.lines && inv.lines.length > 0) {
    body += `\n*Détail :*\n`;
    inv.lines.slice(0, 6).forEach((l) => {
      body += `   • ${l.description} — ${fmtMoney(l.amount, inv.currency)}\n`;
    });
  }

  return `${header('Dernière facture', '🧾')}\n\n${body}${footer(parentInfo.school_name)}`;
}

/** F3 — Historique des 3 derniers paiements */
export async function getPaymentHistory(student, parentInfo) {
  const { data: payments } = await supabaseAdmin
    .from('payments')
    .select('receipt_number, amount, payment_date, method, status, invoice:invoices(invoice_number, period_label)')
    .eq('student_id', student.id)
    .eq('status', 'confirmed')
    .order('payment_date', { ascending: false })
    .limit(5);

  if (!payments || payments.length === 0) {
    return `${header('Historique paiements', '💳')}\n\nAucun paiement enregistré pour ${student.first_name}.${footer(parentInfo.school_name)}`;
  }

  const methodLabel = {
    cash: '💵 Espèces',
    bank_transfer: '🏦 Virement',
    check: '📝 Chèque',
    card: '💳 Carte',
    online: '🌐 En ligne',
  };

  const lines = payments.map((p) => {
    const period = p.invoice?.period_label ? ` (${p.invoice.period_label})` : '';
    return `✅ *${fmtMoney(p.amount)}* — ${fmtDate(p.payment_date)}\n   📋 Reçu N° ${p.receipt_number}${period}\n   ${methodLabel[p.method] || p.method}`;
  });

  return `${header('Derniers paiements', '💳')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** F4 — Échéancier à venir (factures non payées avec date d'échéance) */
export async function getUpcomingDueDates(student, parentInfo) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('invoice_number, period_label, total, amount_paid, due_date, status, currency')
    .eq('student_id', student.id)
    .in('status', ['issued', 'partial', 'overdue'])
    .order('due_date', { ascending: true });

  const pending = (invoices || []).filter((i) => (Number(i.total) - Number(i.amount_paid || 0)) > 0);

  if (pending.length === 0) {
    return `${header('Échéancier', '📅')}\n\n🎉 Aucun paiement en attente !\nVous êtes à jour.${footer(parentInfo.school_name)}`;
  }

  const lines = pending.map((i) => {
    const remaining = Number(i.total) - Number(i.amount_paid || 0);
    const isOverdue = i.due_date && i.due_date < today;
    const icon = isOverdue ? '🔴' : '🟡';
    const label = i.period_label || `Facture ${i.invoice_number}`;
    return `${icon} *${label}* — ${fmtMoney(remaining, i.currency)}\n   ⏰ ${isOverdue ? 'Retard depuis' : 'À régler avant'} le *${fmtDate(i.due_date)}*`;
  });

  return `${header('Échéancier à venir', '📅')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** F5 — Coordonnées de paiement de l'école */
export async function getSchoolPaymentInfo(student, parentInfo) {
  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('name, phone, email, address, payment_info')
    .eq('id', parentInfo.school_id)
    .single();

  if (!school) {
    return `${header('Coordonnées', '📞')}\n\nInformations indisponibles.`;
  }

  let body = `🏫 *${school.name}*\n`;
  if (school.address) body += `📍 ${school.address}\n`;
  if (school.phone) body += `📞 ${school.phone}\n`;
  if (school.email) body += `✉️ ${school.email}\n`;
  if (school.payment_info) {
    body += `\n*Modalités de paiement :*\n${school.payment_info}`;
  } else {
    body += `\n_Pour plus d'informations sur les modalités de paiement, contactez l'école._`;
  }

  return `${header('Contact & Paiement', '📞')}\n\n${body}${footer(school.name)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// CODE MASSAR
// ─────────────────────────────────────────────────────────────────────────

/** Code Massar (رقم التلميذ) + code secret (الرمز السري) de l'élève */
export async function getMassarCode(student, parentInfo) {
  // Re-lecture pour avoir les codes à jour (import possible après le début de session)
  const { data: s } = await supabaseAdmin
    .from('profiles')
    .select('first_name, last_name, massar_code, massar_secret')
    .eq('id', student.id)
    .single();

  const code = s?.massar_code || student.massar_code;
  const secret = s?.massar_secret || student.massar_secret;
  const name = `${s?.first_name || student.first_name || ''} ${s?.last_name || student.last_name || ''}`.trim();

  if (!code && !secret) {
    return `${header('Code Massar', '🆔')}\n\n` +
      `Le code Massar de *${name}* n'est pas encore disponible.\n\n` +
      `_Veuillez contacter l'établissement._${footer(parentInfo?.school_name)}`;
  }

  const lines = [header('Code Massar', '🆔'), '', `👶 *${name}*`];
  if (code) lines.push(`🆔 Code Massar : *${code}*`);
  if (secret) lines.push(`🔑 Code secret : *${secret}*`);
  lines.push('', '🌐 Connexion : https://massar.men.gov.ma', '', '_Conservez ces informations en lieu sûr._');
  return lines.join('\n') + footer(parentInfo?.school_name);
}

// ─────────────────────────────────────────────────────────────────────────
// BULLETINS
// ─────────────────────────────────────────────────────────────────────────

/** Résumé des bulletins publiés de l'élève */
export async function getBulletinSummary(student, parentInfo) {
  const { data: bulletins } = await supabaseAdmin
    .from('bulletins')
    .select('academic_year, semester, general_average, general_rank, total_students_in_class, mention, status')
    .eq('student_id', student.id)
    .in('status', ['published', 'sent'])
    .order('academic_year', { ascending: false })
    .order('semester', { ascending: false })
    .limit(4);

  if (!bulletins || bulletins.length === 0) {
    return `${header('Bulletins scolaires', '📄')}\n\nAucun bulletin publié pour le moment.${footer(parentInfo.school_name)}`;
  }

  const lines = bulletins.map(b => {
    const avg = b.general_average != null ? Number(b.general_average).toFixed(2) : '—';
    const rank = b.general_rank ? `${b.general_rank}/${b.total_students_in_class || '?'}` : '—';
    const emoji = b.general_average >= 14 ? '🟢' : b.general_average >= 10 ? '🟡' : '🔴';
    const mention = b.mention ? ` (${b.mention})` : '';
    return `${emoji} *${b.academic_year} — S${b.semester}*\n   📊 Moyenne : *${avg}/20*${mention}\n   🏅 Rang : *${rank}*`;
  });

  return `${header('Bulletins scolaires', '📄')}\n\n${lines.join('\n\n')}\n\n� _Le(s) bulletin(s) PDF arrivent juste après ce message._${footer(parentInfo.school_name)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// VIE SCOLAIRE (parascolaire, cahier de vie, objets perdus, sondages)
// ─────────────────────────────────────────────────────────────────────────

const catLabelActivity = (c) => ({
  club: '🎯 Club', sortie: '🚌 Sortie', evenement: '🎉 Événement',
  atelier: '🎨 Atelier', activite: '✨ Activité',
}[c] || '✨ Activité');

/** V1 — Activités parascolaires à venir (école + classe de l'élève) */
export async function getExtracurricular(student, parentInfo) {
  const todayIso = new Date().toISOString();
  const safeClass = student.class_id || '00000000-0000-0000-0000-000000000000';
  const { data } = await supabaseAdmin
    .from('extracurricular_activities')
    .select('title, description, category, location, start_date, class_id')
    .eq('school_id', parentInfo.school_id)
    .eq('is_published', true)
    .or(`class_id.is.null,class_id.eq.${safeClass}`)
    .order('start_date', { ascending: true })
    .limit(8);

  const upcoming = (data || []).filter((a) => !a.start_date || a.start_date >= todayIso);
  if (upcoming.length === 0) {
    return `${header('Vie parascolaire', '✨')}\n\nAucune activité prévue pour le moment.${footer(parentInfo.school_name)}`;
  }
  const lines = upcoming.map((a) => {
    let b = `${catLabelActivity(a.category)} — *${a.title}*`;
    if (a.start_date) b += `\n   🗓️ ${fmtDate(a.start_date)}`;
    if (a.location) b += `\n   📍 ${a.location}`;
    if (a.description) b += `\n   💬 _${String(a.description).slice(0, 100)}_`;
    return b;
  });
  return `${header('Vie parascolaire', '✨')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** V2 — Cahier de vie (dernières activités de classe + photos) */
export async function getClassroomFeed(student, parentInfo) {
  if (!student.class_id) {
    return noClassMessage(student, parentInfo, 'Cahier de vie', '📸');
  }

  const { data } = await supabaseAdmin
    .from('classroom_feed_posts')
    .select('title, content, media_urls, activity_date, created_at')
    .eq('class_id', student.class_id)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) {
    return `${header('Cahier de vie', '📸')}\n\nAucune activité partagée pour le moment.${footer(parentInfo.school_name)}`;
  }
  const lines = data.map((p) => {
    const nb = Array.isArray(p.media_urls) ? p.media_urls.length : 0;
    let b = `*${p.title || 'Activité de classe'}* — _${fmtDate(p.activity_date || p.created_at)}_`;
    if (p.content) b += `\n   ${String(p.content).slice(0, 120)}`;
    if (nb) b += `\n   📷 ${nb} photo(s)`;
    return b;
  });
  return `${header('Cahier de vie', '📸')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** Médias du cahier de vie à envoyer en pièce jointe WhatsApp (posts récents). */
export async function getClassroomFeedMedia(student, parentInfo) {
  if (!student.class_id) return [];

  const { data } = await supabaseAdmin
    .from('classroom_feed_posts')
    .select('title, media_urls, activity_date, created_at')
    .eq('class_id', student.class_id)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(3); // on n'envoie les photos que des 3 posts les plus récents
  const items = [];
  for (const p of data || []) {
    const urls = Array.isArray(p.media_urls) ? p.media_urls : [];
    for (const url of urls) {
      if (url) items.push({ title: p.title || 'Activité de classe', url });
    }
  }
  return items.slice(0, 10); // plafond de sécurité
}

/** V3 — Objets perdus (non encore rendus) */
export async function getLostItems(student, parentInfo) {
  const { data } = await supabaseAdmin
    .from('lost_items')
    .select('title, description, location_found, found_date, status')
    .eq('school_id', parentInfo.school_id)
    .neq('status', 'rendu')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!data || data.length === 0) {
    return `${header('Objets perdus', '🔍')}\n\nAucun objet signalé pour le moment.${footer(parentInfo.school_name)}`;
  }
  const lines = data.map((it) => {
    let b = `🧷 *${it.title}*`;
    if (it.location_found) b += `\n   📍 ${it.location_found}`;
    if (it.found_date) b += `\n   📅 ${fmtDate(it.found_date)}`;
    return b;
  });
  return `${header('Objets perdus', '🔍')}\n\n${lines.join('\n\n')}\n\n_Contactez l'école pour réclamer un objet._${footer(parentInfo.school_name)}`;
}

/** Objets perdus possédant une photo (pour envoi en pièce jointe WhatsApp). */
export async function getLostItemsWithPhotos(parentInfo) {
  const { data } = await supabaseAdmin
    .from('lost_items')
    .select('title, location_found, photo_url')
    .eq('school_id', parentInfo.school_id)
    .neq('status', 'rendu')
    .eq('is_published', true)
    .not('photo_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);
  return data || [];
}

/** V4 — Sondages actifs */
export async function getActivePolls(student, parentInfo) {
  const nowIso = new Date().toISOString();
  const safeClass = student.class_id || '00000000-0000-0000-0000-000000000000';
  const { data } = await supabaseAdmin
    .from('polls')
    .select('question, description, options, closes_at, class_id')
    .eq('school_id', parentInfo.school_id)
    .eq('is_active', true)
    .or(`class_id.is.null,class_id.eq.${safeClass}`)
    .order('created_at', { ascending: false })
    .limit(5);

  const active = (data || []).filter((p) => !p.closes_at || p.closes_at >= nowIso);
  if (active.length === 0) {
    return `${header('Sondages', '🗳️')}\n\nAucun sondage en cours.${footer(parentInfo.school_name)}`;
  }
  const lines = active.map((p) => {
    const opts = (p.options || []).map((o, i) => `   ${i + 1}. ${o.label}`).join('\n');
    let b = `*${p.question}*\n${opts}`;
    if (p.closes_at) b += `\n   ⏳ Clôture : ${fmtDate(p.closes_at)}`;
    return b;
  });
  return `${header('Sondages', '🗳️')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** Sondages actifs ouverts aux parents (données brutes, pour le vote WhatsApp). */
export async function getActivePollsData(student, parentInfo) {
  const nowIso = new Date().toISOString();
  const safeClass = student.class_id || '00000000-0000-0000-0000-000000000000';
  const { data } = await supabaseAdmin
    .from('polls')
    .select('id, question, options, closes_at, class_id, target_audience')
    .eq('school_id', parentInfo.school_id)
    .eq('is_active', true)
    .in('target_audience', ['parents', 'tous'])
    .or(`class_id.is.null,class_id.eq.${safeClass}`)
    .order('created_at', { ascending: false })
    .limit(5);
  return (data || []).filter((p) => !p.closes_at || p.closes_at >= nowIso);
}

/** Normalise un texte pour comparaison : minuscules, sans accents ni ponctuation. */
function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')            // accents latins combinés
    .replace(/[ؗ-ًؚ-ْـ]/g, '') // diacritiques/tatweel arabes
    .replace(/[^\p{L}\p{N}]+/gu, ' ')           // ponctuation -> espace
    .trim();
}

/**
 * Détermine l'option choisie à partir d'une saisie libre : numéro (1, 2, chiffres
 * arabes) OU texte de l'option (ex. "Oui", "non"). Renvoie l'index 0-based ou -1.
 */
export function matchPollOption(poll, text) {
  const options = poll.options || [];
  // 1) Par numéro (chiffres latins ou arabes-indiens ٠-٩)
  const digits = String(text).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).trim();
  if (/^\d+$/.test(digits)) {
    const n = parseInt(digits, 10);
    return n >= 1 && n <= options.length ? n - 1 : -1;
  }
  // 2) Par texte de l'option (égalité stricte, puis inclusion)
  const input = normalizeForMatch(text);
  if (!input) return -1;
  let idx = options.findIndex((o) => normalizeForMatch(o.label) === input);
  if (idx >= 0) return idx;
  idx = options.findIndex((o) => {
    const lab = normalizeForMatch(o.label);
    return lab && (lab.includes(input) || input.includes(lab));
  });
  return idx;
}

/** Texte de prompt de vote pour un sondage (options numérotées). */
export function formatPollPrompt(poll, position, total) {
  const opts = (poll.options || []).map((o, i) => `${i + 1}. ${o.label}`).join('\n');
  const pos = total > 1 ? `\n\n_(Sondage ${position}/${total})_` : '';
  return `🗳️ *${poll.question}*\n\n${opts}\n\n_Répondez avec le numéro de votre choix pour voter._${pos}`;
}

/**
 * Enregistre (ou met à jour) le vote d'un parent pour un sondage, puis renvoie
 * un récap avec les résultats actuels.
 */
export async function recordPollVote(poll, optionIndex, parentInfo) {
  const options = poll.options || [];
  const choice = options[optionIndex];
  if (!choice) return { ok: false, message: 'Option invalide.' };

  // Vote(s) existant(s) de ce parent pour ce sondage. On ne dépend pas de la
  // contrainte UNIQUE en base : on déduplique nous-mêmes (1 vote / parent).
  const { data: existing } = await supabaseAdmin
    .from('poll_votes')
    .select('id, option_id')
    .eq('poll_id', poll.id)
    .eq('user_id', parentInfo.parent_id);

  let action; // 'inserted' | 'updated' | 'unchanged'
  if (existing && existing.length === 1 && existing[0].option_id === choice.id) {
    // Déjà voté pour cette même option → rien à changer
    action = 'unchanged';
  } else {
    // Supprime tout vote précédent (et nettoie d'éventuels doublons) puis insère
    if (existing && existing.length > 0) {
      await supabaseAdmin
        .from('poll_votes')
        .delete()
        .eq('poll_id', poll.id)
        .eq('user_id', parentInfo.parent_id);
    }
    const { error } = await supabaseAdmin
      .from('poll_votes')
      .insert({ poll_id: poll.id, user_id: parentInfo.parent_id, option_id: choice.id });
    if (error) return { ok: false, message: error.message };
    action = existing && existing.length > 0 ? 'updated' : 'inserted';
  }

  // Décompte des votes par option pour afficher les résultats
  const { data: votes } = await supabaseAdmin
    .from('poll_votes')
    .select('option_id')
    .eq('poll_id', poll.id);
  const counts = {};
  for (const v of votes || []) counts[v.option_id] = (counts[v.option_id] || 0) + 1;
  const total = (votes || []).length || 1;
  const results = options
    .map((o) => {
      const n = counts[o.id] || 0;
      const pct = Math.round((n / total) * 100);
      return `   ${o.label} : ${n} (${pct}%)`;
    })
    .join('\n');

  const head =
    action === 'unchanged'
      ? `ℹ️ Vous avez déjà voté : *${choice.label}*`
      : action === 'updated'
        ? `🔄 Vote modifié : *${choice.label}*`
        : `✅ Vote enregistré : *${choice.label}*`;

  return { ok: true, message: `${head}\n\n📊 Résultats :\n${results}` };
}
