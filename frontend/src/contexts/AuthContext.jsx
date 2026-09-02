import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase, supabaseUrl } from '../lib/supabase';
import { cacheSplashSchool } from '../components/SchoolSplash';
import { ensureNativePushRegistered, disableNativePush } from '../lib/nativePush';

const AuthContext = createContext({});

const classifyAuthError = async (error) => {
  const message = error?.message || '';
  const name = error?.name || '';

  // Limite de requêtes Supabase atteinte (comptée par adresse IP : un Wi-Fi
  // d'école partagé par plusieurs comptes peut la dépasser). Les identifiants
  // ne sont pas en cause — il faut juste patienter.
  if (error?.status === 429 || /rate limit/i.test(message)) {
    return {
      ...error,
      friendlyMessage: 'Trop de tentatives de connexion depuis ce réseau. Patientez 5 à 10 minutes puis réessayez — vos identifiants ne sont pas en cause.',
      errorCategory: 'rate_limited',
    };
  }

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

// Erreurs passagères (limite de requêtes, serveur indisponible) : on réessaie
// au lieu d'éjecter l'utilisateur vers le login.
const TRANSIENT_STATUSES = [429, 500, 502, 503, 504];
const RETRY_DELAYS_MS = [2000, 5000, 10000];
const ACCESS_CHECK_INTERVAL_MS = 30000;
const SCHOOL_SUSPENDED_MESSAGE = 'L’accès à votre établissement a été suspendu. Contactez l’administration de votre école.';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [school, setSchool] = useState(null);
  const [availableSchools, setAvailableSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [accessError, setAccessError] = useState(null);
  // Numéro de séquence : si un nouveau fetchProfile démarre (ex: changement de
  // session), les tentatives de l'ancien s'arrêtent au lieu d'écraser l'état.
  const fetchSeq = useRef(0);
  const sessionUserId = useRef(null);
  const invalidateProfileFetch = useCallback(() => { ++fetchSeq.current; }, []);

  const clearSessionState = useCallback(() => {
    // Invalide aussi les réponses /me commencées avant la déconnexion.
    invalidateProfileFetch();
    sessionUserId.current = null;
    setUser(null);
    setProfile(null);
    setSchool(null);
    setAvailableSchools([]);
    setProfileError(null);
    setLoading(false);
  }, [invalidateProfileFetch]);

  const denySchoolAccess = useCallback((message, alternatives = []) => {
    const activeAlternatives = alternatives.filter((entry) => entry.status === 'active');
    if (activeAlternatives.length > 0) {
      // Le compte peut choisir explicitement un autre établissement autorisé,
      // mais aucun écran de l'école suspendue ne reste monté.
      invalidateProfileFetch();
      setProfile(null);
      setSchool(null);
      setAvailableSchools(activeAlternatives);
      setProfileError(null);
      setLoading(false);
    } else {
      clearSessionState();
      // Le retrait de l'accès est immédiat dans l'interface, même si Supabase
      // est momentanément indisponible. Le backend refuse déjà les requêtes.
      void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    setAccessError(message || SCHOOL_SUSPENDED_MESSAGE);
  }, [clearSessionState, invalidateProfileFetch]);

  const fetchProfile = useCallback(async (_userId, accessToken = null, { background = false } = {}) => {
    const seq = ++fetchSeq.current;
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    let token = accessToken;
    let triedRefresh = false;

    const done = (fn) => {
      if (seq !== fetchSeq.current) return true;
      if (fn) fn();
      setLoading(false);
      return true;
    };

    for (let attempt = 0; ; attempt++) {
      try {
        if (!token) {
          const { data: { session } } = await supabase.auth.getSession();
          token = session?.access_token;
        }
        if (seq !== fetchSeq.current) return;
        if (!token) {
          // Session pas (encore) disponible — souvent un rafraîchissement
          // bloqué en 429 : on retente, ce n'est pas une déconnexion.
          const err = new Error('No session token available');
          err.transient = true;
          throw err;
        }

        const response = await fetch(`${apiUrl}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` },
          cache: 'no-store',
        });
        if (seq !== fetchSeq.current) return;

        if (response.status === 401 || response.status === 403) {
          const denial = await response.json().catch(() => ({}));
          if (seq !== fetchSeq.current) return;
          if (response.status === 403 && ['SCHOOL_SUSPENDED', 'SCHOOL_UNAVAILABLE'].includes(denial.code)) {
            // Une suspension ne sera pas résolue par un nouveau jeton.
            denySchoolAccess(denial.error, denial.available_schools);
            return;
          }
          // Jeton refusé par le backend (cas typique : session périmée restée
          // dans le localStorage d'un PC). Une seule fois : forcer un vrai
          // rafraîchissement auprès de Supabase.
          if (!triedRefresh) {
            triedRefresh = true;
            const { data, error } = await supabase.auth.refreshSession();
            if (!error && data?.session?.access_token) {
              token = data.session.access_token;
              continue;
            }
          }
          // Session réellement morte : on purge proprement pour repartir sur
          // un login sain, plutôt que de boucler sur des 401.
          if (seq !== fetchSeq.current) return;
          clearSessionState();
          try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
          return;
        }

        if (!response.ok) {
          const err = new Error(`Failed to fetch profile: ${response.status}`);
          err.transient = TRANSIENT_STATUSES.includes(response.status);
          throw err;
        }

        const data = await response.json();
        if (seq !== fetchSeq.current) return;
        const activeSchool = data.profile?.school || data.school || null;
        if (data.profile?.role !== 'super_admin' && activeSchool?.status === 'suspended') {
          denySchoolAccess(SCHOOL_SUSPENDED_MESSAGE, data.available_schools);
          return;
        }
        done(() => {
          // Les contrôles réguliers ne doivent pas recharger tous les écrans
          // qui dépendent du profil lorsque celui-ci n'a pas changé.
          setProfile((previous) => JSON.stringify(previous) === JSON.stringify(data.profile) ? previous : data.profile);
          setSchool((previous) => JSON.stringify(previous) === JSON.stringify(activeSchool) ? previous : activeSchool);
          const permittedSchools = data.profile?.role === 'super_admin'
            ? data.available_schools || []
            : (data.available_schools || []).filter((entry) => entry.status !== 'suspended');
          setAvailableSchools((previous) => JSON.stringify(previous) === JSON.stringify(permittedSchools) ? previous : permittedSchools);
          setProfileError(null);
          setAccessError(null);
          // Mémorise le logo de l'école pour le splash de bienvenue : au prochain
          // chargement, l'animation démarre avant même que le profil ne soit chargé.
          if (!background) cacheSplashSchool(data.profile?.email, activeSchool);
          // App installée : rafraîchit le jeton push natif (sans pop-up) si déjà autorisé.
          if (!background) ensureNativePushRegistered();
        });
        return;
      } catch (error) {
        if (seq !== fetchSeq.current) return;
        // Un échec réseau de fetch() est un TypeError : passager lui aussi.
        const transient = error.transient === true || error instanceof TypeError;
        if (transient && attempt < RETRY_DELAYS_MS.length) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          token = null; // relire la session au prochain essai
          continue;
        }
        console.error('Error fetching profile:', error);
        done(() => {
          setProfileError('Le serveur est momentanément saturé ou injoignable. Patientez quelques instants puis réessayez — inutile de retaper vos identifiants.');
        });
        return;
      }
    }
  }, [clearSessionState, denySchoolAccess]);

  useEffect(() => {
    let disposed = false;
    const applySession = (session) => {
      if (disposed) return;
      const nextUserId = session?.user?.id || null;
      if (!nextUserId) {
        clearSessionState();
        return;
      }
      if (sessionUserId.current !== nextUserId) {
        setProfile(null);
        setSchool(null);
        setAvailableSchools([]);
        setProfileError(null);
        setLoading(true);
      }
      sessionUserId.current = nextUserId;
      setUser(session.user);
      void fetchProfile(nextUserId, session.access_token);
    };

    // Supabase émet INITIAL_SESSION puis les connexions et renouvellements.
    // Une seule source évite qu'un getSession ancien restaure une session
    // après un SIGNED_OUT ou une suspension.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      disposed = true;
      invalidateProfileFetch();
      subscription.unsubscribe();
    };
  }, [clearSessionState, fetchProfile, invalidateProfileFetch]);

  useEffect(() => {
    if (!user?.id || !profile || profile.role === 'super_admin') return;
    let checking = false;
    let lastCheckAt = 0;
    const checkAccess = async () => {
      if (document.visibilityState === 'hidden' || checking || Date.now() - lastCheckAt < 1000) return;
      checking = true;
      lastCheckAt = Date.now();
      try {
        await fetchProfile(user.id, null, { background: true });
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(checkAccess, ACCESS_CHECK_INTERVAL_MS);
    window.addEventListener('focus', checkAccess);
    document.addEventListener('visibilitychange', checkAccess);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkAccess);
      document.removeEventListener('visibilitychange', checkAccess);
    };
  }, [user?.id, profile, fetchProfile]);

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
    setProfile(null);
    setSchool(null);
    setAccessError(null);
    setProfileError(null);
    setLoading(true);
    await fetchProfile(session.user.id);
  };

  const signIn = async (email, password) => {
    setAccessError(null);
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
    // Empêche une réponse de profil tardive de rendre l'accès pendant le logout.
    clearSessionState();
    setAccessError(null);
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

    clearSessionState();
  };

  // Recharge le profil (et l'école associée) — utilisé après une mise à jour
  // côté serveur qui doit se refléter dans l'UI (ex : changement de logo),
  // ou pour réessayer après une erreur passagère (bouton « Réessayer »).
  const refreshProfile = async () => {
    setProfileError(null);
    await fetchProfile();
  };

  const value = {
    user,
    profile,
    school,
    availableSchools,
    switchSchool,
    loading,
    profileError,
    accessError,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
