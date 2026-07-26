/**
 * API des rendez-vous parents ↔ école.
 *
 * Un seul routeur pour les trois publics, chaque route vérifiant le rôle :
 *   • parent     → crée, suit et annule ses demandes
 *   • professeur → voit les demandes qui le visent et propose un créneau
 *   • staff      → arbitre : fixe l'horaire (accorde) ou refuse
 *
 * Le responsable pédagogique ne voit que les demandes des classes de son
 * périmètre (getScopedClassIds), comme partout ailleurs dans l'application.
 */

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, getScopedClassIds } from '../middleware/auth.js';
import {
  APPOINTMENT_STAFF_ROLES,
  createAppointment,
  proposeSlot,
  markTeacherUnavailable,
  confirmAppointment,
  declineAppointment,
  cancelAppointment,
  listForStaff,
  listForParent,
  listForTeacher,
  listClassTeachers,
  getAppointment,
} from '../services/appointments.js';

const router = express.Router();
router.use(authenticate);

const isStaff = (user) => APPOINTMENT_STAFF_ROLES.includes(user.role) || user.role === 'super_admin';

/** Charge le rendez-vous et vérifie que l'utilisateur a le droit de le voir. */
async function loadAppointment(req, res) {
  const appt = await getAppointment(req.params.id);
  if (!appt) {
    res.status(404).json({ error: 'Rendez-vous introuvable' });
    return null;
  }
  const user = req.user;

  if (user.role === 'parent') {
    if (appt.parent_id !== user.id) {
      res.status(403).json({ error: 'Accès refusé' });
      return null;
    }
    return appt;
  }

  if (user.role === 'teacher') {
    if (appt.teacher_id !== user.id) {
      res.status(403).json({ error: 'Accès refusé' });
      return null;
    }
    return appt;
  }

  if (isStaff(user)) {
    if (user.role !== 'super_admin' && appt.school_id !== user.school_id) {
      res.status(403).json({ error: 'Accès refusé' });
      return null;
    }
    const scoped = await getScopedClassIds(req);
    if (scoped !== null && !scoped.includes(appt.class_id)) {
      res.status(403).json({ error: 'Cette classe n\'est pas dans votre périmètre' });
      return null;
    }
    return appt;
  }

  res.status(403).json({ error: 'Accès refusé' });
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// GET /api/appointments — liste adaptée au rôle
// ───────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    if (user.role === 'parent') return res.json(await listForParent(user.id));
    if (user.role === 'teacher') return res.json(await listForTeacher(user.id));
    if (isStaff(user)) {
      const scoped = await getScopedClassIds(req);
      return res.json(await listForStaff({
        schoolId: user.school_id,
        scopedClassIds: scoped,
        status: req.query.status || null,
      }));
    }
    return res.status(403).json({ error: 'Accès refusé' });
  } catch (e) {
    console.error('[appointments] GET /', e);
    res.status(500).json({ error: e.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/appointments/teachers?student_id=… — professeurs de la classe
// (le parent choisit avec qui il veut le rendez-vous)
// ───────────────────────────────────────────────────────────────────────────
router.get('/teachers', async (req, res) => {
  try {
    if (req.user.role !== 'parent') return res.status(403).json({ error: 'Réservé aux parents' });
    const studentId = req.query.student_id;
    if (!studentId) return res.status(400).json({ error: 'student_id requis' });

    const { data: link } = await supabaseAdmin
      .from('parent_students')
      .select('student_id')
      .eq('parent_id', req.user.id)
      .eq('student_id', studentId)
      .maybeSingle();
    if (!link) return res.status(403).json({ error: "Cet élève n'est pas votre enfant" });

    const { data: student } = await supabaseAdmin
      .from('profiles')
      .select('class_id')
      .eq('id', studentId)
      .maybeSingle();

    res.json(await listClassTeachers(student?.class_id));
  } catch (e) {
    console.error('[appointments] GET /teachers', e);
    res.status(500).json({ error: e.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/appointments — le parent demande un rendez-vous
// ───────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    if (req.user.role !== 'parent') return res.status(403).json({ error: 'Réservé aux parents' });
    const { student_id, target_type, teacher_id, subject, message, preferred_slot } = req.body || {};

    if (student_id) {
      const { data: link } = await supabaseAdmin
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', req.user.id)
        .eq('student_id', student_id)
        .maybeSingle();
      if (!link) return res.status(403).json({ error: "Cet élève n'est pas votre enfant" });
    }

    // Le professeur choisi doit bien enseigner à la classe de l'enfant.
    if (target_type === 'teacher') {
      if (!student_id) return res.status(400).json({ error: "Précisez l'enfant concerné" });
      const { data: student } = await supabaseAdmin
        .from('profiles')
        .select('class_id')
        .eq('id', student_id)
        .maybeSingle();
      const teachers = await listClassTeachers(student?.class_id);
      if (!teachers.some((t) => t.id === teacher_id)) {
        return res.status(400).json({ error: "Ce professeur n'enseigne pas à la classe de votre enfant" });
      }
    }

    const appt = await createAppointment({
      parentId: req.user.id,
      schoolId: req.user.school_id,
      studentId: student_id || null,
      targetType: target_type === 'teacher' ? 'teacher' : 'administration',
      teacherId: teacher_id || null,
      subject,
      message,
      preferredSlot: preferred_slot,
      source: 'app',
    });
    res.status(201).json(appt);
  } catch (e) {
    console.error('[appointments] POST /', e);
    res.status(400).json({ error: e.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/appointments/:id — détail + journal
// ───────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const appt = await loadAppointment(req, res);
    if (!appt) return;
    const { data: events } = await supabaseAdmin
      .from('appointment_events')
      .select('*, actor:actor_id(first_name, last_name)')
      .eq('appointment_id', appt.id)
      .order('created_at', { ascending: true });
    res.json({ ...appt, events: events || [] });
  } catch (e) {
    console.error('[appointments] GET /:id', e);
    res.status(500).json({ error: e.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// PATCH /api/appointments/:id/propose — le professeur propose un créneau
// (la confirmation reste au staff)
// ───────────────────────────────────────────────────────────────────────────
router.patch('/:id/propose', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Réservé aux professeurs' });
    const appt = await loadAppointment(req, res);
    if (!appt) return;
    if (!['en_attente', 'propose'].includes(appt.status)) {
      return res.status(400).json({ error: 'Ce rendez-vous a déjà été traité' });
    }

    const { proposed_at, note } = req.body || {};
    if (!proposed_at) return res.status(400).json({ error: 'Date proposée requise' });
    const when = new Date(proposed_at);
    if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Date invalide' });

    const updated = await proposeSlot({
      appointment: appt,
      teacherId: req.user.id,
      proposedAt: when.toISOString(),
      note: note || null,
    });
    res.json(updated);
  } catch (e) {
    console.error('[appointments] PATCH /propose', e);
    res.status(400).json({ error: e.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// PATCH /api/appointments/:id/unavailable — le professeur se déclare
// indisponible : la demande reste ouverte, le staff reprend la main.
// ───────────────────────────────────────────────────────────────────────────
router.patch('/:id/unavailable', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Réservé aux professeurs' });
    const appt = await loadAppointment(req, res);
    if (!appt) return;
    if (!['en_attente', 'propose'].includes(appt.status)) {
      return res.status(400).json({ error: 'Ce rendez-vous a déjà été traité' });
    }
    const updated = await markTeacherUnavailable({
      appointment: appt,
      teacherId: req.user.id,
      message: req.body?.note || null,
    });
    res.json(updated);
  } catch (e) {
    console.error('[appointments] PATCH /unavailable', e);
    res.status(400).json({ error: e.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// PATCH /api/appointments/:id/confirm — le staff accorde le rendez-vous
// → le parent est notifié automatiquement (push app sinon WhatsApp)
// ───────────────────────────────────────────────────────────────────────────
router.patch('/:id/confirm', async (req, res) => {
  try {
    if (!isStaff(req.user)) return res.status(403).json({ error: 'Réservé au personnel de l\'école' });
    const appt = await loadAppointment(req, res);
    if (!appt) return;
    if (['annule', 'termine'].includes(appt.status)) {
      return res.status(400).json({ error: 'Ce rendez-vous est clos' });
    }

    const { scheduled_at, duration_minutes, location, note } = req.body || {};
    const when = new Date(scheduled_at);
    if (!scheduled_at || Number.isNaN(when.getTime())) {
      return res.status(400).json({ error: 'Date et heure du rendez-vous requises' });
    }

    const { appointment, channel } = await confirmAppointment({
      appointment: appt,
      staffUser: req.user,
      scheduledAt: when.toISOString(),
      durationMinutes: Number(duration_minutes) || 30,
      location: location || null,
      note: note || null,
    });
    res.json({ ...appointment, parent_channel: channel });
  } catch (e) {
    console.error('[appointments] PATCH /confirm', e);
    res.status(400).json({ error: e.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// PATCH /api/appointments/:id/decline — le staff refuse
// ───────────────────────────────────────────────────────────────────────────
router.patch('/:id/decline', async (req, res) => {
  try {
    if (!isStaff(req.user)) return res.status(403).json({ error: 'Réservé au personnel de l\'école' });
    const appt = await loadAppointment(req, res);
    if (!appt) return;
    const updated = await declineAppointment({
      appointment: appt,
      staffUser: req.user,
      note: req.body?.note || null,
    });
    res.json(updated);
  } catch (e) {
    console.error('[appointments] PATCH /decline', e);
    res.status(400).json({ error: e.message });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// PATCH /api/appointments/:id/cancel — annulation (parent ou staff)
// ───────────────────────────────────────────────────────────────────────────
router.patch('/:id/cancel', async (req, res) => {
  try {
    const appt = await loadAppointment(req, res);
    if (!appt) return;
    if (req.user.role === 'teacher') return res.status(403).json({ error: 'Le professeur ne peut pas annuler un rendez-vous' });
    const updated = await cancelAppointment({
      appointment: appt,
      actor: req.user,
      note: req.body?.note || null,
    });
    res.json(updated);
  } catch (e) {
    console.error('[appointments] PATCH /cancel', e);
    res.status(400).json({ error: e.message });
  }
});

export default router;
