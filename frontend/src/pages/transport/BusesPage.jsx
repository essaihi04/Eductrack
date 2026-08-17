import { useState, useEffect, useCallback } from 'react';
import { Bus, Plus, Trash2, Edit2, X, Users, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { transportApi, driversApi, transportManagersApi } from '../../lib/transportApi';
import { useYear } from '../../contexts/YearContext';

export default function BusesPage() {
  const { year } = useYear();
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ plate_number: '', model: '', capacity: 30, driver_id: '', transport_manager_id: '', color: '#f59e0b', status: 'active', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, d, m] = await Promise.all([
        transportApi.listBuses(year),
        driversApi.list().catch(() => ({ drivers: [] })),
        transportManagersApi.list().catch(() => ({ managers: [] }))
      ]);
      setBuses(b.buses || []);
      setDrivers(d.drivers || []);
      setManagers(m.managers || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      const payload = { ...form, capacity: Number(form.capacity) || 30 };
      if (!payload.driver_id) payload.driver_id = null;
      if (!payload.transport_manager_id) payload.transport_manager_id = null;
      if (editing) await transportApi.updateBus(editing.id, payload);
      else await transportApi.createBus(payload);
      setShowForm(false); setEditing(null);
      setForm({ plate_number: '', model: '', capacity: 30, driver_id: '', transport_manager_id: '', color: '#f59e0b', status: 'active', notes: '' });
      load();
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  const remove = async (b) => {
    if (!confirm(`Supprimer le bus ${b.plate_number} ?`)) return;
    try { await transportApi.deleteBus(b.id); load(); } catch (e) { alert('Erreur : ' + e.message); }
  };

  const startEdit = (b) => {
    setEditing(b);
    setForm({
      plate_number: b.plate_number, model: b.model || '', capacity: b.capacity || 30,
      driver_id: b.driver_id || '', transport_manager_id: b.transport_manager_id || '',
      color: b.color || '#f59e0b', status: b.status || 'active', notes: b.notes || ''
    });
    setShowForm(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bus className="w-6 h-6 text-orange-600" /> Bus / Véhicules</h1>
          <p className="text-sm text-gray-500">Flotte de transport scolaire</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ plate_number: '', model: '', capacity: 30, driver_id: '', transport_manager_id: '', color: '#f59e0b', status: 'active', notes: '' }); setShowForm(true); }} className="bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-700">
          <Plus className="w-4 h-4" /> Ajouter un bus
        </button>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Chargement...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buses.length === 0 && <div className="col-span-full text-center py-12 text-gray-400">Aucun bus enregistré</div>}
          {buses.map(b => (
            <div key={b.id} className="bg-white rounded-xl shadow border overflow-hidden">
              <div className="p-4 flex items-start gap-3" style={{ borderTop: `4px solid ${b.color || '#f59e0b'}` }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: b.color || '#f59e0b' }}>
                  <Bus className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{b.plate_number}</h3>
                  <p className="text-xs text-gray-500">{b.model || 'Modèle non renseigné'}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                    <span>Capacité : <b>{b.capacity}</b></span>
                    <span><Users className="w-3 h-3 inline" /> <b>{b.students_count || 0}</b> élèves</span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${b.status === 'active' ? 'bg-green-100 text-green-700' : b.status === 'maintenance' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-200 text-gray-600'}`}>
                  {b.status}
                </span>
              </div>
              <div className="px-4 pb-3 text-xs text-gray-600 border-t pt-2">
                <p>👤 Chauffeur : {b.driver ? `${b.driver.first_name} ${b.driver.last_name}` : <span className="text-gray-400">non assigné</span>}</p>
                <p>🧑‍💼 Resp. transport : {b.manager ? `${b.manager.first_name} ${b.manager.last_name}` : <span className="text-gray-400">—</span>}</p>
              </div>
              <div className="flex items-center justify-between border-t p-2 bg-gray-50">
                <Link to={`/transport/buses/${b.id}`} className="text-orange-600 text-sm font-medium flex items-center gap-1 hover:underline">
                  Détail <ArrowRight className="w-3 h-3" />
                </Link>
                <div className="space-x-2">
                  <button onClick={() => startEdit(b)} className="text-blue-600"><Edit2 className="w-4 h-4 inline" /></button>
                  <button onClick={() => remove(b)} className="text-red-600"><Trash2 className="w-4 h-4 inline" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">{editing ? 'Modifier' : 'Ajouter'} un bus</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="border rounded p-2" placeholder="Plaque (ex: 1234-A-12)" value={form.plate_number} onChange={e => setForm({ ...form, plate_number: e.target.value })} />
              <input className="border rounded p-2" placeholder="Modèle (ex: Mercedes Sprinter)" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500">Capacité</label>
                <input type="number" className="border rounded p-2 w-full" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Couleur</label>
                <input type="color" className="border rounded p-1 h-10 w-full" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Statut</label>
                <select className="border rounded p-2 w-full" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Actif</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="inactive">Inactif</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Chauffeur</label>
              <select className="border rounded p-2 w-full" value={form.driver_id} onChange={e => setForm({ ...form, driver_id: e.target.value })}>
                <option value="">— Aucun —</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Responsable transport</label>
              <select className="border rounded p-2 w-full" value={form.transport_manager_id} onChange={e => setForm({ ...form, transport_manager_id: e.target.value })}>
                <option value="">— Aucun —</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
              </select>
            </div>
            <textarea className="border rounded w-full p-2" placeholder="Notes (optionnel)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            <button onClick={save} className="bg-orange-600 text-white w-full py-2 rounded-lg hover:bg-orange-700">{editing ? 'Modifier' : 'Créer'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
