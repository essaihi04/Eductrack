import { useState, useEffect } from 'react';
import { UserCog, Plus, Trash2, Edit2, Key, X } from 'lucide-react';
import { transportManagersApi } from '../../lib/transportApi';

export default function TransportManagersPage() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newCreds, setNewCreds] = useState(null);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', password: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { const d = await transportManagersApi.list(); setManagers(d.managers || []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    try {
      if (editing) await transportManagersApi.update(editing.id, form);
      else {
        const res = await transportManagersApi.create(form);
        setNewCreds({ email: res.email, password: res.password, name: `${res.first_name} ${res.last_name}` });
      }
      setShowForm(false); setEditing(null);
      setForm({ email: '', firstName: '', lastName: '', phone: '', password: '' });
      load();
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  const resetPwd = async (m) => {
    const np = prompt(`Nouveau mot de passe pour ${m.first_name} ${m.last_name} (min 6 caractères) :`);
    if (!np || np.length < 6) return;
    try { await transportManagersApi.resetPassword(m.id, np); alert(`Mot de passe réinitialisé.\nEmail : ${m.email}\nMot de passe : ${np}`); }
    catch (e) { alert('Erreur : ' + e.message); }
  };

  const remove = async (m) => {
    if (!confirm(`Supprimer ${m.first_name} ${m.last_name} ?`)) return;
    try { await transportManagersApi.delete(m.id); load(); } catch (e) { alert('Erreur : ' + e.message); }
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="w-6 h-6 text-orange-600" /> Responsables Transport</h1>
          <p className="text-sm text-gray-500">Gèrent les bus, chauffeurs et assignations d'élèves</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ email: '', firstName: '', lastName: '', phone: '', password: '' }); setShowForm(true); }} className="bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-700">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {newCreds && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="font-semibold text-green-800">✅ {newCreds.name} créé(e)</p>
          <p className="text-sm">Email : <code className="bg-white px-2 py-0.5 rounded">{newCreds.email}</code></p>
          <p className="text-sm">Mot de passe : <code className="bg-white px-2 py-0.5 rounded">{newCreds.password}</code></p>
          <button onClick={() => setNewCreds(null)} className="text-xs text-green-700 underline mt-2">Fermer</button>
        </div>
      )}

      {loading ? <div className="text-center py-12 text-gray-400">Chargement...</div> : (
        <div className="bg-white rounded-lg shadow border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr><th className="text-left p-3">Nom</th><th className="text-left p-3">Email</th><th className="text-left p-3">Téléphone</th><th className="text-right p-3">Actions</th></tr>
            </thead>
            <tbody>
              {managers.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-gray-400">Aucun responsable transport</td></tr>}
              {managers.map(m => (
                <tr key={m.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium">{m.first_name} {m.last_name}</td>
                  <td className="p-3 text-gray-600">{m.email}</td>
                  <td className="p-3 text-gray-600">{m.phone || '—'}</td>
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
              <h2 className="text-lg font-bold">{editing ? 'Modifier' : 'Ajouter'} un responsable transport</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <input className="border rounded w-full p-2" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!!editing} />
            <div className="grid grid-cols-2 gap-2">
              <input className="border rounded p-2" placeholder="Prénom" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
              <input className="border rounded p-2" placeholder="Nom" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <input className="border rounded w-full p-2" placeholder="Téléphone (+212...)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            {!editing && <input className="border rounded w-full p-2" placeholder="Mot de passe (auto si vide)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />}
            <button onClick={save} className="bg-orange-600 text-white w-full py-2 rounded-lg hover:bg-orange-700">{editing ? 'Modifier' : 'Créer'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
