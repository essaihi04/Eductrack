import express from 'express';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { profilePhotoUpload, uploadProfilePhotoFile } from '../utils/profilePhoto.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('parent'));

// Helper: vérifier que l'enfant appartient bien au parent connecté
async function verifyChild(parentId, childId) {
  const { data, error } = await supabaseAdmin
    .from('parent_students')
    .select('student_id, relationship')
    .eq('parent_id', parentId)
    .eq('student_id', childId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

// Middleware: charge l'enfant ciblé via :childId
async function loadChild(req, res, next) {
  try {
    const { childId } = req.params;
    const link = await verifyChild(req.user.id, childId);
    if (!link) return res.status(403).json({ error: 'Accès refusé : cet élève n\'est pas votre enfant' });
    req.childId = childId;
    req.childRelationship = link.relationship;
    next();
  } catch (e) {
    console.error('[parent] loadChild error', e);
    res.status(500).json({ error: e.message });
  }
}

// ============================================================
// GET /api/parent/children — liste des enfants avec résumé
// ============================================================
router.get('/children', async (req, res) => {
  try {
    const parentId = req.user.id;

    const { data: links, error: linksErr } = await supabaseAdmin
      .from('parent_students')
      .select(`
        relationship,
        student:profiles!parent_students_student_id_fkey(
          id, first_name, last_name, avatar_url, date_of_birth, class_id,
          classes:classes!fk_profiles_class(id, name, level)
        )
      `)
      .eq('parent_id', parentId);

    if (linksErr) throw linksErr;

    const children = (links || [])
      .filter(l => l.student)
      .map(l => ({
        id: l.student.id,
        first_name: l.student.first_name,
        last_name: l.student.last_name,
        avatar_url: l.student.avatar_url,
        date_of_birth: l.student.date_of_birth,
        class: l.student.classes ? { id: l.student.classes.id, name: l.student.classes.name, level: l.student.classes.level } : null,
        relationship: l.relationship,
      }));

    // Pour chaque enfant : résumé rapide (présence, devoirs en attente)
    const summaries = await Promise.all(children.map(async (child) => {
      const [{ data: tracking }, { data: pendingHw }] = await Promise.all([
        supabaseAdmin
          .from('session_tracking')
          .select('presence')
          .eq('student_id', child.id),
        supabaseAdmin
          .from('homework')
          .select('id, due_date, target_type, homework_students(student_id), homework_submissions(student_id, status)')
          .eq('class_id', child.class?.id || '00000000-0000-0000-0000-000000000000')
      ]);

      const total = (tracking || []).length;
      const present = (tracking || []).filter(t => t.presence === 'present').length;
      const absent = (tracking || []).filter(t => t.presence === 'absent').length;
      const presenceRate = total > 0 ? Math.round((present / total) * 100) : null;

      const filteredHw = (pendingHw || []).filter(hw => {
        if (hw.target_type === 'all') return true;
        if (hw.target_type === 'group') return (hw.homework_students || []).some(hs => hs.student_id === child.id);
        return false;
      });
      const todayStr = new Date().toISOString().slice(0, 10);
      const unsubmitted = filteredHw.filter(hw => {
        const sub = (hw.homework_submissions || []).find(s => s.student_id === child.id);
        return !sub || sub.status !== 'submitted';
      });
      const overdueCount = unsubmitted.filter(hw => hw.due_date && String(hw.due_date).slice(0, 10) < todayStr).length;
      const upcomingCount = unsubmitted.length - overdueCount;

      return {
        ...child,
        summary: {
          total_sessions: total,
          present_count: present,
          absent_count: absent,
          presence_rate: presenceRate,
          pending_homework: unsubmitted.length,
          overdue_homework: overdueCount,
          upcoming_homework: upcomingCount,
        }
      };
    }));

    res.json(summaries);
  } catch (e) {
    console.error('[parent] GET /children error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/children/:childId/profile
// ============================================================
router.get('/children/:childId/profile', loadChild, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select(`
        id, first_name, last_name, avatar_url, date_of_birth, email, phone, class_id,
        classes:classes!fk_profiles_class(id, name, level)
      `)
      .eq('id', req.childId)
      .single();
    if (error) throw error;
    res.json({ ...data, relationship: req.childRelationship });
  } catch (e) {
    console.error('[parent] profile error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POST /api/parent/children/:childId/photo
// Le parent importe la photo de profil de son enfant
// ============================================================
router.post('/children/:childId/photo', loadChild, profilePhotoUpload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucune image fournie' });
    const avatar_url = await uploadProfilePhotoFile(req.file);
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url })
      .eq('id', req.childId)
      .eq('role', 'student')
      .select('id, avatar_url')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[parent] upload photo enfant error', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// ============================================================
// GET /api/parent/children/:childId/tracking-stats
// (réplique /api/students/me/tracking-stats)
// ============================================================
router.get('/children/:childId/tracking-stats', loadChild, async (req, res) => {
  try {
    const studentId = req.childId;
    const { data: tracking, error } = await supabaseAdmin
      .from('session_tracking')
      .select('presence, cahier_present, participation, homework, discipline, phone_use, writing, attitude, sessions(date)')
      .eq('student_id', studentId);
    if (error) throw error;

    const t = tracking || [];
    res.json({
      present_count: t.filter(x => x.presence === 'present').length,
      absent_count: t.filter(x => x.presence === 'absent').length,
      late_count: t.filter(x => x.presence === 'late').length,
      cahier_present_count: t.filter(x => x.cahier_present).length,
      excellent_participation: t.filter(x => x.participation === 'excellent').length,
      good_participation: t.filter(x => x.participation === 'bon').length,
      faible_participation: t.filter(x => x.participation === 'faible').length,
      homework_done: t.filter(x => x.homework === 'done').length,
      concentre_count: t.filter(x => x.discipline === 'concentre').length,
      moyen_count: t.filter(x => x.discipline === 'moyen').length,
      distrait_count: t.filter(x => x.discipline === 'distrait').length,
      correct_attitude: t.filter(x => x.attitude === 'correct').length,
      bavarre_attitude: t.filter(x => x.attitude === 'bavarre').length,
      perturbateur_attitude: t.filter(x => x.attitude === 'perturbateur').length,
      phone_use_count: t.filter(x => x.phone_use).length,
      writing_count: t.filter(x => x.writing).length,
      total_sessions: t.length,
    });
  } catch (e) {
    console.error('[parent] tracking-stats error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/children/:childId/tracking-history?limit=60
// ============================================================
router.get('/children/:childId/tracking-history', loadChild, async (req, res) => {
  try {
    const studentId = req.childId;
    const { limit = 30 } = req.query;
    const { data, error } = await supabaseAdmin
      .from('session_tracking')
      .select('*, sessions(date, subject_id, teacher_id, subjects(name))')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (error) throw error;

    const teacherIdsNeedingSubject = Array.from(new Set(
      (data || []).filter(t => !t?.sessions?.subject_id && t?.sessions?.teacher_id).map(t => t.sessions.teacher_id)
    ));
    let subjectByTeacherId = new Map();
    if (teacherIdsNeedingSubject.length) {
      const { data: ts } = await supabaseAdmin
        .from('teacher_subjects')
        .select('teacher_id, subjects(name)')
        .in('teacher_id', teacherIdsNeedingSubject);
      (ts || []).forEach(row => {
        const n = row?.subjects?.name;
        if (n && !subjectByTeacherId.has(row.teacher_id)) subjectByTeacherId.set(row.teacher_id, n);
      });
    }

    const formatted = (data || []).map(t => {
      const direct = t.sessions?.subjects?.name || null;
      const fallback = !direct && t.sessions?.teacher_id ? subjectByTeacherId.get(t.sessions.teacher_id) || null : null;
      return {
        ...t,
        session_date: t.sessions?.date,
        session_subject_id: t.sessions?.subject_id || null,
        subject_name: direct || fallback,
      };
    });
    res.json(formatted);
  } catch (e) {
    console.error('[parent] tracking-history error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/children/:childId/homework
// ============================================================
router.get('/children/:childId/homework', loadChild, async (req, res) => {
  try {
    const studentId = req.childId;
    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .single();

    if (!student?.class_id) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from('homework')
      .select(`
        *,
        classes(name, level),
        profiles(first_name, last_name),
        homework_students(student_id),
        homework_submissions(student_id, status, submission_date, grade, feedback)
      `)
      .eq('class_id', student.class_id)
      .order('due_date', { ascending: true });
    if (error) throw error;

    const filteredRaw = (data || []).filter(hw => {
      if (hw.target_type === 'all') return true;
      if (hw.target_type === 'group') return (hw.homework_students || []).some(hs => hs.student_id === studentId);
      return false;
    });

    // Déduire la matière depuis le prof qui a créé le devoir (teacher_subjects)
    // car la table homework n'a pas de colonne subject_id.
    const teacherIds = [...new Set(filteredRaw.map(h => h.created_by).filter(Boolean))];
    const subjectByTeacher = new Map();
    if (teacherIds.length > 0) {
      const { data: ts } = await supabaseAdmin
        .from('teacher_subjects')
        .select('teacher_id, subjects(name)')
        .in('teacher_id', teacherIds);
      (ts || []).forEach(row => {
        const name = row?.subjects?.name;
        if (name && !subjectByTeacher.has(row.teacher_id)) {
          subjectByTeacher.set(row.teacher_id, name);
        }
      });
    }

    const filtered = filteredRaw.map(hw => ({
      ...hw,
      subject_name: subjectByTeacher.get(hw.created_by) || null,
      homework_submissions: (hw.homework_submissions || []).filter(s => s.student_id === studentId),
    }));
    res.json(filtered);
  } catch (e) {
    console.error('[parent] homework error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/children/:childId/documents
// ============================================================
router.get('/children/:childId/documents', loadChild, async (req, res) => {
  try {
    const studentId = req.childId;
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .single();
    if (!profile?.class_id) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from('teaching_documents')
      .select(`
        *,
        classes(name, level),
        subjects(name),
        controls_plan(name),
        profiles!teaching_documents_teacher_id_fkey(first_name, last_name)
      `)
      .eq('class_id', profile.class_id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    // Statut vue / téléchargement de l'ENFANT (pas du parent)
    const docIds = (data || []).map(d => d.id);
    const viewByDoc = new Map();
    if (docIds.length > 0) {
      const { data: views } = await supabaseAdmin
        .from('document_views')
        .select('document_id, viewed_at, downloaded_at')
        .eq('student_id', studentId)
        .in('document_id', docIds);
      (views || []).forEach(v => viewByDoc.set(v.document_id, v));
    }

    const enriched = (data || []).map(d => {
      const v = viewByDoc.get(d.id);
      return {
        ...d,
        child_viewed_at: v?.viewed_at || null,
        child_downloaded_at: v?.downloaded_at || null,
      };
    });

    res.json(enriched);
  } catch (e) {
    console.error('[parent] documents error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/children/:childId/documents/:docId/download
// Téléchargement / aperçu d'un document de la classe de l'enfant.
// Query: ?inline=1 → ouvert dans le navigateur (preview), sinon attachment.
// ============================================================
router.get('/children/:childId/documents/:docId/download', loadChild, async (req, res) => {
  try {
    const { docId } = req.params;
    const studentId = req.childId;

    // Récupérer la classe de l'élève
    const { data: studentProfile } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .single();
    if (!studentProfile?.class_id) return res.status(404).json({ error: 'Classe introuvable' });

    // Récupérer le document
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('teaching_documents')
      .select('id, class_id, file_path, file_name, file_type')
      .eq('id', docId)
      .single();
    if (docErr || !doc) return res.status(404).json({ error: 'Document non trouvé' });

    // Vérifier que le document appartient bien à la classe de l'enfant
    if (doc.class_id !== studentProfile.class_id) {
      return res.status(403).json({ error: 'Accès refusé à ce document' });
    }

    const isDisk = !doc.file_path || path.isAbsolute(doc.file_path);
    if (isDisk && (!doc.file_path || !fs.existsSync(doc.file_path))) {
      return res.status(404).json({ error: 'Fichier non trouvé sur le serveur' });
    }

    const inline = req.query.inline === '1' || req.query.inline === 'true';
    const safeName = (doc.file_name || `document-${docId}`).replace(/"/g, '');
    const ext = path.extname(safeName).toLowerCase();
    const mime = doc.file_type ||
      (ext === '.pdf' ? 'application/pdf' :
       ext === '.png' ? 'image/png' :
       (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' :
       'application/octet-stream');

    res.setHeader('Content-Type', mime);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`
    );

    if (isDisk) {
      fs.createReadStream(doc.file_path).pipe(res);
    } else {
      const { downloadObject, BUCKET_PRIVATE } = await import('../utils/storage.js');
      res.send(await downloadObject(BUCKET_PRIVATE, doc.file_path));
    }
  } catch (e) {
    console.error('[parent] document download error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/children/:childId/control-grades
// (réplique /api/students/me/control-grades)
// ============================================================
router.get('/children/:childId/control-grades', loadChild, async (req, res) => {
  try {
    const studentId = req.childId;
    res.set('Cache-Control', 'no-store');

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('class_id').eq('id', studentId).single();
    if (!profile?.class_id) return res.json([]);

    const { data: controls, error: controlsError } = await supabaseAdmin
      .from('controls_plan')
      .select(`
        id, name, date, description, status, teacher_id, class_id,
        profiles!controls_plan_teacher_id_fkey(first_name, last_name),
        classes(name, level)
      `)
      .eq('class_id', profile.class_id)
      .eq('status', 'completed')
      .order('date', { ascending: false });
    if (controlsError) throw controlsError;

    const controlIds = (controls || []).map(c => c.id);
    if (!controlIds.length) return res.json([]);

    const teacherIds = Array.from(new Set((controls || []).map(c => c.teacher_id).filter(Boolean)));

    const { data: notes } = await supabaseAdmin
      .from('control_notes')
      .select('id, control_id, note, appreciation, created_at')
      .eq('student_id', studentId)
      .in('control_id', controlIds);

    const noteByControlId = new Map();
    (notes || []).forEach(n => { if (!noteByControlId.has(n.control_id)) noteByControlId.set(n.control_id, n); });

    let subjectByTeacherId = new Map();
    if (teacherIds.length) {
      const { data: ts } = await supabaseAdmin
        .from('teacher_subjects')
        .select('teacher_id, subjects(name)')
        .in('teacher_id', teacherIds);
      (ts || []).forEach(row => {
        const n = row?.subjects?.name;
        if (n && !subjectByTeacherId.has(row.teacher_id)) subjectByTeacherId.set(row.teacher_id, n);
      });
    }

    const formatted = (controls || []).map(c => {
      const note = noteByControlId.get(c.id) || null;
      const teacher = c?.profiles;
      return {
        id: c.id,
        note_id: note?.id || null,
        note: note?.note ?? null,
        appreciation: note?.appreciation ?? null,
        control_id: c.id,
        control_name: c.name,
        control_date: c.date,
        control_description: c.description,
        subject_name: subjectByTeacherId.get(c.teacher_id) || null,
        teacher_name: teacher ? `${teacher.first_name} ${teacher.last_name}` : null,
        class_name: c?.classes?.name,
        class_level: c?.classes?.level,
        created_at: note?.created_at || null,
      };
    });
    res.json(formatted);
  } catch (e) {
    console.error('[parent] control-grades error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/children/:childId/timetable
// ============================================================
router.get('/children/:childId/timetable', loadChild, async (req, res) => {
  try {
    const studentId = req.childId;
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('class_id').eq('id', studentId).single();
    if (!profile?.class_id) return res.json([]);

    const { data, error } = await supabaseAdmin
      .from('class_timetable')
      .select('id, class_id, teacher_id, day_of_week, slot_order, start_time, end_time, room, subject:subjects(id, name, code), teacher:profiles!class_timetable_teacher_id_fkey(id, first_name, last_name)')
      .eq('class_id', profile.class_id)
      .order('slot_order', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[parent] timetable error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/children/:childId/invoices
// Factures / situation financière de l'enfant (lecture seule)
// ============================================================
router.get('/children/:childId/invoices', loadChild, async (req, res) => {
  try {
    const studentId = req.childId;
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, period_label, issue_date, due_date, status, total, amount_paid, currency, lines:invoice_lines(*), payments:payments(id, amount, payment_date, method)')
      .eq('student_id', studentId)
      .order('issue_date', { ascending: false });
    if (error) throw error;

    const invoices = (data || []).map((inv) => ({
      ...inv,
      remaining: Number(inv.total || 0) - Number(inv.amount_paid || 0),
    }));
    const summary = invoices.reduce(
      (acc, inv) => {
        acc.total += Number(inv.total || 0);
        acc.paid += Number(inv.amount_paid || 0);
        acc.remaining += inv.remaining;
        return acc;
      },
      { total: 0, paid: 0, remaining: 0, count: invoices.length }
    );
    res.json({ invoices, summary });
  } catch (e) {
    console.error('[parent] invoices error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/issues
// Signalements concernant les enfants du parent connecté
// ============================================================
router.get('/issues', async (req, res) => {
  try {
    const parentId = req.user.id;
    // Enfants du parent
    const { data: links } = await supabaseAdmin
      .from('parent_students')
      .select('student_id')
      .eq('parent_id', parentId);
    const childIds = [...new Set((links || []).map((l) => l.student_id))];
    if (childIds.length === 0) return res.json([]);

    // Liaisons signalement ↔ élève pour ces enfants
    const { data: rels } = await supabaseAdmin
      .from('issue_report_students')
      .select('issue_id, student_id')
      .in('student_id', childIds);
    const issueIds = [...new Set((rels || []).map((r) => r.issue_id))];
    if (issueIds.length === 0) return res.json([]);

    const { data: issues } = await supabaseAdmin
      .from('issue_reports')
      .select('id, category, title, description, priority, status, created_at, classes(name)')
      .in('id', issueIds)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    // Nom des enfants concernés par chaque signalement
    const { data: childProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', childIds);
    const childById = Object.fromEntries((childProfiles || []).map((c) => [c.id, c]));
    const studentsByIssue = {};
    for (const r of rels || []) {
      if (!studentsByIssue[r.issue_id]) studentsByIssue[r.issue_id] = [];
      const c = childById[r.student_id];
      if (c) studentsByIssue[r.issue_id].push(`${c.first_name} ${c.last_name}`);
    }

    const result = (issues || []).map((i) => ({ ...i, children: studentsByIssue[i.id] || [] }));
    res.json(result);
  } catch (e) {
    console.error('[parent] issues error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/notifications
// Historique des notifications WhatsApp envoyées au parent connecté
// (toutes catégories : transport, pédagogique, financier, général)
// ============================================================
router.get('/notifications', async (req, res) => {
  try {
    const parentId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const category = req.query.category; // optionnel : transport | pedagogical | financial | general

    // 1) Récupérer les destinataires (recipients) liés à ce parent
    // Colonnes d'interaction (reaction / response_text) ajoutées par
    // ADD_PARENT_COMM_INTERACTION.sql. Repli sur le select de base si la
    // migration n'est pas encore appliquée (ne casse pas la page notifications).
    const baseCols = 'id, message_id, phone_e164, status, sent_at, error_message, created_at, read_at, responded_at';
    let recipients, rErr;
    ({ data: recipients, error: rErr } = await supabaseAdmin
      .from('whatsapp_message_recipients')
      .select(`${baseCols}, reaction, response_text`)
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false })
      .limit(limit));
    if (rErr) {
      ({ data: recipients, error: rErr } = await supabaseAdmin
        .from('whatsapp_message_recipients')
        .select(baseCols)
        .eq('parent_id', parentId)
        .order('created_at', { ascending: false })
        .limit(limit));
    }
    if (rErr) throw rErr;
    if (!recipients || recipients.length === 0) return res.json([]);

    // Tracking « vu » : le parent consulte sa liste de notifications dans
    // l'app → les messages affichés sont considérés comme lus (canal app).
    const unreadIds = recipients.filter(r => !r.read_at && r.status === 'sent').map(r => r.id);
    if (unreadIds.length) {
      supabaseAdmin
        .from('whatsapp_message_recipients')
        .update({ read_at: new Date().toISOString(), read_channel: 'app' })
        .in('id', unreadIds)
        .is('read_at', null)
        .then(({ error }) => { if (error) console.error('[parent] read tracking:', error.message); });
    }

    // 2) Récupérer les messages associés
    const messageIds = [...new Set(recipients.map(r => r.message_id))];
    let msgQuery = supabaseAdmin
      .from('whatsapp_messages')
      .select('id, content, message_type, media_url, file_name, category, created_at, sent_by')
      .in('id', messageIds);
    if (category) msgQuery = msgQuery.eq('category', category);
    const { data: messages, error: mErr } = await msgQuery;
    if (mErr) throw mErr;

    const messageById = new Map((messages || []).map(m => [m.id, m]));

    const result = recipients
      .map(r => {
        const m = messageById.get(r.message_id);
        if (!m) return null;
        return {
          id: r.id,
          message_id: r.message_id,
          status: r.status,
          sent_at: r.sent_at || r.created_at,
          phone: r.phone_e164,
          content: m.content,
          message_type: m.message_type,
          media_url: m.media_url,
          file_name: m.file_name,
          category: m.category || 'general',
          created_at: m.created_at,
          reaction: r.reaction || null,
          responded_at: r.responded_at || null,
          response_text: r.response_text || null,
        };
      })
      .filter(Boolean);

    res.json(result);
  } catch (e) {
    console.error('[parent] notifications error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POST /api/parent/notifications/:id/react
// Le parent aime / retire son « J'aime » sur un message reçu (canal app).
// :id = whatsapp_message_recipients.id (doit appartenir au parent connecté).
// Body: { like: boolean }
// ============================================================
router.post('/notifications/:id/react', async (req, res) => {
  try {
    const parentId = req.user.id;
    const { id } = req.params;
    const like = req.body?.like !== false; // défaut : aimer
    const reaction = like ? '👍' : null;
    // Aimer implique avoir vu le message → on marque « lu » (canal app) si besoin.
    const patch = { reaction };
    const { data, error } = await supabaseAdmin
      .from('whatsapp_message_recipients')
      .update(patch)
      .eq('id', id)
      .eq('parent_id', parentId)
      .select('id, reaction, read_at')
      .single();
    if (error) throw error;
    if (like && !data.read_at) {
      await supabaseAdmin
        .from('whatsapp_message_recipients')
        .update({ read_at: new Date().toISOString(), read_channel: 'app' })
        .eq('id', id)
        .is('read_at', null);
    }
    res.json({ success: true, reaction: data.reaction || null });
  } catch (e) {
    console.error('[parent] react error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// POST /api/parent/notifications/:id/respond
// Le parent répond par un texte depuis l'app (canal app).
// :id = whatsapp_message_recipients.id (doit appartenir au parent connecté).
// Body: { text: string }
// ============================================================
router.post('/notifications/:id/respond', async (req, res) => {
  try {
    const parentId = req.user.id;
    const { id } = req.params;
    const text = (req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Réponse vide' });
    if (text.length > 2000) return res.status(400).json({ error: 'Réponse trop longue' });
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('whatsapp_message_recipients')
      .update({
        response_text: text,
        responded_at: now,
        response_channel: 'app',
        // Répondre implique avoir vu le message
        read_at: now,
        read_channel: 'app',
      })
      .eq('id', id)
      .eq('parent_id', parentId)
      .select('id, responded_at, response_text')
      .single();
    if (error) throw error;
    res.json({ success: true, responded_at: data.responded_at, response_text: data.response_text });
  } catch (e) {
    console.error('[parent] respond error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// GET /api/parent/notification-preferences
// Renvoie les préférences WhatsApp du parent (rapports IA).
// Si aucune ligne en BDD → renvoie les valeurs par défaut.
// ============================================================
router.get('/notification-preferences', async (req, res) => {
  try {
    const parentId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('parent_report_preferences')
      .select('*')
      .eq('parent_id', parentId)
      .maybeSingle();
    if (error) throw error;

    // Heure par défaut = celle configurée par l'école (ou 18:00)
    let defaultTime = '18:00';
    try {
      const { data: links } = await supabaseAdmin
        .from('parent_students')
        .select('student:profiles!parent_students_student_id_fkey(school_id)')
        .eq('parent_id', parentId)
        .limit(1);
      const schoolId = links?.[0]?.student?.school_id;
      if (schoolId) {
        const { data: schoolSettings } = await supabaseAdmin
          .from('daily_report_settings')
          .select('send_time')
          .eq('school_id', schoolId)
          .maybeSingle();
        if (schoolSettings?.send_time) {
          defaultTime = String(schoolSettings.send_time).substring(0, 5);
        }
      }
    } catch (_) { /* ignore — fallback à 18:00 */ }

    res.json({
      preferences: data || null,
      defaults: {
        enabled: true,
        frequency: 'daily',
        weekly_day: 1, // lundi
        preferred_time: defaultTime,
      },
    });
  } catch (e) {
    console.error('[parent] get prefs error', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// PUT /api/parent/notification-preferences
// Crée ou met à jour les préférences WhatsApp du parent.
// Body : { enabled, frequency, weekly_day, preferred_time }
// ============================================================
router.put('/notification-preferences', async (req, res) => {
  try {
    const parentId = req.user.id;
    const { enabled, frequency, weekly_day, preferred_time } = req.body;

    // Validations
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" doit être un booléen' });
    }
    if (!['daily', 'weekly'].includes(frequency)) {
      return res.status(400).json({ error: '"frequency" doit être daily ou weekly' });
    }
    if (frequency === 'weekly') {
      if (!Number.isInteger(weekly_day) || weekly_day < 0 || weekly_day > 6) {
        return res.status(400).json({ error: '"weekly_day" doit être un entier entre 0 (dim) et 6 (sam)' });
      }
    }
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(String(preferred_time || ''))) {
      return res.status(400).json({ error: '"preferred_time" doit être au format HH:MM' });
    }
    // Plage horaire imposée par l'anti-ban WhatsApp (07:00 → 22:59).
    // Tout envoi en dehors serait bloqué silencieusement par sendText.
    {
      const [hh, mm] = String(preferred_time).split(':').map((n) => parseInt(n, 10));
      const minutes = hh * 60 + mm;
      if (minutes < 7 * 60 || minutes > 22 * 60 + 59) {
        return res.status(400).json({
          error: "L'heure de réception doit être comprise entre 07:00 et 22:59 (heure du Maroc). Les envois WhatsApp sont bloqués en dehors de ce créneau.",
        });
      }
    }

    const payload = {
      parent_id: parentId,
      enabled,
      frequency,
      weekly_day: frequency === 'weekly' ? weekly_day : null,
      preferred_time: String(preferred_time).substring(0, 5),
    };

    const { data, error } = await supabaseAdmin
      .from('parent_report_preferences')
      .upsert(payload, { onConflict: 'parent_id' })
      .select()
      .single();
    if (error) throw error;

    res.json({ success: true, preferences: data });
  } catch (e) {
    console.error('[parent] put prefs error', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
