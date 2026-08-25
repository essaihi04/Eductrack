import { useEffect, useRef, useState } from 'react';
import { resolveLogoUrl } from '../lib/schoolLogo';

/**
 * Écran de bienvenue animé aux couleurs de l'école.
 *
 * Affiché pendant le chargement du profil (connexion + rechargement de page) :
 * le logo de l'école surgit avec un rebond élastique, entouré d'anneaux qui
 * rayonnent (encre indigo / safran / menthe) et traversé d'un reflet lumineux,
 * avec le nom de l'école en dessous — l'app « appartient » à l'école.
 *
 * - `ready`  : quand true, le splash reste affiché jusqu'à MIN_MS puis
 *              s'estompe et appelle `onDone`.
 * - Le logo Bousole n'est JAMAIS utilisé comme patience : tant que le logo de
 *   l'école n'est pas connu on affiche une pastille neutre, sinon l'utilisateur
 *   voit d'abord Bousole puis son école (double logo au démarrage).
 * - Le logo est mis en cache par utilisateur (localStorage) pour que
 *   l'animation soit instantanée dès le prochain chargement, avant même
 *   que le profil ne soit chargé.
 */

const MIN_MS = 1700;   // durée minimale d'affichage (laisse l'effet respirer)
const EXIT_MS = 450;   // durée du fondu de sortie (= transition CSS)

const cacheKey = (email) => `boussoule.splash.${String(email || '').trim().toLowerCase()}`;
// Repli quand l'email n'est pas encore connu (les toutes premières frames d'un
// rechargement) : la derniere ecole affichee sur cet appareil.
const LAST_KEY = 'boussoule.splash.last';

/** Mémorise le logo + nom d'école pour cet utilisateur (appelé par AuthContext). */
export function cacheSplashSchool(email, school) {
  if (!email || !school) return;
  try {
    const entry = JSON.stringify({
      logo_url: school.logo_url || null,
      name: school.name || '',
    });
    localStorage.setItem(cacheKey(email), entry);
    localStorage.setItem(LAST_KEY, entry);
  } catch (_) { /* stockage plein / privé : ignoré */ }
}

/** Relit le logo + nom d'école mémorisés pour cet utilisateur. */
export function readSplashCache(email) {
  try {
    // Email connu : on ne montre que SON ecole (appareil partage au secretariat
    // -> jamais le logo de l'etablissement precedent). Email pas encore charge :
    // on prend la derniere ecole vue sur cet appareil.
    const raw = email ? localStorage.getItem(cacheKey(email)) : localStorage.getItem(LAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

const SchoolSplash = ({ logoUrl, schoolName, ready, onDone }) => {
  const [exiting, setExiting] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const mountedAt = useRef(Date.now());
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!ready || exiting) return undefined;
    const wait = Math.max(0, MIN_MS - (Date.now() - mountedAt.current));
    const t = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDoneRef.current?.(), EXIT_MS);
    }, wait);
    return () => clearTimeout(t);
  }, [ready, exiting]);

  // `logo_url` peut être un chemin relatif ou contenir un schéma abîmé
  // (« https//… ») : on le normalise, sinon l'image casse et on retombait sur
  // le logo Bousole.
  const resolvedLogo = resolveLogoUrl(logoUrl);
  const showLogo = resolvedLogo && !logoBroken;
  // Pas de logo d'école exploitable : initiale du nom, et le logo Bousole
  // seulement pour un compte sans école (super admin).
  const initial = (schoolName || '').trim().charAt(0).toUpperCase();

  return (
    <div
      className={`et-splash-bg fixed inset-0 z-[9999] flex flex-col items-center justify-center ${exiting ? 'et-splash-exit' : ''}`}
      role="status"
      aria-label={`Chargement de ${schoolName || 'votre école'}`}
    >
      <div className="relative flex items-center justify-center">
        {/* Anneaux rayonnants — bleu Bousole, or et turquoise */}
        <span className="et-splash-ring" style={{ borderColor: 'hsl(207 59% 22% / 0.35)' }} />
        <span className="et-splash-ring" style={{ borderColor: 'hsl(42 78% 59% / 0.48)', animationDelay: '0.4s' }} />
        <span className="et-splash-ring" style={{ borderColor: 'hsl(173 58% 39% / 0.38)', animationDelay: '0.8s' }} />

        {/* Logo de l'école (re-déclenche le rebond quand le logo arrive) */}
        <div
          key={showLogo ? logoUrl : 'fallback'}
          className="et-splash-logo relative w-28 h-28 rounded-3xl bg-white shadow-xl overflow-hidden flex items-center justify-center"
        >
          {showLogo ? (
            <img
              src={resolvedLogo}
              alt=""
              onError={() => setLogoBroken(true)}
              className="w-full h-full object-contain p-2"
              draggable="false"
            />
          ) : initial ? (
            <span className="font-display text-4xl font-semibold text-[hsl(207_59%_22%)]">{initial}</span>
          ) : ready ? (
            <img
              src="/brand/boussoule-logo.png"
              alt="Logo Bousole"
              className="w-full h-full object-contain p-2"
              draggable="false"
            />
          ) : (
            <span className="h-14 w-14 rounded-2xl bg-black/5 animate-pulse" aria-hidden="true" />
          )}
          <span className="et-splash-shine" aria-hidden="true" />
        </div>
      </div>

      <div className="et-splash-text mt-7 text-center px-6">
        <div className="font-display text-2xl font-semibold text-foreground">
          {schoolName || (ready ? 'Bousole' : ' ')}
        </div>
        <div className="mt-1.5 text-sm text-muted-foreground">
          {ready ? 'Bienvenue !' : 'Préparation de votre espace…'}
        </div>
      </div>

      <div className="absolute bottom-8 text-xs text-muted-foreground/70">
        Propulsé par <span className="font-medium text-muted-foreground">Bousole</span>
      </div>
    </div>
  );
};

export default SchoolSplash;
