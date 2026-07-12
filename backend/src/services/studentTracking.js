// ============================================================================
// Agrégat « suivi rapide » d'UN élève sur une période (session_tracking).
//
// Utilisé par la vue « Notes d'élève » (fiche élève admin) et par l'envoi du
// bulletin aux parents : présence aux séances, participation, vigilance,
// attitude, téléphone, somnolence, devoirs, cahier, mini-évaluations et
// derniers commentaires des professeurs.
//
// Normalisation : les valeurs historiques EN et FR coexistent en base
// (cf. UPDATE_TRACKING_ENUM_CONSTRAINTS.sql / UPDATE_DISCIPLINE_ATTITUDE_VALUES.sql),
// on les regroupe ici selon les mêmes règles que le dashboard comportement admin.
// ============================================================================

import { supabaseAdmin } from '../config/supabase.js';

const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

// discipline / vigilance → concentre | moyen | distrait
const normDiscipline = (v) => {
  const d = norm(v);
  if (['concentre', 'vigilant', 'excellent'].includes(d)) return 'concentre';
  if (['moyen', 'bavarre', 'good'].includes(d)) return 'moyen';
  if (['distrait', 'average', 'poor', 'perturbateur'].includes(d)) return 'distrait';
  return null;
};

// participation → faible | bon | excellent
const normParticipation = (v) => {
  const p = norm(v);
  if (['faible', 'weak'].includes(p)) return 'faible';
  if (['bon', 'good', 'medium'].includes(p)) return 'bon';
  if (p === 'excellent') return 'excellent';
  return null;
};

// attitude → correct | excellent | perturbateur
const normAttitude = (v) => {
  const a = norm(v);
  if (['correct'].includes(a)) return 'correct';
  if (['excellent', 'very_engaged'].includes(a)) return 'excellent';
  if (['perturbateur', 'disruptive'].includes(a)) return 'perturbateur';
  return null;
};

// devoirs → done | partial | not_done
const normHomework = (v) => {
  if (v === true || v === 'done') return 'done';
  if (v === 'partial') return 'partial';
  if (v === false || v === 'not_done' || v === 'missing') return 'not_done';
  return null;
};

const pct = (value, base) => (base > 0 ? Math.round((value / base) * 100) : null);

/**
 * Agrège le suivi de séance d'un élève entre deux dates (incluses).
 * Retourne null si la table n'est pas disponible (migration absente).
 */
