import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// Configuration multer pour upload de logos
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/logos';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo-${uniqueSuffix}${ext}`);
  }
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Types acceptés: JPG, PNG, GIF, SVG, WebP'));
    }
  }
});

router.use(authenticate);
router.use(requireSuperAdmin);

// ============================================================
// GESTION DES ÉCOLES
// ============================================================

// Lister toutes les écoles avec stats rapides
router.get('/schools', async (req, res) => {
  try {
    const { data: schools, error } = await supabaseAdmin
      .from('schools')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Stats par école
    const enriched = await Promise.all(schools.map(async (school) => {
      const [
        { count: teacherCount },
        { count: studentCount },
        { count: classCount },
        { count: sessionCount }
      ] = await Promise.all([
        supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', school.id).eq('role', 'teacher'),
        supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', school.id).eq('role', 'student'),
        supabaseAdmin.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', school.id),
        supabaseAdmin.from('sessions').select('*', { count: 'exact', head: true }).eq('school_id', school.id)
      ]);

      return {
        ...school,
        stats: {
          teachers: teacherCount || 0,
          students: studentCount || 0,
          classes: classCount || 0,
          sessions: sessionCount || 0
        }
      };
    }));

    res.json({ schools: enriched });
  } catch (error) {
    console.error('Erreur liste écoles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer une école
router.post('/schools', async (req, res) => {
  try {
    const { name, code, address, phone } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Nom et code requis' });
    }

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .insert({
        name,
        code: code.toUpperCase(),
        address: address || null,
        phone: phone || null,
        created_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Ce code école existe déjà' });
      }
      throw error;
    }

    // Audit log
    await supabaseAdmin.from('audit_log').insert({
      user_id: req.user.id,
      school_id: school.id,
      action: 'create_school',
      target_type: 'school',
      target_id: school.id,
      details: { name, code }
    });

    res.status(201).json({ school });
  } catch (error) {
    console.error('Erreur création école:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détail d'une école
router.get('/schools/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !school) {
      return res.status(404).json({ error: 'École introuvable' });
    }

    // Admins de l'école
    const { data: admins } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, role, created_at')
      .eq('school_id', id)
      .in('role', ['admin', 'school_admin']);

    // Stats
    const [
      { count: teacherCount },
      { count: studentCount },
      { count: classCount },
      { count: sessionCount }
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', id).eq('role', 'teacher'),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', id).eq('role', 'student'),
      supabaseAdmin.from('classes').select('*', { count: 'exact', head: true }).eq('school_id', id),
      supabaseAdmin.from('sessions').select('*', { count: 'exact', head: true }).eq('school_id', id)
    ]);

    res.json({
      school,
      admins: admins || [],
      stats: {
        teachers: teacherCount || 0,
        students: studentCount || 0,
        classes: classCount || 0,
        sessions: sessionCount || 0
      }
    });
  } catch (error) {
    console.error('Erreur détail école:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier une école
router.put('/schools/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, address, phone, logo_url } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (code) updates.code = code.toUpperCase();
    if (address !== undefined) updates.address = address;
    if (phone !== undefined) updates.phone = phone;
    if (logo_url !== undefined) updates.logo_url = logo_url;

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from('audit_log').insert({
      user_id: req.user.id,
      school_id: id,
      action: 'update_school',
      target_type: 'school',
      target_id: id,
      details: updates
    });

    res.json({ school });
  } catch (error) {
    console.error('Erreur modification école:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Suspendre / réactiver une école
router.patch('/schools/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide (active ou suspended)' });
    }

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from('audit_log').insert({
      user_id: req.user.id,
      school_id: id,
      action: status === 'suspended' ? 'suspend_school' : 'reactivate_school',
      target_type: 'school',
      target_id: id,
      details: { status }
    });

    res.json({ school });
  } catch (error) {
    console.error('Erreur changement statut école:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Upload logo d'une école
router.post('/schools/:id/logo', logoUpload.single('logo'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier envoyé' });
    }

    // Récupérer l'ancien logo pour le supprimer
    const { data: oldSchool } = await supabaseAdmin
      .from('schools')
      .select('logo_url')
      .eq('id', id)
      .single();

    if (oldSchool?.logo_url) {
      const oldPath = oldSchool.logo_url.replace(/^\//, '');
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const logoUrl = `/uploads/logos/${req.file.filename}`;

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .update({ logo_url: logoUrl })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from('audit_log').insert({
      user_id: req.user.id,
      school_id: id,
      action: 'upload_school_logo',
      target_type: 'school',
      target_id: id,
      details: { logo_url: logoUrl }
    });

    res.json({ school, logo_url: logoUrl });
  } catch (error) {
    console.error('Erreur upload logo:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer le logo d'une école
router.delete('/schools/:id/logo', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: oldSchool } = await supabaseAdmin
      .from('schools')
      .select('logo_url')
      .eq('id', id)
      .single();

    if (oldSchool?.logo_url) {
      const oldPath = oldSchool.logo_url.replace(/^\//, '');
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const { data: school, error } = await supabaseAdmin
      .from('schools')
      .update({ logo_url: null })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ school });
  } catch (error) {
    console.error('Erreur suppression logo:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// GESTION DES ADMINS D'ÉCOLE
// ============================================================

// Lister les admins d'une école
router.get('/schools/:id/admins', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: admins, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, role, created_at')
      .eq('school_id', id)
      .in('role', ['admin', 'school_admin'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ admins: admins || [] });
  } catch (error) {
    console.error('Erreur liste admins:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un admin pour une école (création directe email+mdp)
router.post('/schools/:id/admins', async (req, res) => {
  try {
    const { id: schoolId } = req.params;
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, mot de passe, prénom et nom requis' });
    }

    // Vérifier que l'école existe
    const { data: school } = await supabaseAdmin
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .single();

    if (!school) {
      return res.status(404).json({ error: 'École introuvable' });
    }

    // Créer l'utilisateur dans Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'school_admin'
      }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Créer le profil
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        role: 'school_admin',
        school_id: schoolId
      })
      .select()
      .single();

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    await supabaseAdmin.from('audit_log').insert({
      user_id: req.user.id,
      school_id: schoolId,
      action: 'create_admin',
      target_type: 'profile',
      target_id: authData.user.id,
      details: { email, firstName, lastName, schoolName: school.name }
    });

    res.status(201).json({ admin: profile });
  } catch (error) {
    console.error('Erreur création admin:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Désactiver un admin
router.delete('/schools/:schoolId/admins/:userId', async (req, res) => {
  try {
    const { schoolId, userId } = req.params;

    // Rétrograder en teacher (ne pas supprimer)
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update({ role: 'teacher' })
      .eq('id', userId)
      .eq('school_id', schoolId)
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin.from('audit_log').insert({
      user_id: req.user.id,
      school_id: schoolId,
      action: 'remove_admin',
      target_type: 'profile',
      target_id: userId,
      details: { email: profile.email }
    });

    res.json({ message: 'Admin rétrogradé', profile });
  } catch (error) {
    console.error('Erreur suppression admin:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// VISION PÉDAGOGIQUE PAR ÉCOLE
// ============================================================

// Helper: safe division
const safePct = (num, den) => den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

// KPIs pédagogiques d'une école
router.get('/schools/:id/overview', async (req, res) => {
  try {
    const { id: schoolId } = req.params;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const days = parseInt(req.query.days) || 7;

    const endDate = new Date(date);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    // Récupérer les sessions + tracking de la période
    const { data: trackingData, error } = await supabaseAdmin
      .from('session_tracking')
      .select('*, sessions!inner(id, date, class_id, teacher_id, school_id)')
      .eq('sessions.school_id', schoolId)
      .gte('sessions.date', startDate.toISOString().split('T')[0])
      .lte('sessions.date', date);

    if (error) throw error;

    const records = trackingData || [];
    const total = records.length;

    if (total === 0) {
      return res.json({
        schoolId,
        period: { start: startDate.toISOString().split('T')[0], end: date, days },
        totalRecords: 0,
        overview: null,
        message: 'Aucune donnée pour cette période'
      });
    }

    const present = records.filter(r => r.presence === 'present').length;
    const absent = records.filter(r => r.presence === 'absent').length;
    const late = records.filter(r => r.presence === 'late').length;
    const sleeping = records.filter(r => r.sleeping === true).length;
    const phoneUse = records.filter(r => r.phone_use === true).length;
    const cahierPresent = records.filter(r => r.cahier_present === true).length;
    const cahierAbsent = records.filter(r => r.cahier_present === false).length;
    const participationGood = records.filter(r => ['good', 'excellent'].includes(r.participation)).length;
    const participationFaible = records.filter(r => r.participation === 'faible').length;
    const attitudeCorrect = records.filter(r => ['correct', 'excellent'].includes(r.attitude)).length;
    const perturbateur = records.filter(r => r.attitude === 'perturbateur').length;
    const disciplineCorrect = records.filter(r => ['concentre', 'vigilant'].includes(r.discipline)).length;
    const disciplineBavard = records.filter(r => ['moyen', 'bavarre'].includes(r.discipline)).length;

    let evalSum = 0, evalCount = 0;
    records.forEach(r => {
      const v = typeof r.mini_eval === 'number' ? r.mini_eval : parseFloat(r.mini_eval);
      if (!isNaN(v)) { evalSum += v; evalCount++; }
    });

    // Unique sessions and classes
    const uniqueSessions = new Set(records.map(r => r.session_id));
    const uniqueClasses = new Set(records.map(r => r.sessions?.class_id).filter(Boolean));

    res.json({
      schoolId,
      period: { start: startDate.toISOString().split('T')[0], end: date, days },
      totalRecords: total,
      totalSessions: uniqueSessions.size,
      totalClasses: uniqueClasses.size,
      overview: {
        presence: { present: safePct(present, total), absent: safePct(absent, total), late: safePct(late, total) },
        discipline: { correct: safePct(disciplineCorrect, total), bavard: safePct(disciplineBavard, total) },
        participation: { positive: safePct(participationGood, total), faible: safePct(participationFaible, total) },
        attitude: { correct: safePct(attitudeCorrect, total), perturbateur: safePct(perturbateur, total) },
        cahier: { present: safePct(cahierPresent, cahierPresent + cahierAbsent), absent: safePct(cahierAbsent, cahierPresent + cahierAbsent) },
        sleeping: { rate: safePct(sleeping, total), count: sleeping },
        phone: { rate: safePct(phoneUse, total), count: phoneUse },
        evaluation: { average: evalCount > 0 ? Math.round(evalSum / evalCount) : null, count: evalCount }
      }
    });
  } catch (error) {
    console.error('Erreur overview école:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Tendances d'une école (évolution jour par jour)
router.get('/schools/:id/trends', async (req, res) => {
  try {
    const { id: schoolId } = req.params;
    const days = parseInt(req.query.days) || 14;
    const endDate = req.query.date ? new Date(req.query.date) : new Date();

    const trends = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const { data: records } = await supabaseAdmin
        .from('session_tracking')
        .select('presence, sleeping, phone_use, participation, attitude, cahier_present, discipline, mini_eval, sessions!inner(date, school_id)')
        .eq('sessions.school_id', schoolId)
        .eq('sessions.date', dateStr);

      const total = records?.length || 0;
      if (total === 0) {
        trends.push({ date: dateStr, records: 0 });
        continue;
      }

      const present = records.filter(r => r.presence === 'present').length;
      const sleeping = records.filter(r => r.sleeping === true).length;
      const phoneUse = records.filter(r => r.phone_use === true).length;
      const partGood = records.filter(r => ['good', 'excellent'].includes(r.participation)).length;
      const cahierOk = records.filter(r => r.cahier_present === true).length;
      const cahierTotal = records.filter(r => r.cahier_present !== null && r.cahier_present !== undefined).length;

      let evalSum = 0, evalCount = 0;
      records.forEach(r => {
        const v = parseFloat(r.mini_eval);
        if (!isNaN(v)) { evalSum += v; evalCount++; }
      });

      trends.push({
        date: dateStr,
        records: total,
        presenceRate: safePct(present, total),
        sleepingRate: safePct(sleeping, total),
        phoneRate: safePct(phoneUse, total),
        participationRate: safePct(partGood, total),
        cahierRate: cahierTotal > 0 ? safePct(cahierOk, cahierTotal) : null,
        evaluationAverage: evalCount > 0 ? Math.round(evalSum / evalCount) : null
      });
    }

    res.json({ schoolId, days, trends });
  } catch (error) {
    console.error('Erreur tendances école:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Comparaison inter-écoles
router.get('/compare', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const endDate = req.query.date ? new Date(req.query.date) : new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const { data: schools } = await supabaseAdmin
      .from('schools')
      .select('id, name, code, status')
      .eq('status', 'active');

    const comparison = await Promise.all((schools || []).map(async (school) => {
      const { data: records } = await supabaseAdmin
        .from('session_tracking')
        .select('presence, sleeping, phone_use, participation, attitude, cahier_present, discipline, mini_eval, sessions!inner(date, school_id)')
        .eq('sessions.school_id', school.id)
        .gte('sessions.date', startStr)
        .lte('sessions.date', endStr);

      const total = records?.length || 0;
      if (total === 0) {
        return { ...school, totalRecords: 0, metrics: null };
      }

      const present = records.filter(r => r.presence === 'present').length;
      const sleeping = records.filter(r => r.sleeping === true).length;
      const phoneUse = records.filter(r => r.phone_use === true).length;
      const partGood = records.filter(r => ['good', 'excellent'].includes(r.participation)).length;
      const attCorrect = records.filter(r => ['correct', 'excellent'].includes(r.attitude)).length;
      const cahierOk = records.filter(r => r.cahier_present === true).length;
      const cahierTotal = records.filter(r => r.cahier_present !== null && r.cahier_present !== undefined).length;

      let evalSum = 0, evalCount = 0;
      records.forEach(r => {
        const v = parseFloat(r.mini_eval);
        if (!isNaN(v)) { evalSum += v; evalCount++; }
      });

      // Health score (same formula as class-health)
      const presRate = safePct(present, total);
      const sleepRate = safePct(sleeping, total);
      const phoneRate = safePct(phoneUse, total);
      const partRate = safePct(partGood, total);
      const attRate = safePct(attCorrect, total);
      const cahierRate = cahierTotal > 0 ? safePct(cahierOk, cahierTotal) : 50;

      const healthScore = Math.round(
        presRate * 0.25 +
        (100 - sleepRate * 2 - phoneRate * 2) * 0.20 +
        partRate * 0.20 +
        attRate * 0.15 +
        cahierRate * 0.20
      );

      return {
        ...school,
        totalRecords: total,
        healthScore: Math.max(0, Math.min(100, healthScore)),
        metrics: {
          presence: safePct(present, total),
          sleeping: safePct(sleeping, total),
          phone: safePct(phoneUse, total),
          participation: safePct(partGood, total),
          attitude: safePct(attCorrect, total),
          cahier: cahierTotal > 0 ? safePct(cahierOk, cahierTotal) : null,
          evaluation: evalCount > 0 ? Math.round(evalSum / evalCount) : null
        }
      };
    }));

    // Sort by health score
    comparison.sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0));

    res.json({
      period: { start: startStr, end: endStr, days },
      schools: comparison
    });
  } catch (error) {
    console.error('Erreur comparaison écoles:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Stats globales toutes écoles
router.get('/global-stats', async (req, res) => {
  try {
    const [
      { count: schoolCount },
      { count: teacherCount },
      { count: studentCount },
      { count: classCount }
    ] = await Promise.all([
      supabaseAdmin.from('schools').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      supabaseAdmin.from('classes').select('*', { count: 'exact', head: true })
    ]);

    res.json({
      schools: schoolCount || 0,
      teachers: teacherCount || 0,
      students: studentCount || 0,
      classes: classCount || 0
    });
  } catch (error) {
    console.error('Erreur stats globales:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// AUDIT LOG
// ============================================================

router.get('/audit', async (req, res) => {
  try {
    const { schoolId, action, limit: lim } = req.query;
    const pageSize = parseInt(lim) || 50;

    let query = supabaseAdmin
      .from('audit_log')
      .select('*, profiles:user_id(email, first_name, last_name), schools:school_id(name, code)')
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (schoolId) query = query.eq('school_id', schoolId);
    if (action) query = query.eq('action', action);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ logs: data || [] });
  } catch (error) {
    console.error('Erreur audit log:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
