import { useEffect, useRef, useState } from 'react';

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
 * - Le logo est mis en cache par utilisateur (localStorage) pour que
 *   l'animation soit instantanée dès le prochain chargement, avant même
 *   que le profil ne soit chargé.
 */

const MIN_MS = 1700;   // durée minimale d'affichage (laisse l'effet respirer)
const EXIT_MS = 450;   // durée du fondu de sortie (= transition CSS)

const cacheKey = (email) => `edutrack.splash.${String(email || '').trim().toLowerCase()}`;

/** Mémorise le logo + nom d'école pour cet utilisateur (appelé par AuthContext). */
export function cacheSplashSchool(email, school) {
  if (!email || !school) return;
  try {
    localStorage.setItem(cacheKey(email), JSON.stringify({
      logo_url: school.logo_url || null,
      name: school.name || '',
    }));
  } catch (_) { /* stockage plein / privé : ignoré */ }
}

/** Relit le logo + nom d'école mémorisés pour cet utilisateur. */
export function readSplashCache(email) {
  if (!email) return null;
  try {
    const raw = localStorage.getItem(cacheKey(email));
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

  const showLogo = logoUrl && !logoBroken;
  const initial = (schoolName || 'E').trim().charAt(0).toUpperCase();

  return (
    <div
      className={`et-splash-bg fixed inset-0 z-[9999] flex flex-col items-center justify-center ${exiting ? 'et-splash-exit' : ''}`}
      role="status"
      aria-label={`Chargement de ${schoolName || 'votre école'}`}
    >
      <div className="relative flex items-center justify-center">
        {/* Anneaux rayonnants — encre indigo, safran, menthe */}
        <span className="et-splash-ring" style={{ borderColor: 'hsl(243 53% 52% / 0.35)' }} />
        <span className="et-splash-ring" style={{ borderColor: 'hsl(38 92% 53% / 0.45)', animationDelay: '0.4s' }} />
        <span className="et-splash-ring" style={{ borderColor: 'hsl(165 80% 35% / 0.35)', animationDelay: '0.8s' }} />

        {/* Logo de l'école (re-déclenche le rebond quand le logo arrive) */}
        <div
          key={showLogo ? logoUrl : 'fallback'}
          className="et-splash-logo relative w-28 h-28 rounded-3xl bg-white shadow-xl overflow-hidden flex items-center justify-center"
        >
          {showLogo ? (
            <img
              src={logoUrl}
              alt=""
              onError={() => setLogoBroken(true)}
              className="w-full h-full object-contain p-2"
              draggable="false"
            />
          ) : (
            <span
              className="font-display text-5xl font-bold"
              style={{ color: 'hsl(243 53% 52%)' }}
            >
              {initial}
            </span>
          )}
          <span className="et-splash-shine" aria-hidden="true" />
        </div>
      </div>

      <div className="et-splash-text mt-7 text-center px-6">
        <div className="font-display text-2xl font-semibold text-foreground">
          {schoolName || 'EduTrack'}
        </div>
        <div className="mt-1.5 text-sm text-muted-foreground">
          {ready ? 'Bienvenue !' : 'Préparation de votre espace…'}
        </div>
      </div>

      <div className="absolute bottom-8 text-xs text-muted-foreground/70">
        Propulsé par <span className="font-medium text-muted-foreground">EduTrack</span>
      </div>
    </div>
  );
};

export default SchoolSplash;
