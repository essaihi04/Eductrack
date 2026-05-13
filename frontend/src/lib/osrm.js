// Client OSRM (routage open-source) — self-hosted sur le VPS via /osrm/
const OSRM_BASE = (import.meta.env.VITE_OSRM_URL || '/osrm') + '/route/v1/driving';

/**
 * Calcule un itinéraire routier entre 2 ou plusieurs points.
 * @param {Array<[number,number]>} coords Tableau de [lng, lat] (au moins 2)
 * @returns {Promise<{distance:number, duration:number, geometry:Array<[number,number]>, steps:Array}>}
 */
export async function fetchRoute(coords) {
  if (!coords || coords.length < 2) throw new Error('Au moins 2 coordonnées requises');
  const coordStr = coords.map(c => `${c[0]},${c[1]}`).join(';');
  const url = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson&steps=true&annotations=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM HTTP ' + res.status);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error('OSRM: ' + data.message);
  const route = data.routes[0];
  return {
    distance: route.distance,         // mètres
    duration: route.duration,         // secondes
    geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]), // pour Leaflet [lat,lng]
    steps: route.legs.flatMap(l => l.steps).map(s => ({
      distance: s.distance,
      duration: s.duration,
      name: s.name,
      maneuver: s.maneuver,        // { type, modifier, bearing_before, bearing_after, location:[lng,lat] }
      geometry: (s.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng])
    }))
  };
}

// Distance haversine entre 2 points en mètres
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Convertit un type/modifier OSRM en instruction française
export function maneuverToFrench(maneuver, streetName) {
  if (!maneuver) return '';
  const { type, modifier } = maneuver;
  const street = streetName ? ` sur ${streetName}` : '';
  const mod = {
    'left': 'à gauche',
    'right': 'à droite',
    'slight left': 'légèrement à gauche',
    'slight right': 'légèrement à droite',
    'sharp left': 'fortement à gauche',
    'sharp right': 'fortement à droite',
    'straight': 'tout droit',
    'uturn': 'demi-tour'
  };
  switch (type) {
    case 'depart': return 'Démarrez' + street;
    case 'arrive': return 'Vous êtes arrivé';
    case 'turn': return 'Tournez ' + (mod[modifier] || modifier);
    case 'new name': return 'Continuez' + street;
    case 'merge': return 'Insérez-vous ' + (mod[modifier] || '');
    case 'on ramp': return "Prenez la bretelle " + (mod[modifier] || '');
    case 'off ramp': return "Sortez " + (mod[modifier] || '');
    case 'fork': return 'À la fourche, prenez ' + (mod[modifier] || '');
    case 'roundabout':
    case 'rotary': return 'Au rond-point, prenez la sortie';
    case 'continue': return 'Continuez ' + (mod[modifier] || 'tout droit');
    case 'end of road': return 'Au bout de la route, tournez ' + (mod[modifier] || '');
    default: return 'Continuez';
  }
}

// Énoncé voix court pour la synthèse vocale
export function maneuverToShortFr(maneuver) {
  if (!maneuver) return '';
  const { type, modifier } = maneuver;
  if (type === 'arrive') return 'Vous êtes arrivé';
  if (type === 'depart') return '';
  const mod = {
    'left': 'à gauche', 'right': 'à droite',
    'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite',
    'sharp left': 'fortement à gauche', 'sharp right': 'fortement à droite',
    'uturn': 'faites demi-tour'
  };
  if (type === 'turn') return 'Tournez ' + (mod[modifier] || '');
  if (type === 'roundabout' || type === 'rotary') return 'Prenez le rond-point';
  if (type === 'merge') return "Rejoignez la voie";
  if (type === 'on ramp') return "Prenez la bretelle";
  if (type === 'off ramp') return 'Sortez';
  if (type === 'fork') return 'À la fourche, ' + (mod[modifier] || '');
  return 'Continuez';
}
