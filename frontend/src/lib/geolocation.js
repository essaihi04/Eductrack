// Helper de géolocalisation unifié — utilise le plugin natif Capacitor sur mobile,
// sinon l'API navigator.geolocation du navigateur.
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

/**
 * Récupère la position GPS courante (one-shot).
 * Sur app Capacitor : demande automatiquement la permission native si pas accordée.
 * Sur navigateur : utilise navigator.geolocation (HTTPS requis).
 *
 * @param {Object} opts
 * @param {boolean} opts.enableHighAccuracy default true
 * @param {number} opts.timeout default 15000
 * @returns {Promise<{lat:number, lng:number, accuracy:number}>}
 */
export async function getCurrentPositionUnified(opts = {}) {
  const { enableHighAccuracy = true, timeout = 15000, maximumAge = 0 } = opts;

  if (Capacitor.isNativePlatform()) {
    // Plugin Capacitor — gère permissions natives
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted') {
      const req = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (req.location !== 'granted') {
        const err = new Error('Permission GPS refusée');
        err.code = 1;
        throw err;
      }
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy, timeout, maximumAge });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  }

  // Navigateur web
  if (!('geolocation' in navigator)) {
    const err = new Error('Géolocalisation non supportée');
    err.code = 2;
    throw err;
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(err),
      { enableHighAccuracy, timeout, maximumAge }
    );
  });
}
