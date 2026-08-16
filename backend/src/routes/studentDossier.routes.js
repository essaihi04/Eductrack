import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  aggregateAttendanceByYear,
  normalizeOfficialControlNotes,
} from '../services/studentDossierMetrics.js';

// ─────────────────────────────────────────────────────────────────────────────
// Dossier élève 360° — toutes les données d'un élève de la crèche au bac,
// pour le conseil pédagogique : parcours (interne + antérieur), notes et
// courbes, tests diagnostiques, observations des profs, contexte familial,
// et rapport détaillé généré à la demande (DeepSeek).
// Tables dédiées : ADD_STUDENT_DOSSIER.sql. Chaque section est tolérante à
// une table absente (le dossier s'affiche partiellement + indicateur).
// ─────────────────────────────────────────────────────────────────────────────

const router = express.Router();
router.use(authenticate);
// pedagogical_director / pedagogical_manager héritent (voir middleware/auth.js)
router.use(authorize('admin', 'school_admin'));

const getSchoolId = (req) => (req.user.role === 'super_admin' ? null : req.user.school_id || null);
const applySchool = (query, req, column = 'school_id') => {
  const sid = getSchoolId(req);
  return sid ? query.eq(column, sid) : query;
};

// Vérifie que l'élève appartient à l'école du demandeur. Renvoie le profil ou
// null (la réponse 404 est déjà envoyée).
const studentInScope = async (req, res, studentId) => {
  let q = supabaseAdmin.from('profiles').select('*').eq('id', studentId).eq('role', 'student');
  q = applySchool(q, req);
  const { data, error } = await q.maybeSingle();
  if (error || !data) {
    res.status(404).json({ error: 'Élève introuvable' });
    return null;
  }
  return data;
};

// Client DeepSeek paresseux (même clé que le chatbot).
let _deepseek = null;
const getDeepseek = async () => {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  if (!_deepseek) {
    const { default: OpenAI } = await import('openai');
    _deepseek = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY });
  }
  return _deepseek;
};

// ==================== AGRÉGAT COMPLET ====================

