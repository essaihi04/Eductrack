import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, Sun, Moon, LogOut, Play } from 'lucide-react';
import { transportApi } from '../../lib/transportApi';
import { useAuth } from '../../contexts/AuthContext';

export default function DriverDashboard() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

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
                <p className="text-xs opacity-90">{inProgress.direction === 'morning_pickup' ? 'Ramassage matin' : 'Retour soir'} • Bus {inProgress.bus?.plate_number}</p>
                <p className="text-sm mt-2 underline">Reprendre →</p>
              </button>
            )}

            {!inProgress && (
              <>
                <div className="bg-white rounded-2xl shadow p-4 space-y-3">
                  <h2 className="font-semibold text-gray-700">Démarrer une tournée</h2>
                  <button onClick={() => startTrip('morning_pickup')} className="w-full bg-amber-500 text-white rounded-xl p-5 flex items-center gap-3 hover:bg-amber-600 transition">
                    <Sun className="w-8 h-8" />
                    <div className="text-left flex-1">
                      <div className="font-bold text-lg">Ramassage matin</div>
                      <div className="text-xs opacity-90">Aller chercher les élèves</div>
                    </div>
                    <Play className="w-6 h-6" />
                  </button>
                  <button onClick={() => startTrip('evening_dropoff')} className="w-full bg-indigo-600 text-white rounded-xl p-5 flex items-center gap-3 hover:bg-indigo-700 transition">
                    <Moon className="w-8 h-8" />
                    <div className="text-left flex-1">
                      <div className="font-bold text-lg">Retour soir</div>
                      <div className="text-xs opacity-90">Ramener les élèves à la maison</div>
                    </div>
                    <Play className="w-6 h-6" />
                  </button>
                </div>
              </>
            )}

            {trips.filter(t => t.status === 'completed').length > 0 && (
              <div className="bg-white rounded-2xl shadow p-4">
                <h3 className="font-semibold mb-2 text-sm text-gray-600">Tournées terminées aujourd'hui</h3>
                <div className="space-y-2">
                  {trips.filter(t => t.status === 'completed').map(t => (
                    <div key={t.id} className="flex items-center justify-between text-sm border rounded-lg p-2">
                      <span>{t.direction === 'morning_pickup' ? '☀️ Matin' : '🌙 Soir'}</span>
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
