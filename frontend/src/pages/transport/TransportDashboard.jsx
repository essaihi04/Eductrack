import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bus, MapPin, Users, AlertCircle, CheckCircle, Activity, History, UserCog, User, School, Save, X, Crosshair, TrendingUp } from 'lucide-react';
import { transportApi } from '../../lib/transportApi';
import { directionLabel } from '../../lib/tripDirection';
import HomeMapPicker from '../../components/transport/HomeMapPicker';
import { getCurrentPositionUnified } from '../../lib/geolocation';

export default function TransportDashboard() {
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState([]);
  const [school, setSchool] = useState(null);
  const [showSchoolEdit, setShowSchoolEdit] = useState(false);
  const [detectingSchool, setDetectingSchool] = useState(false);
  const [schoolMsg, setSchoolMsg] = useState(null); // { type: 'success'|'error', text }

  useEffect(() => {
    load();
    loadSchool();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    try {
      const [s, l] = await Promise.all([transportApi.summary(), transportApi.liveBuses().catch(() => ({ trips: [] }))]);
      setSummary(s); setLive(l.trips || []);
    } catch (e) { console.error(e); }
  };

  const loadSchool = async () => {
    try { setSchool(await transportApi.getSchool()); } catch (e) { console.error(e); }
  };

  // Détecte la position actuelle et l'enregistre directement comme localisation école (sans modal)
  // Utilise le plugin Capacitor sur app native, sinon navigator.geolocation
  const detectAndSaveSchool = async () => {
    setDetectingSchool(true);
    setSchoolMsg(null);
    try {
      const pos = await getCurrentPositionUnified({ enableHighAccuracy: true, timeout: 15000 });
      const updated = await transportApi.updateSchool({ lat: pos.lat, lng: pos.lng });
      setSchool(updated);
      setSchoolMsg({ type: 'success', text: '✅ Position de l\'école enregistrée à votre position actuelle' });
      setTimeout(() => setSchoolMsg(null), 4000);
    } catch (e) {
      const msg = e?.code === 1
        ? 'Permission GPS refusée. Activez la localisation dans les paramètres de l\'app/navigateur.'
        : 'GPS impossible : ' + (e?.message || 'erreur');
      setSchoolMsg({ type: 'error', text: msg });
    } finally {
      setDetectingSchool(false);
    }
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
        <Link to="/transport/stats" className="bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white rounded-xl p-4 hover:shadow-lg transition col-span-2 lg:col-span-4">
          <div className="flex items-center justify-between">
            <div>
              <TrendingUp className="w-6 h-6 mb-2" /><h3 className="font-bold">📊 Statistiques détaillées</h3>
              <p className="text-xs text-purple-100">Performance par chauffeur · Km parcourus · Temps moyen · Détail de chaque trajet</p>
            </div>
            <div className="text-3xl opacity-80">→</div>
          </div>
        </Link>
      </div>

      {/* Localisation de l'école — point de départ/arrivée de chaque tournée */}
      <div className={`rounded-xl border shadow-sm ${school?.lat && school?.lng ? 'bg-white' : 'bg-amber-50 border-amber-200'}`}>
        <div className="p-4 flex items-start gap-3">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${school?.lat && school?.lng ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
            <School className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold flex items-center gap-2">
              📍 Localisation de l'école
              {(!school?.lat || !school?.lng) && (
                <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">À CONFIGURER</span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mb-2">
              Point de départ et d'arrivée automatique de chaque tournée. Une fois tous les élèves traités, la navigation guide le chauffeur vers l'école.
            </p>
            {school?.lat && school?.lng ? (
              <div className="text-sm">
                <div className="font-medium">{school?.name}</div>
                {school?.address && <div className="text-xs text-gray-600">{school.address}</div>}
                <div className="text-xs text-gray-500 mt-1">
                  GPS : {Number(school.lat).toFixed(5)}, {Number(school.lng).toFixed(5)}
                </div>
              </div>
            ) : (
              <p className="text-sm text-amber-800">
                ⚠️ Définissez la position GPS de votre école pour que les tournées commencent et terminent automatiquement à l'école.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              onClick={detectAndSaveSchool}
              disabled={detectingSchool}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 font-medium"
              title="Détecte votre position GPS actuelle et l'enregistre automatiquement"
            >
              <Crosshair className="w-4 h-4" />
              {detectingSchool ? 'Détection...' : (school?.lat ? 'Re-détecter ici' : 'Détecter ici')}
            </button>
            <button
              onClick={() => setShowSchoolEdit(true)}
              className="text-xs text-gray-600 hover:text-orange-700 hover:underline flex items-center gap-1 justify-center"
              title="Choisir manuellement sur la carte"
            >
              <MapPin className="w-3 h-3" /> Choisir sur carte
            </button>
          </div>
        </div>
        {schoolMsg && (
          <div className={`mx-4 mb-3 px-3 py-2 rounded-lg text-xs ${schoolMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {schoolMsg.text}
          </div>
        )}
      </div>

      {showSchoolEdit && (
        <SchoolLocationModal
          school={school}
          onClose={() => setShowSchoolEdit(false)}
          onSaved={(updated) => { setSchool(updated); setShowSchoolEdit(false); }}
        />
      )}

      {/* Trajets actifs */}
      <div className="bg-white rounded-xl shadow border">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold">🚌 Trajets en cours</h2>
          <Link to="/transport/stats" className="text-sm text-orange-600 hover:underline flex items-center gap-1"><History className="w-4 h-4" /> Historique & Stats</Link>
        </div>
        <div className="divide-y">
          {live.length === 0 && <div className="p-6 text-center text-gray-400">Aucun trajet en cours</div>}
          {live.map(t => (
            <div key={t.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: t.bus?.color || '#f59e0b' }}>
                <Bus className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t.bus?.plate_number} • {directionLabel(t.direction)}</div>
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

function SchoolLocationModal({ school, onClose, onSaved }) {
  const [lat, setLat] = useState(school?.lat ?? '');
  const [lng, setLng] = useState(school?.lng ?? '');
  const [address, setAddress] = useState(school?.address || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [locating, setLocating] = useState(false);

  const useCurrentPosition = async () => {
    setLocating(true);
    setError(null);
    try {
      const pos = await getCurrentPositionUnified({ enableHighAccuracy: true, timeout: 15000 });
      setLat(pos.lat);
      setLng(pos.lng);
    } catch (err) {
      setError(err?.code === 1 ? 'Permission GPS refusée' : (err?.message || 'Erreur GPS'));
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!lat || !lng) { setError('Cliquez sur la carte ou utilisez la position GPS'); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await transportApi.updateSchool({ lat: Number(lat), lng: Number(lng), address: address || null });
      onSaved(updated);
    } catch (e) {
      setError(e.message || 'Erreur enregistrement');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[95vh] overflow-y-auto shadow-2xl">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-bold text-lg flex items-center gap-2"><School className="w-5 h-5 text-orange-600" /> Localisation de l'école</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 border-b flex justify-end gap-2 sticky top-[57px] z-10 bg-white">
          <button onClick={onClose} className="px-4 py-2 border rounded">Annuler</button>
          <button onClick={save} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">
            Cliquez sur la carte pour placer le point exact de l'école, ou utilisez votre position GPS actuelle si vous êtes sur place.
          </p>
          <HomeMapPicker
            lat={lat}
            lng={lng}
            onChange={(la, ln) => { setLat(la); setLng(ln); }}
            height={350}
          />
          <button
            onClick={useCurrentPosition}
            disabled={locating}
            className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Crosshair className="w-4 h-4" /> {locating ? 'Localisation...' : 'Utiliser ma position GPS actuelle'}
          </button>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <input className="border rounded p-2" placeholder="Latitude" value={lat} onChange={e => setLat(e.target.value)} />
            <input className="border rounded p-2" placeholder="Longitude" value={lng} onChange={e => setLng(e.target.value)} />
          </div>
          <input
            className="border rounded w-full p-2 text-sm"
            placeholder="Adresse de l'école (optionnel)"
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
          {error && <div className="text-xs bg-red-50 text-red-700 p-2 rounded">{error}</div>}
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
