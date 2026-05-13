import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, LogOut, Play, MapPin, CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { transportApi } from '../../lib/transportApi';
import { useAuth } from '../../contexts/AuthContext';
import { DIRECTIONS, suggestDirectionByTime, directionShort } from '../../lib/tripDirection';

export default function DriverDashboard() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gpsTest, setGpsTest] = useState(null); // { ok, lat, lng, accuracy, error }
  const [testing, setTesting] = useState(false);

  const testGps = async () => {
    setTesting(true); setGpsTest(null);
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setGpsTest({ ok: false, error: 'Site doit être en HTTPS (actuellement HTTP)' });
      setTesting(false); return;
    }
    if (!('geolocation' in navigator)) {
      setGpsTest({ ok: false, error: 'Géolocalisation non supportée par le navigateur' });
      setTesting(false); return;
    }
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 }));
      setGpsTest({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
    } catch (e) {
      setGpsTest({ ok: false, error: e.message + ' (autorisez la localisation pour ce site)' });
    } finally { setTesting(false); }
  };

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { const r = await transportApi.todayTrips(); setTrips(r.trips || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const startTrip = async (direction) => {
    try {
      // Demander position de départ
      let lat, lng;
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }));
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      } catch {}
      const trip = await transportApi.startTrip({ direction, lat, lng });
      navigate(`/driver/trip/${trip.id}`);
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  const inProgress = trips.find(t => t.status === 'in_progress');

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Bus className="w-6 h-6 text-amber-600" /> Bonjour {profile?.first_name}</h1>
            <p className="text-xs text-gray-500">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <button onClick={signOut} className="text-gray-500"><LogOut className="w-5 h-5" /></button>
        </div>

        {loading ? <div className="text-center py-12 text-gray-400">Chargement...</div> : (
          <>
            {inProgress && (
              <button onClick={() => navigate(`/driver/trip/${inProgress.id}`)} className="w-full bg-green-600 text-white rounded-2xl p-6 shadow-lg hover:bg-green-700 transition">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="w-3 h-3 bg-white rounded-full animate-pulse"></span>
                  <span className="font-bold text-lg">Tournée en cours</span>
                </div>
                <p className="text-xs opacity-90">{DIRECTIONS[inProgress.direction]?.label || inProgress.direction} • Bus {inProgress.bus?.plate_number}</p>
                <p className="text-sm mt-2 underline">Reprendre →</p>
              </button>
            )}

            {!inProgress && (
              <>
                {/* Test GPS */}
                <div className="bg-white rounded-2xl shadow p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-600" /> Diagnostic GPS</h3>
                    <button onClick={testGps} disabled={testing} className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                      {testing ? 'Test...' : 'Tester'}
                    </button>
                  </div>
                  {gpsTest?.ok && (
                    <div className="text-xs bg-green-50 text-green-800 rounded p-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> GPS OK — {gpsTest.lat.toFixed(5)}, {gpsTest.lng.toFixed(5)} (±{Math.round(gpsTest.accuracy)}m)
                    </div>
                  )}
                  {gpsTest && !gpsTest.ok && (
                    <div className="text-xs bg-red-50 text-red-800 rounded p-2 flex items-start gap-2">
                      <XCircle className="w-4 h-4 shrink-0" /> {gpsTest.error}
                    </div>
                  )}
                  {!gpsTest && <p className="text-xs text-gray-500">Cliquez "Tester" pour vérifier que la géolocalisation fonctionne avant de démarrer une tournée.</p>}
                </div>

                {(() => {
                  const suggested = suggestDirectionByTime();
                  const completedKeys = new Set(trips.filter(t => t.status === 'completed').map(t => t.direction));
                  const order = ['morning_pickup', 'noon_dropoff', 'afternoon_pickup', 'evening_dropoff'];
                  const colorClasses = {
                    morning_pickup: 'from-amber-400 to-amber-600 hover:from-amber-500 hover:to-amber-700',
                    noon_dropoff: 'from-sky-400 to-sky-600 hover:from-sky-500 hover:to-sky-700',
                    afternoon_pickup: 'from-orange-400 to-orange-600 hover:from-orange-500 hover:to-orange-700',
                    evening_dropoff: 'from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800',
                  };
                  return (
                    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-gray-700">Démarrer une tournée</h2>
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-1 rounded-full flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> Suggéré selon l'heure
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {order.map(key => {
                          const d = DIRECTIONS[key];
                          const isSuggested = key === suggested;
                          const isDone = completedKeys.has(key);
                          return (
                            <button
                              key={key}
                              onClick={() => startTrip(key)}
                              disabled={isDone}
                              className={`relative text-white rounded-xl p-4 flex flex-col items-start gap-1 transition shadow-md bg-gradient-to-br ${colorClasses[key]} ${isSuggested ? 'ring-4 ring-amber-300 scale-[1.02]' : ''} ${isDone ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                            >
                              {isSuggested && !isDone && (
                                <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5" /> SUGGÉRÉ
                                </span>
                              )}
                              {isDone && (
                                <span className="absolute top-1.5 right-1.5 bg-white/30 text-[9px] font-bold px-1.5 py-0.5 rounded">✓ Fait</span>
                              )}
                              <div className="text-2xl">{d.icon}</div>
                              <div className="text-left">
                                <div className="font-bold text-sm leading-tight">{d.label}</div>
                                <div className="text-[10px] opacity-90">{d.typicalRange}</div>
                              </div>
                              {!isDone && <Play className="w-4 h-4 self-end" />}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-gray-500 text-center pt-1">
                        💡 Les ramassages utilisent ✓/✕ (monté/absent), les retours utilisent 🏠/✕ (déposé/absent)
                      </p>
                    </div>
                  );
                })()}
              </>
            )}

            {trips.filter(t => t.status === 'completed').length > 0 && (
              <div className="bg-white rounded-2xl shadow p-4">
                <h3 className="font-semibold mb-2 text-sm text-gray-600">Tournées terminées aujourd'hui</h3>
                <div className="space-y-2">
                  {trips.filter(t => t.status === 'completed').map(t => (
                    <div key={t.id} className="flex items-center justify-between text-sm border rounded-lg p-2">
                      <span>{directionShort(t.direction)}</span>
                      <span className="text-xs text-gray-500">{t.total_duration_min ? `${t.total_duration_min} min` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
