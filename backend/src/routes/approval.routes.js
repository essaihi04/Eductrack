import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  ELEMENT_TYPES, reviewRequest, pendingStats, managerClassIds,
} from '../services/approvals.js';

const router = express.Router();
router.use(authenticate);

const CONFIG_ROLES = ['admin', 'school_admin', 'pedagogical_director'];
const REVIEW_ROLES = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'];

const schoolOf = (req) => req.user.school_id;
const isManager = (req) => req.user.role === 'pedagogical_manager';

// Table cible + colonne publié pour appliquer la décision
const ELEMENT_TARGET = {
  signalement: { table: 'issue_reports', col: 'is_published' },
  activity: { table: 'extracurricular_activities', col: 'is_published' },
  feed: { table: 'classroom_feed_posts', col: 'is_published' },
  lost_item: { table: 'lost_items', col: 'is_published' },
};

async function applyDecisionEffect(elementType, elementId, approved) {
  const target = ELEMENT_TARGET[elementType];
  if (!target) return; // grade/homework/control : pas d'effet de publication direct
  await supabaseAdmin.from(target.table).update({ [target.col]: approved }).eq('id', elementId);
}

// ── Réglages : quels types exigent une approbation ──
router.get('/settings', authorize(...REVIEW_ROLES), async (req, res) => {
  try {
    const schoolId = schoolOf(req);
    const { data } = await supabaseAdmin
      .from('approval_settings')
      .select('element_type, requires_approval')
      .eq('school_id', schoolId);
    const map = Object.fromEntries((data || []).map((s) => [s.element_type, s.requires_approval]));
    const settings = Object.entries(ELEMENT_TYPES).map(([type, label]) => ({
      element_type: type, label, requires_approval: map[type] === true,
    }));
    res.json({ settings, can_configure: CONFIG_ROLES.includes(req.user.role) });
  } catch (e) {
    console.error('GET /approvals/settings', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/settings', authorize(...CONFIG_ROLES), async (req, res) => {
  try {
    // Le responsable pédagogique ne configure pas (authorize l'autorise via
    // l'héritage admin) : on le bloque explicitement ici.
    if (!CONFIG_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Configuration réservée à l\'admin et au directeur pédagogique.' });
    }
    const schoolId = schoolOf(req);
    const { element_type, requires_approval } = req.body;
    if (!ELEMENT_TYPES[element_type]) return res.status(400).json({ error: 'Type inconnu' });
    const { error } = await supabaseAdmin
      .from('approval_settings')
      .upsert({ school_id: schoolId, element_type, requires_approval: !!requires_approval, updated_at: new Date().toISOString() }, { onConflict: 'school_id,element_type' });
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /approvals/settings', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ── Boîte de validation ──
router.get('/requests', authorize(...REVIEW_ROLES), async (req, res) => {
  try {
    const schoolId = schoolOf(req);
    const status = req.query.status || 'pending';
    let q = supabaseAdmin
      .from('approval_requests')
      .select('*, requester:requested_by(first_name, last_name), reviewer:reviewed_by(first_name, last_name), classes(name)')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (status !== 'all') q = q.eq('status', status);

    // Responsable pédagogique : limité à ses classes
    if (isManager(req)) {
      const classIds = await managerClassIds(req.user.id);
      q = q.in('class_id', classIds.length ? classIds : ['00000000-0000-0000-0000-000000000000']);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('GET /approvals/requests', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/stats', authorize(...REVIEW_ROLES), async (req, res) => {
  try {
    const schoolId = schoolOf(req);
    const classIds = isManager(req) ? await managerClassIds(req.user.id) : null;
    res.json(await pendingStats(schoolId, classIds));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function handleDecision(req, res, decision) {
  try {
    const reviewerName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();
    // Charger la demande pour appliquer l'effet sur le bon élément
    const { data: reqRow } = await supabaseAdmin
      .from('approval_requests')
      .select('id, element_type, element_id, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!reqRow) return res.status(404).json({ error: 'Demande introuvable' });
    if (reqRow.status !== 'pending') return res.status(409).json({ error: 'Demande déjà traitée' });

    const updated = await reviewRequest({
      requestId: req.params.id, decision, reviewerId: req.user.id, reviewerName, reason: req.body?.reason,
    });
    if (!updated) return res.status(409).json({ error: 'Demande déjà traitée' });

    await applyDecisionEffect(reqRow.element_type, reqRow.element_id, decision === 'approved');
    res.json({ success: true, request: updated });
  } catch (e) {
    console.error('POST /approvals decision', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

router.post('/requests/:id/approve', authorize(...REVIEW_ROLES), (req, res) => handleDecision(req, res, 'approved'));
router.post('/requests/:id/reject', authorize(...REVIEW_ROLES), (req, res) => handleDecision(req, res, 'rejected'));

export default router;
