import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import { CheckCircle, XCircle, Home, Square, MapPin, Phone, ChevronDown, ChevronUp, Volume2, VolumeX, Navigation, ArrowRight, ArrowLeft, ArrowUp, RotateCcw, Gauge, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

function MapAutoCenter({ position, navMode }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    const targetZoom = navMode ? 17 : (map.getZoom() < 14 ? 15 : map.getZoom());
    // Décale le centre de la carte vers le bas pour voir plus loin devant le bus (style Waze)
    if (navMode) {
      const offset = map.getSize().y * 0.2;
      const point = map.project([position.lat, position.lng], targetZoom).subtract([0, -offset]);
      const newCenter = map.unproject(point, targetZoom);
      map.flyTo(newCenter, targetZoom, { duration: 0.5, animate: true });
    } else {
      map.flyTo([position.lat, position.lng], targetZoom, { duration: 0.6, animate: true });
    }
  }, [position?.lat, position?.lng, navMode]);
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
  const [sheetOpen, setSheetOpen] = useState(false); // bottom sheet liste élèves
  const [navMode, setNavMode] = useState(true); // mode navigation plein écran style Waze
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

  // Tri : pending d'abord par pickup_order, puis terminés
  const sortedStudents = useMemo(() => [...students].sort((a, b) => {
    const sa = statusOf(a.student.id) === 'pending' ? 0 : 1;
    const sb = statusOf(b.student.id) === 'pending' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (a.pickup_order || 0) - (b.pickup_order || 0);
  }), [students, events]);
  const nextStudent = sortedStudents.find(a => statusOf(a.student.id) === 'pending');
  // Destination mémorisée : ne change QUE quand le prochain élève change
  const destination = useMemo(() => {
    if (!nextStudent?.student?.home_lat) return null;
    return { lat: Number(nextStudent.student.home_lat), lng: Number(nextStudent.student.home_lng) };
  }, [nextStudent?.student?.id]);
  const nav = useNavigation({ position, destination, voiceEnabled });

  // Drag-and-drop sensors (souris + tactile)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }));
  const handleDragEnd = async (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const pendingList = sortedStudents.filter(a => statusOf(a.student.id) === 'pending');
    const oldIdx = pendingList.findIndex(a => a.id === active.id);
    const newIdx = pendingList.findIndex(a => a.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(pendingList, oldIdx, newIdx);
    // Réassigner pickup_order en partant du min des pending
    const minOrder = Math.min(...pendingList.map(a => a.pickup_order || 0)) || 1;
    const items = reordered.map((a, i) => ({ id: a.id, pickup_order: minOrder + i }));
    // Mise à jour locale optimiste
    setStudents(prev => prev.map(a => {
      const found = items.find(it => it.id === a.id);
      return found ? { ...a, pickup_order: found.pickup_order } : a;
    }));
    try { await transportApi.reorderAssignments(bus.id, items); }
    catch (err) { alert('Erreur réordonnancement : ' + err.message); load(); }
  };

  if (loading) return <div className="p-12 text-center text-gray-400">Chargement...</div>;

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

      {/* HUD instruction de navigation style Waze */}
      {nav.currentStep && destination && (
        <div className="bg-gradient-to-b from-blue-600 to-blue-700 text-white px-4 py-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="shrink-0 bg-white/20 rounded-2xl p-3">{maneuverIcon(nav.currentStep.maneuver?.type, nav.currentStep.maneuver?.modifier)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-5xl font-black leading-none">{formatDistance(nav.distToNextManeuver)}</div>
              <div className="text-sm opacity-95 truncate mt-1">{nav.currentStep.name || 'Continuez'}</div>
              {nav.route?.steps?.[nav.stepIndex + 1] && (
                <div className="text-xs opacity-75 truncate mt-0.5">puis {nav.route.steps[nav.stepIndex + 1].name || 'continuer'}</div>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button onClick={() => setVoiceEnabled(v => !v)} className="bg-white/20 p-2.5 rounded-full hover:bg-white/30">
                {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <button onClick={() => setNavMode(v => !v)} className="bg-white/20 p-2.5 rounded-full hover:bg-white/30" title="Basculer mode navigation">
                <Navigation className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
      {nav.recalculating && <div className="bg-blue-100 text-blue-800 text-xs px-3 py-1 text-center">🔄 Recalcul de l'itinéraire...</div>}

      {/* Carte plein écran avec bannière élève clignotante + boutons flottants */}
      <div className="relative overflow-hidden flex-1">
        <MapContainer center={position ? [position.lat, position.lng] : [33.5731, -7.5898]} zoom={navMode ? 17 : 15} style={{ height: '100%', width: '100%' }} zoomControl={!navMode} attributionControl={!navMode}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains={TILE_SUBDOMAINS} maxZoom={TILE_MAX_ZOOM} />
          <MapAutoCenter position={position} navMode={navMode} />
          {nav.route?.geometry && <Polyline positions={nav.route.geometry} color="#2563eb" weight={8} opacity={0.9} />}
          {position && <Marker position={[position.lat, position.lng]} icon={busTopViewIcon('#f59e0b', position.heading || 0, navMode ? 60 : 48, true)} />}
          {destination && <Marker position={[destination.lat, destination.lng]} icon={homeIcon} />}
        </MapContainer>

        {/* Bannière élève en cours (clignotante) en haut de la carte */}
        {nextStudent && (
          <div className="absolute top-3 left-3 right-3 z-[1000] pointer-events-none">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl shadow-2xl px-4 py-2.5 flex items-center gap-3 student-banner-pulse pointer-events-auto">
              <div className="w-10 h-10 rounded-full bg-white text-amber-700 flex items-center justify-center font-black text-lg shrink-0 shadow ring-2 ring-white/60">
                {nextStudent.pickup_order || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wide opacity-90 leading-none">🎯 Destination en cours</div>
                <div className="font-black text-base leading-tight truncate">{nextStudent.student.first_name} {nextStudent.student.last_name}</div>
                <div className="text-[11px] opacity-95 truncate">{nextStudent.student.classes?.name || nextStudent.student.home_address || ''}</div>
              </div>
              {nextStudent.student.phone && (
                <a href={`tel:${nextStudent.student.phone}`} className="bg-white/25 hover:bg-white/40 p-2 rounded-full shrink-0"><Phone className="w-4 h-4" /></a>
              )}
            </div>
          </div>
        )}

        {/* Boutons d'action flottants pour l'élève en cours */}
        {nextStudent && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-[1000] flex flex-col gap-2.5">
            <button onClick={() => sendEvent(nextStudent.student.id, 'boarded')} className="bg-green-600 hover:bg-green-700 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center ring-4 ring-white/40 active:scale-95 transition" title="Monté">
              <CheckCircle className="w-7 h-7" />
            </button>
            <button onClick={() => sendEvent(nextStudent.student.id, 'dropped')} className="bg-blue-600 hover:bg-blue-700 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center ring-4 ring-white/40 active:scale-95 transition" title="Déposé">
              <Home className="w-7 h-7" />
            </button>
            <button onClick={() => sendEvent(nextStudent.student.id, 'absent')} className="bg-red-600 hover:bg-red-700 text-white w-14 h-14 rounded-full shadow-2xl flex items-center justify-center ring-4 ring-white/40 active:scale-95 transition" title="Absent">
              <XCircle className="w-7 h-7" />
            </button>
          </div>
        )}

        {/* HUD vitesse + ETA en bas (au-dessus de la poignée du bottom sheet) */}
        <div className="absolute bottom-14 left-2 right-2 flex gap-2 z-[1000]">
          <div className="bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-amber-600" />
            <div>
              <div className="text-xl font-bold leading-none">{position?.speed != null ? Math.round(position.speed) : 0}</div>
              <div className="text-[10px] text-gray-500">km/h</div>
            </div>
          </div>
          {nav.route && (
            <div className="bg-white rounded-xl shadow-lg px-3 py-2 flex-1">
              <div className="text-xs text-gray-500">Arrivée</div>
              <div className="text-sm font-bold leading-tight">{formatDuration(nav.remainingDuration)} · {formatDistance(nav.remainingDistance)}</div>
            </div>
          )}
          <div className="bg-white rounded-xl shadow-lg px-3 py-2">
            <div className="text-xs text-gray-500">Parcouru</div>
            <div className="text-sm font-bold">{totalKm.toFixed(1)} km</div>
          </div>
        </div>

        {/* Bottom sheet : liste des élèves, fermé par défaut */}
        <div
          className={`absolute left-0 right-0 bottom-0 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.15)] rounded-t-2xl z-[1001] transition-[height] duration-300 ease-out flex flex-col`}
          style={{ height: sheetOpen ? '60vh' : '48px' }}
        >
          {/* Poignée toujours visible */}
          <button onClick={() => setSheetOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2 border-b shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
              <span className="text-xs font-semibold text-gray-700">
                📋 {sortedStudents.filter(a => statusOf(a.student.id) === 'pending').length} restant(s) / {sortedStudents.length}
              </span>
            </div>
            {sheetOpen ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronUp className="w-5 h-5 text-gray-500" />}
          </button>

          {/* Liste (visible uniquement quand ouvert) */}
          {sheetOpen && (
            <div className="flex-1 overflow-y-auto bg-gray-50">
              <div className="text-[10px] text-gray-500 px-3 py-1.5 bg-gray-100 border-b">🔀 Glissez les élèves pour réordonner</div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedStudents.filter(a => statusOf(a.student.id) === 'pending').map(a => a.id)} strategy={verticalListSortingStrategy}>
                  {sortedStudents.map(a => (
                    <StudentRow key={a.id} assignment={a} status={statusOf(a.student.id)} onEvent={(sid, t) => { sendEvent(sid, t); }} isNext={nextStudent?.id === a.id} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes studentBannerPulse {
          0%, 100% { box-shadow: 0 10px 25px -5px rgba(245, 158, 11, 0.7), 0 0 0 0 rgba(245, 158, 11, 0.6); transform: scale(1); }
          50% { box-shadow: 0 10px 35px -5px rgba(245, 158, 11, 1), 0 0 0 8px rgba(245, 158, 11, 0); transform: scale(1.02); }
        }
        .student-banner-pulse {
          animation: studentBannerPulse 1.6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function StudentRow({ assignment: a, status: st, onEvent, isNext }) {
  const isDone = st !== 'pending';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: a.id, disabled: isDone });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={`p-3 border-b flex items-center gap-2 ${isDone ? 'bg-gray-50 opacity-60' : isNext ? 'bg-amber-50 border-l-4 border-l-amber-500' : 'bg-white'}`}>
      {!isDone && (
        <button {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600" title="Glisser pour réordonner">
          <GripVertical className="w-5 h-5" />
        </button>
      )}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isDone ? 'bg-gray-200 text-gray-500' : isNext ? 'bg-amber-600 text-white ring-2 ring-amber-300' : 'bg-amber-500 text-white'}`}>
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
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onEvent(a.student.id, 'boarded')} className="bg-green-600 text-white p-2 rounded-lg" title="Monté"><CheckCircle className="w-5 h-5" /></button>
          <button onClick={() => onEvent(a.student.id, 'dropped')} className="bg-blue-600 text-white p-2 rounded-lg" title="Déposé"><Home className="w-5 h-5" /></button>
          <button onClick={() => onEvent(a.student.id, 'absent')} className="bg-red-600 text-white p-2 rounded-lg" title="Absent"><XCircle className="w-5 h-5" /></button>
        </div>
      )}
    </div>
  );
}
