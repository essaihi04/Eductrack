import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, AlertCircle, Compass } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import SchoolSplash, { readSplashCache } from '../components/SchoolSplash';
import BrandLogo, { BOUSSOULE_TAGLINE } from '../components/BrandLogo';

// App desktop Electron : on donne le focus au champ email dès l'arrivée sur la
// page (ex: après déconnexion) — le focus clavier programmatique fonctionne
// même quand la fenêtre a du mal à redonner le focus au clic.
const isDesktopApp = /electron/i.test(navigator.userAgent);

/** Page d'accueil selon le rôle : admins et finance passent par le choix d'année. */
const homeFor = (role) => {
  const yearSelectRoles = ['admin', 'school_admin', 'pedagogical_director', 'finance_manager'];
  return yearSelectRoles.includes(role) ? '/select-year' : '/dashboard';
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Splash « logo de l'école » : affiché dès la connexion réussie, pendant le
  // chargement du profil ; la navigation part à la fin de l'animation.
  const [splash, setSplash] = useState(false);
  const { signIn, user, profile, school } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Déjà connecté (retour sur /login) : redirection directe, sans splash.
    if (user && profile && !splash) {
      navigate(homeFor(profile.role), { replace: true });
    }
  }, [user, profile, splash, navigate]);

  // ── Reconnexion automatique (app desktop Electron) ──
  // Les identifiants sont chiffrés côté Electron (safeStorage) et exposés via
  // window.desktopAuth (preload). Au lancement de l'app : préremplissage +
  // connexion automatique UNE fois par lancement (le drapeau sessionStorage
  // évite de reconnecter d'office après une déconnexion volontaire).
  useEffect(() => {
    const desktopAuth = window.desktopAuth;
    if (!desktopAuth || user) return;
    let cancelled = false;
    Promise.resolve(desktopAuth.load()).then(async (creds) => {
      if (cancelled || !creds?.email || !creds?.password) return;
      setEmail(creds.email);
      setPassword(creds.password);
      if (sessionStorage.getItem('desktop-auto-login-done')) return;
      sessionStorage.setItem('desktop-auto-login-done', '1');
      setLoading(true);
      try {
        await signIn(creds.email, creds.password);
        if (!cancelled) setSplash(true);
      } catch (err) {
        // Mot de passe changé / hors-ligne : formulaire prérempli, sans erreur bloquante.
        console.warn('[desktop] auto-login échoué:', err?.message);
        if (!cancelled) setLoading(false);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      // App desktop : mémorise les derniers identifiants valides pour la
      // reconnexion automatique au prochain lancement.
      try { await window.desktopAuth?.save(email, password); } catch (_) { /* ignore */ }
      setSplash(true);
    } catch (err) {
      // Message précis quand la cause n'est pas le mot de passe (limite de
      // requêtes 429, réseau bloqué…) — sinon on induit l'utilisateur en erreur.
      setError(err?.friendlyMessage || 'Email ou mot de passe incorrect');
      console.error('Login error:', err);
      setLoading(false);
    }
  };

  if (splash) {
    const cached = readSplashCache(email);
    return (
      <SchoolSplash
        logoUrl={school?.logo_url || cached?.logo_url || null}
        schoolName={school?.name || cached?.name || ''}
        ready={!!(user && profile)}
        onDone={() => navigate(homeFor(profile.role), { replace: true })}
      />
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#FFF7E9] via-white to-[#2A9D8F]/15 dark:from-[#111C2A] dark:via-[#173A59] dark:to-[#102C31] flex items-center justify-center p-4">
      <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-[#E66F51]/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-[#2A9D8F]/20 blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-7 text-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 180, damping: 16 }}
          >
            <BrandLogo
              className="justify-center gap-3 sm:gap-4"
              iconClassName="h-20 w-20 rounded-2xl bg-white/90 p-1.5 shadow-lg ring-1 ring-[#173A59]/10 sm:h-24 sm:w-24 sm:rounded-3xl sm:p-2"
              nameClassName="text-3xl sm:text-4xl"
            />
          </motion.div>
          <p className="mt-3 text-sm font-semibold text-[#2A9D8F] dark:text-[#7DD3C7] sm:text-base">
            {BOUSSOULE_TAGLINE}
          </p>
        </div>

        <Card className="border-[#173A59]/10 bg-white/95 shadow-2xl backdrop-blur dark:bg-[#14273A]/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#173A59] dark:text-white"><Compass className="h-5 w-5 text-[#E66F51]" />Connexion</CardTitle>
            <CardDescription>Retrouvez le parcours de votre établissement</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg"
                >
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">{error}</span>
                </motion.div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="votre.email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    autoFocus={isDesktopApp}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Connexion...' : 'Se connecter'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};

export default Login;
