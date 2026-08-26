/**
 * Routes admin du planificateur de communications.
 * Monté sous /api/admin/communications (auth + scope école).
 */

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendCommunication } from '../services/communicationScheduler.js';
import { allowedCategoriesForRole, resolveCategoryForSending } from '../utils/whatsappCategory.js';
import { selectInChunksPaged } from '../utils/chunkedQueries.js';

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
    // « Aujourd'hui » se lit comme une date (depuis minuit), les autres
    // périodes comme des fenêtres glissantes. Même règle que l'interface,
    // sinon la tuile et la liste ne racontent pas la même histoire.
    const jours = { week: 7, month: 30 }[period];
    let from = null;
    if (period === 'today') {
      const minuit = new Date();
      minuit.setHours(0, 0, 0, 0);
      from = minuit.toISOString();
    } else if (jours) {
      from = new Date(Date.now() - jours * 24 * 3600 * 1000).toISOString();
    } else if (period === 'custom' && fromDate) {
      from = new Date(`${fromDate}T00:00:00`).toISOString();
    }
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

const historyStatus = (message) => {
  if (message.status === 'completed') return 'sent';
  if (message.status === 'pending' && message.scheduled_at && new Date(message.scheduled_at) > new Date()) return 'scheduled';
  return message.status || 'sent';
};

const historyTitle = (message) => {
  const text = String(message.content || '').replace(/\s+/g, ' ').trim();
  if (text) return text.length > 80 ? `${text.slice(0, 77)}…` : text;
  return message.file_name || 'Communication WhatsApp';
};

// GET / — liste UNIFIÉE des communications de l'école.
//
// Le planificateur écrit dans scheduled_communications, tandis que les envois
// directs écrivent seulement dans whatsapp_messages. Ne lire que la première
// table affichait donc « Aucune communication » alors que le dashboard
// comptait correctement les campagnes WhatsApp. On fusionne les deux sources,
// en dédupliquant les messages déjà liés à une communication planifiée.
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
    const scheduled = data || [];

    let historyQuery = supabaseAdmin
      .from('whatsapp_messages')
      .select('id, school_id, sent_by, message_type, content, file_name, total_recipients, sent_count, failed_count, status, scheduled_at, created_at, category')
      .order('created_at', { ascending: false })
      .limit(100);
    if (schoolId) historyQuery = historyQuery.eq('school_id', schoolId);
    const allowedCats = allowedCategoriesForRole(req.user?.role);
    if (allowedCats) historyQuery = historyQuery.in('category', allowedCats);
    const { data: history, error: historyError } = await historyQuery;
    if (historyError) throw historyError;

    const linkedMessageIds = new Set(scheduled.map((c) => c.message_id).filter(Boolean));
    const direct = (history || [])
      .filter((message) => !linkedMessageIds.has(message.id))
      .map((message) => ({
        id: `whatsapp-${message.id}`,
        school_id: message.school_id,
        created_by: message.sent_by,
        title: historyTitle(message),
        body: message.content || null,
        type: 'normal',
        attachment_name: message.file_name || null,
        scheduled_at: message.scheduled_at || message.created_at,
        status: historyStatus(message),
        sent_count: message.sent_count || 0,
        failed_count: message.failed_count || 0,
        total_recipients: message.total_recipients || 0,
        created_at: message.created_at,
        message_id: message.id,
        source: 'whatsapp',
      }));

    const comms = [...scheduled, ...direct]
      .sort((a, b) => new Date(b.scheduled_at || b.created_at) - new Date(a.scheduled_at || a.created_at))
      .slice(0, 100);

    // Agrégats de tracking par message lié
    const msgIds = comms.map((c) => c.message_id).filter(Boolean);
    if (msgIds.length) {
      const metricsByMsg = new Map();
      const recs = await selectInChunksPaged(
        msgIds,
        (chunk) => supabaseAdmin
          .from('whatsapp_message_recipients')
          .select('id, message_id, status, read_at, read_channel, responded_at')
          .in('message_id', chunk)
          .order('id', { ascending: true }),
      );
      recs.forEach((r) => {
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
        // Une lecture/réponse ne vaut que sur un envoi réellement remis.
        if (r.read_at && r.status === 'sent') { m.read++; if (r.read_channel === 'app') m.readApp++; else m.readWa++; }
        if (r.responded_at && r.status === 'sent') m.responded++;
      });
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
