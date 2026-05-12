import { useState, useEffect } from 'react';
import { UserCog, Plus, Trash2, Edit2, Key, X, Mail, Phone, Calendar } from 'lucide-react';
import { financeApi, formatDate } from '../../lib/financeApi';

export default function FinanceManagersPage() {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newCreds, setNewCreds] = useState(null);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', password: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listManagers();
      setManagers(data.managers || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    try {
      if (editing) {
        await financeApi.updateManager(editing.id, {
          firstName: form.firstName, lastName: form.lastName, phone: form.phone
        });
      } else {
        const res = await financeApi.createManager(form);
        setNewCreds({ email: res.email, password: res.password, name: `${res.first_name} ${res.last_name}` });
      }
      setShowForm(false);
      setEditing(null);
      setForm({ email: '', firstName: '', lastName: '', phone: '', password: '' });
      load();
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  const resetPassword = async (manager) => {
    const newPassword = prompt(`Nouveau mot de passe pour ${manager.first_name} ${manager.last_name} (min 6 caractères):`);
    if (!newPassword || newPassword.length < 6) return;
    try {
      await financeApi.resetManagerPassword(manager.id, newPassword);
      alert(`Mot de passe réinitialisé\n\nEmail: ${manager.email}\nMot de passe: ${newPassword}`);
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const remove = async (m) => {
    if (!confirm(`Supprimer ${m.first_name} ${m.last_name} ? Cette action est irréversible.`)) return;
    try {
      await financeApi.deleteManager(m.id);
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const startEdit = (m) => {
    setEditing(m);
    setForm({ email: m.email, firstName: m.first_name, lastName: m.last_name, phone: m.phone || '', password: '' });
    setShowForm(true);
  };

  const startNew = () => {
    setEditing(null);
    setForm({ email: '', firstName: '', lastName: '', phone: '', password: '' });
    setShowForm(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <UserCog className="w-6 h-6" /> Responsables financiers
          </h1>
          <p className="text-sm text-gray-500">
            Créez des comptes dédiés à la gestion financière. Ils auront accès uniquement au module Finance.
          </p>
        </div>
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
          <Plus className="w-4 h-4" /> Nouveau responsable
        </button>
      </div>

      {loading && <p className="text-gray-500">Chargement...</p>}

      {!loading && managers.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <UserCog className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">Aucun responsable financier</p>
          <p className="text-sm text-gray-400">Créez le premier compte pour déléguer la gestion financière</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {managers.map(m => (
          <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold">
                  {m.first_name?.[0]}{m.last_name?.[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{m.first_name} {m.last_name}</h3>
                  <p className="text-xs text-gray-500 inline-block px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full mt-1">
                    Finance Manager
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(m)} className="p-1.5 hover:bg-gray-100 rounded" title="Modifier">
                  <Edit2 className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => resetPassword(m)} className="p-1.5 hover:bg-yellow-50 rounded" title="Réinitialiser mot de passe">
                  <Key className="w-4 h-4 text-yellow-600" />
                </button>
                <button onClick={() => remove(m)} className="p-1.5 hover:bg-red-50 rounded" title="Supprimer">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="w-3.5 h-3.5" /> {m.email}
              </div>
              {m.phone && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-3.5 h-3.5" /> {m.phone}
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Calendar className="w-3.5 h-3.5" /> Créé le {formatDate(m.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Modifier' : 'Nouveau'} responsable</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Prénom *</label>
                <input type="text" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
                <input type="text" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            {!editing && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mot de passe (optionnel, sera généré)</label>
                  <input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Laisser vide pour générer automatiquement"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone</label>
              <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Annuler</button>
              <button onClick={save} disabled={!form.firstName || !form.lastName || (!editing && !form.email)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                {editing ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nouveaux identifiants */}
      {newCreds && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-3">
            <h2 className="text-lg font-semibold text-green-700">✓ Responsable créé</h2>
            <p className="text-sm text-gray-600">Transmettez ces identifiants à <strong>{newCreds.name}</strong> :</p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 font-mono text-sm">
              <div><strong>Email :</strong> {newCreds.email}</div>
              <div><strong>Mot de passe :</strong> {newCreds.password}</div>
            </div>
            <p className="text-xs text-orange-600">⚠️ Ce mot de passe ne sera plus affiché. Copiez-le maintenant.</p>
            <button onClick={() => setNewCreds(null)} className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg">
              J'ai noté
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
