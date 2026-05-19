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

/** P1 — Notes du dernier contrôle */
export async function getLastControlGrades(student, parentInfo) {
  const { data: grades } = await supabaseAdmin
    .from('control_scores')
    .select('score, max_score, control:control_plans(date, title, subjects(name))')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!grades || grades.length === 0) {
    return `${header('Dernières notes', '📝')}\n\nAucune note de contrôle enregistrée pour le moment.${footer(parentInfo.school_name)}`;
  }

  const lines = grades.map((g) => {
    const subj = g.control?.subjects?.name || g.control?.title || 'Matière';
    const date = fmtDate(g.control?.date);
    return `${scoreEmoji(g.score, g.max_score)} *${subj}* — ${g.score}/${g.max_score}\n   _${date}_`;
  });

  return `${header(`Notes de ${student.first_name}`, '📝')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** P2 — Moyenne par matière (sur tous les contrôles) */
export async function getAverageBySubject(student, parentInfo) {
  const { data: grades } = await supabaseAdmin
    .from('control_scores')
    .select('score, max_score, control:control_plans(subjects(id, name))')
    .eq('student_id', student.id);

  if (!grades || grades.length === 0) {
    return `${header('Moyennes', '📊')}\n\nAucune note disponible pour calculer une moyenne.${footer(parentInfo.school_name)}`;
  }

  const bySubject = {};
  grades.forEach((g) => {
    const name = g.control?.subjects?.name || 'Autre';
    if (!bySubject[name]) bySubject[name] = { sum: 0, max: 0, n: 0 };
    bySubject[name].sum += Number(g.score) || 0;
    bySubject[name].max += Number(g.max_score) || 20;
    bySubject[name].n += 1;
  });

  const lines = Object.entries(bySubject)
    .map(([name, s]) => {
      const avg = (s.sum / s.n).toFixed(2);
      const avg20 = ((s.sum / s.max) * 20).toFixed(2);
      return `${scoreEmoji(avg20, 20)} *${name}* — ${avg20}/20  (${s.n} note${s.n > 1 ? 's' : ''})`;
    })
    .sort();

  // Moyenne générale
  const totalSum = Object.values(bySubject).reduce((a, s) => a + s.sum, 0);
  const totalMax = Object.values(bySubject).reduce((a, s) => a + s.max, 0);
  const general = totalMax > 0 ? ((totalSum / totalMax) * 20).toFixed(2) : '—';

  return `${header(`Moyennes — ${student.first_name}`, '📊')}\n\n${lines.join('\n')}\n\n━━━━━━━━━━━━━━━━━━━\n📈 *Moyenne générale : ${general}/20*${footer(parentInfo.school_name)}`;
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

  const { data: tracking } = await supabaseAdmin
    .from('session_tracking')
    .select('present, late, absent, session:sessions(date, subjects(name))')
    .eq('student_id', student.id)
    .gte('session.date', monday.toISOString().slice(0, 10))
    .lte('session.date', sunday.toISOString().slice(0, 10));

  const valid = (tracking || []).filter((t) => t.session);
  if (valid.length === 0) {
    return `${header('Présence cette semaine', '📅')}\n\nAucune séance enregistrée cette semaine.${footer(parentInfo.school_name)}`;
  }

  const present = valid.filter((t) => t.present).length;
  const absent = valid.filter((t) => t.absent).length;
  const late = valid.filter((t) => t.late).length;
  const total = valid.length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  const absences = valid.filter((t) => t.absent).map((t) => `   • ${fmtDate(t.session.date)} — ${t.session.subjects?.name || 'Séance'}`);

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
  const { data: hw } = await supabaseAdmin
    .from('homework')
    .select(`
      id, title, description, due_date, target_type, created_at,
      homework_students!left(student_id),
      homework_submissions!left(student_id, submitted_at)
    `)
    .eq('class_id', student.class_id)
    .gte('due_date', today)
    .order('due_date', { ascending: true })
    .limit(10);

  const filtered = (hw || []).filter((h) => {
    if (h.target_type === 'all') return true;
    return (h.homework_students || []).some((hs) => hs.student_id === student.id);
  }).filter((h) => {
    // Pas encore rendu par cet élève
    return !(h.homework_submissions || []).some((s) => s.student_id === student.id && s.submitted_at);
  });

  if (filtered.length === 0) {
    return `${header('Devoirs à faire', '✍️')}\n\n🎉 Aucun devoir en attente !\nVotre enfant est à jour.${footer(parentInfo.school_name)}`;
  }

  const lines = filtered.map((h) => {
    const due = fmtDate(h.due_date);
    const desc = h.description ? `\n   _${h.description.substring(0, 100)}${h.description.length > 100 ? '…' : ''}_` : '';
    return `📌 *${h.title}*\n   ⏰ À rendre : *${due}*${desc}`;
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

  if (!sessions || sessions.length === 0) {
    return `${header('Programme du jour', '📆')}\n\nAucune séance programmée aujourd'hui.${footer(parentInfo.school_name)}`;
  }

  const lines = sessions.map((s) => {
    const time = `${(s.start_time || '').slice(0, 5)} – ${(s.end_time || '').slice(0, 5)}`;
    const typeIcon = s.type === 'control' ? '📝' : s.type === 'exam' ? '📋' : '📚';
    const topic = s.topic ? `\n   _${s.topic}_` : '';
    return `${typeIcon} *${time}* — ${s.subjects?.name || 'Séance'}${topic}`;
  });

  return `${header(`Programme du ${fmtDate(today)}`, '📆')}\n\n${lines.join('\n\n')}${footer(parentInfo.school_name)}`;
}

/** P6 — Documents partagés par les profs */
export async function getRecentDocuments(student, parentInfo) {
  const { data: docs } = await supabaseAdmin
    .from('documents')
    .select('id, title, file_name, created_at, subject:subjects(name), uploader:profiles!documents_uploaded_by_fkey(first_name, last_name)')
    .eq('class_id', student.class_id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!docs || docs.length === 0) {
    return `${header('Documents partagés', '📎')}\n\nAucun document partagé pour le moment.${footer(parentInfo.school_name)}`;
  }

  const lines = docs.map((d) => {
    const teacher = d.uploader ? `${d.uploader.first_name} ${d.uploader.last_name}` : 'Enseignant';
    return `📄 *${d.title || d.file_name}*\n   👨‍🏫 ${teacher}${d.subject?.name ? ` — ${d.subject.name}` : ''}\n   📅 ${fmtDate(d.created_at)}`;
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
    .select('invoice_number, period_label, total, amount_paid, status, due_date, currency, created_at, lines:invoice_lines(label, amount)')
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
      body += `   • ${l.label} — ${fmtMoney(l.amount, inv.currency)}\n`;
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
