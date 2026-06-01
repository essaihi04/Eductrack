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

/** P4 — Devoirs à faire (homework non rendus) */
export async function getPendingHomework(student, parentInfo) {
  const today = new Date().toISOString().slice(0, 10);
  // Inclut les devoirs en retard (90 derniers jours) + à venir (aligné avec le contexte IA)
  const thirtyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { data: hw } = await supabaseAdmin
    .from('homework')
    .select(`
      id, title, description, due_date, target_type, created_at,
      homework_students!left(student_id),
      homework_submissions!left(student_id, submitted_at, status)
    `)
    .eq('class_id', student.class_id)
    .gte('due_date', thirtyDaysAgo)
    .order('due_date', { ascending: true })
    .limit(20);

  const filtered = (hw || []).filter((h) => {
    if (h.target_type === 'all') return true;
    return (h.homework_students || []).some((hs) => hs.student_id === student.id);
  }).filter((h) => {
    // Pas encore rendu par cet élève (vérifie submitted_at ET status)
    return !(h.homework_submissions || []).some((s) =>
      s.student_id === student.id &&
      (s.submitted_at || ['submitted', 'graded'].includes(s.status))
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

/** P5 — Programme du jour */
export async function getTodaySchedule(student, parentInfo) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: sessions } = await supabaseAdmin
    .from('sessions')
    .select('id, topic, type, start_time, end_time, subjects(name)')
    .eq('class_id', student.class_id)
    .eq('date', today)
    .order('start_time', { ascending: true });

  if (sessions && sessions.length > 0) {
    const lines = sessions.map((s) => {
      const time = `${(s.start_time || '').slice(0, 5)} – ${(s.end_time || '').slice(0, 5)}`;
      const typeIcon = s.type === 'control' ? '📝' : s.type === 'exam' ? '📋' : '📚';
      const topic = s.topic ? `\n   _${s.topic}_` : '';
      return `${typeIcon} *${time}* — ${s.subjects?.name || 'Séance'}${topic}`;
    });
    return `${header(`Programme du ${fmtDate(today)}`, '📆')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
  }

  // Fallback : emploi du temps hebdomadaire (class_timetable) si pas de sessions ponctuelles
  const JS_TO_KEY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayKey = JS_TO_KEY[new Date().getDay()];
  const { data: slots } = await supabaseAdmin
    .from('class_timetable')
    .select('start_time, end_time, slot_order, room, subject:subjects(name), teacher:profiles!class_timetable_teacher_id_fkey(first_name, last_name)')
    .eq('class_id', student.class_id)
    .eq('day_of_week', todayKey)
    .order('slot_order', { ascending: true });

  if (!slots || slots.length === 0) {
    return `${header('Programme du jour', '📆')}\n\nAucune séance programmée aujourd'hui.${footer(parentInfo.school_name)}`;
  }

  const lines = slots.map((s) => {
    const time = `${(s.start_time || '').slice(0, 5)} – ${(s.end_time || '').slice(0, 5)}`;
    const teacherName = s.teacher ? ` — _${`${s.teacher.first_name} ${s.teacher.last_name}`.trim()}_` : '';
    const room = s.room ? ` _(${s.room})_` : '';
    return `📚 *${time}* — ${s.subject?.name || 'Cours'}${teacherName}${room}`;
  });

  return `${header(`Programme du ${fmtDate(today)}`, '📆')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** P6 — Documents partagés par les profs */
export async function getRecentDocuments(student, parentInfo) {
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
