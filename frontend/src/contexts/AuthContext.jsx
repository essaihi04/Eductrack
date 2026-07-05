import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, supabaseUrl } from '../lib/supabase';
import { cacheSplashSchool } from '../components/SchoolSplash';
import { ensureNativePushRegistered, disableNativePush } from '../lib/nativePush';

const AuthContext = createContext({});

const classifyAuthError = async (error) => {
  const message = error?.message || '';
  const name = error?.name || '';

  if (
    name === 'AuthRetryableFetchError'
    || /failed to fetch/i.test(message)
    || /networkerror/i.test(message)
    || /load failed/i.test(message)
  ) {
    try {
      const healthUrl = `${supabaseUrl}/auth/v1/health`;
      const response = await fetch(healthUrl, { method: 'GET' });

      if (!response.ok) {
        return {
          ...error,
          friendlyMessage: 'Connexion impossible au service d’authentification. Vérifiez la connexion internet ou le certificat du téléphone.',
          errorCategory: 'network_auth_service',
        };
      }
    } catch (_networkCheckError) {
      return {
        ...error,
        friendlyMessage: 'Impossible de joindre le service de connexion depuis cet appareil. Vérifiez internet, la date/heure du téléphone, ou essayez un autre réseau.',
        errorCategory: 'network_unreachable',
      };
    }

    return {
      ...error,
      friendlyMessage: 'Le service de connexion est joignable, mais cet appareil bloque la requête. Vérifiez le navigateur, le VPN, le proxy ou les restrictions réseau.',
      errorCategory: 'device_network_block',
    };
  }

  return error;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [school, setSchool] = useState(null);
  const [availableSchools, setAvailableSchools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Vérifier la session active
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Écouter les changements d'authentification
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No session token available');
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.statusText}`);
      }

      const data = await response.json();
      setProfile(data.profile);
      const activeSchool = data.profile?.school || data.school || null;
      setSchool(activeSchool);
      setAvailableSchools(data.available_schools || []);
      // Mémorise le logo de l'école pour le splash de bienvenue : au prochain
      // chargement, l'animation démarre avant même que le profil ne soit chargé.
      cacheSplashSchool(data.profile?.email, activeSchool);
      // App installée : rafraîchit le jeton push natif (sans pop-up) si déjà autorisé.
      ensureNativePushRegistered();
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  // Bascule l'école active du compte (multi-établissements) puis recharge le profil.
  const switchSchool = async (schoolId) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée');
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const response = await fetch(`${apiUrl}/api/auth/switch-school`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ school_id: schoolId }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Changement d’école impossible');
    }
    await fetchProfile(session.user.id);
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw await classifyAuthError(error);
    }
    return data;
  };

  const signUp = async (email, password, userData) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
      },
    });

    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    // App installée : retire le jeton push de cet appareil pour ne plus recevoir
    // les notifications de ce compte après déconnexion.
    try { await disableNativePush(); } catch (_) { /* ignore */ }
    // Tente d'abord un logout serveur (révoque le refresh token côté Supabase).
    // Si la session est déjà invalide (ex: mot de passe changé juste avant),
    // l'appel échoue avec AuthSessionMissingError / 403 — on l'ignore et on
    // bascule sur un nettoyage purement local pour que l'utilisateur soit
    // bien déconnecté côté UI dans tous les cas.
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        const msg = String(error?.message || '').toLowerCase();
        const isSessionMissing =
          error?.name === 'AuthSessionMissingError' ||
          msg.includes('session missing') ||
          msg.includes('session_not_found') ||
          error?.status === 401 || error?.status === 403;
        if (!isSessionMissing) {
          console.warn('[auth] signOut server error (ignoré):', error);
        }
        // Fallback : nettoyage local explicite
        try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) { /* ignore */ }
      }
    } catch (e) {
      console.warn('[auth] signOut exception (ignorée):', e?.message);
      try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) { /* ignore */ }
    }

    // Sécurité : on purge en plus tous les artefacts Supabase du storage,
    // au cas où la lib n'aurait pas réussi.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') || k.startsWith('supabase.'))
        .forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* ignore */ }

    setUser(null);
    setProfile(null);
    setSchool(null);
    setAvailableSchools([]);
  };

  const value = {
    user,
    profile,
    school,
    availableSchools,
    switchSchool,
    loading,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
