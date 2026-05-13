import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import { CheckCircle, XCircle, Home, Square, MapPin, Phone, ChevronDown, ChevronUp, Volume2, VolumeX, Navigation, ArrowRight, ArrowLeft, ArrowUp, RotateCcw, Gauge } from 'lucide-react';
import { transportApi } from '../../lib/transportApi';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useNavigation, formatDistance, formatDuration } from '../../hooks/useNavigation';
import { TILE_URL, TILE_ATTRIBUTION, TILE_SUBDOMAINS, TILE_MAX_ZOOM, busTopViewIcon, homeTopViewIcon } from '../../lib/mapAssets';

const maneuverIcon = (type, modifier) => {
  if (type === 'arrive') return <CheckCircle className="w-10 h-10" />;
  if (type === 'turn' || type === 'end of road') {
    if (modifier?.includes('left')) return <ArrowLeft className="w-10 h-10" />;
    if (modifier?.includes('right')) return <ArrowRight className="w-10 h-10" />;
    if (modifier === 'uturn') return <RotateCcw className="w-10 h-10" />;
  }
  if (type === 'roundabout' || type === 'rotary') return <RotateCcw className="w-10 h-10" />;
  return <ArrowUp className="w-10 h-10" />;
};

const homeIcon = homeTopViewIcon(34);

function MapAutoCenter({ position }) {
  const map = useMap();
  useEffect(() => { if (position) map.setView([position.lat, position.lng], map.getZoom() < 14 ? 15 : map.getZoom()); }, [position?.lat, position?.lng]);
  return null;
}

const POSITION_PUSH_INTERVAL_MS = 5000;

