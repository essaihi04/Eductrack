import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { markNotificationsRead } from '../services/communicationTracking.js';

const router = express.Router();

router.use(authenticate);

// Récupérer les notifications de l'utilisateur
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Marquer une notification comme lue
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    // Tracking communications : propage la lecture au hub (canal app)
    markNotificationsRead([id]).catch(() => {});
    res.json(data);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Marquer toutes les notifications comme lues
router.put('/read-all', async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .select();

    if (error) throw error;
    // Tracking communications : propage la lecture au hub (canal app)
    markNotificationsRead((data || []).map((n) => n.id)).catch(() => {});
    res.json({ message: 'Notifications marquées comme lues' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Compter les notifications non lues
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('[DEBUG] Unread count requested for user:', userId);

    const { data, error, count } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    console.log('[DEBUG] Unread count query result:', { data, error, count });

    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
