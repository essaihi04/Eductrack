// Gestion des Responsables Pédagogiques (pedagogical_manager) par l'admin et le directeur pédagogique
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

// GET — liste des responsables pédagogiques + leurs scopes
router.get('/', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    let q = supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, role, created_at, school_id')
      .eq('role', 'pedagogical_manager')
      .order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data: managers, error } = await q;
    if (error) throw error;

    const ids = (managers || []).map(m => m.id);
    let scopesByManager = {};
    if (ids.length > 0) {
      const { data: scopes } = await supabaseAdmin
        .from('pedagogical_manager_scopes')
        .select('manager_id, class_id, level, classes(id, name, level)')
        .in('manager_id', ids);
      scopesByManager = (scopes || []).reduce((acc, s) => {
        (acc[s.manager_id] ||= []).push(s);
        return acc;
      }, {});
    }

    const enriched = (managers || []).map(m => ({
      ...m,
      scopes: scopesByManager[m.id] || [],
      class_ids: (scopesByManager[m.id] || []).filter(s => s.class_id).map(s => s.class_id),
      levels: (scopesByManager[m.id] || []).filter(s => s.level).map(s => s.level)
    }));

    res.json({ managers: enriched });
  } catch (error) {
    console.error('Erreur fetch pedagogical-managers:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST — créer un responsable pédagogique
router.post('/', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, password, classIds, levels } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'email, firstName, lastName requis' });
    }
    const schoolId = getSchoolId(req);

    const finalPassword = password || (firstName.substring(0, 1).toUpperCase() + firstName.slice(1).toLowerCase() + new Date().getFullYear());

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'pedagogical_manager' }
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
        role: 'pedagogical_manager',
        school_id: schoolId
      })
      .select()
      .single();
    if (profileError) {
      try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch {}
      throw profileError;
    }

    // Ajouter les scopes (classes + niveaux)
    const scopeRows = [];
    (classIds || []).forEach(cid => scopeRows.push({ manager_id: profile.id, class_id: cid }));
    (levels || []).forEach(lvl => scopeRows.push({ manager_id: profile.id, level: lvl }));
    if (scopeRows.length > 0) {
      await supabaseAdmin.from('pedagogical_manager_scopes').insert(scopeRows);
    }

    res.status(201).json({ ...profile, password: finalPassword });
  } catch (error) {
    console.error('Erreur create pedagogical-manager:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// PUT — modifier infos + scopes (remplacement complet)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, classIds, levels } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (firstName !== undefined) updates.first_name = firstName;
    if (lastName !== undefined) updates.last_name = lastName;
    if (phone !== undefined) updates.phone = phone;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .eq('role', 'pedagogical_manager')
      .select()
      .single();
    if (error) throw error;

    // Mise à jour des scopes si fournis
    if (classIds !== undefined || levels !== undefined) {
      await supabaseAdmin.from('pedagogical_manager_scopes').delete().eq('manager_id', id);
      const scopeRows = [];
      (classIds || []).forEach(cid => scopeRows.push({ manager_id: id, class_id: cid }));
      (levels || []).forEach(lvl => scopeRows.push({ manager_id: id, level: lvl }));
      if (scopeRows.length > 0) {
        await supabaseAdmin.from('pedagogical_manager_scopes').insert(scopeRows);
      }
    }

    res.json(data);
  } catch (error) {
    console.error('Erreur update pedagogical-manager:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /reset-password
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
    if (!profile || profile.role !== 'pedagogical_manager') {
      return res.status(404).json({ error: 'Responsable pédagogique non trouvé' });
    }
    if (req.user.role !== 'super_admin' && profile.school_id !== req.user.school_id) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    await supabaseAdmin.auth.admin.updateUserById(id, { password: newPassword });
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur reset password pedagogical-manager:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await supabaseAdmin.from('profiles').delete().eq('id', id).eq('role', 'pedagogical_manager');
    try { await supabaseAdmin.auth.admin.deleteUser(id); } catch {}
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur delete pedagogical-manager:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
