import { useEffect, useState, useRef } from 'react';

/**
 * Suit la position GPS en arrière-plan.
 * @param {boolean} active si false, ne démarre pas le tracking
 * @param {(pos: {lat:number,lng:number,speed:number,heading:number,accuracy:number}) => void} onUpdate
 */
export function useGeolocation(active, onUpdate) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!active) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    if (!('geolocation' in navigator)) {
      setError('Géolocalisation non supportée');
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const p = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : null, // m/s -> km/h
          heading: pos.coords.heading,
          accuracy: pos.coords.accuracy
        };
        setPosition(p);
        onUpdate?.(p);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [active]);

  return { position, error };
}
