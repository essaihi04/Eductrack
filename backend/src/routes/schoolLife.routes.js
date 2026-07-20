import express from 'express';
import multer from 'multer';
import path, { dirname, join } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { uploadBuffer, BUCKET_PUBLIC } from '../utils/storage.js';
import { sendText, sendImage, getStatus } from '../services/whatsapp/index.js';
import { requiresApproval, createApprovalRequest } from '../services/approvals.js';
import { archivedStudentIdSet } from '../utils/studentArchive.js';

// Un prof crée-t-il un élément qui doit passer en validation ?
const needsApproval = async (req, type) =>
  req.user.role === 'teacher' && (await requiresApproval(req.user.school_id, type));
const requesterName = (req) => `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────
// Upload (photos des activités / cahier de vie / objets perdus)
// ─────────────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Seules les images sont autorisées'), ok);
  },
});
// Upload d'une image vie scolaire -> URL publique Supabase (bucket public)
const uploadSchoolLifePhoto = async (file) => {
  if (!file) return null;
  const { publicUrl } = await uploadBuffer({ bucket: BUCKET_PUBLIC, folder: 'school-life', file, prefix: 'sl' });
  return publicUrl;
};
const absoluteUrl = (relUrl) => {
  if (!relUrl) return null;
  if (/^https?:\/\//i.test(relUrl)) return relUrl;
  const base = process.env.PUBLIC_BASE_URL || process.env.API_URL || 'https://etrack.ma';
  return `${base}${relUrl}`;
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

/** Élèves d'une classe ou de toute l'école (élèves archivés exclus). */
async function getStudentIds(schoolId, classId) {
  let q = supabaseAdmin.from('profiles').select('id').eq('role', 'student');
  if (classId) q = q.eq('class_id', classId);
  else if (schoolId) q = q.eq('school_id', schoolId);
  const { data } = await q;
  const archivedIds = await archivedStudentIdSet(schoolId);
  return (data || [])
    .map((s) => s.id)
    .filter((id) => !archivedIds || !archivedIds.has(id));
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

/**
 * Autorise la suppression : les admins/direction peuvent tout supprimer ; un
 * professeur ne peut supprimer que les éléments qu'il a lui-même créés.
 * Répond directement (403/404) et renvoie false si non autorisé.
 */
async function ensureCanDelete(req, res, table, ownerCol) {
  if (adminRoles.includes(req.user.role)) return true;
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(`id, ${ownerCol}`)
    .eq('id', req.params.id)
    .maybeSingle();
  if (error || !data) {
    res.status(404).json({ error: 'Élément introuvable' });
    return false;
  }
  if (data[ownerCol] !== req.user.id) {
    res.status(403).json({ error: 'Vous ne pouvez supprimer que les éléments que vous avez créés.' });
    return false;
  }
  return true;
}

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

router.post('/activities', authorize('admin', 'school_admin', 'teacher'), upload.single('photo'), async (req, res) => {
  try {
    const { title, description, category, location, start_date, end_date, target_level, class_id, capacity, notify } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    const photo_url = await uploadSchoolLifePhoto(req.file);
    const gated = await needsApproval(req, 'activity');
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
        is_published: !gated,
        created_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;

    if (gated) {
      await createApprovalRequest({ schoolId: req.user.school_id, elementType: 'activity', elementId: data.id, classId: class_id || null, title, requestedBy: req.user.id, requesterName: requesterName(req) });
      return res.status(201).json({ ...data, pending_approval: true });
    }

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

router.put('/activities/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
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

router.delete('/activities/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    if (!(await ensureCanDelete(req, res, 'extracurricular_activities', 'created_by'))) return;
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

router.post('/activities/:id/register', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
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

router.delete('/activities/:id/register/:studentId', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
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
      q = q.in('class_id', classIds.length ? classIds : ['00000000-0000-0000-0000-000000000000']).eq('is_published', true);
    } else if (req.user.role === 'student') {
      q = q.eq('class_id', req.user.class_id || '00000000-0000-0000-0000-000000000000').eq('is_published', true);
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

router.post('/feed', authorize('admin', 'school_admin', 'teacher'), upload.array('photos', 10), async (req, res) => {
  try {
    const { title, content, class_id, activity_date, notify } = req.body;
    if (!class_id) return res.status(400).json({ error: 'class_id requis' });
    const media_urls = (await Promise.all((req.files || []).map((f) => uploadSchoolLifePhoto(f)))).filter(Boolean);
    const gated = await needsApproval(req, 'feed');
    const { data, error } = await supabaseAdmin
      .from('classroom_feed_posts')
      .insert({
        school_id: req.user.school_id,
        class_id,
        author_id: req.user.id,
        title: title || null,
        content: content || null,
        media_urls,
        is_published: !gated,
        activity_date: activity_date || null,
      })
      .select()
      .single();
    if (error) throw error;

    if (gated) {
      await createApprovalRequest({ schoolId: req.user.school_id, elementType: 'feed', elementId: data.id, classId: class_id, title: title || 'Cahier de vie', requestedBy: req.user.id, requesterName: requesterName(req) });
      return res.status(201).json({ ...data, pending_approval: true });
    }

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

router.delete('/feed/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    if (!(await ensureCanDelete(req, res, 'classroom_feed_posts', 'author_id'))) return;
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

router.post('/lost-items', authorize('admin', 'school_admin', 'teacher'), upload.single('photo'), async (req, res) => {
  try {
    const { title, description, location_found, found_date, notify } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    const photo_url = await uploadSchoolLifePhoto(req.file);
    const gated = await needsApproval(req, 'lost_item');
    const { data, error } = await supabaseAdmin
      .from('lost_items')
      .insert({
        school_id: req.user.school_id,
        title,
        description: description || null,
        location_found: location_found || null,
        found_date: found_date || null,
        photo_url,
        is_published: !gated,
        reported_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;

    if (gated) {
      await createApprovalRequest({ schoolId: req.user.school_id, elementType: 'lost_item', elementId: data.id, classId: null, title, requestedBy: req.user.id, requesterName: requesterName(req) });
      return res.status(201).json({ ...data, pending_approval: true });
    }

    if (notify === 'true' || notify === true) {
      const studentIds = await getStudentIds(req.user.school_id, null);
      const parents = await getParentPhonesForStudents(studentIds);
      const text = `🔍 *Objet perdu trouvé*\n\n🧷 *${title}*${description ? `\n${description}` : ''}${location_found ? `\n📍 ${location_found}` : ''}\n\n_Si cet objet est à votre enfant, contactez l'école._`;
      await notifyUsers(parents.parentIds, { title: `Objet perdu : ${title}`, message: description || location_found || '', type: 'message' });
      broadcastWhatsApp(req.user.school_id, parents.phones, text, photo_url).catch(() => {});
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('POST /lost-items', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/lost-items/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
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

router.delete('/lost-items/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    if (!(await ensureCanDelete(req, res, 'lost_items', 'reported_by'))) return;
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

router.post('/polls', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
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

router.put('/polls/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { is_active } = req.body;
    const { data, error } = await supabaseAdmin.from('polls').update({ is_active }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/polls/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    if (!(await ensureCanDelete(req, res, 'polls', 'created_by'))) return;
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
router.get('/issues', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    let q = supabaseAdmin
      .from('issue_reports')
      .select('*, classes(name), reporter:reported_by(first_name, last_name, role), related:related_student(first_name, last_name), students:issue_report_students(student:profiles(id, first_name, last_name))')
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

// Élèves d'une classe (pour cibler un signalement sur un élève précis)
router.get('/classes/:classId/students', authorize('admin', 'school_admin', 'teacher', 'pedagogical_director', 'pedagogical_manager'), async (req, res) => {
  try {
    let q = supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'student')
      .eq('class_id', req.params.classId)
      .order('last_name', { ascending: true });
    if (schoolFilter(req)) q = q.eq('school_id', schoolFilter(req));
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('GET /classes/:classId/students', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/issues', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    const { category, title, description, priority, class_id, related_student, related_students } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    // Liste d'élèves ciblés (multi). Compat : related_student (single) accepté.
    const studentIds = Array.isArray(related_students) && related_students.length > 0
      ? related_students.filter(Boolean)
      : (related_student ? [related_student] : []);
    const gated = await needsApproval(req, 'signalement');
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
        related_student: studentIds[0] || null,
        is_published: !gated,
      })
      .select()
      .single();
    if (error) throw error;

    if (studentIds.length > 0) {
      await supabaseAdmin
        .from('issue_report_students')
        .insert(studentIds.map((sid) => ({ issue_id: data.id, student_id: sid })));
    }

    if (gated) {
      await createApprovalRequest({ schoolId: req.user.school_id, elementType: 'signalement', elementId: data.id, classId: class_id || null, title, requestedBy: req.user.id, requesterName: requesterName(req) });
      return res.status(201).json({ ...data, pending_approval: true });
    }

    if (studentIds.length > 0) {
      // Notifier les parents des élèves concernés (in-app + WhatsApp)
      try {
        const parents = await getParentPhonesForStudents(studentIds);
        const text = `🚩 *Signalement*\n\n*${title}*${description ? `\n${description}` : ''}\n\n_Ce signalement concerne votre enfant. Contactez l'établissement pour plus d'informations._`;
        await notifyUsers(parents.parentIds, {
          title: `Signalement : ${title}`,
          message: description || title,
          type: 'message',
          data: { kind: 'issue_report', issue_id: data.id },
        });
        broadcastWhatsApp(req.user.school_id, parents.phones, text).catch(() => {});
      } catch (notifErr) {
        console.error('[issues] notification parents:', notifErr.message);
      }
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('POST /issues', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/issues/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
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

router.delete('/issues/:id', authorize('admin', 'school_admin', 'teacher'), async (req, res) => {
  try {
    if (!(await ensureCanDelete(req, res, 'issue_reports', 'reported_by'))) return;
    const { error } = await supabaseAdmin.from('issue_reports').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
