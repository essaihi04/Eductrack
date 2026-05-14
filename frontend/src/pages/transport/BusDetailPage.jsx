import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, MoveUp, MoveDown, MapPin, X, Search } from 'lucide-react';
import { transportApi } from '../../lib/transportApi';
import HomeMapPicker from '../../components/transport/HomeMapPicker';

export default function BusDetailPage() {
  const { id } = useParams();
  const [assignments, setAssignments] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [editingHome, setEditingHome] = useState(null); // student object

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([
        transportApi.listBusStudents(id),
        transportApi.listAvailableStudents()
      ]);
      setAssignments(a.assignments || []);
      setAvailable(s.students || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const assign = async (student) => {
    try {
      const order = (assignments[assignments.length - 1]?.pickup_order || 0) + 1;
      await transportApi.assignStudent(id, { student_id: student.id, direction: 'both', pickup_order: order });
      setShowAdd(false); setSearch('');
      load();
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  const remove = async (a) => {
    if (!confirm(`Retirer ${a.student.first_name} ${a.student.last_name} de ce bus ?`)) return;
    try { await transportApi.removeAssignment(a.id); load(); } catch (e) { alert('Erreur : ' + e.message); }
  };

  const moveOrder = async (idx, dir) => {
    const newList = [...assignments];
    const j = idx + dir;
    if (j < 0 || j >= newList.length) return;
    [newList[idx], newList[j]] = [newList[j], newList[idx]];
    setAssignments(newList);
    try {
      await transportApi.reorderAssignments(id, newList.map((a, i) => ({ id: a.id, pickup_order: i + 1 })));
    } catch (e) { console.error(e); load(); }
  };

  const saveHome = async (lat, lng, address, notes) => {
    if (!editingHome) return;
    try {
      await transportApi.updateStudentHome(editingHome.id, {
        home_lat: lat, home_lng: lng, home_address: address, transport_notes: notes
      });
      setEditingHome(null);
      load();
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  const assignedIds = new Set(assignments.map(a => a.student.id));
  // Normalisation : minuscules + suppression des accents pour recherche tolérante
  const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const searchNorm = norm(search.trim());
  const candidates = available.filter(s => !assignedIds.has(s.id));
  const filtered = !searchNorm ? candidates : candidates.filter(s => {
    const hay = norm(`${s.first_name} ${s.last_name} ${s.classes?.name || ''}`);
    return hay.includes(searchNorm);
  });
  // Regroupement par classe
  const grouped = filtered.reduce((acc, s) => {
    const key = s.classes?.name || 'Sans classe';
    (acc[key] = acc[key] || []).push(s);
    return acc;
  }, {});
  const groupedSorted = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0], 'fr'));

  return (
    <div className="p-6 space-y-6">
      <Link to="/transport/buses" className="text-orange-600 inline-flex items-center gap-1 text-sm"><ArrowLeft className="w-4 h-4" /> Retour aux bus</Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Élèves assignés</h1>
          <p className="text-sm text-gray-500">{assignments.length} élève(s) — Réorganisez l'ordre de passage</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-700">
          <Plus className="w-4 h-4" /> Assigner un élève
        </button>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Chargement...</div> : (
        <div className="bg-white rounded-lg shadow border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3 w-16">Ordre</th>
                <th className="text-left p-3">Élève</th>
                <th className="text-left p-3">Classe</th>
                <th className="text-left p-3">Domicile</th>
                <th className="text-left p-3">Direction</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-gray-400">Aucun élève assigné. Cliquez sur "Assigner un élève".</td></tr>}
              {assignments.map((a, i) => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <span className="font-bold w-6">{i + 1}</span>
                      <button onClick={() => moveOrder(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30"><MoveUp className="w-4 h-4" /></button>
                      <button onClick={() => moveOrder(i, +1)} disabled={i === assignments.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30"><MoveDown className="w-4 h-4" /></button>
                    </div>
                  </td>
                  <td className="p-3 font-medium">{a.student.first_name} {a.student.last_name}</td>
                  <td className="p-3 text-gray-600">{a.student.classes?.name || '—'}</td>
                  <td className="p-3 text-gray-600 max-w-xs">
                    {a.student.home_lat && a.student.home_lng ? (
                      <span className="text-xs text-green-700">📍 GPS défini</span>
                    ) : (
                      <span className="text-xs text-red-500">⚠ GPS manquant</span>
                    )}
                    <div className="text-xs text-gray-500 truncate">{a.student.home_address || '—'}</div>
                  </td>
                  <td className="p-3">
                    <select value={a.direction} onChange={async (e) => { try { await transportApi.updateAssignment(a.id, { direction: e.target.value }); load(); } catch (err) { alert(err.message); } }} className="border rounded p-1 text-xs">
                      <option value="both">Aller-Retour</option>
                      <option value="pickup">Aller</option>
                      <option value="dropoff">Retour</option>
                    </select>
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <button onClick={() => setEditingHome(a.student)} className="text-blue-600 hover:underline" title="Définir domicile"><MapPin className="w-4 h-4 inline" /></button>
                    <button onClick={() => remove(a)} className="text-red-600 hover:underline"><Trash2 className="w-4 h-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-5 border-b">
              <div>
                <h2 className="text-lg font-bold">Assigner un élève</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {filtered.length} élève(s) disponible(s) sur {candidates.length} non assigné(s)
                </p>
              </div>
              <button onClick={() => { setShowAdd(false); setSearch(''); }} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search bar (sticky) */}
            <div className="p-4 border-b bg-gray-50">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  className="border rounded-lg w-full pl-9 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Rechercher par nom, prénom ou classe..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* List grouped by class */}
            <div className="overflow-y-auto flex-1 p-3">
              {filtered.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  {search ? 'Aucun élève ne correspond à la recherche' : 'Tous les élèves sont déjà assignés'}
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedSorted.map(([className, students]) => (
                    <div key={className}>
                      <div className="sticky top-0 bg-white z-10 flex items-center gap-2 px-2 py-1.5 border-b border-gray-200 mb-1">
                        <span className="text-xs font-bold uppercase tracking-wide text-orange-700">{className}</span>
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">{students.length}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {students.map(s => (
                          <button
                            key={s.id}
                            onClick={() => assign(s)}
                            className="text-left p-3 rounded-lg border border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition group"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-gray-900 truncate group-hover:text-orange-700">
                                  {s.first_name} {s.last_name}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  {s.home_lat && s.home_lng ? (
                                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📍 GPS</span>
                                  ) : (
                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">⚠ Sans GPS</span>
                                  )}
                                  {s.phone && (
                                    <span className="text-[10px] text-gray-500 truncate">{s.phone}</span>
                                  )}
                                </div>
                              </div>
                              <Plus className="w-4 h-4 text-gray-300 group-hover:text-orange-600 flex-shrink-0 mt-1" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 text-center">
              Cliquez sur un élève pour l'assigner à ce bus
            </div>
          </div>
        </div>
      )}

      {editingHome && (
        <HomeEditModal student={editingHome} onClose={() => setEditingHome(null)} onSave={saveHome} />
      )}
    </div>
  );
}

function HomeEditModal({ student, onClose, onSave }) {
  const [lat, setLat] = useState(student.home_lat || '');
  const [lng, setLng] = useState(student.home_lng || '');
  const [address, setAddress] = useState(student.home_address || '');
  const [notes, setNotes] = useState(student.transport_notes || '');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl space-y-3 max-h-[95vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">Domicile de {student.first_name} {student.last_name}</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-500">Cliquez sur la carte pour placer la maison de l'élève.</p>
        <HomeMapPicker
          lat={lat} lng={lng}
          onChange={(la, ln) => { setLat(la); setLng(ln); }}
          height={350}
        />
        <div className="grid grid-cols-2 gap-2 text-sm">
          <input className="border rounded p-2" placeholder="Latitude" value={lat} onChange={e => setLat(e.target.value)} />
          <input className="border rounded p-2" placeholder="Longitude" value={lng} onChange={e => setLng(e.target.value)} />
        </div>
        <input className="border rounded w-full p-2" placeholder="Adresse (optionnel)" value={address} onChange={e => setAddress(e.target.value)} />
        <textarea className="border rounded w-full p-2" placeholder="Notes pour le chauffeur (porte rouge, sonner...)" value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded">Annuler</button>
          <button onClick={() => onSave(lat ? Number(lat) : null, lng ? Number(lng) : null, address, notes)} className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
