import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import { Bus, RefreshCw, User, Phone, Clock, Navigation } from 'lucide-react';
import { transportApi } from '../../lib/transportApi';
import { supabase } from '../../lib/supabase';
import { TILE_URL, TILE_ATTRIBUTION, TILE_SUBDOMAINS, TILE_MAX_ZOOM, busTopViewIcon } from '../../lib/mapAssets';

function FitBounds({ trips, selectedId }) {
  const map = useMap();
  useEffect(() => {
    if (selectedId) {
      const t = trips.find(x => x.id === selectedId);
      if (t?.last_position) {
        map.flyTo([t.last_position.lat, t.last_position.lng], 16, { duration: 0.8 });
      }
      return;
    }
    const pts = trips.filter(t => t.last_position).map(t => [t.last_position.lat, t.last_position.lng]);
    if (pts.length === 1) {
      map.setView(pts[0], 14);
    } else if (pts.length > 1) {
      map.fitBounds(pts, { padding: [50, 50], maxZoom: 14 });
    }
  }, [trips.length, selectedId]);
  return null;
}

const directionLabel = (d) => d === 'morning_pickup' ? '☀️ Matin' : '🌙 Soir';

export default function LiveMapPage() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const channelRef = useRef(null);

  useEffect(() => {
    load();
    channelRef.current = supabase.channel('bus_positions_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bus_positions' }, (payload) => {
        const np = payload.new;
        setTrips(prev => prev.map(t => t.id === np.trip_id ? { ...t, last_position: np } : t));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_trips' }, () => load())
      .subscribe();
    const interval = setInterval(load, 30000);
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      clearInterval(interval);
    };
  }, []);

  const load = async () => {
    try {
      const r = await transportApi.liveBuses();
      setTrips(r.trips || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const center = [33.5731, -7.5898];
  const selected = trips.find(t => t.id === selectedId);

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Sidebar gauche : liste des bus en circulation */}
      <div className="w-80 bg-white border-r flex flex-col shadow-lg z-[1000]">
        <div className="p-4 border-b bg-gradient-to-r from-orange-500 to-amber-600 text-white">
          <h1 className="text-lg font-bold flex items-center gap-2"><Bus className="w-5 h-5" /> Suivi en direct</h1>
          <p className="text-xs opacity-90">{trips.length} bus en circulation</p>
        </div>
        <div className="p-2 border-b flex justify-between items-center text-xs">
          <button onClick={() => setSelectedId(null)} className="text-orange-600 hover:underline">Voir tous</button>
          <button onClick={load} className="text-gray-600 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Actualiser</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-6 text-center text-gray-400 text-sm">Chargement...</div>}
          {!loading && trips.length === 0 && (
            <div className="p-6 text-center">
              <Bus className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Aucun bus en circulation</p>
              <p className="text-xs text-gray-400 mt-1">Les bus apparaîtront ici dès qu'un chauffeur démarrera sa tournée.</p>
            </div>
          )}
          {trips.map(t => {
            const isSelected = t.id === selectedId;
            const hasGps = !!t.last_position;
            const lastUpdate = t.last_position ? new Date(t.last_position.recorded_at) : null;
            const ageSec = lastUpdate ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000) : null;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-3 border-b hover:bg-orange-50 transition flex gap-3 items-start ${isSelected ? 'bg-orange-100 border-l-4 border-l-orange-500' : ''}`}
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xl shrink-0 shadow"
                  style={{ backgroundColor: t.bus?.color || '#f59e0b' }}
                >
                  🚌
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{t.bus?.plate_number}</div>
                  <div className="text-xs text-gray-500 truncate">{t.bus?.model || ''}</div>
                  {t.driver && (
                    <div className="text-xs text-gray-700 flex items-center gap-1 mt-1">
                      <User className="w-3 h-3" /> {t.driver.first_name} {t.driver.last_name}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">{directionLabel(t.direction)}</span>
                    {hasGps ? (
                      <span className="text-xs text-green-700 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                        {ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}min`}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">⏳ GPS</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Carte */}
      <div className="flex-1 relative">
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains={TILE_SUBDOMAINS} maxZoom={TILE_MAX_ZOOM} />
          <FitBounds trips={trips} selectedId={selectedId} />
          {trips.filter(t => t.last_position).map(t => {
            const isSel = t.id === selectedId;
            return (
              <Marker
                key={t.id}
                position={[t.last_position.lat, t.last_position.lng]}
                icon={busTopViewIcon(t.bus?.color || '#f59e0b', t.last_position.heading || 0, isSel ? 56 : 44, isSel)}
                eventHandlers={{ click: () => setSelectedId(t.id) }}
              >
                <Tooltip permanent direction="top" offset={[0, -20]} className="bus-label">
                  <div className="font-bold text-xs">{t.bus?.plate_number}</div>
                  {t.driver && <div className="text-[10px] text-gray-700">{t.driver.first_name} {t.driver.last_name}</div>}
                </Tooltip>
                <Popup>
                  <div className="space-y-1 min-w-[180px]">
                    <div className="font-bold text-base flex items-center gap-1">🚌 {t.bus?.plate_number}</div>
                    {t.bus?.model && <div className="text-xs text-gray-600">{t.bus.model}</div>}
                    {t.driver && (
                      <div className="text-xs flex items-center gap-1 mt-2"><User className="w-3 h-3" /> {t.driver.first_name} {t.driver.last_name}</div>
                    )}
                    {t.driver?.phone && (
                      <a href={`tel:${t.driver.phone}`} className="text-xs flex items-center gap-1 text-blue-600 hover:underline"><Phone className="w-3 h-3" /> {t.driver.phone}</a>
                    )}
                    <div className="text-xs flex items-center gap-1">{directionLabel(t.direction)}</div>
                    <div className="text-xs flex items-center gap-1"><Navigation className="w-3 h-3" /> {t.last_position.speed_kmh ? `${Math.round(t.last_position.speed_kmh)} km/h` : '— km/h'}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> MAJ : {new Date(t.last_position.recorded_at).toLocaleTimeString('fr-FR')}</div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Détails du bus sélectionné en bas */}
        {selected && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-xl shadow-2xl p-4 z-[1000]">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl shrink-0" style={{ backgroundColor: selected.bus?.color || '#f59e0b' }}>🚌</div>
              <div className="flex-1">
                <div className="font-bold">{selected.bus?.plate_number}</div>
                {selected.driver && (
                  <div className="text-sm text-gray-700 flex items-center gap-1"><User className="w-3 h-3" /> {selected.driver.first_name} {selected.driver.last_name}</div>
                )}
                {selected.last_position && (
                  <div className="text-xs text-gray-600 mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {selected.last_position.speed_kmh ? `${Math.round(selected.last_position.speed_kmh)} km/h` : '0 km/h'}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(selected.last_position.recorded_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            {selected.driver?.phone && (
              <a href={`tel:${selected.driver.phone}`} className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 text-sm">
                <Phone className="w-4 h-4" /> Appeler le chauffeur
              </a>
            )}
          </div>
        )}
      </div>

      <style>{`
        .bus-label {
          background: rgba(255,255,255,0.95) !important;
          border: 1px solid #f59e0b !important;
          border-radius: 6px !important;
          padding: 2px 6px !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.15) !important;
        }
        .bus-label::before { display: none !important; }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
