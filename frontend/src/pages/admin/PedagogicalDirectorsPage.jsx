import { useState, useEffect } from 'react';
import { GraduationCap, Plus, Trash2, Edit2, Key, X, Mail, Phone, Calendar } from 'lucide-react';
import { pedagogicalApi, formatDate } from '../../lib/pedagogicalApi';

export default function PedagogicalDirectorsPage() {
  const [directors, setDirectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newCreds, setNewCreds] = useState(null);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', password: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await pedagogicalApi.list();
      setDirectors(data.directors || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    try {
      if (editing) {
        await pedagogicalApi.update(editing.id, {
          firstName: form.firstName, lastName: form.lastName, phone: form.phone
        });
      } else {
        const res = await pedagogicalApi.create(form);
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

  const resetPassword = async (d) => {
    const newPassword = prompt(`Nouveau mot de passe pour ${d.first_name} ${d.last_name} (min 6 caractères):`);
    if (!newPassword || newPassword.length < 6) return;
    try {
      await pedagogicalApi.resetPassword(d.id, newPassword);
      alert(`Mot de passe réinitialisé\n\nEmail: ${d.email}\nMot de passe: ${newPassword}`);
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const remove = async (d) => {
    if (!confirm(`Supprimer ${d.first_name} ${d.last_name} ? Cette action est irréversible.`)) return;
    try {
      await pedagogicalApi.delete(d.id);
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const startEdit = (d) => {
    setEditing(d);
    setForm({ email: d.email, firstName: d.first_name, lastName: d.last_name, phone: d.phone || '', password: '' });
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
            <GraduationCap className="w-6 h-6" /> Directeurs pédagogiques
          </h1>
          <p className="text-sm text-gray-500">
            Comptes pour la direction pédagogique : accès aux classes, élèves, professeurs, suivis et communications. <strong>Aucun accès à la finance.</strong>
          </p>
        </div>
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Nouveau directeur
        </button>
      </div>

      {loading && <p className="text-gray-500">Chargement...</p>}

      {!loading && directors.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <GraduationCap className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">Aucun directeur pédagogique</p>
          <p className="text-sm text-gray-400">Créez le premier compte pour déléguer la supervision pédagogique</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {directors.map(d => (
          <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold">
                  {d.first_name?.[0]}{d.last_name?.[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{d.first_name} {d.last_name}</h3>
                  <p className="text-xs text-gray-500 inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full mt-1">
                    Directeur pédagogique
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(d)} className="p-1.5 hover:bg-gray-100 rounded" title="Modifier">
                  <Edit2 className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => resetPassword(d)} className="p-1.5 hover:bg-yellow-50 rounded" title="Réinitialiser mot de passe">
                  <Key className="w-4 h-4 text-yellow-600" />
                </button>
                <button onClick={() => remove(d)} className="p-1.5 hover:bg-red-50 rounded" title="Supprimer">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="w-3.5 h-3.5" /> {d.email}
              </div>
              {d.phone && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-3.5 h-3.5" /> {d.phone}
                </div>
              )}
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Calendar className="w-3.5 h-3.5" /> Créé le {formatDate(d.created_at)}
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
              <h2 className="text-lg font-semibold">{editing ? 'Modifier' : 'Nouveau'} directeur</h2>
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
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
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
            <h2 className="text-lg font-semibold text-green-700">✓ Directeur créé</h2>
            <p className="text-sm text-gray-600">Transmettez ces identifiants à <strong>{newCreds.name}</strong> :</p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 font-mono text-sm">
              <div><strong>Email :</strong> {newCreds.email}</div>
              <div><strong>Mot de passe :</strong> {newCreds.password}</div>
            </div>
            <p className="text-xs text-orange-600">⚠️ Ce mot de passe ne sera plus affiché. Copiez-le maintenant.</p>
            <button onClick={() => setNewCreds(null)} className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg">
              J'ai noté
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
