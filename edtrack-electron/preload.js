// Preload: surcharge navigator.geolocation pour Electron desktop.
// Electron par défaut nécessite une clé Google API pour la géolocalisation.
// On utilise un fallback IP-based gratuit (ipapi.co) puisque les desktops
// n'ont généralement pas de GPS matériel.

async function fetchIpLocation() {
  // Essaie plusieurs services gratuits avec fallback
  const providers = [
    {
      url: 'https://ipapi.co/json/',
      parse: (d) => ({
        latitude: d.latitude,
        longitude: d.longitude,
        accuracy: 5000, // précision IP ~5km
      }),
    },
    {
      url: 'https://ipwho.is/',
      parse: (d) => ({
        latitude: d.latitude,
        longitude: d.longitude,
        accuracy: 5000,
      }),
    },
    {
      url: 'https://get.geojs.io/v1/ip/geo.json',
      parse: (d) => ({
        latitude: parseFloat(d.latitude),
        longitude: parseFloat(d.longitude),
        accuracy: 10000,
      }),
    },
  ];

  for (const p of providers) {
    try {
      const res = await fetch(p.url, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      const parsed = p.parse(data);
      if (
        Number.isFinite(parsed.latitude) &&
        Number.isFinite(parsed.longitude)
      ) {
        return parsed;
      }
    } catch (e) {
      // try next provider
    }
  }
  throw new Error('IP geolocation unavailable');
}

function buildPosition(coords) {
  return {
    coords: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy || 5000,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };
}

function patchGeolocation() {
  const originalGeo = navigator.geolocation;

  const wrappedGetCurrentPosition = function (success, error, options) {
    // Tente d'abord l'API native d'Electron (peut marcher si Google API key configurée)
    let nativeReturned = false;
    let nativeFailed = false;

    const onNativeSuccess = (pos) => {
      nativeReturned = true;
      success && success(pos);
    };
    const onNativeError = async (err) => {
      nativeFailed = true;
      // Fallback vers IP geolocation
      try {
        const coords = await fetchIpLocation();
        success && success(buildPosition(coords));
      } catch (e) {
        error &&
          error({
            code: 2, // POSITION_UNAVAILABLE
            message:
              'Géolocalisation indisponible sur ce poste (pas de GPS, fallback IP également échoué).',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
      }
    };

    try {
      originalGeo.getCurrentPosition(onNativeSuccess, onNativeError, {
        timeout: 4000,
        ...options,
      });
    } catch (e) {
      onNativeError(e);
    }

    // Sécurité : si l'API native ne répond ni success ni error dans 5s, fallback
    setTimeout(async () => {
      if (!nativeReturned && !nativeFailed) {
        nativeFailed = true;
        try {
          const coords = await fetchIpLocation();
          success && success(buildPosition(coords));
        } catch (e) {
          error &&
            error({
              code: 3,
              message: 'Timeout géolocalisation',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
        }
      }
    }, 5000);
  };

  const wrappedWatchPosition = function (success, error, options) {
    // watchPosition : refresh IP toutes les 60s (la précision IP ne change pas vite)
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const coords = await fetchIpLocation();
        success && success(buildPosition(coords));
      } catch (e) {
        error &&
          error({
            code: 2,
            message: 'Géolocalisation IP indisponible',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          });
      }
    };
    tick();
    const id = setInterval(tick, 60000);
    return id;
  };

  const wrappedClearWatch = function (id) {
    clearInterval(id);
  };

  // Surcharge non-destructive
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      getCurrentPosition: wrappedGetCurrentPosition,
      watchPosition: wrappedWatchPosition,
      clearWatch: wrappedClearWatch,
    },
    configurable: true,
  });
}

// Patch dès le chargement du document
try {
  patchGeolocation();
  // Marque que c'est l'app Electron desktop
  Object.defineProperty(navigator, 'isElectronDesktop', {
    value: true,
    configurable: true,
  });
} catch (e) {
  console.error('[preload] Failed to patch geolocation:', e);
}
