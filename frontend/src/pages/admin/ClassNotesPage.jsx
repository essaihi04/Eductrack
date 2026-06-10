import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, RefreshCw, FileDown, Save, X, Users, AlertTriangle, Pencil } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';

// Couleurs de statut (alignées sur le rapport de contrôle)
const LEVEL = {
  red:    { dot: 'bg-red-500',    text: 'text-red-700',    chip: 'bg-red-100 text-red-700' },
  orange: { dot: 'bg-orange-500', text: 'text-orange-700', chip: 'bg-orange-100 text-orange-700' },
  yellow: { dot: 'bg-amber-400',  text: 'text-amber-700',  chip: 'bg-amber-100 text-amber-700' },
  gray:   { dot: 'bg-gray-400',   text: 'text-gray-600',   chip: 'bg-gray-100 text-gray-600' },
  ok:     { dot: 'bg-green-500',  text: 'text-green-700',  chip: 'bg-green-100 text-green-700' },
};

const noteColor = (n) => n == null ? 'text-gray-400' : n >= 15 ? 'text-green-700' : n >= 10 ? 'text-amber-600' : 'text-red-600';

const ClassNotesPage = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Édition d'un contrôle
  const [editCtrl, setEditCtrl] = useState(null);   // { control, subject, rows, hasTracking }
  const [editRows, setEditRows] = useState([]);     // notes éditables
  const [savingEdit, setSavingEdit] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/api/admin/classes`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setClasses(await res.json());
      } catch (e) { console.error(e); }
    })();
  }, []);

  const loadOverview = useCallback(async () => {
    if (!selectedClass) { setOverview(null); return; }
    setLoading(true); setMsg('');
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/classes/${selectedClass}/controls-overview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setOverview(await res.json());
    } catch (e) { setMsg(`❌ ${e.message}`); setOverview(null); }
    finally { setLoading(false); }
  }, [selectedClass]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  // Ouvrir l'éditeur d'un contrôle
  const openControl = async (controlId) => {
    setMsg('');
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/controls/${controlId}/notes-detail`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setEditCtrl(data);
      setEditRows(data.rows.map(r => ({ ...r, _note: r.note == null ? '' : String(r.note) })));
    } catch (e) { setMsg(`❌ ${e.message}`); }
  };

  const saveEdit = async () => {
    if (!editCtrl) return;
    setSavingEdit(true); setMsg('');
    try {
      const token = await getToken();
      const notes = editRows.map(r => ({ student_id: r.student_id, note: r._note }));
      const res = await fetch(`${apiUrl}/api/admin/controls/${editCtrl.control.id}/notes`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setMsg(`✅ ${data.saved} note(s) enregistrée(s)${data.cleared ? `, ${data.cleared} effacée(s)` : ''}`);
      setEditCtrl(null);
      loadOverview();
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setSavingEdit(false); }
  };

  const exportPdf = async (controlId) => {
    setExporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/controls-plan/${controlId}/report-pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `rapport_controle.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setExporting(false); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ClipboardList className="w-6 h-6 text-indigo-600" /> Notes des professeurs
      </h1>
      <p className="text-sm text-gray-500 -mt-3">Consultez, corrigez et exportez les notes publiées par les professeurs.</p>

      <Card>
        <CardContent className="pt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Classe</label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm min-w-[240px]">
            <option value="">— Choisir une classe —</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level}${c.filiere ? '/' + c.filiere : ''})` : ''}</option>
            ))}
          </select>
          {overview && (
            <span className="ml-4 text-sm text-gray-500 inline-flex items-center gap-1">
              <Users className="w-4 h-4" /> {overview.totalStudents} élèves • {overview.controls.length} contrôle(s)
            </span>
          )}
        </CardContent>
      </Card>

      {msg && <p className="text-sm font-medium">{msg}</p>}

      {loading ? (
        <div className="flex justify-center py-10"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : overview && overview.controls.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun contrôle pour cette classe.</p>
      ) : overview ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {overview.controls.map(c => (
            <div key={c.id} className="border rounded-xl p-4 bg-white hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 truncate">{c.name}</span>
                    {c.kind === 'activity' && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">Activité</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.subject} • {c.teacher} • {c.date ? new Date(c.date).toLocaleDateString('fr-FR') : '—'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-lg font-bold ${noteColor(c.average)}`}>{c.average != null ? `${c.average}/20` : '—'}</p>
                  <p className="text-[11px] text-gray-400">moyenne</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {c.notedStudents}/{c.totalStudents} notés
                </span>
                {c.missing > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {c.missing} sans note
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <button onClick={() => openControl(c.id)}
                    className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 inline-flex items-center gap-1">
                    <Pencil className="w-3.5 h-3.5" /> Voir / Modifier
                  </button>
                  <button onClick={() => exportPdf(c.id)} disabled={exporting}
                    className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-40">
                    <FileDown className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ─── Éditeur de notes (modal) ─── */}
      {editCtrl && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditCtrl(null)}>
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-800">{editCtrl.control.name}</h3>
                <p className="text-xs text-gray-500">{editCtrl.subject} • {editCtrl.class?.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => exportPdf(editCtrl.control.id)} disabled={exporting}
                  className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-40">
                  <FileDown className="w-4 h-4" /> PDF
                </button>
                <button onClick={() => setEditCtrl(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="overflow-y-auto p-4">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left text-gray-600">
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="px-2 py-2">Élève</th>
                    {editCtrl.hasTracking && <th className="px-2 py-2 w-16 text-center">Copie</th>}
                    <th className="px-2 py-2 w-24 text-center">Note /20</th>
                    <th className="px-2 py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {editRows.map((r, i) => {
                    const lv = LEVEL[r.statusLevel] || LEVEL.ok;
                    return (
                      <tr key={r.student_id} className="border-t hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                        <td className="px-2 py-1.5 font-medium text-gray-800">{r.last_name} {r.first_name}</td>
                        {editCtrl.hasTracking && (
                          <td className="px-2 py-1.5 text-center">
                            <span className={r.copy_submitted === 'Oui' ? 'text-green-600' : r.copy_submitted === 'Non' ? 'text-red-600' : 'text-gray-400'}>
                              {r.copy_submitted || '—'}
                            </span>
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-center">
                          <input type="number" min="0" max="20" step="0.25" value={r._note}
                            onChange={e => setEditRows(prev => prev.map((x, j) => j === i ? { ...x, _note: e.target.value } : x))}
                            className="w-20 border rounded px-2 py-1 text-center text-sm" placeholder="—" />
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${lv.dot}`}></span>
                            <span className={`text-xs ${lv.text}`}>{r.statusLabel}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-xs text-gray-400">Modifier une note écrase celle du professeur. Effacer le champ supprime la note.</p>
              <button onClick={saveEdit} disabled={savingEdit}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
                <Save className="w-4 h-4" /> {savingEdit ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassNotesPage;