// Rassemble toutes les données du dossier. Utilisé par le GET et par le
// rapport IA (mêmes chiffres, jamais ceux du client).
async function collectDossier(req, student) {
  const id = student.id;
  const dossier = {
    missing_tables: [],
    data_quality: { unclassified_control_notes: 0 },
  };

  // Parents (nom, téléphone, profession, situation) — contexte familial de base.
  try {
    const { data: links } = await supabaseAdmin
      .from('parent_students')
      .select('relationship, parent:profiles!parent_students_parent_id_fkey(id, first_name, last_name, phone, email, profession, marital_status)')
      .eq('student_id', id);
    dossier.parents = (links || []).filter((l) => l.parent).map((l) => ({
      ...l.parent, relationship: l.relationship || null,
    }));
  } catch { dossier.parents = []; }

  // Parcours interne (inscriptions par année) + classe actuelle.
  try {
    const { data: enr } = await supabaseAdmin
      .from('student_enrollments')
      .select('academic_year, status, created_at, class:classes(id, name, level)')
      .eq('student_id', id)
      .order('academic_year', { ascending: true });
    dossier.enrollments = enr || [];
  } catch { dossier.enrollments = []; }

  if (student.class_id) {
    const { data: cls } = await supabaseAdmin
      .from('classes').select('id, name, level, filiere, academic_year').eq('id', student.class_id).maybeSingle();
    dossier.current_class = cls || null;
  }

  // Bulletins (moyennes semestrielles, rang, mentions, certification).
  try {
    const { data: bulletins } = await supabaseAdmin
      .from('bulletins')
      .select('id, academic_year, semester, general_average, general_rank, total_students_in_class, mention, cc_average, local_average, regional_average, national_average, certification_average, certification_mention')
      .eq('student_id', id)
      .order('academic_year', { ascending: true })
      .order('semester', { ascending: true });
    dossier.bulletins = bulletins || [];
    const ids = (bulletins || []).map((b) => b.id);
    dossier.bulletin_lines = [];
    if (ids.length) {
      const { data: lines } = await supabaseAdmin
        .from('bulletin_lines')
        .select('bulletin_id, subject_name, note_20, coefficient, rank_in_class, appreciation, appreciation_by_teacher')
        .in('bulletin_id', ids);
      dossier.bulletin_lines = lines || [];
    }
  } catch { dossier.bulletins = []; dossier.bulletin_lines = []; }

  // Notes de contrôles (toutes années) + appréciations des profs.
  try {
    const { data: notes } = await supabaseAdmin
      .from('control_notes')
      .select('note, appreciation, created_at, control:controls_plan!inner(date, name, class_id, subject_id, subject:subjects(name))')
      .eq('student_id', id);
    const classIds = [...new Set((notes || []).map((n) => n.control?.class_id).filter(Boolean))];
    const classMap = {};
    if (classIds.length) {
      const { data: cls } = await supabaseAdmin
        .from('classes').select('id, name, academic_year').in('id', classIds);
      (cls || []).forEach((c) => { classMap[c.id] = c; });
    }
    const normalized = normalizeOfficialControlNotes(notes || [], classMap);
    dossier.controls = normalized.controls;
    dossier.data_quality.unclassified_control_notes = normalized.unclassifiedControlNotes;
  } catch { dossier.controls = []; }

  // Examens de certification (national / régional / local, réels et blancs).
  try {
    const { data: exams } = await supabaseAdmin
      .from('exam_notes')
      .select('academic_year, level, subject_name, exam_type, scenario, note')
      .eq('student_id', id)
      .order('academic_year', { ascending: true });
    dossier.exams = exams || [];
  } catch { dossier.exams = []; }

  // Assiduité & suivi de séance, agrégés par année scolaire.
  try {
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabaseAdmin
        .from('session_tracking')
        .select('presence, mini_eval, participation, homework, discipline, attitude, sleeping, phone_use, sessions!inner(date)')
        .eq('student_id', id)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (page && page.length) rows.push(...page);
      if (!page || page.length < PAGE) break;
    }
    dossier.attendance = aggregateAttendanceByYear(rows);
  } catch { dossier.attendance = {}; }

  // Sections du dossier (nouvelles tables) — tolérantes à la migration absente.
  const grab = async (key, query) => {
    try {
      const { data, error } = await query;
      if (error) {
        if (error.code === '42P01') dossier.missing_tables.push(key);
        return null;
      }
      return data;
    } catch { return null; }
  };
  dossier.diagnostics = (await grab('diagnostic_tests', supabaseAdmin
    .from('diagnostic_tests')
    .select('id, academic_year, label, subject_name, score, max_score, mastery, test_date, notes, created_at')
    .eq('student_id', id)
    .order('test_date', { ascending: true, nullsFirst: true }))) || [];
  dossier.observations = (await grab('student_observations', supabaseAdmin
    .from('student_observations')
    .select('id, author_name, author_role, category, content, academic_year, created_at')
    .eq('student_id', id)
    .order('created_at', { ascending: false }))) || [];
  dossier.family = (await grab('student_family_info', supabaseAdmin
    .from('student_family_info')
    .select('*')
    .eq('student_id', id)
    .maybeSingle())) || null;
  dossier.external_records = (await grab('student_external_records', supabaseAdmin
    .from('student_external_records')
    .select('id, academic_year, level, school_name, general_average, mention, remarks, created_at')
    .eq('student_id', id)
    .order('academic_year', { ascending: true }))) || [];

  return dossier;
}

