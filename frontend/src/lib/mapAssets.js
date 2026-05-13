// Assets partagés pour les cartes Leaflet (style inDrive / Google Maps)
import L from 'leaflet';

// Tuiles style "Google Maps" claires et détaillées (rues + quartiers + commerces)
// CartoDB Voyager : gratuit, sans clé, attribution requise
export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
export const TILE_SUBDOMAINS = 'abcd';
export const TILE_MAX_ZOOM = 20;

// SVG bus vu de dessus (style inDrive automobile)
// heading en degrés (0 = nord, sens horaire), color = couleur principale du bus
export const busTopViewIcon = (color = '#f59e0b', heading = 0, size = 48, highlighted = false) => {
  const w = size;
  const h = Math.round(size * 1.6);
  const svg = `
    <svg width="${w}" height="${h}" viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg"
         style="transform: rotate(${heading || 0}deg); transition: transform 0.5s ease-out; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));">
      <!-- Ombre sous le bus -->
      <ellipse cx="20" cy="58" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
      <!-- Carrosserie -->
      <rect x="5" y="4" width="30" height="54" rx="7" ry="7" fill="${color}" stroke="white" stroke-width="2"/>
      <!-- Pare-brise avant (haut) -->
      <path d="M 8 8 Q 20 4 32 8 L 30 14 L 10 14 Z" fill="#bae6fd" opacity="0.95"/>
      <!-- Vitres latérales -->
      <rect x="7" y="18" width="3" height="8" rx="1" fill="#bae6fd" opacity="0.85"/>
      <rect x="30" y="18" width="3" height="8" rx="1" fill="#bae6fd" opacity="0.85"/>
      <rect x="7" y="28" width="3" height="8" rx="1" fill="#bae6fd" opacity="0.85"/>
      <rect x="30" y="28" width="3" height="8" rx="1" fill="#bae6fd" opacity="0.85"/>
      <rect x="7" y="38" width="3" height="8" rx="1" fill="#bae6fd" opacity="0.85"/>
      <rect x="30" y="38" width="3" height="8" rx="1" fill="#bae6fd" opacity="0.85"/>
      <!-- Vitre arrière -->
      <rect x="10" y="50" width="20" height="5" rx="2" fill="#fef3c7" opacity="0.9"/>
      <!-- Phares avant -->
      <circle cx="10" cy="7" r="1.5" fill="#fef08a"/>
      <circle cx="30" cy="7" r="1.5" fill="#fef08a"/>
      <!-- Feu central toit -->
      <rect x="18" y="15" width="4" height="2" rx="1" fill="white" opacity="0.9"/>
      ${highlighted ? '<rect x="3" y="2" width="34" height="58" rx="9" fill="none" stroke="#fbbf24" stroke-width="2" opacity="0.8"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite"/></rect>' : ''}
    </svg>
  `;
  return L.divIcon({
    html: svg,
    className: 'bus-marker-icon',
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2]
  });
};

// Maison vue de dessus (pour le domicile élève)
export const homeTopViewIcon = (size = 36) => L.divIcon({
  html: `
    <svg width="${size}" height="${size}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"
         style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
      <circle cx="20" cy="20" r="18" fill="#10b981" stroke="white" stroke-width="2.5"/>
      <path d="M 20 9 L 9 19 L 12 19 L 12 30 L 28 30 L 28 19 L 31 19 Z" fill="white"/>
      <rect x="17" y="22" width="6" height="8" fill="#10b981"/>
    </svg>
  `,
  className: '',
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2]
});
