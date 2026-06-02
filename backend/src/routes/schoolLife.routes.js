import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendText, sendImage, getStatus } from '../services/whatsapp/index.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────
// Upload (photos des activités / cahier de vie / objets perdus)
// ─────────────────────────────────────────────────────────────────────────
const UPLOAD_DIR = 'uploads/school-life';
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `sl-${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Seules les images sont autorisées'), ok);
  },
});
const publicUrl = (relPath) => `/${relPath.replace(/\\/g, '/')}`;
const absoluteUrl = (relUrl) => {
  const base = process.env.PUBLIC_BASE_URL || process.env.API_URL || '';
  return base ? `${base}${relUrl}` : null;
};

router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
const adminRoles = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'];

/** Récupère les téléphones WhatsApp des parents pour une liste d'élèves. */
async function getParentPhonesForStudents(studentIds) {
  if (!studentIds || studentIds.length === 0) return { parentIds: [], phones: [] };
  const { data: links } = await supabaseAdmin
    .from('parent_students')
    .select('parent_id')
    .in('student_id', studentIds);
  const parentIds = [...new Set((links || []).map((l) => l.parent_id))];
  if (parentIds.length === 0) return { parentIds: [], phones: [] };
  const { data: contacts } = await supabaseAdmin
    .from('parent_contacts')
    .select('parent_id, phone_e164, is_primary')
    .in('parent_id', parentIds);
  return { parentIds, phones: [...new Set((contacts || []).map((c) => c.phone_e164).filter(Boolean))] };
}

/** Élèves d'une classe ou de toute l'école. */
async function getStudentIds(schoolId, classId) {
  let q = supabaseAdmin.from('profiles').select('id').eq('role', 'student');
  if (classId) q = q.eq('class_id', classId);
  else if (schoolId) q = q.eq('school_id', schoolId);
  const { data } = await q;
  return (data || []).map((s) => s.id);
}

/** Crée des notifications in-app pour une liste d'utilisateurs. */
async function notifyUsers(userIds, { title, message, type = 'system', data = null }) {
  if (!userIds || userIds.length === 0) return;
  const rows = userIds.map((uid) => ({ user_id: uid, title, message, type, data }));
  try {
    await supabaseAdmin.from('notifications').insert(rows);
  } catch (e) {
    console.error('[schoolLife] notifyUsers error:', e.message);
  }
}

/** Envoi WhatsApp best-effort à une liste de téléphones (texte + image optionnelle). */
async function broadcastWhatsApp(schoolId, phones, text, imageRelUrl = null) {
  if (!schoolId || !phones || phones.length === 0) return { sent: 0 };
  try {
    if (!getStatus(schoolId).connected) return { sent: 0, reason: 'not_connected' };
  } catch {
    return { sent: 0, reason: 'not_connected' };
  }
  const imgAbs = imageRelUrl ? absoluteUrl(imageRelUrl) : null;
  let sent = 0;
  for (const phone of phones) {
    try {
      if (imgAbs) await sendImage(schoolId, phone, imgAbs, text);
      else await sendText(schoolId, phone, text);
      sent += 1;
    } catch (e) {
      console.error('[schoolLife] WhatsApp send fail', phone, e.message);
    }
  }
  return { sent };
}

const schoolFilter = (req) => req.user.school_id;

// ═══════════════════════════════════════════════════════════════════════════
// 1) PARASCOLAIRE — extracurricular_activities
// ═══════════════════════════════════════════════════════════════════════════
router.get('/activities', async (req, res) => {
  try {
    let q = supabaseAdmin
      .from('extracurricular_activities')
      .select('*, classes(name, level)')
      .order('start_date', { ascending: true, nullsFirst: false });
    if (schoolFilter(req)) q = q.eq('school_id', schoolFilter(req));
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('GET /activities', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/activities', authorize('admin', 'teacher'), upload.single('photo'), async (req, res) => {
  try {
    const { title, description, category, location, start_date, end_date, target_level, class_id, capacity, notify } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    const photo_url = req.file ? publicUrl(`${UPLOAD_DIR}/${req.file.filename}`) : null;
    const { data, error } = await supabaseAdmin
      .from('extracurricular_activities')
      .insert({
        school_id: req.user.school_id,
        title,
        description: description || null,
        category: category || 'activite',
        location: location || null,
        start_date: start_date || null,
        end_date: end_date || null,
        target_level: target_level || null,
        class_id: class_id || null,
        capacity: capacity ? Number(capacity) : null,
        photo_url,
        created_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;

    if (notify === 'true' || notify === true) {
      const studentIds = await getStudentIds(req.user.school_id, class_id || null);
      const parents = await getParentPhonesForStudents(studentIds);
      const dateStr = start_date ? new Date(start_date).toLocaleString('fr-FR') : '';
      const text = `🎉 *Nouvelle activité parascolaire*\n\n*${title}*\n${description || ''}${location ? `\n📍 ${location}` : ''}${dateStr ? `\n🗓️ ${dateStr}` : ''}`;
      await notifyUsers(parents.parentIds, { title: `Activité : ${title}`, message: description || '', type: 'message' });
      broadcastWhatsApp(req.user.school_id, parents.phones, text, photo_url).catch(() => {});
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('POST /activities', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/activities/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const fields = (({ title, description, category, location, start_date, end_date, target_level, class_id, capacity, is_published }) =>
      ({ title, description, category, location, start_date, end_date, target_level, class_id, capacity, is_published }))(req.body);
    Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
    fields.updated_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('extracurricular_activities')
      .update(fields)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('PUT /activities/:id', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/activities/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('extracurricular_activities').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/activities/:id/registrations', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('activity_registrations')
      .select('*, profiles:student_id(first_name, last_name, class_id)')
      .eq('activity_id', req.params.id);
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/activities/:id/register', async (req, res) => {
  try {
    const { student_id, note } = req.body;
    if (!student_id) return res.status(400).json({ error: 'student_id requis' });
    const { data, error } = await supabaseAdmin
      .from('activity_registrations')
      .upsert({ activity_id: req.params.id, student_id, registered_by: req.user.id, note: note || null }, { onConflict: 'activity_id,student_id' })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('POST register', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/activities/:id/register/:studentId', async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('activity_registrations')
      .delete()
      .eq('activity_id', req.params.id)
      .eq('student_id', req.params.studentId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2) MATERNELLE — cahier de vie (classroom_feed_posts)
// ═══════════════════════════════════════════════════════════════════════════
router.get('/feed', async (req, res) => {
  try {
    const { classId } = req.query;
    let q = supabaseAdmin
      .from('classroom_feed_posts')
      .select('*, classes(name, level), author:author_id(first_name, last_name)')
      .order('created_at', { ascending: false });

    if (req.user.role === 'parent') {
      // Posts des classes des enfants du parent
      const { data: links } = await supabaseAdmin
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', req.user.id);
      const studentIds = (links || []).map((l) => l.student_id);
      const { data: students } = await supabaseAdmin
        .from('profiles')
        .select('class_id')
        .in('id', studentIds.length ? studentIds : ['00000000-0000-0000-0000-000000000000']);
      const classIds = [...new Set((students || []).map((s) => s.class_id).filter(Boolean))];
      q = q.in('class_id', classIds.length ? classIds : ['00000000-0000-0000-0000-000000000000']);
    } else if (req.user.role === 'student') {
      q = q.eq('class_id', req.user.class_id || '00000000-0000-0000-0000-000000000000');
    } else {
      if (schoolFilter(req)) q = q.eq('school_id', schoolFilter(req));
      if (classId) q = q.eq('class_id', classId);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('GET /feed', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/feed', authorize('admin', 'teacher'), upload.array('photos', 10), async (req, res) => {
  try {
    const { title, content, class_id, activity_date, notify } = req.body;
    if (!class_id) return res.status(400).json({ error: 'class_id requis' });
    const media_urls = (req.files || []).map((f) => publicUrl(`${UPLOAD_DIR}/${f.filename}`));
    const { data, error } = await supabaseAdmin
      .from('classroom_feed_posts')
      .insert({
        school_id: req.user.school_id,
        class_id,
        author_id: req.user.id,
        title: title || null,
        content: content || null,
        media_urls,
        activity_date: activity_date || null,
      })
      .select()
      .single();
    if (error) throw error;

    if (notify === 'true' || notify === true) {
      const studentIds = await getStudentIds(req.user.school_id, class_id);
      const parents = await getParentPhonesForStudents(studentIds);
      const text = `📸 *Cahier de vie*\n\n*${title || 'Nouvelle activité de classe'}*\n${content || ''}${media_urls.length ? `\n\n${media_urls.length} photo(s) partagée(s).` : ''}`;
      await notifyUsers(parents.parentIds, { title: title || 'Cahier de vie', message: content || '', type: 'message' });
      broadcastWhatsApp(req.user.school_id, parents.phones, text, media_urls[0] || null).catch(() => {});
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('POST /feed', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/feed/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('classroom_feed_posts').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3) OBJETS PERDUS — lost_items
// ═══════════════════════════════════════════════════════════════════════════
router.get('/lost-items', async (req, res) => {
  try {
    let q = supabaseAdmin.from('lost_items').select('*').order('created_at', { ascending: false });
    if (schoolFilter(req)) q = q.eq('school_id', schoolFilter(req));
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/lost-items', authorize('admin', 'teacher'), upload.single('photo'), async (req, res) => {
  try {
    const { title, description, location_found, found_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    const photo_url = req.file ? publicUrl(`${UPLOAD_DIR}/${req.file.filename}`) : null;
    const { data, error } = await supabaseAdmin
      .from('lost_items')
      .insert({
        school_id: req.user.school_id,
        title,
        description: description || null,
        location_found: location_found || null,
        found_date: found_date || null,
        photo_url,
        reported_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('POST /lost-items', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/lost-items/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { status, claimed_by } = req.body;
    const fields = { updated_at: new Date().toISOString() };
    if (status) fields.status = status;
    if (claimed_by !== undefined) fields.claimed_by = claimed_by || null;
    const { data, error } = await supabaseAdmin.from('lost_items').update(fields).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/lost-items/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('lost_items').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4) SONDAGES — polls / poll_votes
// ═══════════════════════════════════════════════════════════════════════════
router.get('/polls', async (req, res) => {
  try {
    let q = supabaseAdmin.from('polls').select('*').order('created_at', { ascending: false });
    if (schoolFilter(req)) q = q.eq('school_id', schoolFilter(req));
    const { data: polls, error } = await q;
    if (error) throw error;

    // Joindre le vote de l'utilisateur courant + compteurs
    const pollIds = (polls || []).map((p) => p.id);
    let votes = [];
    if (pollIds.length) {
      const { data: v } = await supabaseAdmin.from('poll_votes').select('poll_id, option_id, user_id').in('poll_id', pollIds);
      votes = v || [];
    }
    const enriched = (polls || []).map((p) => {
      const pv = votes.filter((x) => x.poll_id === p.id);
      const counts = {};
      pv.forEach((x) => { counts[x.option_id] = (counts[x.option_id] || 0) + 1; });
      const myVote = pv.find((x) => x.user_id === req.user.id);
      return { ...p, vote_counts: counts, total_votes: pv.length, my_vote: myVote ? myVote.option_id : null };
    });
    res.json(enriched);
  } catch (e) {
    console.error('GET /polls', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/polls', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { question, description, options, target_audience, class_id, is_anonymous, closes_at, notify } = req.body;
    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: 'Question et au moins 2 options requises' });
    }
    const normOptions = options.map((o, i) => (typeof o === 'string' ? { id: `o${i + 1}`, label: o } : o));
    const { data, error } = await supabaseAdmin
      .from('polls')
      .insert({
        school_id: req.user.school_id,
        question,
        description: description || null,
        options: normOptions,
        target_audience: target_audience || 'parents',
        class_id: class_id || null,
        is_anonymous: !!is_anonymous,
        closes_at: closes_at || null,
        created_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;

    if (notify === true || notify === 'true') {
      const studentIds = await getStudentIds(req.user.school_id, class_id || null);
      const parents = await getParentPhonesForStudents(studentIds);
      const optsTxt = normOptions.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
      const text = `🗳️ *Nouveau sondage*\n\n${question}\n\n${optsTxt}\n\nRépondez via l'application Eductrack.`;
      await notifyUsers(parents.parentIds, { title: 'Nouveau sondage', message: question, type: 'message' });
      broadcastWhatsApp(req.user.school_id, parents.phones, text).catch(() => {});
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('POST /polls', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/polls/:id/vote', async (req, res) => {
  try {
    const { option_id } = req.body;
    if (!option_id) return res.status(400).json({ error: 'option_id requis' });
    const { data: poll } = await supabaseAdmin.from('polls').select('is_active, closes_at').eq('id', req.params.id).single();
    if (!poll || !poll.is_active) return res.status(400).json({ error: 'Sondage clôturé' });
    if (poll.closes_at && new Date(poll.closes_at) < new Date()) return res.status(400).json({ error: 'Sondage clôturé' });
    const { data, error } = await supabaseAdmin
      .from('poll_votes')
      .upsert({ poll_id: req.params.id, user_id: req.user.id, option_id }, { onConflict: 'poll_id,user_id' })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('POST vote', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/polls/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { is_active } = req.body;
    const { data, error } = await supabaseAdmin.from('polls').update({ is_active }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/polls/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('polls').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 5) SIGNALEMENTS — issue_reports
// ═══════════════════════════════════════════════════════════════════════════
router.get('/issues', authorize('admin', 'teacher'), async (req, res) => {
  try {
    let q = supabaseAdmin
      .from('issue_reports')
      .select('*, classes(name), reporter:reported_by(first_name, last_name, role)')
      .order('created_at', { ascending: false });
    if (schoolFilter(req)) q = q.eq('school_id', schoolFilter(req));
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('GET /issues', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/issues', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { category, title, description, priority, class_id, related_student } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    const { data, error } = await supabaseAdmin
      .from('issue_reports')
      .insert({
        school_id: req.user.school_id,
        reported_by: req.user.id,
        category: category || 'autre',
        title,
        description: description || null,
        priority: priority || 'normale',
        class_id: class_id || null,
        related_student: related_student || null,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('POST /issues', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/issues/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { status, resolution_note, assigned_to, priority } = req.body;
    const fields = {};
    if (status) {
      fields.status = status;
      if (status === 'resolu' || status === 'ferme') fields.resolved_at = new Date().toISOString();
    }
    if (resolution_note !== undefined) fields.resolution_note = resolution_note;
    if (assigned_to !== undefined) fields.assigned_to = assigned_to || null;
    if (priority) fields.priority = priority;
    const { data, error } = await supabaseAdmin.from('issue_reports').update(fields).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/issues/:id', authorize('admin', 'teacher'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin.from('issue_reports').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
