import express from 'express';
import rateLimit from 'express-rate-limit';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { profilePhotoUpload, uploadProfilePhotoFile } from '../utils/profilePhoto.js';

const router = express.Router();

// Anti brute-force : 10 tentatives / 15 min / IP sur les routes sensibles
// (login, register, change-password). Les tentatives réussies ne comptent pas.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes' },
});

// Inscription publique — SÉCURITÉ : le rôle est TOUJOURS forcé à 'student'.
// Le champ `role` envoyé par le client est ignoré ; les comptes staff (admin,
// prof, finance…) ne se créent que via les routes admin authentifiées.
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    // Créer l'utilisateur
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'student'
      }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // Créer le profil
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        role: 'student'
      })
      .select()
      .single();

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    res.status(201).json({ user: authData.user, profile });
  } catch (error) {
    console.error('Erreur d\'inscription:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    // Récupérer le profil
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    res.json({
      user: data.user,
      session: data.session,
      profile
    });
  } catch (error) {
    console.error('Erreur de connexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Déconnexion
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      await supabase.auth.signOut();
    }

    res.json({ message: 'Déconnexion réussie' });
  } catch (error) {
    console.error('Erreur de déconnexion:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer l'utilisateur actuel
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Si le profil n'existe pas mais l'utilisateur Auth existe, créer le profil automatiquement
    if (profileError && profileError.code === 'PGRST116') {
      console.log(`[Auth /me] Profil manquant pour ${user.email}, création automatique...`);
      
      // Extraire les informations depuis les métadonnées Auth
      const metadata = user.user_metadata || {};
      const firstName = metadata.first_name || user.email?.split('@')[0] || 'Utilisateur';
      const lastName = metadata.last_name || '';
      // SÉCURITÉ : user_metadata est modifiable par l'utilisateur lui-même
      // (supabase.auth.updateUser) → ne JAMAIS en déduire un rôle privilégié.
      const role = 'student';
      
      // Créer le profil
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          first_name: firstName,
          last_name: lastName,
          role: role,
          school_id: null, // Sera mis à jour plus tard par l'admin
          class_id: null
        })
        .select()
        .single();
      
      if (createError) {
        console.error(`[Auth /me] Erreur création profil pour ${user.email}:`, createError);
        return res.status(500).json({ error: 'Impossible de créer le profil' });
      }
      
      console.log(`[Auth /me] Profil créé avec succès pour ${user.email}`);
      profile = newProfile;
    } else if (profileError) {
      console.error(`[Auth /me] Erreur récupération profil pour ${user.email}:`, profileError);
      // Panne passagère côté base (ex: PGRST003 « pool de connexions saturé »,
      // timeout 504) : renvoyer 503 pour que le front réessaie automatiquement,
      // au lieu d'un 404 qui le fait abandonner alors que le profil existe.
      return res.status(503).json({ error: 'Base de données momentanément indisponible', details: profileError.code || profileError.message });
    }

    // Enrichir le profil avec les infos de l'école (nom + logo)
    let school = null;
    if (profile.school_id) {
      const { data: schoolData } = await supabaseAdmin
        .from('schools')
        .select('id, name, code, logo_url')
        .eq('id', profile.school_id)
        .single();
      school = schoolData;
    }

    // Écoles que ce compte peut piloter (multi-établissements sur un même compte).
    // On y inclut toujours l'école active courante.
    let available_schools = [];
    const { data: links } = await supabaseAdmin
      .from('account_schools')
      .select('school:schools(id, name, code, logo_url)')
      .eq('user_id', user.id);
    const byId = new Map();
    (links || []).forEach((l) => { if (l.school) byId.set(l.school.id, l.school); });
    if (school) byId.set(school.id, school);
    available_schools = Array.from(byId.values());

    res.json({ user, profile: { ...profile, school }, available_schools });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Basculer l'école active du compte (multi-établissements).
// Met à jour profiles.school_id : toutes les routes scopées sur req.user.school_id suivent.
router.post('/switch-school', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token manquant' });

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Token invalide' });

    const { school_id } = req.body;
    if (!school_id) return res.status(400).json({ error: 'school_id requis' });

    // Ensemble des écoles autorisées = account_schools ∪ école active courante.
    const { data: profile } = await supabaseAdmin
      .from('profiles').select('school_id').eq('id', user.id).single();
    const { data: links } = await supabaseAdmin
      .from('account_schools').select('school_id').eq('user_id', user.id);
    const allowed = new Set([
      ...(profile?.school_id ? [profile.school_id] : []),
      ...((links || []).map((l) => l.school_id)),
    ]);

    if (!allowed.has(school_id)) {
      return res.status(403).json({ error: 'Accès à cette école non autorisé' });
    }

    const { error: updErr } = await supabaseAdmin
      .from('profiles').update({ school_id }).eq('id', user.id);
    if (updErr) throw updErr;

    const { data: school } = await supabaseAdmin
      .from('schools').select('id, name, code, logo_url').eq('id', school_id).single();

    res.json({ success: true, school });
  } catch (error) {
    console.error('Erreur switch-school:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Importer sa propre photo de profil (tous les rôles authentifiés).
// L'ancienne route /students/me/photo reste disponible pour compatibilité,
// mais le profil parent ne doit pas dépendre d'une autorisation « student ».
router.post('/profile/photo', profilePhotoUpload.single('photo'), async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token manquant' });

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Utilisateur non authentifié' });
    if (!req.file) return res.status(400).json({ error: 'Aucune image fournie' });

    const avatar_url = await uploadProfilePhotoFile(req.file);
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url })
      .eq('id', user.id)
      .select('id, avatar_url')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erreur upload photo profil:', error);
    res.status(500).json({ error: error.message || 'Erreur serveur' });
  }
});

// Mettre à jour le profil (tous les utilisateurs)
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    const { first_name, last_name, phone, avatar, avatar_url } = req.body;

    const updateData = {};
    if (phone !== undefined) updateData.phone = phone;
    if (avatar !== undefined) updateData.avatar = avatar;
    // avatar_url: null pour revenir à l'avatar emoji après une photo importée
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Erreur mise à jour profil:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Changer le mot de passe (tous les utilisateurs)
router.post('/change-password', authLimiter, async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
    }

    // Récupérer l'utilisateur via le token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    // Vérifier le mot de passe actuel
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });

    if (signInError) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }

    // Mettre à jour le mot de passe via admin
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword
    });

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    console.error('Erreur changement mot de passe:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
