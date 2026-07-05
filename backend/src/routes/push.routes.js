// Routes pour la gestion des abonnements aux notifications push web
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { getVapidPublicKey, isPushConfigured, sendPushToUser } from '../services/webPush.js';

const router = express.Router();

// GET /vapid-public-key — clé publique VAPID (à appeler par le navigateur)
router.get('/vapid-public-key', (req, res) => {
  if (!isPushConfigured()) return res.status(503).json({ error: 'Push non configuré' });
  res.json({ publicKey: getVapidPublicKey() });
});

router.use(authenticate);

// POST /subscribe — enregistrer une subscription
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Subscription invalide' });
    }
    // Upsert par endpoint
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        user_id: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent || req.headers['user-agent'] || null
      }, { onConflict: 'endpoint' });
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur push subscribe:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /unsubscribe
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) {
      await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur push unsubscribe:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /device-token — enregistrer un jeton d'appareil natif (FCM)
router.post('/device-token', async (req, res) => {
  try {
    const { token, platform, userAgent } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token requis' });
    const { error } = await supabaseAdmin
      .from('device_tokens')
      .upsert({
        user_id: req.user.id,
        token,
        platform: platform || null,
        user_agent: userAgent || req.headers['user-agent'] || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'token' });
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur device-token:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /device-token/delete — retirer un jeton (déconnexion)
router.post('/device-token/delete', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (token) await supabaseAdmin.from('device_tokens').delete().eq('token', token);
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur device-token delete:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /test — envoyer une notif test à l'utilisateur courant (web + natif)
router.post('/test', async (req, res) => {
  try {
    const payload = {
      title: '🔔 Notification test',
      body: 'Les notifications Eductrack fonctionnent !',
      url: '/'
    };
    const result = await sendPushToUser(req.user.id, payload);
    res.json(result);
  } catch (e) {
    console.error('Erreur push test:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