export default function ActiveTripPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bus, setBus] = useState(null);
  const [students, setStudents] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const lastPushRef = useRef(0);
  const offlineBufferRef = useRef([]);
  const [pushError, setPushError] = useState(null);
  const [pushCount, setPushCount] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [totalKm, setTotalKm] = useState(0);
  const lastPosForKmRef = useRef(null);

  // GPS partagé toutes les 5s
  const { position, error: gpsError } = useGeolocation(true, async (p) => {
    const now = Date.now();
    if (now - lastPushRef.current < POSITION_PUSH_INTERVAL_MS) return;
    lastPushRef.current = now;
    try {
      // Vider buffer hors-ligne d'abord
      while (offlineBufferRef.current.length > 0) {
        const buffered = offlineBufferRef.current[0];
        await transportApi.pushPosition(id, buffered);
        offlineBufferRef.current.shift();
      }
      await transportApi.pushPosition(id, { lat: p.lat, lng: p.lng, speed_kmh: p.speed, heading: p.heading, accuracy_m: p.accuracy });
      setPushCount(c => c + 1);
      setPushError(null);
      // Compteur km parcourus
      const last = lastPosForKmRef.current;
      if (last) {
        const R = 6371e3, toRad = d => d * Math.PI / 180;
        const dLat = toRad(p.lat - last.lat), dLon = toRad(p.lng - last.lng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(last.lat)) * Math.cos(toRad(p.lat)) * Math.sin(dLon / 2) ** 2;
        const d = 2 * R * Math.asin(Math.sqrt(a));
        if (d < 200) setTotalKm(k => k + d / 1000); // ignore jumps > 200m (GPS noise)
      }
      lastPosForKmRef.current = { lat: p.lat, lng: p.lng };
    } catch (e) {
      setPushError(e.message || 'Échec envoi position');
      offlineBufferRef.current.push({ lat: p.lat, lng: p.lng, speed_kmh: p.speed, heading: p.heading, accuracy_m: p.accuracy });
      if (offlineBufferRef.current.length > 100) offlineBufferRef.current.shift();
    }
  });

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    try {
      const trips = await transportApi.todayTrips();
      const trip = (trips.trips || []).find(t => t.id === id);
      if (!trip) { alert('Trajet introuvable'); navigate('/driver'); return; }
      setBus(trip.bus);
      const [s, e] = await Promise.all([
        transportApi.listBusStudents(trip.bus_id),
        transportApi.getEvents(id)
      ]);
      setStudents(s.assignments || []);
      setEvents(e.events || []);
    } catch (err) { console.error(err); alert('Erreur : ' + err.message); }
    finally { setLoading(false); }
  };

  const lastEventByStudent = events.reduce((acc, e) => { if (!acc[e.student_id]) acc[e.student_id] = e; return acc; }, {});
  const statusOf = (sid) => lastEventByStudent[sid]?.event_type || 'pending';
  const remaining = students.filter(a => statusOf(a.student.id) === 'pending').length;

  const sendEvent = async (studentId, event_type) => {
    try {
      await transportApi.pushEvent(id, studentId, {
        event_type,
        lat: position?.lat, lng: position?.lng
      });
      // Mise à jour locale immédiate
      setEvents(prev => [{ trip_id: id, student_id: studentId, event_type, recorded_at: new Date().toISOString() }, ...prev]);
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  const endTrip = async () => {
    if (!confirm('Terminer la tournée ?')) return;
    try { await transportApi.endTrip(id, {}); navigate('/driver'); }
    catch (e) { alert('Erreur : ' + e.message); }
  };

  const destination = (() => {
    const next = students.find(a => statusOf(a.student.id) === 'pending');
    if (!next?.student?.home_lat) return null;
    return { lat: Number(next.student.home_lat), lng: Number(next.student.home_lng) };
  })();
  const nav = useNavigation({ position, destination, voiceEnabled });

  if (loading) return <div className="p-12 text-center text-gray-400">Chargement...</div>;

  // Trier : pending d'abord, dans l'ordre pickup_order
  const sortedStudents = [...students].sort((a, b) => {
    const sa = statusOf(a.student.id) === 'pending' ? 0 : 1;
    const sb = statusOf(b.student.id) === 'pending' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (a.pickup_order || 0) - (b.pickup_order || 0);
  });
  const nextStudent = sortedStudents.find(a => statusOf(a.student.id) === 'pending');

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-amber-600 text-white p-3 flex items-center justify-between">
        <div>
          <div className="font-bold flex items-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
            🚌 {bus?.plate_number}
          </div>
          <div className="text-xs opacity-90">{remaining} élève(s) restant(s) sur {students.length}</div>
        </div>
        <button onClick={endTrip} className="bg-red-600 px-3 py-2 rounded-lg flex items-center gap-1 text-sm hover:bg-red-700">
          <Square className="w-4 h-4" /> Terminer
        </button>
      </div>

      {/* Bandeau diagnostic GPS */}
      {(gpsError || (!position && !gpsError)) && (
        <div className={`px-3 py-2 text-xs font-medium ${gpsError ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
          {gpsError ? `⚠️ GPS bloqué : ${gpsError}. Activez la localisation pour ce site dans les paramètres du navigateur.` : '⏳ En attente du signal GPS...'}
        </div>
      )}
      {position && pushError && (
        <div className="px-3 py-2 text-xs bg-orange-100 text-orange-800">⚠️ Position captée mais échec d'envoi : {pushError}</div>
      )}
      {position && !pushError && pushCount > 0 && (
        <div className="px-3 py-1 text-xs bg-green-50 text-green-700 flex items-center justify-between">
          <span>✅ GPS partagé ({pushCount} positions envoyées)</span>
          <span>±{Math.round(position.accuracy || 0)}m</span>
        </div>
      )}

      {/* HUD instruction de navigation */}
      {nav.currentStep && destination && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center gap-3 shadow-md">
          <div className="shrink-0">{maneuverIcon(nav.currentStep.maneuver?.type, nav.currentStep.maneuver?.modifier)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-2xl font-bold leading-tight">{formatDistance(nav.distToNextManeuver)}</div>
            <div className="text-xs opacity-90 truncate">{nav.currentStep.name || 'continuer'}</div>
          </div>
          <button onClick={() => setVoiceEnabled(v => !v)} className="bg-white/20 p-2 rounded-full">
            {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>
      )}
      {nav.recalculating && <div className="bg-blue-100 text-blue-800 text-xs px-3 py-1 text-center">🔄 Recalcul de l'itinéraire...</div>}

      {/* Carte */}
      <div className="relative" style={{ height: collapsed ? '30vh' : '45vh' }}>
        <MapContainer center={position ? [position.lat, position.lng] : [33.5731, -7.5898]} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains={TILE_SUBDOMAINS} maxZoom={TILE_MAX_ZOOM} />
          <MapAutoCenter position={position} />
          {nav.route?.geometry && <Polyline positions={nav.route.geometry} color="#2563eb" weight={6} opacity={0.85} />}
          {position && <Marker position={[position.lat, position.lng]} icon={busTopViewIcon('#f59e0b', position.heading || 0, 48, true)} />}
          {destination && <Marker position={[destination.lat, destination.lng]} icon={homeIcon} />}
        </MapContainer>
        <button onClick={() => setCollapsed(!collapsed)} className="absolute bottom-2 right-2 bg-white rounded-full p-2 shadow z-[1000]">
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {/* HUD vitesse + ETA en bas */}
        <div className="absolute bottom-2 left-2 right-14 flex gap-2 z-[1000]">
          <div className="bg-white rounded-xl shadow px-3 py-2 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-amber-600" />
            <div>
              <div className="text-xl font-bold leading-none">{position?.speed != null ? Math.round(position.speed) : 0}</div>
              <div className="text-[10px] text-gray-500">km/h</div>
            </div>
          </div>
          {nav.route && (
            <div className="bg-white rounded-xl shadow px-3 py-2 flex-1">
              <div className="text-xs text-gray-500">Arrivée</div>
              <div className="text-sm font-bold leading-tight">{formatDuration(nav.remainingDuration)} · {formatDistance(nav.remainingDistance)}</div>
            </div>
          )}
          <div className="bg-white rounded-xl shadow px-3 py-2">
            <div className="text-xs text-gray-500">Parcouru</div>
            <div className="text-sm font-bold">{totalKm.toFixed(1)} km</div>
          </div>
        </div>
      </div>

      {/* Prochain élève */}
      {nextStudent && (
        <div className="bg-white border-y p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700">{nextStudent.pickup_order || '?'}</div>
          <div className="flex-1">
            <div className="font-bold">{nextStudent.student.first_name} {nextStudent.student.last_name}</div>
            <div className="text-xs text-gray-500 truncate">{nextStudent.student.home_address || nextStudent.student.classes?.name || ''}</div>
            {nextStudent.student.transport_notes && <div className="text-xs text-orange-600">📝 {nextStudent.student.transport_notes}</div>}
          </div>
          {nextStudent.student.phone && (
            <a href={`tel:${nextStudent.student.phone}`} className="bg-blue-100 text-blue-700 p-2 rounded-full"><Phone className="w-4 h-4" /></a>
          )}
        </div>
      )}

      {/* Liste élèves */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {sortedStudents.map(a => {
          const st = statusOf(a.student.id);
          const isDone = st !== 'pending';
          return (
            <div key={a.id} className={`p-3 border-b flex items-center gap-3 ${isDone ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${isDone ? 'bg-gray-200 text-gray-500' : 'bg-amber-500 text-white'}`}>
                {a.pickup_order || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-medium truncate ${isDone ? 'line-through' : ''}`}>{a.student.first_name} {a.student.last_name}</div>
                <div className="text-xs text-gray-500 truncate">
                  {st === 'boarded' && '🚌 Monté'}
                  {st === 'dropped' && '✅ Déposé'}
                  {(st === 'absent' || st === 'no_show') && '⚠️ Absent'}
                  {st === 'pending' && (a.student.classes?.name || a.student.home_address || '')}
                </div>
              </div>
              {!isDone && (
                <div className="flex gap-1">
                  <button onClick={() => sendEvent(a.student.id, 'boarded')} className="bg-green-600 text-white p-2 rounded-lg" title="Monté"><CheckCircle className="w-5 h-5" /></button>
                  <button onClick={() => sendEvent(a.student.id, 'dropped')} className="bg-blue-600 text-white p-2 rounded-lg" title="Déposé"><Home className="w-5 h-5" /></button>
                  <button onClick={() => sendEvent(a.student.id, 'absent')} className="bg-red-600 text-white p-2 rounded-lg" title="Absent"><XCircle className="w-5 h-5" /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
