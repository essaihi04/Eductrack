/**
 * Routes « Inscriptions » accessibles au module finance (responsable financier).
 *
 * Le finance_manager n'a pas accès aux routes /api/admin (réservées aux admins).
 * Ce routeur expose donc un sous-ensemble strictement nécessaire à l'inscription
 * et la réinscription des élèves, scopé à l'école du demandeur :
 *   - GET  /classes   : classes de l'école (pour le formulaire + cibles de réinscription)
 *   - POST /students  : création d'un nouvel élève (compte auth + profil)
 *
 * La consultation des élèves (cartes) et l'entonnoir de métriques passent par
 * /api/enrollments (déjà accessible à tout utilisateur authentifié, scopé école).
 */

import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authenticate, requireFinanceAccess } from '../middleware/auth.js';
import { mapStudentOptionalFields } from '../utils/studentFields.js';

const router = Router();

router.use(authenticate);
router.use(requireFinanceAccess);

const getSchoolId = (req) => req.user?.school_id || null;

// GET /api/inscriptions/classes?academic_year=YYYY/YYYY
// Classes de l'école (optionnellement filtrées par année scolaire).
router.get('/classes', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.json([]);
    let q = supabaseAdmin
      .from('classes')
      .select('id, name, level, filiere, academic_year, capacity')
      .eq('school_id', schoolId)
      .order('name', { ascending: true });
    if (req.query.academic_year) q = q.eq('academic_year', req.query.academic_year);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('GET /inscriptions/classes:', e);
    res.status(500).json({ error: 'Erreur serveur', details: e.message });
  }
});

// POST /api/inscriptions/students
// Crée un élève (compte auth + profil) — mêmes champs que la création admin.
// body: { email, password, firstName, lastName, classId, ...champs fiche }
router.post('/students', async (req, res) => {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return res.status(400).json({ error: 'Aucune école associée au compte' });

    const { email, password, firstName, lastName, classId } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom et prénom requis' });
    if (!email || !password) return res.status(400).json({ error: 'Identifiants (email/mot de passe) requis' });

    // La classe cible doit appartenir à l'école du demandeur.
    if (classId) {
      const { data: cls } = await supabaseAdmin
        .from('classes').select('id').eq('id', classId).eq('school_id', schoolId).maybeSingle();
      if (!cls) return res.status(404).json({ error: 'Classe introuvable dans votre école' });
    }

    // 1. Compte d'authentification
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, role: 'student' },
    });
    if (authError) throw authError;

    // 2. Profil élève
    const profileData = {
      id: authData.user.id,
      email,
      first_name: firstName,
      last_name: lastName,
      role: 'student',
      class_id: classId || null,
      school_id: schoolId,
      ...mapStudentOptionalFields(req.body),
    };
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert(profileData)
      .select()
      .single();
    if (profileError) {
      // Nettoyage : supprimer le compte auth orphelin si le profil échoue.
      try { await supabaseAdmin.auth.admin.deleteUser(authData.user.id); } catch (_) {}
      throw profileError;
    }

    res.status(201).json({ ...profile, password });
  } catch (error) {
    console.error('POST /inscriptions/students:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

export default router;
