import { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Edit2, Key, X, Mail, Phone, Calendar, GraduationCap } from 'lucide-react';
import { pedagogicalManagersApi } from '../../lib/pedagogicalManagersApi';
import { supabase } from '../../lib/supabase';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';

export default function PedagogicalManagersPage() {
  const [managers, setManagers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newCreds, setNewCreds] = useState(null);
  const [form, setForm] = useState({
    email: '', firstName: '', lastName: '', phone: '', password: '',
    classIds: [], levels: []
  });

  useEffect(() => { load(); loadClassesAndLevels(); }, []);

  const loadClassesAndLevels = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const res = await fetch(`${apiUrl}/api/admin/classes`, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setClasses(list);
      // Niveaux uniques
      const uniqueLevels = [...new Set(list.map(c => c.level).filter(Boolean))].sort();
      setLevels(uniqueLevels);
    } catch (e) { console.error(e); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await pedagogicalManagersApi.list();
      setManagers(data.managers || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        classIds: form.classIds,
        levels: form.levels
      };
      if (editing) {
        await pedagogicalManagersApi.update(editing.id, payload);
      } else {
        const res = await pedagogicalManagersApi.create({
          ...payload,
          email: form.email,
          password: form.password
        });
        setNewCreds({ email: res.email, password: res.password, name: `${res.first_name} ${res.last_name}` });
      }
      setShowForm(false);
      setEditing(null);
      setForm({ email: '', firstName: '', lastName: '', phone: '', password: '', classIds: [], levels: [] });
      load();
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  const resetPassword = async (m) => {
    const newPassword = prompt(`Nouveau mot de passe pour ${m.first_name} ${m.last_name} (min 6 caractères):`);
    if (!newPassword || newPassword.length < 6) return;
    try {
      await pedagogicalManagersApi.resetPassword(m.id, newPassword);
      alert(`Mot de passe réinitialisé\n\nEmail: ${m.email}\nMot de passe: ${newPassword}`);
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const remove = async (m) => {
    if (!confirm(`Supprimer ${m.first_name} ${m.last_name} ? Cette action est irréversible.`)) return;
    try {
      await pedagogicalManagersApi.delete(m.id);
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const startEdit = (m) => {
    setEditing(m);
    setForm({
      email: m.email,
      firstName: m.first_name,
      lastName: m.last_name,
      phone: m.phone || '',
      password: '',
      classIds: m.class_ids || [],
      levels: m.levels || []
    });
    setShowForm(true);
  };

  const startNew = () => {
    setEditing(null);
    setForm({ email: '', firstName: '', lastName: '', phone: '', password: '', classIds: [], levels: [] });
    setShowForm(true);
  };

  const toggleClass = (id) => {
    setForm(f => ({
      ...f,
      classIds: f.classIds.includes(id) ? f.classIds.filter(x => x !== id) : [...f.classIds, id]
    }));
  };

  const toggleLevel = (lvl) => {
    setForm(f => ({
      ...f,
      levels: f.levels.includes(lvl) ? f.levels.filter(x => x !== lvl) : [...f.levels, lvl]
    }));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="w-6 h-6" /> Responsables pédagogiques
          </h1>
          <p className="text-sm text-gray-500">
            Comptes restreints à un périmètre (classes ou niveaux). Mêmes droits qu'un directeur pédagogique, mais limités à leurs assignations.
          </p>
        </div>
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
          <Plus className="w-4 h-4" /> Nouveau responsable
        </button>
      </div>

      {loading && <p className="text-gray-500">Chargement...</p>}

      {!loading && managers.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <Users className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">Aucun responsable pédagogique</p>
          <p className="text-sm text-gray-400">Créez le premier compte pour déléguer la supervision d'un périmètre</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {managers.map(m => (
          <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white font-bold">
                  {m.first_name?.[0]}{m.last_name?.[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{m.first_name} {m.last_name}</h3>
                  <p className="text-xs text-gray-500 inline-block px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full mt-1">
                    Responsable pédagogique
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(m)} className="p-1.5 hover:bg-gray-100 rounded" title="Modifier"><Edit2 className="w-4 h-4 text-gray-500" /></button>
                <button onClick={() => resetPassword(m)} className="p-1.5 hover:bg-yellow-50 rounded" title="Réinitialiser mot de passe"><Key className="w-4 h-4 text-yellow-600" /></button>
                <button onClick={() => remove(m)} className="p-1.5 hover:bg-red-50 rounded" title="Supprimer"><Trash2 className="w-4 h-4 text-red-500" /></button>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600"><Mail className="w-3.5 h-3.5" /> {m.email}</div>
              {m.phone && <div className="flex items-center gap-2 text-gray-600"><Phone className="w-3.5 h-3.5" /> {m.phone}</div>}
              <div className="flex items-center gap-2 text-gray-500 text-xs"><Calendar className="w-3.5 h-3.5" /> Créé le {formatDate(m.created_at)}</div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> Périmètre</p>
              {(m.levels || []).length === 0 && (m.scopes || []).length === 0 && (
                <p className="text-xs text-orange-600">⚠️ Aucune classe assignée — ne verra rien</p>
              )}
              <div className="flex flex-wrap gap-1">
                {(m.levels || []).map(lvl => (
                  <span key={lvl} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">Niveau : {lvl}</span>
                ))}
                {(m.scopes || []).filter(s => s.class_id).map(s => (
                  <span key={s.class_id} className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs">
                    {s.classes?.name || 'Classe'}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Modifier' : 'Nouveau'} responsable pédagogique</h2>
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

            {/* Périmètre */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Périmètre d'accès</h3>
              <p className="text-xs text-gray-500 mb-3">
                Cochez les <strong>niveaux</strong> (toutes les classes du niveau seront incluses, y compris les futures) <strong>et/ou</strong> des <strong>classes</strong> individuelles.
              </p>

              {levels.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-700 mb-1.5">Niveaux complets</p>
                  <div className="flex flex-wrap gap-2">
                    {levels.map(lvl => (
                      <label key={lvl} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs ${form.levels.includes(lvl) ? 'bg-indigo-100 border-indigo-400 text-indigo-700' : 'bg-white border-gray-300 text-gray-700'}`}>
                        <input type="checkbox" checked={form.levels.includes(lvl)} onChange={() => toggleLevel(lvl)} className="hidden" />
                        {lvl}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {classes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1.5">Classes individuelles</p>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                    {classes.map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-sm hover:bg-gray-50 px-2 py-1 rounded cursor-pointer">
                        <input type="checkbox" checked={form.classIds.includes(c.id)} onChange={() => toggleClass(c.id)} />
                        <span>{c.name}</span>
                        {c.level && <span className="text-xs text-gray-400">({c.level})</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Annuler</button>
              <button onClick={save} disabled={!form.firstName || !form.lastName || (!editing && !form.email)}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {editing ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal identifiants */}
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
            <button onClick={() => setNewCreds(null)} className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg">
              J'ai noté
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
