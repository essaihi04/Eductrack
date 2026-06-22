import { useState, useEffect } from 'react';
import { MessageSquare, Plus, Trash2, Edit2, X, Phone, Power, Bot } from 'lucide-react';
import { receptionistApi } from '../../lib/receptionistApi';

export default function ReceptionistsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await receptionistApi.list();
      setItems(data.receptionists || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const save = async () => {
    try {
      if (editing) {
        await receptionistApi.update(editing.id, { name: form.name, phone: form.phone });
      } else {
        await receptionistApi.create({ name: form.name, phone: form.phone });
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', phone: '' });
      load();
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  const toggleActive = async (r) => {
    try {
      await receptionistApi.update(r.id, { active: !r.active });
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const remove = async (r) => {
    if (!confirm(`Supprimer le réceptionniste ${r.name || r.phone_e164} ?`)) return;
    try {
      await receptionistApi.remove(r.id);
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const startEdit = (r) => {
    setEditing(r);
    setForm({ name: r.name || '', phone: r.phone_e164 || '' });
    setShowForm(true);
  };

  const startNew = () => {
    setEditing(null);
    setForm({ name: '', phone: '' });
    setShowForm(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Bot className="w-6 h-6" /> Réceptionniste (chatbot statistiques)
          </h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            Ajoutez un numéro WhatsApp autorisé à interroger l'assistant IA de l'école.
            Ce numéro pourra poser des questions libres (effectifs, taux d'absence, taux de
            réussite, trésorerie, état de santé de l'école…) et recevra les réponses via le
            numéro WhatsApp de l'établissement — distinct de votre numéro personnel.
          </p>
        </div>
        <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap">
          <Plus className="w-4 h-4" /> Nouveau numéro
        </button>
      </div>

      {loading && <p className="text-gray-500">Chargement...</p>}

      {!loading && items.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <Bot className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600">Aucun réceptionniste configuré</p>
          <p className="text-sm text-gray-400">Ajoutez un numéro pour activer le chatbot statistiques de l'école</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{r.name || 'Réceptionniste'}</h3>
                  <span className={`text-xs inline-block px-2 py-0.5 rounded-full mt-1 ${r.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggleActive(r)} className="p-1.5 hover:bg-gray-100 rounded" title={r.active ? 'Désactiver' : 'Activer'}>
                  <Power className={`w-4 h-4 ${r.active ? 'text-green-600' : 'text-gray-400'}`} />
                </button>
                <button onClick={() => startEdit(r)} className="p-1.5 hover:bg-gray-100 rounded" title="Modifier">
                  <Edit2 className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => remove(r)} className="p-1.5 hover:bg-red-50 rounded" title="Supprimer">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="w-3.5 h-3.5" /> {r.phone_e164}
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
              <h2 className="text-lg font-semibold">{editing ? 'Modifier' : 'Nouveau'} réceptionniste</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Libellé / nom</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex : Accueil, Directeur…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Numéro WhatsApp *</label>
              <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+212 6 12 34 56 78"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              <p className="text-xs text-gray-400 mt-1">Format international, ex : +2126XXXXXXXX</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Annuler</button>
              <button onClick={save} disabled={!form.phone}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {editing ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
