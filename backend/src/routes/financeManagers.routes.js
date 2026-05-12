// Gestion des Responsables Financiers (finance_manager) par l'admin
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireSchoolAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSchoolAdmin);

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.body.school_id || req.query.school_id || null;
  return req.user.school_id || null;
};

// GET — liste des responsables financiers
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, role, created_at, school_id')
      .eq('role', 'finance_manager')
      .order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ managers: data || [] });
  } catch (error) {
    console.error('Erreur fetch finance-managers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — créer un responsable financier
router.post('/', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, password } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'email, firstName, lastName requis' });
    }
    const schoolId = getSchoolId(req);

    const finalPassword = password || (firstName.substring(0, 1).toUpperCase() + firstName.slice(1).toLowerCase() + new Date().getFullYear());

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'finance_manager' }
    });
    if (authError) throw authError;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        role: 'finance_manager',
        school_id: schoolId
      })
      .select()
      .single();
    if (profileError) {
      // rollback auth
      try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch {}
      throw profileError;
    }

    res.status(201).json({ ...profile, password: finalPassword });
  } catch (error) {
    console.error('Erreur create finance-manager:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
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
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .eq('role', 'finance_manager')
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur update finance-manager:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /reset-password — réinitialiser le mot de passe
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Mot de passe min 6 caractères' });
    }

    // Vérifier que c'est bien un finance_manager de la même école
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('id, role, school_id')
      .eq('id', id).single();
    if (!profile || profile.role !== 'finance_manager') {
      return res.status(404).json({ error: 'Responsable financier non trouvé' });
    }
    if (req.user.role !== 'super_admin' && profile.school_id !== req.user.school_id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    await supabaseAdmin.auth.admin.updateUserById(id, { password: newPassword });
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur reset password finance-manager:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — supprimer
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('profiles').delete().eq('id', id).eq('role', 'finance_manager');
    try { await supabaseAdmin.auth.admin.deleteUser(id); } catch {}
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur delete finance-manager:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