export async function aggregateStudentTracking({ studentId, classId, start, end }) {
  let query = supabaseAdmin
    .from('session_tracking')
    .select('presence, participation, discipline, attitude, phone_use, sleeping, homework, cahier_present, mini_eval, comment, notes, sessions!inner(id, date, class_id, subject_id, tracking_options)')
    .eq('student_id', studentId)
    .gte('sessions.date', start)
    .lte('sessions.date', end);
  if (classId) query = query.eq('sessions.class_id', classId);

  const { data, error } = await query;
  if (error) {
    console.warn('[studentTracking] aggregate error:', error.message);
    return null;
  }
  // Tri par date de séance décroissante (les commentaires les plus récents d'abord)
  const rows = (data || []).sort((a, b) => String(b.sessions?.date || '').localeCompare(String(a.sessions?.date || '')));

  const t = {
    sessions_tracked: rows?.length || 0,
    presence: { present: 0, absent: 0, late: 0, excused: 0 },
    participation: { faible: 0, bon: 0, excellent: 0, tracked: 0 },
    discipline: { concentre: 0, moyen: 0, distrait: 0, tracked: 0 },
    attitude: { correct: 0, excellent: 0, perturbateur: 0, tracked: 0 },
    phone: { used: 0, tracked: 0 },
    sleeping: { count: 0, tracked: 0 },
    homework: { done: 0, partial: 0, not_done: 0, tracked: 0 },
    cahier: { present: 0, absent: 0, tracked: 0 },
    mini_eval: { count: 0, avg: null },
    comments: [],
  };
  if (!rows || rows.length === 0) return t;

  const isPresent = (p) => ['present', 'late', 'excused'].includes(p);
  let evalSum = 0;

  // Matières des séances (pour contextualiser les commentaires)
  const subjectIds = [...new Set(rows.map(r => r.sessions?.subject_id).filter(Boolean))];
  const subjectById = new Map();
  if (subjectIds.length) {
    const { data: subs } = await supabaseAdmin.from('subjects').select('id, name').in('id', subjectIds);
    (subs || []).forEach(s => subjectById.set(s.id, s.name));
  }

  for (const r of rows) {
    const opts = r.sessions?.tracking_options || {};
    const track = (key) => opts?.[key] !== false;

    // Présence : comptée sur toutes les séances suivies
    if (r.presence && t.presence[r.presence] != null) t.presence[r.presence] += 1;

    // Les autres dimensions ne comptent que si l'élève était présent à la séance
    if (!isPresent(r.presence)) continue;

    if (track('participation')) {
      const p = normParticipation(r.participation);
      if (p) { t.participation[p] += 1; t.participation.tracked += 1; }
    }
    if (track('discipline')) {
      const d = normDiscipline(r.discipline);
      if (d) { t.discipline[d] += 1; t.discipline.tracked += 1; }
    }
    if (track('attitude')) {
      const a = normAttitude(r.attitude);
      if (a) { t.attitude[a] += 1; t.attitude.tracked += 1; }
    }
    if (track('phone_use') && typeof r.phone_use === 'boolean') {
      if (r.phone_use) t.phone.used += 1;
      t.phone.tracked += 1;
    }
    if (track('sleeping') && typeof r.sleeping === 'boolean') {
      if (r.sleeping) t.sleeping.count += 1;
      t.sleeping.tracked += 1;
    }
    if (track('homework')) {
      const h = normHomework(r.homework);
      if (h) { t.homework[h] += 1; t.homework.tracked += 1; }
    }
    if (track('cahier_present') && typeof r.cahier_present === 'boolean') {
      if (r.cahier_present) t.cahier.present += 1;
      else t.cahier.absent += 1;
      t.cahier.tracked += 1;
    }
    const ev = typeof r.mini_eval === 'number' ? r.mini_eval : parseFloat(r.mini_eval);
    if (!Number.isNaN(ev)) { t.mini_eval.count += 1; evalSum += ev; }

    // Commentaires des profs (max 5, les plus récents — rows déjà triées desc)
    const text = (r.comment || r.notes || '').trim();
    if (text && t.comments.length < 5) {
      t.comments.push({
        date: r.sessions?.date || null,
        subject: subjectById.get(r.sessions?.subject_id) || null,
        text,
      });
    }
  }

  if (t.mini_eval.count > 0) t.mini_eval.avg = Math.round((evalSum / t.mini_eval.count) * 100) / 100;

  // Taux prêts à afficher
  const presTotal = t.presence.present + t.presence.absent + t.presence.late + t.presence.excused;
  t.rates = {
    presence: pct(t.presence.present + t.presence.late + t.presence.excused, presTotal),
    participation_positive: pct(t.participation.bon + t.participation.excellent, t.participation.tracked),
    discipline_concentre: pct(t.discipline.concentre, t.discipline.tracked),
    attitude_correcte: pct(t.attitude.correct + t.attitude.excellent, t.attitude.tracked),
    phone: pct(t.phone.used, t.phone.tracked),
    sleeping: pct(t.sleeping.count, t.sleeping.tracked),
    homework_done: pct(t.homework.done, t.homework.tracked),
    cahier_present: pct(t.cahier.present, t.cahier.tracked),
  };
  return t;
}

/**
 * Résumé texte du suivi (pour le bloc « Observations » du bulletin PDF et
 * les messages WhatsApp/app). Ne mentionne que les dimensions renseignées.
 */
export function trackingSummaryText(t) {
  if (!t || !t.sessions_tracked) return '';
  const parts = [];
  const presTotal = t.presence.present + t.presence.absent + t.presence.late + t.presence.excused;
  if (presTotal > 0) {
    const seg = [`présent ${t.presence.present}/${presTotal} séances`];
    if (t.presence.absent) seg.push(`${t.presence.absent} absence${t.presence.absent > 1 ? 's' : ''}`);
    if (t.presence.late) seg.push(`${t.presence.late} retard${t.presence.late > 1 ? 's' : ''}`);
    parts.push(`Assiduité : ${seg.join(', ')}`);
  }
  if (t.participation.tracked) parts.push(`Participation positive : ${t.rates.participation_positive}%`);
  if (t.discipline.tracked) parts.push(`Concentration : ${t.rates.discipline_concentre}%`);
  if (t.attitude.tracked && t.attitude.perturbateur > 0) parts.push(`Attitude perturbatrice : ${t.attitude.perturbateur} séance${t.attitude.perturbateur > 1 ? 's' : ''}`);
  if (t.phone.used > 0) parts.push(`Téléphone en classe : ${t.phone.used} fois`);
  if (t.sleeping.count > 0) parts.push(`Somnolence : ${t.sleeping.count} séance${t.sleeping.count > 1 ? 's' : ''}`);
  if (t.homework.tracked && t.homework.not_done > 0) parts.push(`Devoirs non faits : ${t.homework.not_done}`);
  if (t.cahier.tracked && t.cahier.absent > 0) parts.push(`Cahier absent : ${t.cahier.absent} fois`);
  return parts.join(' · ');
}
