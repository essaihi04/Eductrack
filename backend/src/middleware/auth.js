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

    if (!roles.includes(req.user.role)) {
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
  if (!['super_admin', 'admin', 'school_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
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
