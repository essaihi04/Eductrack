import { useEffect, useState, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Suit la position GPS en arrière-plan.
 * Utilise automatiquement :
 *  - Le plugin natif @capacitor/geolocation sur Android/iOS (app mobile)
 *  - L'API navigator.geolocation sur navigateur web
 *
 * @param {boolean} active si false, ne démarre pas le tracking
 * @param {(pos) => void} onUpdate callback à chaque nouvelle position
 *
 * Renvoie : { position, error, errorCode, retry, isSecureContext, isSupported, isNative }
 *  - errorCode : 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
 */
export function useGeolocation(active, onUpdate) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [tick, setTick] = useState(0);
  const watchIdRef = useRef(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const isNative = Capacitor.isNativePlatform();
  const isSupported = isNative || (typeof navigator !== 'undefined' && 'geolocation' in navigator);
  // En contexte natif Capacitor, le webview est toujours "sécurisé"
  const isSecureContext = isNative || (typeof window !== 'undefined' && (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

  const retry = useCallback(() => {
    setError(null);
    setErrorCode(null);
    setTick(t => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const stop = async () => {
      if (watchIdRef.current !== null) {
        try {
          if (isNative) {
            await Geolocation.clearWatch({ id: watchIdRef.current });
          } else {
            navigator.geolocation.clearWatch(watchIdRef.current);
          }
        } catch (e) { /* ignore */ }
        watchIdRef.current = null;
      }
    };

    if (!active) { stop(); return; }
    if (!isSupported) {
      setError('Géolocalisation non supportée');
      return;
    }
    if (!isSecureContext) {
      setError('Le GPS nécessite HTTPS. Le site est servi en HTTP, les navigateurs bloquent la géolocalisation.');
      setErrorCode(1);
      return;
    }

    const handlePosition = (pos) => {
      if (cancelled) return;
      setError(null);
      setErrorCode(null);
      const c = pos.coords || pos;
      const p = {
        lat: c.latitude,
        lng: c.longitude,
        speed: c.speed != null ? c.speed * 3.6 : null,
        heading: c.heading,
        accuracy: c.accuracy,
      };
      setPosition(p);
      onUpdateRef.current?.(p);
    };

    const handleError = (err) => {
      if (cancelled) return;
      setError(err?.message || 'Erreur GPS');
      setErrorCode(err?.code || null);
    };

    if (isNative) {
      // Plugin Capacitor natif — gère permissions + watch GPS
      (async () => {
        try {
          // Demander la permission explicitement (dialog Android/iOS si pas encore accordée)
          const perm = await Geolocation.checkPermissions();
          if (perm.location !== 'granted') {
            const req = await Geolocation.requestPermissions({ permissions: ['location'] });
            if (req.location !== 'granted') {
              handleError({ message: 'Permission GPS refusée par l\'utilisateur', code: 1 });
              return;
            }
          }
          const id = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 },
            (pos, err) => {
              if (err) handleError(err);
              else if (pos) handlePosition(pos);
            }
          );
          if (cancelled) {
            await Geolocation.clearWatch({ id });
          } else {
            watchIdRef.current = id;
          }
        } catch (e) {
          handleError(e);
        }
      })();
    } else {
      // Navigateur web standard
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
      );
    }

    return () => { cancelled = true; stop(); };
  }, [active, tick, isSupported, isSecureContext, isNative]);

  return { position, error, errorCode, retry, isSecureContext, isSupported, isNative };
}
