// Petit composant carte pour saisir/visualiser le domicile d'un élève
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import { TILE_URL, TILE_ATTRIBUTION, TILE_SUBDOMAINS, TILE_MAX_ZOOM, homeTopViewIcon } from '../../lib/mapAssets';

const homeIcon = homeTopViewIcon(36);

function ClickHandler({ onPick }) {
  useMapEvents({ click(e) { onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export default function HomeMapPicker({ lat, lng, onChange, height = 280, defaultCenter = [33.5731, -7.5898] }) {
  const center = (lat && lng) ? [Number(lat), Number(lng)] : defaultCenter;
  return (
    <div style={{ height, width: '100%' }} className="rounded-lg overflow-hidden border">
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains={TILE_SUBDOMAINS} maxZoom={TILE_MAX_ZOOM} />
        <ClickHandler onPick={(la, ln) => onChange?.(la, ln)} />
        {(lat && lng) && <Marker position={[Number(lat), Number(lng)]} icon={homeIcon} />}
      </MapContainer>
    </div>
  );
}
