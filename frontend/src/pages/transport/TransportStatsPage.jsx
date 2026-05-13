import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bus, User, Clock, Route as RouteIcon, CheckCircle, XCircle, Home, TrendingUp, Award, Activity, Calendar } from 'lucide-react';
import { transportApi } from '../../lib/transportApi';
import { directionShort, isPickupDirection } from '../../lib/tripDirection';

const formatDuration = (min) => {
  if (!min || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
};

const formatTime = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function TransportStatsPage() {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [period]);

  const load = async () => {
    setLoading(true);
    try { setData(await transportApi.statistics(period)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const g = data?.global || {};
  const drivers = data?.drivers || [];
  const trips = data?.trips || [];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto">
      <Link to="/transport" className="text-orange-600 inline-flex items-center gap-1 text-sm"><ArrowLeft className="w-4 h-4" /> Tableau de bord</Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="w-6 h-6 text-orange-600" /> Statistiques transport</h1>
          <p className="text-sm text-gray-500">Performance des chauffeurs et des tournées</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {['today', 'week', 'month'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${period === p ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
              {p === 'today' ? "Aujourd'hui" : p === 'week' ? '7 derniers jours' : '30 derniers jours'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : (
        <>
          {/* KPIs globaux */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={<Activity className="w-5 h-5" />} label="Tournées" value={g.completed_trips || 0} sub={g.in_progress_trips > 0 ? `+${g.in_progress_trips} en cours` : null} color="orange" />
            <Kpi icon={<RouteIcon className="w-5 h-5" />} label="Km parcourus" value={`${g.total_km || 0} km`} sub={`Moy. ${g.avg_km || 0} km/tournée`} color="blue" />
            <Kpi icon={<Clock className="w-5 h-5" />} label="Temps total" value={formatDuration(g.total_duration_min)} sub={`Moy. ${formatDuration(g.avg_duration_min)}`} color="purple" />
            <Kpi icon={<CheckCircle className="w-5 h-5" />} label="Élèves transportés" value={(g.total_boarded || 0) + (g.total_dropped || 0)} sub={g.total_absent ? `${g.total_absent} absent(s)` : 'Aucun absent'} color="green" />
          </div>

          {/* Répartition par type de tournée */}
          {g.by_direction && Object.keys(g.by_direction).length > 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <h2 className="font-bold mb-3 flex items-center gap-2"><Calendar className="w-5 h-5 text-orange-600" /> Tournées par période</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {['morning_pickup', 'noon_dropoff', 'afternoon_pickup', 'evening_dropoff'].map(dir => {
                  const count = g.by_direction[dir] || 0;
                  return (
                    <div key={dir} className="border rounded-lg p-3 text-center">
                      <div className="text-xs text-gray-500">{directionShort(dir)}</div>
                      <div className="text-2xl font-bold mt-1">{count}</div>
                      <div className="text-[10px] text-gray-400">{isPickupDirection(dir) ? 'Ramassage' : 'Retour'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Classement chauffeurs */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="p-4 border-b">
              <h2 className="font-bold flex items-center gap-2"><Award className="w-5 h-5 text-orange-600" /> Performance des chauffeurs</h2>
              <p className="text-xs text-gray-500">Classés par kilométrage parcouru sur la période</p>
            </div>
            {drivers.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Aucune donnée chauffeur sur cette période</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="text-left p-3">#</th>
                      <th className="text-left p-3">Chauffeur</th>
                      <th className="text-right p-3">Tournées</th>
                      <th className="text-right p-3">Km total</th>
                      <th className="text-right p-3">Km moy.</th>
                      <th className="text-right p-3">Durée moy.</th>
                      <th className="text-right p-3">Élèves</th>
                      <th className="text-right p-3">Absents</th>
                      <th className="text-right p-3">Bus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map((d, i) => (
                      <tr key={d.driver_id} className="border-t hover:bg-orange-50/30">
                        <td className="p-3">
                          {i === 0 && '🥇'}
                          {i === 1 && '🥈'}
                          {i === 2 && '🥉'}
                          {i > 2 && <span className="text-gray-400">#{i + 1}</span>}
                        </td>
                        <td className="p-3 font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">
                              {d.driver?.first_name?.[0]}{d.driver?.last_name?.[0]}
                            </div>
                            <div>
                              <div>{d.driver?.first_name} {d.driver?.last_name}</div>
                              {d.driver?.phone && <div className="text-[10px] text-gray-500">{d.driver.phone}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-bold">{d.completed_trips}</span>
                          <span className="text-xs text-gray-400">/{d.total_trips}</span>
                        </td>
                        <td className="p-3 text-right font-bold text-blue-700">{d.total_km.toFixed(1)} km</td>
                        <td className="p-3 text-right text-gray-600">{d.avg_km_per_trip} km</td>
                        <td className="p-3 text-right text-gray-600">{formatDuration(d.avg_duration_min)}</td>
                        <td className="p-3 text-right">
                          <span className="text-green-700 font-medium">{d.total_boarded + d.total_dropped}</span>
                        </td>
                        <td className="p-3 text-right">
                          {d.total_absent > 0 ? (
                            <span className="text-red-600 font-medium">{d.total_absent}</span>
                          ) : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                        <td className="p-3 text-right text-gray-600">{d.buses_used}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Détail des trajets */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="p-4 border-b">
              <h2 className="font-bold flex items-center gap-2"><Bus className="w-5 h-5 text-orange-600" /> Détail des trajets</h2>
              <p className="text-xs text-gray-500">{trips.length} tournée(s) sur la période sélectionnée</p>
            </div>
            {trips.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Aucun trajet sur cette période</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Bus</th>
                      <th className="text-left p-3">Chauffeur</th>
                      <th className="text-left p-3">Tournée</th>
                      <th className="text-right p-3">Départ</th>
                      <th className="text-right p-3">Arrivée</th>
                      <th className="text-right p-3">Durée</th>
                      <th className="text-right p-3">Km</th>
                      <th className="text-right p-3">Élèves</th>
                      <th className="text-center p-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map(t => {
                      const ev = t.events || {};
                      const isPickup = isPickupDirection(t.direction);
                      return (
                        <tr key={t.id} className="border-t hover:bg-gray-50">
                          <td className="p-3 text-xs">{formatDate(t.trip_date)}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded flex items-center justify-center text-white shrink-0" style={{ backgroundColor: t.bus?.color || '#f59e0b' }}>
                                <Bus className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-medium">{t.bus?.plate_number}</span>
                            </div>
                          </td>
                          <td className="p-3 text-xs">
                            {t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="p-3 text-xs">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isPickup ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                              {directionShort(t.direction)}
                            </span>
                          </td>
                          <td className="p-3 text-right text-xs font-mono">{formatTime(t.started_at)}</td>
                          <td className="p-3 text-right text-xs font-mono">{formatTime(t.ended_at)}</td>
                          <td className="p-3 text-right font-medium">{formatDuration(t.total_duration_min)}</td>
                          <td className="p-3 text-right font-bold text-blue-700">{t.total_km ? `${Number(t.total_km).toFixed(1)} km` : '—'}</td>
                          <td className="p-3 text-right text-xs">
                            <span className="text-green-700">{ev.boarded + ev.dropped}</span>
                            {ev.absent > 0 && <span className="text-red-600 ml-1">· {ev.absent} abs.</span>}
                          </td>
                          <td className="p-3 text-center">
                            {t.status === 'completed' && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">Terminé</span>}
                            {t.status === 'in_progress' && <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">En cours</span>}
                            {t.status === 'cancelled' && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px] font-bold">Annulé</span>}
                            {t.status === 'scheduled' && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] font-bold">Prévu</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, color }) {
  const colors = {
    orange: 'from-orange-500 to-amber-600',
    blue: 'from-blue-500 to-cyan-600',
    purple: 'from-purple-500 to-fuchsia-600',
    green: 'from-emerald-500 to-green-600',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${colors[color] || colors.orange} text-white p-4 shadow-sm`}>
      <div className="flex items-center justify-between opacity-90">
        {icon}
      </div>
      <div className="text-2xl font-bold mt-2">{value}</div>
      <div className="text-xs opacity-90">{label}</div>
      {sub && <div className="text-[10px] opacity-75 mt-1">{sub}</div>}
    </div>
  );
}
