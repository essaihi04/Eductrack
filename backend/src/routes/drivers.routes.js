// Gestion des Chauffeurs (driver) — créés par admin / directeur pédagogique / transport_manager
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireTransportManagement } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);
router.use(requireTransportManagement);

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.body.school_id || req.query.school_id || null;
  return req.user.school_id || null;
};

// GET
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, role, created_at, school_id')
      .eq('role', 'driver')
      .order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) throw error;

    // Bus assigné
    const ids = (data || []).map(d => d.id);
    let busByDriver = {};
    if (ids.length > 0) {
      const { data: buses } = await supabaseAdmin
        .from('buses').select('id, plate_number, model, driver_id').in('driver_id', ids);
      busByDriver = (buses || []).reduce((acc, b) => { acc[b.driver_id] = b; return acc; }, {});
    }
    res.json({ drivers: (data || []).map(d => ({ ...d, bus: busByDriver[d.id] || null })) });
  } catch (e) {
    console.error('Erreur fetch drivers:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST
router.post('/', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, password } = req.body;
    if (!email || !firstName || !lastName) return res.status(400).json({ error: 'email, firstName, lastName requis' });
    const schoolId = getSchoolId(req);
    const finalPassword = password || (firstName.substring(0, 1).toUpperCase() + firstName.slice(1).toLowerCase() + new Date().getFullYear());

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password: finalPassword, email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'driver' }
    });
    if (authError) throw authError;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: authData.user.id, email, first_name: firstName, last_name: lastName, phone: phone || null, role: 'driver', school_id: schoolId })
      .select().single();
    if (profileError) {
      try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch {}
      throw profileError;
    }
    res.status(201).json({ ...profile, password: finalPassword });
  } catch (e) {
    console.error('Erreur create driver:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// PUT
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (firstName !== undefined) updates.first_name = firstName;
    if (lastName !== undefined) updates.last_name = lastName;
    if (phone !== undefined) updates.phone = phone;
    const { data, error } = await supabaseAdmin
      .from('profiles').update(updates).eq('id', id).eq('role', 'driver')
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Erreur update driver:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /:id/reset-password
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mot de passe min 6 caractères' });
    const { data: p } = await supabaseAdmin.from('profiles').select('id, role, school_id').eq('id', id).single();
    if (!p || p.role !== 'driver') return res.status(404).json({ error: 'Non trouvé' });
    if (req.user.role !== 'super_admin' && p.school_id !== req.user.school_id) return res.status(403).json({ error: 'Accès refusé' });
    await supabaseAdmin.auth.admin.updateUserById(id, { password: newPassword });
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur reset driver:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('profiles').delete().eq('id', id).eq('role', 'driver');
    try { await supabaseAdmin.auth.admin.deleteUser(id); } catch {}
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur delete driver:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
