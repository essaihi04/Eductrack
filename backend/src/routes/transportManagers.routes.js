// Gestion des Responsables Transport (transport_manager) — créés par admin/directeur pédagogique
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requirePedagogicalLeadership } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);
router.use(requirePedagogicalLeadership);

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.body.school_id || req.query.school_id || null;
  return req.user.school_id || null;
};

// GET — liste
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, role, created_at, school_id')
      .eq('role', 'transport_manager')
      .order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ managers: data || [] });
  } catch (e) {
    console.error('Erreur fetch transport-managers:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — créer
router.post('/', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, password } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'email, firstName, lastName requis' });
    }
    const schoolId = getSchoolId(req);
    const finalPassword = password || (firstName.substring(0, 1).toUpperCase() + firstName.slice(1).toLowerCase() + new Date().getFullYear());

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email, password: finalPassword, email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'transport_manager' }
    });
    if (authError) throw authError;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({ id: authData.user.id, email, first_name: firstName, last_name: lastName, phone: phone || null, role: 'transport_manager', school_id: schoolId })
      .select().single();
    if (profileError) {
      try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch {}
      throw profileError;
    }
    res.status(201).json({ ...profile, password: finalPassword });
  } catch (e) {
    console.error('Erreur create transport-manager:', e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
});

// PUT — modifier
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (firstName !== undefined) updates.first_name = firstName;
    if (lastName !== undefined) updates.last_name = lastName;
    if (phone !== undefined) updates.phone = phone;
    const { data, error } = await supabaseAdmin
      .from('profiles').update(updates)
      .eq('id', id).eq('role', 'transport_manager')
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('Erreur update transport-manager:', e);
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
    if (!p || p.role !== 'transport_manager') return res.status(404).json({ error: 'Non trouvé' });
    if (req.user.role !== 'super_admin' && p.school_id !== req.user.school_id) return res.status(403).json({ error: 'Accès refusé' });
    await supabaseAdmin.auth.admin.updateUserById(id, { password: newPassword });
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur reset transport-manager:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('profiles').delete().eq('id', id).eq('role', 'transport_manager');
    try { await supabaseAdmin.auth.admin.deleteUser(id); } catch {}
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur delete transport-manager:', e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
