import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, RefreshCw, Save, Plus, Trash2, X, Check, Eye, EyeOff,
  AlertTriangle, GraduationCap, BookOpen,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Page « Saisie des notes » (admin / directeur / responsable pédagogique).
// Grille type Massar : lignes = élèves (ordre du fichier Massar), colonnes =
// contrôles (C1, C2…) de la classe × matière sélectionnées + moyenne.
//  - saisie manuelle des notes (0–20), enregistrement par lot
//  - ajout / suppression d'un contrôle
//  - VALIDATION & PUBLICATION : un contrôle (saisi par un prof ou ici) n'est
//    visible chez les élèves et parents qu'une fois publié.
export default function NotesSaisiePage() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const [grid, setGrid] = useState(null); // { class, students, controls, notes }
  const [cells, setCells] = useState({}); // `${controlId}_${studentId}` -> valeur saisie (string)
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyControl, setBusyControl] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [newControl, setNewControl] = useState({ name: '', date: new Date().toISOString().split('T')[0] });

  const authHeaders = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' };
  };

  const api = async (path, options = {}) => {
    const headers = await authHeaders();
    const res = await fetch(`${apiUrl}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  useEffect(() => {
    (async () => {
      try {
        const [cls, subj] = await Promise.all([api('/api/admin/classes'), api('/api/admin/subjects')]);
        setClasses(Array.isArray(cls) ? cls : []);
        setSubjects(Array.isArray(subj) ? subj : (subj.subjects || []));
      } catch (e) { setError(e.message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGrid = async (cId = classId, sId = subjectId) => {
    if (!cId || !sId) { setGrid(null); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/admin/notes/grid?class_id=${cId}&subject_id=${sId}`);
      setGrid(data);
      // Initialiser les cellules depuis les notes existantes
      const c = {};
      (data.notes || []).forEach(n => { c[`${n.control_id}_${n.student_id}`] = String(n.note ?? ''); });
      setCells(c);
      setDirty(false);
    } catch (e) { setError(e.message); setGrid(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadGrid(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [classId, subjectId]);

  const setCell = (controlId, studentId, value) => {
    // Accepte vide, virgule ou point ; borne 0–20 à l'enregistrement
    if (value !== '' && !/^\d{0,2}([.,]\d{0,2})?$/.test(value)) return;
    setCells(prev => ({ ...prev, [`${controlId}_${studentId}`]: value }));
    setDirty(true);
  };

  const parseNote = (v) => {
    if (v === '' || v == null) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : Math.min(20, Math.max(0, n));
  };

  // Moyenne par élève (sur les contrôles notés seulement)
  const avgByStudent = useMemo(() => {
    const map = {};
    if (!grid) return map;
    grid.students.forEach(s => {
      const vals = grid.controls
        .map(c => parseNote(cells[`${c.id}_${s.id}`]))
        .filter(v => v !== null);
      map[s.id] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    });
    return map;
  }, [grid, cells]);

  const saveAll = async () => {
    if (!grid) return;
    setSaving(true);
    setError(''); setInfo('');
    try {
      for (const c of grid.controls) {
        const notes = grid.students.map(s => ({
          student_id: s.id,
          note: cells[`${c.id}_${s.id}`] ?? '',
        }));
        await api(`/api/admin/controls/${c.id}/notes`, { method: 'PUT', body: JSON.stringify({ notes }) });
      }
      setInfo('Notes enregistrées.');
      setDirty(false);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const addControl = async () => {
    if (!newControl.name.trim()) return;
    setBusyControl('new');
    setError('');
    try {
      await api('/api/admin/notes/controls', {
        method: 'POST',
        body: JSON.stringify({ class_id: classId, subject_id: subjectId, name: newControl.name, date: newControl.date }),
      });
      setAddOpen(false);
      setNewControl({ name: '', date: new Date().toISOString().split('T')[0] });
      await loadGrid();
    } catch (e) { setError(e.message); }
    finally { setBusyControl(''); }
  };

  const deleteControl = async (c) => {
    if (!window.confirm(`Supprimer le contrôle « ${c.name} » et toutes ses notes ? Cette action est définitive.`)) return;
    setBusyControl(c.id);
    setError('');
    try {
      await api(`/api/admin/notes/controls/${c.id}`, { method: 'DELETE' });
      await loadGrid();
    } catch (e) { setError(e.message); }
    finally { setBusyControl(''); }
  };

  const togglePublish = async (c) => {
    const publish = !c.published;
    if (publish && dirty) {
      if (!window.confirm('Des notes ne sont pas enregistrées. Publier quand même ? (Enregistrez d\'abord pour publier les dernières valeurs.)')) return;
    }
    if (publish && !window.confirm(`Valider et publier « ${c.name} » ? Les notes seront visibles par les élèves et les parents.`)) return;
    setBusyControl(c.id);
    setError('');
    try {
      await api(`/api/admin/notes/controls/${c.id}/publish`, { method: 'POST', body: JSON.stringify({ published: publish }) });
      setGrid(prev => ({
        ...prev,
        controls: prev.controls.map(x => x.id === c.id ? { ...x, published: publish } : x),
      }));
    } catch (e) { setError(e.message); }
    finally { setBusyControl(''); }
  };

  const pendingCount = grid ? grid.controls.filter(c => !c.published).length : 0;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" /> Saisie des notes
        </h1>
        {grid && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" /> Ajouter un contrôle
            </button>
            <button
              onClick={saveAll}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>

      {/* Sélecteurs classe + matière */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                <GraduationCap className="w-3.5 h-3.5 inline mr-1" />Classe
              </label>
              <select value={classId} onChange={e => setClassId(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background min-w-[180px]">
                <option value="">— choisir —</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                <BookOpen className="w-3.5 h-3.5 inline mr-1" />Matière
              </label>
              <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background min-w-[180px]">
                <option value="">— choisir —</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {grid && (
              <div className="text-sm text-muted-foreground pb-2">
                {grid.students.length} élève(s) · {grid.controls.length} contrôle(s)
                {pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                    <AlertTriangle className="w-3 h-3" /> {pendingCount} à valider
                  </span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      {info && <p className="text-sm font-medium text-green-700">{info}</p>}

      {loading && <div className="flex justify-center p-10"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>}

      {!loading && classId && subjectId && grid && (
        grid.students.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Aucun élève dans cette classe.</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="px-3 py-2 sticky left-0 bg-muted/50 z-10 min-w-[180px]">Élève</th>
                      {grid.controls.map((c, i) => (
                        <th key={c.id} className="px-2 py-2 text-center min-w-[110px] align-top">
                          <div className="font-semibold">C{i + 1} · {c.name}</div>
                          <div className="text-[10px] font-normal text-muted-foreground">
                            {c.date}{c.teacher_name ? ` · ${c.teacher_name}` : ''}
                          </div>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            {c.published ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-medium">
                                <Check className="w-3 h-3" /> Publié
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium">
                                À valider
                              </span>
                            )}
                            <button
                              onClick={() => togglePublish(c)}
                              disabled={busyControl === c.id}
                              title={c.published ? 'Dépublier (masquer aux élèves/parents)' : 'Valider & publier (visible élèves/parents)'}
                              className="p-1 rounded hover:bg-accent disabled:opacity-50"
                            >
                              {c.published ? <EyeOff className="w-3.5 h-3.5 text-gray-500" /> : <Eye className="w-3.5 h-3.5 text-indigo-600" />}
                            </button>
                            <button
                              onClick={() => deleteControl(c)}
                              disabled={busyControl === c.id}
                              title="Supprimer ce contrôle"
                              className="p-1 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center bg-primary/10 min-w-[70px]">Moy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grid.students.map((s, idx) => (
                      <tr key={s.id} className="border-t border-border hover:bg-accent/30">
                        <td className="px-3 py-1.5 sticky left-0 bg-card z-10">
                          <span className="text-xs text-muted-foreground mr-2">{s.import_order ?? idx + 1}</span>
                          <span className="font-medium">{s.last_name} {s.first_name}</span>
                        </td>
                        {grid.controls.map(c => {
                          const key = `${c.id}_${s.id}`;
                          const v = cells[key] ?? '';
                          const n = parseNote(v);
                          return (
                            <td key={c.id} className="px-1 py-1 text-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={v}
                                onChange={e => setCell(c.id, s.id, e.target.value)}
                                className={`w-16 px-1 py-1 text-center border rounded ${
                                  n === null ? 'border-border bg-background'
                                  : n < 10 ? 'border-red-200 bg-red-50 text-red-700 font-medium'
                                  : 'border-green-200 bg-green-50 text-green-800 font-medium'
                                }`}
                                placeholder="—"
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-1.5 text-center font-bold bg-primary/5">
                          {avgByStudent[s.id] ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {!loading && (!classId || !subjectId) && (
        <p className="text-center text-muted-foreground py-10">
          Sélectionnez une <strong>classe</strong> et une <strong>matière</strong> pour afficher la grille de notes.
        </p>
      )}

      {/* Modale : ajouter un contrôle */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAddOpen(false)}>
          <div className="bg-card rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-indigo-600" /> Nouveau contrôle</h3>
              <button onClick={() => setAddOpen(false)} className="p-1 hover:bg-accent rounded"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nom du contrôle</label>
              <input
                type="text" value={newControl.name} autoFocus
                onChange={e => setNewControl({ ...newControl, name: e.target.value })}
                placeholder="Ex : Contrôle 1, الفرض الأول…"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date" value={newControl.date}
                onChange={e => setNewControl({ ...newControl, date: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Le contrôle est créé <strong>non publié</strong> : saisissez les notes puis « Valider & publier »
              pour le rendre visible aux élèves et parents.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent">Annuler</button>
              <button
                onClick={addControl}
                disabled={!newControl.name.trim() || busyControl === 'new'}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {busyControl === 'new' ? 'Création…' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
