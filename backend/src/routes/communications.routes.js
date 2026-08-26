/**
 * Routes admin du planificateur de communications.
 * Monté sous /api/admin/communications (auth + scope école).
 */

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendCommunication } from '../services/communicationScheduler.js';
import { resolveCategoryForSending } from '../utils/whatsappCategory.js';

const router = express.Router();
router.use(authenticate);
router.use(authorize('admin', 'school_admin', 'pedagogical_manager', 'pedagogical_director'));

const getSchoolId = (req) => (req.user.role === 'super_admin' ? null : req.user.school_id || null);

/**
 * GET /pending-delivery — combien de contenus attendent encore leur livraison.
 *
 * Hors fenêtre de 24 h, seule l'annonce part : le message reste au statut
 * « annoncé » jusqu'à ce que le parent écrive. Le tableau de bord des envois
 * doit montrer ce reliquat, sinon un taux de remise de 100 % laisse croire
 * que tout le monde a lu, alors que le contenu n'est jamais arrivé.
 *
 * Paramètres : period = today | week | month | all | custom (+ from / to).
 */
router.get('/pending-delivery', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    const { period, from: fromDate, to: toDate } = req.query;
    const jours = { today: 1, week: 7, month: 30 }[period];
    const from = jours ? new Date(Date.now() - jours * 24 * 3600 * 1000).toISOString()
      : (period === 'custom' && fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : null);
    // Borne haute INCLUSIVE : « jusqu'au 26 » couvre toute la journée du 26.
    const to = period === 'custom' && toDate
      ? new Date(`${toDate}T23:59:59`).toISOString() : null;

    let q = supabaseAdmin
      .from('whatsapp_message_recipients')
      .select('phone_e164, whatsapp_messages!inner(school_id)')
      .eq('status', 'announced');
    if (schoolId) q = q.eq('whatsapp_messages.school_id', schoolId);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, error } = await q;
    if (error) throw error;

    const lignes = data || [];
    res.json({
      messages: lignes.length,
      parents: new Set(lignes.map((r) => r.phone_e164).filter(Boolean)).size,
    });
  } catch (e) {
    // Colonne de statut absente ou table vide : un zéro vaut mieux qu'une
    // page d'erreur pour une simple tuile de tableau de bord.
    console.warn('Erreur en attente de livraison:', e.message);
    res.json({ messages: 0, parents: 0 });
  }
});

// GET / — liste des communications de l'école, avec métriques de lecture
// (ciblés / vus par canal / réponses) pour les envois trackés (message_id).
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
    const comms = data || [];

    // Agrégats de tracking par message lié
    const msgIds = comms.map((c) => c.message_id).filter(Boolean);
    if (msgIds.length) {
      const metricsByMsg = new Map();
      for (let i = 0; i < msgIds.length; i += 100) {
        const chunk = msgIds.slice(i, i + 100);
        const { data: recs } = await supabaseAdmin
          .from('whatsapp_message_recipients')
          .select('message_id, status, read_at, read_channel, responded_at')
          .in('message_id', chunk);
        (recs || []).forEach((r) => {
          if (!metricsByMsg.has(r.message_id)) {
            metricsByMsg.set(r.message_id, {
              targeted: 0, sent: 0, read: 0, readApp: 0, readWa: 0, responded: 0, announced: 0,
            });
          }
          const m = metricsByMsg.get(r.message_id);
          m.targeted++;
          if (r.status === 'sent') m.sent++;
          // « annoncé » : hors fenêtre de 24 h, seule l'annonce est partie et
          // le contenu attend encore la réponse du parent.
          if (r.status === 'announced') m.announced++;
          if (r.read_at) { m.read++; if (r.read_channel === 'app') m.readApp++; else m.readWa++; }
          if (r.responded_at) m.responded++;
        });
      }
      comms.forEach((c) => { if (c.message_id) c.metrics = metricsByMsg.get(c.message_id) || null; });
    }

    res.json({ communications: comms });
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
      attachment_url, attachment_name, attachment_type, channels, target, scheduled_at, send_now,
      personalize,
    } = req.body || {};

    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (!['normal', 'deadline', 'urgent'].includes(type)) {
      return res.status(400).json({ error: 'Type invalide' });
    }
    // Urgent ou send_now → planifié maintenant
    const when = (send_now || type === 'urgent') ? new Date().toISOString() : scheduled_at;
    if (!when) return res.status(400).json({ error: 'Date d\'envoi requise' });

    // Cible valide = toute l'école, des classes, ou des parents sélectionnés
    const validTarget = target && (target.all || target.class_ids?.length || target.parent_ids?.length)
      ? target : { all: true };

    const payload = {
      school_id: schoolId,
      created_by: req.user.id,
      title,
      body: body || null,
      type,
      // Boîte cible figée selon le rôle (le tracking whatsapp_messages en hérite)
      category: resolveCategoryForSending(req.body?.category, req.user?.role),
      channels: ['whatsapp', 'push', 'both'].includes(channels) ? channels : 'both',
      deadline_date: type === 'deadline' ? (deadline_date || null) : null,
      attachment_url: attachment_url || null,
      attachment_name: attachment_name || null,
      attachment_type: ['image', 'document'].includes(attachment_type) ? attachment_type : null,
      target: validTarget,
      // Salutation nominative par parent : chaque destinataire reçoit un texte
      // distinct, ce qui réduit le risque de ban WhatsApp.
      personalize: personalize === true,
      scheduled_at: when,
      status: 'scheduled',
    };

    let { data, error } = await supabaseAdmin
      .from('scheduled_communications')
      .insert(payload)
      .select()
      .single();
    // Migrations pas toutes appliquées → retente sans les colonnes récentes
    // (la création ne doit jamais être bloquée par une colonne manquante).
    if (error && /column|category|channels|attachment_type|personalize/i.test(error.message || '')) {
      delete payload.category;
      delete payload.channels;
      delete payload.attachment_type;
      delete payload.personalize;
      ({ data, error } = await supabaseAdmin
        .from('scheduled_communications')
        .insert(payload)
        .select()
        .single());
    }
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
