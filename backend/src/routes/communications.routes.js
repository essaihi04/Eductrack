/**
 * Routes admin du planificateur de communications.
 * Monté sous /api/admin/communications (auth + scope école).
 */

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendCommunication } from '../services/communicationScheduler.js';

const router = express.Router();
router.use(authenticate);
router.use(authorize('admin', 'school_admin', 'pedagogical_manager', 'pedagogical_director'));

const getSchoolId = (req) => (req.user.role === 'super_admin' ? null : req.user.school_id || null);

// GET / — liste des communications de l'école
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin
      .from('scheduled_communications')
      .select('*')
      .order('scheduled_at', { ascending: false })
      .limit(100);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ communications: data || [] });
  } catch (e) {
    console.error('Erreur liste communications:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST / — crée une communication planifiée
router.post('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'School ID requis' });

    const {
      title, body, type = 'normal', deadline_date,
      attachment_url, attachment_name, target, scheduled_at, send_now,
    } = req.body || {};

    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (!['normal', 'deadline', 'urgent'].includes(type)) {
      return res.status(400).json({ error: 'Type invalide' });
    }
    // Urgent ou send_now → planifié maintenant
    const when = (send_now || type === 'urgent') ? new Date().toISOString() : scheduled_at;
    if (!when) return res.status(400).json({ error: 'Date d\'envoi requise' });

    const payload = {
      school_id: schoolId,
      created_by: req.user.id,
      title,
      body: body || null,
      type,
      deadline_date: type === 'deadline' ? (deadline_date || null) : null,
      attachment_url: attachment_url || null,
      attachment_name: attachment_name || null,
      target: target && (target.all || target.class_ids?.length) ? target : { all: true },
      scheduled_at: when,
      status: 'scheduled',
    };

    const { data, error } = await supabaseAdmin
      .from('scheduled_communications')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    // Envoi immédiat si urgent / send_now (en arrière-plan)
    if (send_now || type === 'urgent') {
      res.json({ success: true, communication: data, sending: true });
      sendCommunication(data).catch((e) => console.error('[communications] send-now:', e.message));
      return;
    }
    res.json({ success: true, communication: data });
  } catch (e) {
    console.error('Erreur création communication:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /:id/send-now — déclenche l'envoi immédiat
router.post('/:id/send-now', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin.from('scheduled_communications').select('*').eq('id', req.params.id);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data: comm } = await q.maybeSingle();
    if (!comm) return res.status(404).json({ error: 'Communication introuvable' });
    if (comm.status === 'sending' || comm.status === 'sent') {
      return res.status(400).json({ error: 'Déjà envoyée ou en cours' });
    }
    res.json({ success: true, sending: true });
    sendCommunication(comm).catch((e) => console.error('[communications] send-now:', e.message));
  } catch (e) {
    console.error('Erreur send-now:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /:id — annule/supprime une communication non envoyée
router.delete('/:id', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin.from('scheduled_communications').delete().eq('id', req.params.id);
    if (schoolId) q = q.eq('school_id', schoolId);
    const { error } = await q;
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur suppression communication:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
