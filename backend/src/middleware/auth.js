import { supabase, supabaseAdmin } from '../config/supabase.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token manquant' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    // Récupérer le profil utilisateur avec son rôle (utiliser supabaseAdmin pour contourner RLS)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
    }

    req.user = { ...user, ...profile };
    next();
  } catch (error) {
    console.error('Erreur d\'authentification:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // super_admin a accès à tout
    if (req.user.role === 'super_admin') {
      return next();
    }

    // pedagogical_director et pedagogical_manager héritent des droits admin/school_admin
    // (le manager sera filtré sur les classes assignées via getScopedClassIds)
    const allowedRoles = (roles.includes('admin') || roles.includes('school_admin'))
      ? [...roles, 'pedagogical_director', 'pedagogical_manager']
      : roles;

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    next();
  };
};

export const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Accès réservé au super administrateur' });
  }
  next();
};

export const requireSchoolAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  if (!['super_admin', 'admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
};

// Réservé à admin + directeur pédagogique : peut gérer les responsables pédagogiques (manager)
// Exclut le pedagogical_manager lui-même (il ne peut pas créer d'autres managers)
export const requirePedagogicalLeadership = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  if (!['super_admin', 'admin', 'school_admin', 'pedagogical_director'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès réservé à la direction' });
  }
  next();
};

/**
 * Récupère la liste des class_ids autorisés pour l'utilisateur courant.
 * @returns {Promise<string[]|null>} null = pas de restriction (admin complet) ; sinon liste d'UUIDs.
 */
export const getScopedClassIds = async (req) => {
  if (!req.user) return [];
  // Rôles non restreints
  if (['super_admin', 'admin', 'school_admin', 'pedagogical_director'].includes(req.user.role)) {
    return null;
  }
  if (req.user.role !== 'pedagogical_manager') {
    // Autres rôles : pas de scope pédagogique
    return [];
  }

  // 1) Classes assignées directement
  const { data: scopes } = await supabaseAdmin
    .from('pedagogical_manager_scopes')
    .select('class_id, level')
    .eq('manager_id', req.user.id);

  const directClassIds = (scopes || []).filter(s => s.class_id).map(s => s.class_id);
  const levels = (scopes || []).filter(s => s.level).map(s => s.level);

  let levelClassIds = [];
  if (levels.length > 0) {
    let q = supabaseAdmin.from('classes').select('id').in('level', levels);
    if (req.user.school_id) q = q.eq('school_id', req.user.school_id);
    const { data: lvlClasses } = await q;
    levelClassIds = (lvlClasses || []).map(c => c.id);
  }

  return Array.from(new Set([...directClassIds, ...levelClassIds]));
};

/**
 * Applique un filtre IN sur class_id si l'utilisateur est restreint (pedagogical_manager).
 * Si aucune classe n'est dans le scope, retourne une requête vide (filtre impossible : .in('id', [''])).
 */
export const applyScopeFilter = async (query, req, columnName = 'class_id') => {
  const scopedIds = await getScopedClassIds(req);
  if (scopedIds === null) return query; // pas de restriction
  if (scopedIds.length === 0) {
    // Aucune classe assignée → ne renvoie rien
    return query.eq(columnName, '00000000-0000-0000-0000-000000000000');
  }
  return query.in(columnName, scopedIds);
};

// Réservé aux admins "complets" — exclut le directeur pédagogique
// Utilisé pour les actions sensibles (créer un autre admin, gérer les responsables financiers, etc.)
export const requireFullAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  if (!['super_admin', 'admin', 'school_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs principaux' });
  }
  next();
};

// Accès au module finance: admin, school_admin, super_admin, finance_manager
export const requireFinanceAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  if (!['super_admin', 'admin', 'school_admin', 'finance_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès réservé au personnel financier' });
  }
  next();
};

// Accès au module transport (gestion) : admin, school_admin, super_admin,
// pedagogical_director, transport_manager
export const requireTransportAccess = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  if (!['super_admin', 'admin', 'school_admin', 'pedagogical_director', 'transport_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès réservé au personnel transport' });
  }
  next();
};

// Réservé aux personnes habilitées à créer/gérer responsables transport et chauffeurs
export const requireTransportManagement = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  if (!['super_admin', 'admin', 'school_admin', 'pedagogical_director', 'transport_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès réservé à la direction transport' });
  }
  next();
};

// Vérifie qu'un chauffeur (driver) ne touche qu'à ses propres trajets
export const requireDriverOrTransportAccess = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  const ok = ['super_admin', 'admin', 'school_admin', 'pedagogical_director', 'transport_manager', 'driver'].includes(req.user.role);
  if (!ok) return res.status(403).json({ error: 'Accès refusé' });
  next();
};

