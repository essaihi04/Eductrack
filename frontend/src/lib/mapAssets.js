// Assets partagés pour les cartes Leaflet (style inDrive / Google Maps)
import L from 'leaflet';

// === Fond de carte sophistiqué (style GPS pro / Apple Maps) ===
// Stratégie hybride :
//   1. Si VITE_MAPTILER_KEY défini → MapTiler Streets v2 (qualité max, ~Apple Maps)
//   2. Sinon → Esri World Navigation (très joli style GPS pro, sans clé)
//   3. Fallback CartoDB Voyager si problème réseau Esri (au niveau du composant via onerror)
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;

export const TILE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
  : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

export const TILE_ATTRIBUTION = MAPTILER_KEY
  ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  : 'Tiles &copy; Esri &mdash; Sources: Esri, HERE, Garmin, NGA, USGS';

export const TILE_SUBDOMAINS = MAPTILER_KEY ? '' : '';
export const TILE_MAX_ZOOM = 20;

// Fallback CartoDB (à utiliser comme deuxième TileLayer si besoin)
export const TILE_URL_FALLBACK = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const TILE_ATTRIBUTION_FALLBACK = '&copy; OpenStreetMap &copy; CARTO';

// SVG bus scolaire vu de côté (style cartoon jaune).
// Le bus se "retourne" horizontalement (scaleX) selon la direction GPS :
//   - Heading 0°-180° (est / sud) → face à droite (par défaut)
//   - Heading 180°-360° (ouest / nord) → face à gauche (miroir)
// Le nom `busTopViewIcon` est conservé pour compatibilité avec le code existant.
export const busTopViewIcon = (color = '#fcd34d', heading = 0, size = 56, highlighted = false) => {
  const w = size;
  const h = Math.round(size * 0.72); // ratio side-view (largeur > hauteur)
  // Flip horizontalement si le bus roule vers l'ouest / nord
  const flip = heading > 180 && heading < 360;
  const transform = flip ? 'scaleX(-1)' : 'scaleX(1)';
  // Couleur secondaire (toit / bandes) plus claire
  const lighter = color === '#fcd34d' ? '#fde68a' : color;
  const svg = `
    <svg width="${w}" height="${h}" viewBox="0 0 100 72" xmlns="http://www.w3.org/2000/svg"
         style="transform: ${transform}; transition: transform 0.4s ease-out; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.35));">
      <!-- Ombre sous le bus -->
      <ellipse cx="50" cy="68" rx="40" ry="3" fill="rgba(0,0,0,0.22)"/>

      <!-- Carrosserie principale (jaune) -->
      <path d="M 8 22 L 8 56 Q 8 60 12 60 L 88 60 Q 92 60 92 56 L 92 30 Q 92 26 88 26 L 78 26 L 72 20 Q 70 18 67 18 L 14 18 Q 8 18 8 22 Z"
            fill="${color}" stroke="#1f2937" stroke-width="1.5"/>

      <!-- Capot avant -->
      <path d="M 78 26 L 88 26 Q 92 26 92 30 L 92 40 L 78 40 Z" fill="${lighter}" stroke="#1f2937" stroke-width="1.2"/>

      <!-- Bande noire latérale -->
      <rect x="10" y="44" width="80" height="3" fill="#1f2937"/>

      <!-- Pare-brise avant -->
      <path d="M 79 28 L 88 28 Q 90 28 90 30 L 90 38 L 79 38 Z" fill="#bfdbfe" opacity="0.95" stroke="#1f2937" stroke-width="0.8"/>

      <!-- Vitres latérales (bleu clair) -->
      <rect x="12" y="24" width="14" height="14" rx="2" fill="#bae6fd" stroke="#1f2937" stroke-width="0.8"/>
      <rect x="28" y="24" width="14" height="14" rx="2" fill="#bae6fd" stroke="#1f2937" stroke-width="0.8"/>
      <rect x="44" y="24" width="14" height="14" rx="2" fill="#bae6fd" stroke="#1f2937" stroke-width="0.8"/>
      <rect x="60" y="24" width="14" height="14" rx="2" fill="#bae6fd" stroke="#1f2937" stroke-width="0.8"/>

      <!-- Porte (au milieu, plus foncée) -->
      <rect x="58" y="24" width="6" height="32" fill="${color}" stroke="#1f2937" stroke-width="0.8"/>
      <rect x="58.5" y="40" width="5" height="2" fill="#1f2937" opacity="0.5"/>

      <!-- Phares avant -->
      <circle cx="89" cy="50" r="2.5" fill="#fef08a" stroke="#1f2937" stroke-width="0.6"/>

      <!-- Rétroviseur -->
      <rect x="74" y="14" width="3" height="6" fill="#1f2937"/>
      <rect x="71" y="13" width="6" height="3" fill="#1f2937"/>

      <!-- Roue avant -->
      <circle cx="78" cy="60" r="7" fill="#1f2937"/>
      <circle cx="78" cy="60" r="3.5" fill="#9ca3af"/>
      <circle cx="78" cy="60" r="1.5" fill="#1f2937"/>

      <!-- Roue arrière -->
      <circle cx="22" cy="60" r="7" fill="#1f2937"/>
      <circle cx="22" cy="60" r="3.5" fill="#9ca3af"/>
      <circle cx="22" cy="60" r="1.5" fill="#1f2937"/>

      ${highlighted ? '<rect x="4" y="14" width="92" height="50" rx="6" fill="none" stroke="#fbbf24" stroke-width="2.5" opacity="0.85"><animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite"/></rect>' : ''}
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
