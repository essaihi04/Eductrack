// Gestion des Directeurs Pédagogiques (pedagogical_director) par l'admin
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireFullAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireFullAdmin);

const getSchoolId = (req) => {
  if (req.user.role === 'super_admin') return req.body.school_id || req.query.school_id || null;
  return req.user.school_id || null;
};

// GET — liste des directeurs pédagogiques
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, role, created_at, school_id')
      .eq('role', 'pedagogical_director')
      .order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ directors: data || [] });
  } catch (error) {
    console.error('Erreur fetch pedagogical-directors:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — créer un directeur pédagogique
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
      user_metadata: { first_name: firstName, last_name: lastName, role: 'pedagogical_director' }
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
        role: 'pedagogical_director',
        school_id: schoolId
      })
      .select()
      .single();
    if (profileError) {
      try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch {}
      throw profileError;
    }

    res.status(201).json({ ...profile, password: finalPassword });
  } catch (error) {
    console.error('Erreur create pedagogical-director:', error);
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
      .eq('role', 'pedagogical_director')
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur update pedagogical-director:', error);
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

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('id, role, school_id')
      .eq('id', id).single();
    if (!profile || profile.role !== 'pedagogical_director') {
      return res.status(404).json({ error: 'Directeur pédagogique non trouvé' });
    }
    if (req.user.role !== 'super_admin' && profile.school_id !== req.user.school_id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    await supabaseAdmin.auth.admin.updateUserById(id, { password: newPassword });
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur reset password pedagogical-director:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE — supprimer
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('profiles').delete().eq('id', id).eq('role', 'pedagogical_director');
    try { await supabaseAdmin.auth.admin.deleteUser(id); } catch {}
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur delete pedagogical-director:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
