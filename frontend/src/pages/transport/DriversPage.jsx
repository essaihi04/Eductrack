import { useState, useEffect } from 'react';
import { User, Plus, Trash2, Edit2, Key, X, Bus } from 'lucide-react';
import { driversApi } from '../../lib/transportApi';

export default function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newCreds, setNewCreds] = useState(null);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', password: '' });

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try { const d = await driversApi.list(); setDrivers(d.drivers || []); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  const save = async () => {
    try {
      if (editing) await driversApi.update(editing.id, form);
      else { const r = await driversApi.create(form); setNewCreds({ email: r.email, password: r.password, name: `${r.first_name} ${r.last_name}` }); }
      setShowForm(false); setEditing(null);
      setForm({ email: '', firstName: '', lastName: '', phone: '', password: '' });
      load();
    } catch (e) { alert('Erreur : ' + e.message); }
  };
  const resetPwd = async (m) => {
    const np = prompt(`Nouveau mot de passe pour ${m.first_name} ${m.last_name} (min 6 caractères) :`);
    if (!np || np.length < 6) return;
    try { await driversApi.resetPassword(m.id, np); alert(`Mot de passe réinitialisé.\nEmail : ${m.email}\nMot de passe : ${np}`); }
    catch (e) { alert('Erreur : ' + e.message); }
  };
  const remove = async (m) => {
    if (!confirm(`Supprimer ${m.first_name} ${m.last_name} ?`)) return;
    try { await driversApi.delete(m.id); load(); } catch (e) { alert('Erreur : ' + e.message); }
  };
  const startEdit = (m) => {
    setEditing(m);
    setForm({ email: m.email, firstName: m.first_name, lastName: m.last_name, phone: m.phone || '', password: '' });
    setShowForm(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><User className="w-6 h-6 text-amber-600" /> Chauffeurs</h1>
          <p className="text-sm text-gray-500">Comptes chauffeurs avec accès à l'app de tournée</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ email: '', firstName: '', lastName: '', phone: '', password: '' }); setShowForm(true); }} className="bg-amber-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-700">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {newCreds && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="font-semibold text-green-800">✅ {newCreds.name} créé(e)</p>
          <p className="text-sm">Email : <code className="bg-white px-2 py-0.5 rounded">{newCreds.email}</code></p>
          <p className="text-sm">Mot de passe : <code className="bg-white px-2 py-0.5 rounded">{newCreds.password}</code></p>
          <p className="text-xs text-gray-600 mt-2">Le chauffeur pourra se connecter sur <code>/driver</code> avec ces identifiants.</p>
          <button onClick={() => setNewCreds(null)} className="text-xs text-green-700 underline mt-2">Fermer</button>
        </div>
      )}

      {loading ? <div className="text-center py-12 text-gray-400">Chargement...</div> : (
        <div className="bg-white rounded-lg shadow border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr><th className="text-left p-3">Nom</th><th className="text-left p-3">Email</th><th className="text-left p-3">Téléphone</th><th className="text-left p-3">Bus</th><th className="text-right p-3">Actions</th></tr>
            </thead>
            <tbody>
              {drivers.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-gray-400">Aucun chauffeur</td></tr>}
              {drivers.map(m => (
                <tr key={m.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium">{m.first_name} {m.last_name}</td>
                  <td className="p-3 text-gray-600">{m.email}</td>
                  <td className="p-3 text-gray-600">{m.phone || '—'}</td>
                  <td className="p-3">{m.bus ? <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded"><Bus className="w-3 h-3" /> {m.bus.plate_number}</span> : <span className="text-gray-400 text-xs">non assigné</span>}</td>
                  <td className="p-3 text-right space-x-2">
                    <button onClick={() => startEdit(m)} className="text-blue-600 hover:underline"><Edit2 className="w-4 h-4 inline" /></button>
                    <button onClick={() => resetPwd(m)} className="text-orange-600 hover:underline"><Key className="w-4 h-4 inline" /></button>
                    <button onClick={() => remove(m)} className="text-red-600 hover:underline"><Trash2 className="w-4 h-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">{editing ? 'Modifier' : 'Ajouter'} un chauffeur</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <input className="border rounded w-full p-2" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!!editing} />
            <div className="grid grid-cols-2 gap-2">
              <input className="border rounded p-2" placeholder="Prénom" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
              <input className="border rounded p-2" placeholder="Nom" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <input className="border rounded w-full p-2" placeholder="Téléphone (+212...)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            {!editing && <input className="border rounded w-full p-2" placeholder="Mot de passe (auto si vide)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />}
            <button onClick={save} className="bg-amber-600 text-white w-full py-2 rounded-lg hover:bg-amber-700">{editing ? 'Modifier' : 'Créer'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
