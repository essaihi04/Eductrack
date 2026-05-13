import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bus, MapPin, Users, AlertCircle, CheckCircle, Activity, History, UserCog, User } from 'lucide-react';
import { transportApi } from '../../lib/transportApi';

export default function TransportDashboard() {
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState([]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    try {
      const [s, l] = await Promise.all([transportApi.summary(), transportApi.liveBuses().catch(() => ({ trips: [] }))]);
      setSummary(s); setLive(l.trips || []);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Bus className="w-6 h-6 text-orange-600" /> Transport scolaire</h1>
        <p className="text-sm text-gray-500">Vue d'ensemble de la flotte et du suivi en direct</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={<Bus />} label="Bus actifs" value={summary?.active_buses ?? '—'} color="orange" />
        <Kpi icon={<Activity />} label="Trajets en cours" value={summary?.active_trips ?? '—'} color="blue" />
        <Kpi icon={<CheckCircle />} label="Élèves transportés (jour)" value={summary?.today?.boarded ?? '—'} color="green" />
        <Kpi icon={<AlertCircle />} label="Absents (jour)" value={summary?.today?.absent ?? '—'} color="red" />
      </div>

      {/* Liens rapides */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link to="/transport/live" className="bg-gradient-to-br from-orange-500 to-amber-600 text-white rounded-xl p-4 hover:shadow-lg transition">
          <MapPin className="w-6 h-6 mb-2" /><h3 className="font-bold">Suivi en direct</h3>
          <p className="text-xs text-orange-100">Carte des bus en temps réel</p>
        </Link>
        <Link to="/transport/buses" className="bg-white border rounded-xl p-4 hover:shadow transition">
          <Bus className="w-6 h-6 mb-2 text-orange-600" /><h3 className="font-bold">Bus & Assignations</h3>
          <p className="text-xs text-gray-500">Gérer la flotte et les élèves</p>
        </Link>
        <Link to="/transport/drivers" className="bg-white border rounded-xl p-4 hover:shadow transition">
          <User className="w-6 h-6 mb-2 text-amber-600" /><h3 className="font-bold">Chauffeurs</h3>
          <p className="text-xs text-gray-500">Comptes chauffeurs</p>
        </Link>
        <Link to="/transport/managers" className="bg-white border rounded-xl p-4 hover:shadow transition">
          <UserCog className="w-6 h-6 mb-2 text-orange-600" /><h3 className="font-bold">Responsables</h3>
          <p className="text-xs text-gray-500">Resp. transport</p>
        </Link>
      </div>

      {/* Trajets actifs */}
      <div className="bg-white rounded-xl shadow border">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold">🚌 Trajets en cours</h2>
          <Link to="/transport/history" className="text-sm text-orange-600 hover:underline flex items-center gap-1"><History className="w-4 h-4" /> Historique</Link>
        </div>
        <div className="divide-y">
          {live.length === 0 && <div className="p-6 text-center text-gray-400">Aucun trajet en cours</div>}
          {live.map(t => (
            <div key={t.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: t.bus?.color || '#f59e0b' }}>
                <Bus className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t.bus?.plate_number} • {t.direction === 'morning_pickup' ? 'Ramassage matin' : 'Retour soir'}</div>
                <div className="text-xs text-gray-500">Démarré à {new Date(t.started_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              {t.last_position ? (
                <div className="text-xs text-green-700 flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> En direct</div>
              ) : (
                <div className="text-xs text-gray-400">En attente GPS</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, color }) {
  const colors = {
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.orange}`}>
      <div className="flex items-center justify-between">
        <div className="opacity-70">{icon}</div>
      </div>
      <div className="text-2xl font-bold mt-2">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}
