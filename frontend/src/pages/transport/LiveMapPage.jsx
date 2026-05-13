import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import L from 'leaflet';
import { Bus, RefreshCw } from 'lucide-react';
import { transportApi } from '../../lib/transportApi';
import { supabase } from '../../lib/supabase';

const busIcon = (color = '#f59e0b') => L.divIcon({
  html: `<div style="background:${color};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:18px">🚌</div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

function FitBounds({ trips }) {
  const map = useMap();
  useEffect(() => {
    const pts = trips.filter(t => t.last_position).map(t => [t.last_position.lat, t.last_position.lng]);
    if (pts.length > 0) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
    }
  }, [trips.length]);
  return null;
}

export default function LiveMapPage() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  useEffect(() => {
    load();
    // Realtime : on s'abonne aux nouvelles positions
    channelRef.current = supabase.channel('bus_positions_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_positions' }, (payload) => {
        const np = payload.new;
        setTrips(prev => prev.map(t => t.id === np.trip_id ? { ...t, last_position: np } : t));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bus_trips' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_trips' }, () => load())
      .subscribe();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, []);

  const load = async () => {
    try {
      const r = await transportApi.liveBuses();
      setTrips(r.trips || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const center = [33.5731, -7.5898]; // Casablanca par défaut

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Bus className="w-5 h-5 text-orange-600" /> Suivi en direct</h1>
          <p className="text-xs text-gray-500">{trips.length} bus en circulation • Mise à jour temps réel</p>
        </div>
        <button onClick={load} className="text-orange-600 flex items-center gap-1 text-sm"><RefreshCw className="w-4 h-4" /> Actualiser</button>
      </div>
      <div className="flex-1 relative">
        {loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400 z-10">Chargement...</div>}
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <FitBounds trips={trips} />
          {trips.filter(t => t.last_position).map(t => (
            <Marker key={t.id} position={[t.last_position.lat, t.last_position.lng]} icon={busIcon(t.bus?.color)}>
              <Popup>
                <div className="space-y-1">
                  <div className="font-bold">🚌 {t.bus?.plate_number}</div>
                  <div className="text-xs">{t.bus?.model || ''}</div>
                  <div className="text-xs">{t.direction === 'morning_pickup' ? 'Ramassage matin' : 'Retour soir'}</div>
                  <div className="text-xs">Vitesse : {t.last_position.speed_kmh ? `${Math.round(t.last_position.speed_kmh)} km/h` : '—'}</div>
                  <div className="text-xs text-gray-500">MAJ : {new Date(t.last_position.recorded_at).toLocaleTimeString('fr-FR')}</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        {trips.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 rounded-xl p-6 text-center shadow-lg">
              <Bus className="w-12 h-12 text-orange-400 mx-auto mb-2" />
              <p className="font-semibold">Aucun bus en circulation</p>
              <p className="text-xs text-gray-500">Les bus apparaîtront ici dès qu'un chauffeur démarrera sa tournée.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
