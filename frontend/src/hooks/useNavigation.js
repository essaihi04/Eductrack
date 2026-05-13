import { useState, useEffect, useRef } from 'react';
import { fetchRoute, haversine, maneuverToShortFr } from '../lib/osrm';

/**
 * Hook de navigation type Waze :
 *  - calcule un itinéraire de A à B
 *  - suit la progression en fonction de la position GPS
 *  - recalcule automatiquement si écart > 60m
 *  - donne l'instruction courante + distance au prochain virage
 *  - annonce vocalement les manœuvres à 200m puis "maintenant"
 *
 * @param {Object} params
 * @param {{lat,lng}|null} params.position position GPS actuelle
 * @param {{lat,lng}|null} params.destination destination
 * @param {boolean} params.voiceEnabled active la voix
 */
export function useNavigation({ position, destination, voiceEnabled = true }) {
  const [route, setRoute] = useState(null); // { distance, duration, geometry, steps }
  const [stepIndex, setStepIndex] = useState(0);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState(null);
  const announcedRef = useRef({}); // { [stepIdx]: { far:true, near:true } }
  const lastCalcRef = useRef(0);

  // Calcul initial / changement de destination
  useEffect(() => {
    if (!position || !destination) { setRoute(null); setStepIndex(0); announcedRef.current = {}; return; }
    calc(position, destination);
  }, [destination?.lat, destination?.lng]);

  const calc = async (from, to) => {
    if (Date.now() - lastCalcRef.current < 3000) return; // throttle 3s
    lastCalcRef.current = Date.now();
    try {
      setRecalculating(true); setError(null);
      const r = await fetchRoute([[from.lng, from.lat], [to.lng, to.lat]]);
      setRoute(r); setStepIndex(0);
      announcedRef.current = {};
      speak(voiceEnabled, `Itinéraire calculé. ${formatDistance(r.distance)}, ${formatDuration(r.duration)}.`);
    } catch (e) {
      setError(e.message);
    } finally { setRecalculating(false); }
  };

  // Mise à jour de la progression à chaque nouvelle position GPS
  useEffect(() => {
    if (!route || !position) return;
    const steps = route.steps;
    if (stepIndex >= steps.length) return;

    // Distance jusqu'au prochain point de manœuvre
    const next = steps[stepIndex];
    const maneuverLoc = next?.maneuver?.location; // [lng, lat]
    if (!maneuverLoc) return;
    const distToManeuver = haversine(position.lat, position.lng, maneuverLoc[1], maneuverLoc[0]);

    // Annonces voix
    const ann = announcedRef.current[stepIndex] || {};
    if (!ann.far && distToManeuver < 250 && distToManeuver > 60 && stepIndex > 0) {
      const phrase = `Dans ${Math.round(distToManeuver / 10) * 10} mètres, ${maneuverToShortFr(next.maneuver)}`;
      speak(voiceEnabled, phrase);
      announcedRef.current[stepIndex] = { ...ann, far: true };
    }
    if (!ann.near && distToManeuver < 60) {
      const phrase = stepIndex > 0 ? maneuverToShortFr(next.maneuver) : '';
      if (phrase) speak(voiceEnabled, phrase + ' maintenant');
      announcedRef.current[stepIndex] = { ...ann, near: true, far: true };
    }

    // Avancer au prochain step si on a dépassé le point de manœuvre
    if (distToManeuver < 25 && stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1);
    }

    // Recalcul auto si on est trop loin de la trace
    const distToRoute = distanceToPolyline(position, route.geometry);
    if (distToRoute > 60 && !recalculating && destination) {
      speak(voiceEnabled, 'Recalcul de l\'itinéraire');
      calc(position, destination);
    }
  }, [position?.lat, position?.lng, route, stepIndex]);

  // Recalculer manuellement (ex: changement de prochain élève)
  const recalculate = () => { if (position && destination) calc(position, destination); };

  // Distance restante jusqu'à la destination (somme des steps restants)
  const remainingDistance = route ? route.steps.slice(stepIndex).reduce((s, st) => s + st.distance, 0) : 0;
  const remainingDuration = route ? route.steps.slice(stepIndex).reduce((s, st) => s + st.duration, 0) : 0;
  const currentStep = route?.steps?.[stepIndex] || null;
  const distToNextManeuver = (() => {
    if (!currentStep || !position) return 0;
    const loc = currentStep.maneuver?.location;
    if (!loc) return 0;
    return haversine(position.lat, position.lng, loc[1], loc[0]);
  })();

  return {
    route, currentStep, stepIndex, recalculating, error, recalculate,
    remainingDistance, remainingDuration, distToNextManeuver
  };
}

// === Helpers ===
export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function formatDuration(s) {
  if (s < 60) return `${Math.round(s)}s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

function distanceToPolyline(pos, geometry) {
  if (!geometry || geometry.length === 0) return Infinity;
  let min = Infinity;
  for (let i = 0; i < geometry.length; i++) {
    const [lat, lng] = geometry[i];
    const d = haversine(pos.lat, pos.lng, lat, lng);
    if (d < min) min = d;
  }
  return min;
}

let voiceWarmedUp = false;
function speak(enabled, text) {
  if (!enabled || !('speechSynthesis' in window)) return;
  try {
    // Charger les voix une fois
    if (!voiceWarmedUp) { window.speechSynthesis.getVoices(); voiceWarmedUp = true; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 1.05;
    u.pitch = 1;
    u.volume = 1;
    // Annuler les énoncés en attente pour ne pas accumuler
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}
