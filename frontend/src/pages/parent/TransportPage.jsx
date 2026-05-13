import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import L from 'leaflet';
import { Bus, Home, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { transportApi, pushApi } from '../../lib/transportApi';
import { supabase } from '../../lib/supabase';
import { enablePushNotifications } from '../../lib/pushClient';

const busIcon = (color = '#f59e0b') => L.divIcon({
  html: `<div style="background:${color};width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:18px">🚌</div>`,
  className: '', iconSize: [36, 36], iconAnchor: [18, 18]
});
const homeIcon = L.divIcon({
  html: `<div style="background:#10b981;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.2);font-size:14px">🏠</div>`,
  className: '', iconSize: [30, 30], iconAnchor: [15, 15]
});

const eventLabel = (e) => {
  if (!e) return '—';
  const map = { boarded: '🚌 Monté(e) dans le bus', dropped: '✅ Arrivé(e)', absent: '⚠️ Absent(e)', no_show: '⚠️ Pas venu(e)', approaching: '⏰ Bus approche' };
  return map[e.event_type] || e.event_type;
};

export default function ParentTransportPage() {
  const [data, setData] = useState({ children: [] });
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const channelRef = useRef(null);

  useEffect(() => {
    load();
    channelRef.current = supabase.channel('parent_bus_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_positions' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_student_events' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_trips' }, () => load())
      .subscribe();
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, []);

  const load = async () => {
    try { const r = await transportApi.parentLive(); setData(r); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const enablePush = async () => {
    try {
      const ok = await enablePushNotifications();
      if (ok) { setPushEnabled(true); alert('🔔 Notifications activées !'); }
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  // Calculer le centre de la carte
  const points = [];
  data.children.forEach(c => {
    if (c.student.home_lat) points.push([c.student.home_lat, c.student.home_lng]);
    c.buses.forEach(b => { if (b.last_position) points.push([b.last_position.lat, b.last_position.lng]); });
  });
  const center = points.length > 0 ? points[0] : [33.5731, -7.5898];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bus className="w-6 h-6 text-orange-600" /> Transport scolaire</h1>
          <p className="text-sm text-gray-500">Suivi en direct du bus de votre enfant</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="text-sm text-gray-600 flex items-center gap-1 px-3 py-1.5 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /> Actualiser</button>
          {!pushEnabled && (
            <button onClick={enablePush} className="text-sm bg-orange-600 text-white flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-orange-700">🔔 Activer notifications</button>
          )}
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Chargement...</div> : (
        <>
          {data.children.length === 0 && <div className="text-center py-12 text-gray-400">Aucun enfant rattaché à votre compte.</div>}
          {data.children.map(c => (
            <div key={c.student.id} className="bg-white rounded-xl shadow border overflow-hidden">
              <div className="p-4 border-b bg-gray-50 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-xl">👦</div>
                <div className="flex-1">
                  <h2 className="font-bold text-lg">{c.student.first_name} {c.student.last_name}</h2>
                  <p className="text-sm text-gray-600">{eventLabel(c.last_event)} {c.last_event && <span className="text-xs text-gray-400">• {new Date(c.last_event.recorded_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}</p>
                </div>
              </div>

              {c.buses.length === 0 && <div className="p-6 text-center text-gray-400">Aucun bus assigné à cet élève</div>}
              {c.buses.map(b => (
                <div key={b.id} className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: b.color || '#f59e0b' }}>
                      <Bus className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">Bus {b.plate_number}</div>
                      <div className="text-xs text-gray-500">{b.model || ''}</div>
                    </div>
                    {b.active_trip ? (
                      <span className="text-xs text-green-700 flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> En route</span>
                    ) : (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Inactif</span>
                    )}
                  </div>

                  {b.last_position && c.student.home_lat && (
                    <div className="rounded-lg overflow-hidden border" style={{ height: 280 }}>
                      <MapContainer center={[b.last_position.lat, b.last_position.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                        <Marker position={[b.last_position.lat, b.last_position.lng]} icon={busIcon(b.color)}>
                          <Popup>Bus {b.plate_number}<br />{b.last_position.speed_kmh ? `${Math.round(b.last_position.speed_kmh)} km/h` : ''}</Popup>
                        </Marker>
                        <Marker position={[c.student.home_lat, c.student.home_lng]} icon={homeIcon}>
                          <Popup>🏠 Maison</Popup>
                        </Marker>
                      </MapContainer>
                    </div>
                  )}

                  {!b.last_position && b.active_trip && <div className="text-xs text-gray-500 text-center py-3">⏳ En attente de la position GPS du chauffeur...</div>}
                  {!b.active_trip && <div className="text-xs text-gray-500 text-center py-3">Le bus n'est pas en circulation pour le moment.</div>}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