// GET /students/:id — dossier complet
router.get('/students/:id', async (req, res) => {
  try {
    const student = await studentInScope(req, res, req.params.id);
    if (!student) return;
    const dossier = await collectDossier(req, student);
    // On expose le profil sans champs sensibles d'auth.
    const { massar_secret, ...profile } = student;
    res.json({ student: profile, ...dossier });
  } catch (error) {
    console.error('Erreur GET dossier:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== INSERTIONS (unitaires ET en vrac) ====================

const asArray = (body) => (Array.isArray(body?.items) ? body.items : [body]);

// POST /students/:id/diagnostics — { items: [...] } ou objet seul
router.post('/students/:id/diagnostics', async (req, res) => {
  try {
    const student = await studentInScope(req, res, req.params.id);
    if (!student) return;
    const rows = asArray(req.body)
      .filter((r) => r && String(r.subject_name || '').trim())
      .map((r) => ({
        school_id: student.school_id || getSchoolId(req),
        student_id: student.id,
        academic_year: r.academic_year || null,
        label: r.label || null,
        subject_name: String(r.subject_name).trim(),
        score: r.score === '' || r.score == null ? null : Number(r.score),
        max_score: r.max_score ? Number(r.max_score) : 20,
        mastery: ['acquis', 'en_cours', 'non_acquis'].includes(r.mastery) ? r.mastery : null,
        test_date: r.test_date || null,
        notes: r.notes || null,
        created_by: req.user?.id || null,
      }));
    if (!rows.length) return res.status(400).json({ error: 'Aucune ligne valide (matière requise)' });
    const { data, error } = await supabaseAdmin.from('diagnostic_tests').insert(rows).select();
    if (error) {
      if (error.code === '42P01') return res.status(400).json({ error: 'Exécutez ADD_STUDENT_DOSSIER.sql dans Supabase' });
      throw error;
    }
    res.status(201).json({ inserted: data.length, items: data });
  } catch (error) {
    console.error('Erreur POST diagnostics:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

router.delete('/diagnostics/:id', async (req, res) => {
  try {
    let q = supabaseAdmin.from('diagnostic_tests').delete().eq('id', req.params.id);
    q = applySchool(q, req);
    const { error } = await q;
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /students/:id/observations
router.post('/students/:id/observations', async (req, res) => {
  try {
    const student = await studentInScope(req, res, req.params.id);
    if (!student) return;
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Contenu requis' });
    const cats = ['pedagogique', 'comportement', 'orientation', 'famille', 'sante', 'autre'];
    const { data, error } = await supabaseAdmin.from('student_observations').insert({
      school_id: student.school_id || getSchoolId(req),
      student_id: student.id,
      author_id: req.user?.id || null,
      author_name: [req.user?.first_name, req.user?.last_name].filter(Boolean).join(' ') || req.user?.email || null,
      author_role: req.user?.role || null,
      category: cats.includes(req.body.category) ? req.body.category : 'pedagogique',
      content,
      academic_year: req.body.academic_year || null,
    }).select().single();
    if (error) {
      if (error.code === '42P01') return res.status(400).json({ error: 'Exécutez ADD_STUDENT_DOSSIER.sql dans Supabase' });
      throw error;
    }
    res.status(201).json(data);
  } catch (error) {
    console.error('Erreur POST observation:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

router.delete('/observations/:id', async (req, res) => {
  try {
    let q = supabaseAdmin.from('student_observations').delete().eq('id', req.params.id);
    q = applySchool(q, req);
    const { error } = await q;
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /students/:id/family — upsert de l'état familial
router.put('/students/:id/family', async (req, res) => {
  try {
    const student = await studentInScope(req, res, req.params.id);
    if (!student) return;
    const b = req.body || {};
    const txt = (v) => (v == null || v === '' ? null : String(v).trim());
    const num = (v) => (v === '' || v == null ? null : parseInt(v, 10));
    const { data, error } = await supabaseAdmin.from('student_family_info').upsert({
      student_id: student.id,
      school_id: student.school_id || getSchoolId(req),
      family_status: txt(b.family_status),
      guardian: txt(b.guardian),
      siblings_count: num(b.siblings_count),
      sibling_rank: num(b.sibling_rank),
      housing: txt(b.housing),
      father_profession: txt(b.father_profession),
      mother_profession: txt(b.mother_profession),
      family_support: ['fort', 'moyen', 'faible'].includes(b.family_support) ? b.family_support : null,
      health_notes: txt(b.health_notes),
      orientation_wish: txt(b.orientation_wish),
      notes: txt(b.notes),
      updated_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id' }).select().single();
    if (error) {
      if (error.code === '42P01') return res.status(400).json({ error: 'Exécutez ADD_STUDENT_DOSSIER.sql dans Supabase' });
      throw error;
    }
    res.json(data);
  } catch (error) {
    console.error('Erreur PUT family:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// POST /students/:id/external-records — parcours antérieur, { items: [...] } ou objet seul
router.post('/students/:id/external-records', async (req, res) => {
  try {
    const student = await studentInScope(req, res, req.params.id);
    if (!student) return;
    const rows = asArray(req.body)
      .filter((r) => r && String(r.academic_year || '').trim())
      .map((r) => ({
        school_id: student.school_id || getSchoolId(req),
        student_id: student.id,
        academic_year: String(r.academic_year).trim(),
        level: r.level || null,
        school_name: r.school_name || null,
        general_average: r.general_average === '' || r.general_average == null ? null : Number(r.general_average),
        mention: r.mention || null,
        remarks: r.remarks || null,
        created_by: req.user?.id || null,
      }));
    if (!rows.length) return res.status(400).json({ error: 'Aucune ligne valide (année requise)' });
    const { data, error } = await supabaseAdmin.from('student_external_records').insert(rows).select();
    if (error) {
      if (error.code === '42P01') return res.status(400).json({ error: 'Exécutez ADD_STUDENT_DOSSIER.sql dans Supabase' });
      throw error;
    }
    res.status(201).json({ inserted: data.length, items: data });
  } catch (error) {
    console.error('Erreur POST external-records:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

router.delete('/external-records/:id', async (req, res) => {
  try {
    let q = supabaseAdmin.from('student_external_records').delete().eq('id', req.params.id);
    q = applySchool(q, req);
    const { error } = await q;
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== RAPPORT DÉTAILLÉ À LA DEMANDE (IA) ====================

// POST /students/:id/report — le serveur ré-agrège les données réelles et
// demande à DeepSeek un rapport de conseiller pédagogique structuré.
router.post('/students/:id/report', async (req, res) => {
  try {
    const student = await studentInScope(req, res, req.params.id);
    if (!student) return;
    const deepseek = await getDeepseek();
    if (!deepseek) return res.status(400).json({ error: 'Rapport IA indisponible : DEEPSEEK_API_KEY non configurée' });

    const d = await collectDossier(req, student);

    // Condensé textuel du dossier (l'IA reçoit des faits, pas des opinions).
    const L = [];
    L.push(`ÉLÈVE : ${student.first_name} ${student.last_name}${student.gender ? ` (${student.gender})` : ''}${student.date_of_birth ? `, né(e) le ${student.date_of_birth}` : ''}`);
    if (d.current_class) L.push(`Classe actuelle : ${d.current_class.name} (${d.current_class.level || '?'}${d.current_class.filiere ? ', ' + d.current_class.filiere : ''})`);
    if (d.external_records.length) {
      L.push('PARCOURS ANTÉRIEUR (avant notre école) :');
      d.external_records.forEach((r) => L.push(`  ${r.academic_year} — ${r.level || '?'}${r.school_name ? ' à ' + r.school_name : ''}${r.general_average != null ? `, moyenne ${r.general_average}/20` : ''}${r.remarks ? ` (${r.remarks})` : ''}`));
    }
    if (d.enrollments.length) {
      L.push('PARCOURS INTERNE :');
      d.enrollments.forEach((e) => L.push(`  ${e.academic_year} — ${e.class?.name || '?'} (${e.class?.level || '?'}), statut ${e.status}`));
    }
    if (d.bulletins.length) {
      L.push('BULLETINS (moyenne générale /20, rang) :');
      d.bulletins.forEach((b) => L.push(`  ${b.academic_year} S${b.semester} : ${b.general_average ?? '—'}${b.general_rank ? `, rang ${b.general_rank}/${b.total_students_in_class || '?'}` : ''}${b.mention ? `, mention ${b.mention}` : ''}${b.regional_average != null ? `, régional ${b.regional_average}` : ''}${b.national_average != null ? `, national ${b.national_average}` : ''}`));
    }
    // Moyennes par matière (bulletins puis contrôles de l'année en cours).
    const bySubjectYear = {};
    d.bulletin_lines.forEach((l) => {
      const b = d.bulletins.find((x) => x.id === l.bulletin_id);
      if (!b || l.note_20 == null) return;
      const key = `${b.academic_year}|${l.subject_name}`;
      const e = bySubjectYear[key] || (bySubjectYear[key] = { sum: 0, n: 0 });
      e.sum += Number(l.note_20); e.n++;
    });
    d.controls.forEach((c) => {
      if (!c.subject || !c.academic_year) return;
      const key = `${c.academic_year}|${c.subject}`;
      if (bySubjectYear[key]) return; // le bulletin fait foi
      const e = bySubjectYear[`ctl:${key}`] || (bySubjectYear[`ctl:${key}`] = { sum: 0, n: 0, ctl: key });
      e.sum += c.note; e.n++;
    });
    const subjLines = Object.entries(bySubjectYear).map(([k, v]) => {
      const key = v.ctl || k;
      const [year, subject] = key.split('|');
      return `  ${year} — ${subject} : ${(v.sum / v.n).toFixed(2)}/20 (${v.n} note${v.n > 1 ? 's' : ''})`;
    }).sort();
    if (subjLines.length) { L.push('MOYENNES PAR MATIÈRE :'); L.push(...subjLines); }
    if (d.diagnostics.length) {
      L.push('TESTS DIAGNOSTIQUES :');
      d.diagnostics.forEach((t) => L.push(`  ${t.test_date || t.academic_year || '?'} — ${t.subject_name}${t.label ? ` (${t.label})` : ''} : ${t.score ?? '—'}/${t.max_score ?? 20}${t.mastery ? `, ${t.mastery}` : ''}${t.notes ? ` — ${t.notes}` : ''}`));
    }
    const att = Object.entries(d.attendance);
    if (att.length) {
      L.push('ASSIDUITÉ / COMPORTEMENT (par année) :');
      att.forEach(([y, a]) => L.push(`  ${y} : ${a.absences} absences sur ${a.sessions} séances, ${a.incidents} incidents, performance ${a.performance ?? '—'}%`));
    }
    const apprecs = [
      ...d.bulletin_lines.filter((l) => l.appreciation || l.appreciation_by_teacher)
        .map((l) => `  ${l.subject_name} : ${l.appreciation || l.appreciation_by_teacher}`),
      ...d.controls.filter((c) => c.appreciation).map((c) => `  ${c.subject} (${c.date}) : ${c.appreciation}`),
    ].slice(0, 25);
    if (apprecs.length) { L.push('APPRÉCIATIONS DES PROFESSEURS :'); L.push(...apprecs); }
    if (d.observations.length) {
      L.push('OBSERVATIONS ENREGISTRÉES :');
      d.observations.slice(0, 20).forEach((o) => L.push(`  [${o.category}] ${o.created_at?.slice(0, 10)} ${o.author_name || ''} : ${o.content}`));
    }
    if (d.family) {
      const f = d.family;
      L.push(`CONTEXTE FAMILIAL : situation ${f.family_status || '—'}, tuteur ${f.guardian || '—'}, fratrie ${f.siblings_count ?? '—'} (rang ${f.sibling_rank ?? '—'}), logement ${f.housing || '—'}, père ${f.father_profession || '—'}, mère ${f.mother_profession || '—'}, soutien familial ${f.family_support || '—'}${f.health_notes ? `, santé : ${f.health_notes}` : ''}${f.orientation_wish ? `, souhait d'orientation : ${f.orientation_wish}` : ''}${f.notes ? `, notes : ${f.notes}` : ''}`);
    } else if (d.parents.length) {
      L.push(`PARENTS : ${d.parents.map((p) => `${p.first_name} ${p.last_name}${p.relationship ? ` (${p.relationship})` : ''}${p.profession ? `, ${p.profession}` : ''}`).join(' ; ')}`);
    }
    if (d.exams.length) {
      L.push('EXAMENS DE CERTIFICATION :');
      d.exams.forEach((e) => L.push(`  ${e.academic_year} ${e.exam_type}${e.scenario === 'mock' ? ' (blanc)' : ''} — ${e.subject_name} : ${e.note ?? '—'}/20`));
    }

    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      temperature: 0.3,
      max_tokens: 2600,
      messages: [
        {
          role: 'system',
          content: `Tu es conseiller pédagogique expérimenté dans une école marocaine. À partir du dossier factuel d'un élève, rédige un rapport professionnel en français, directement exploitable par la direction pédagogique et présentable aux parents.
Structure EXACTEMENT avec ces titres markdown :
## 1. Profil global
## 2. Parcours scolaire
## 3. Analyse des résultats et évolution
## 4. Points forts
## 5. Points de vigilance et faiblesses
## 6. Assiduité et comportement
## 7. Contexte familial et environnement
## 8. Recommandations d'orientation
## 9. Plan d'action proposé
Règles : appuie chaque affirmation sur les chiffres fournis (cite-les), signale explicitement les données manquantes qui aideraient l'orientation, reste bienveillant mais lucide, propose dans le plan d'action 3 à 5 mesures concrètes datées (court/moyen terme). Si le niveau de l'élève approche une année d'orientation (3AC, TC, 1BAC, 2BAC), sois précis sur les filières marocaines envisageables.`,
        },
        { role: 'user', content: L.join('\n') },
      ],
    });

    const report = completion.choices?.[0]?.message?.content || '';
    if (!report.trim()) return res.status(502).json({ error: 'Rapport vide, réessayez' });
    res.json({ report, generated_at: new Date().toISOString() });
  } catch (error) {
    console.error('Erreur POST dossier report:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

export default router;
