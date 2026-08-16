import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ClipboardList, RefreshCw, Save, Plus, Trash2, X, Check, Eye, EyeOff,
  AlertTriangle, GraduationCap, BookOpen, CalendarRange, FileDown, Filter,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { saveBlob } from '../../lib/download';
import { useYear } from '../../contexts/YearContext';
import { sameYear } from '../../lib/schoolYear';
import { dedupeSubjects } from '../../lib/subjectAliases';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Page « Saisie des notes » (admin / directeur / responsable pédagogique).
// Grille type Massar : lignes = élèves (ordre du fichier Massar), colonnes =
// contrôles de la classe × matière × SEMESTRE sélectionnés + moyenne.
//  - contrôles OFFICIELS marocains créés PAR DÉFAUT à l'ouverture de la
//    grille : 3 fards (الفرض 1/2/3) + note d'activités (الأنشطة) par semestre
//  - ajout d'un contrôle supplémentaire libre ou d'un Similé (examen blanc)
//  - saisie manuelle des notes (0–20), enregistrement par lot
//  - VALIDATION & PUBLICATION : un contrôle (saisi par un prof ou ici) n'est
//    visible chez les élèves et parents qu'une fois publié.

// Badge visuel selon le type de contrôle
const TYPE_BADGES = {
  official: { label: 'Officiel', cls: 'bg-indigo-100 text-indigo-700' },
  unified: { label: 'Unifié', cls: 'bg-purple-100 text-purple-700' },
  simile: { label: 'Similé', cls: 'bg-sky-100 text-sky-700' },
};
const badgeFor = (c) => {
  if (String(c.official_key || '').endsWith('_act')) {
    return { label: 'Activités', cls: 'bg-teal-100 text-teal-700' };
  }
  return TYPE_BADGES[c.control_type] || null;
};

export default function NotesSaisiePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedClassId = searchParams.get('class');
  const { year } = useYear();
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [semester, setSemester] = useState(null); // 1 | 2 — initialisé sur le semestre en cours

  const [grid, setGrid] = useState(null); // { class, students, controls, notes, official_missing }
  const [visibleIds, setVisibleIds] = useState(null); // null = tous les contrôles, sinon Set d'ids affichés
  const [cells, setCells] = useState({}); // `${controlId}_${studentId}` -> valeur saisie (string)
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyControl, setBusyControl] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(''); // 'blank' | 'filled' pendant le téléchargement
  // kind : simile (examen blanc) | custom (contrôle supplémentaire libre)
  const [newControl, setNewControl] = useState({ kind: 'custom', name: '', date: new Date().toISOString().split('T')[0] });

  // Une seule année scolaire est visible à la fois. Les anciennes/futures
  // classes ne peuvent plus être choisies par erreur dans la saisie courante.
  const activeClasses = useMemo(
    () => classes.filter((cls) => !cls.academic_year || sameYear(cls.academic_year, year)),
    [classes, year],
  );
  const availableSubjects = useMemo(() => dedupeSubjects(subjects), [subjects]);

  const selectClass = (nextClassId) => {
    setClassId(nextClassId);
    const next = new URLSearchParams(searchParams);
    if (nextClassId) next.set('class', nextClassId);
    else next.delete('class');
    setSearchParams(next, { replace: true });
  };

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
        const [cls, subj] = await Promise.all([
          api(`/api/admin/classes?academic_year=${encodeURIComponent(year)}`),
          api('/api/admin/subjects'),
        ]);
        setClasses(Array.isArray(cls) ? cls : []);
        setSubjects(Array.isArray(subj) ? subj : (subj.subjects || []));
      } catch (e) { setError(e.message); }
      // Semestre en cours d'après le calendrier de l'école (défauts MEN sinon)
      try {
        const cur = await api('/api/bulletins/current-semester');
        setSemester(cur?.semester === 2 ? 2 : 1);
      } catch { setSemester(1); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    if (requestedClassId && activeClasses.some((cls) => cls.id === requestedClassId)) {
      setClassId(requestedClassId);
      return;
    }
    if (classId && !activeClasses.some((cls) => cls.id === classId)) {
      setClassId('');
      return;
    }
    if (!classId && activeClasses.length > 0) setClassId(activeClasses[0].id);
  }, [activeClasses, classId, requestedClassId]);

  // La page affiche immédiatement une grille utile : la première matière est
  // choisie automatiquement, tout en laissant l'utilisateur changer de choix.
  useEffect(() => {
    if (classId && !subjectId && availableSubjects.length > 0) {
      setSubjectId(availableSubjects[0].id);
    }
  }, [availableSubjects, classId, subjectId]);

  const loadGrid = async (cId = classId, sId = subjectId, sem = semester) => {
    if (!cId || !sId || !sem) { setGrid(null); return; }
    setLoading(true);
    setError('');
    try {
      const data = await api(`/api/admin/notes/grid?class_id=${cId}&subject_id=${sId}&semester=${sem}`);
      setGrid(data);
      setVisibleIds(null); // nouveau chargement → toutes les colonnes affichées
      // Initialiser les cellules depuis les notes existantes
      const c = {};
      (data.notes || []).forEach(n => { c[`${n.control_id}_${n.student_id}`] = String(n.note ?? ''); });
      setCells(c);
      setDirty(false);
    } catch (e) { setError(e.message); setGrid(null); }
    finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadGrid(); }, [classId, subjectId, semester]);

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

  // Contrôles affichés selon le filtre de colonnes (null / vide = tous)
  const displayedControls = useMemo(() => {
    if (!grid) return [];
    if (!visibleIds || visibleIds.size === 0) return grid.controls;
    return grid.controls.filter(c => visibleIds.has(c.id));
  }, [grid, visibleIds]);

  const filterActive = !!(visibleIds && visibleIds.size > 0 && grid && visibleIds.size < grid.controls.length);

  // Bascule l'affichage d'un contrôle dans le filtre
  const toggleVisible = (id) => {
    setVisibleIds(prev => {
      if (!prev || prev.size === 0) return new Set([id]); // depuis « tous » → seul celui-ci
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next.size === 0 ? null : next; // plus rien de coché → retour à « tous »
    });
  };

  // Moyenne par élève (sur les contrôles AFFICHÉS et notés seulement)
  const avgByStudent = useMemo(() => {
    const map = {};
    if (!grid) return map;
    grid.students.forEach(s => {
      const vals = displayedControls
        .map(c => parseNote(cells[`${c.id}_${s.id}`]))
        .filter(v => v !== null);
      map[s.id] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    });
    return map;
  }, [grid, displayedControls, cells]);

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

  // Télécharge la grille en PDF (une page) : vide pour la saisie papier,
  // ou remplie avec les notes saisies. Généré côté backend (PDFKit + arabe).
  const downloadPdf = async (pdfMode) => {
    if (!classId || !subjectId || !semester) return;
    if (pdfMode === 'filled' && dirty
      && !window.confirm('Des notes ne sont pas enregistrées : elles ne figureront pas dans le PDF. Continuer quand même ? (Enregistrez d\'abord pour un PDF à jour.)')) return;
    setPdfBusy(pdfMode);
    setError('');
    try {
      const headers = await authHeaders();
      // Filtre de colonnes actif → le PDF ne contient que les contrôles affichés
      const ctrlParam = filterActive ? `&controls=${displayedControls.map(c => c.id).join(',')}` : '';
      const res = await fetch(
        `${apiUrl}/api/admin/notes/grid-pdf?class_id=${classId}&subject_id=${subjectId}&semester=${semester}&mode=${pdfMode}${ctrlParam}`,
        { headers },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cls = classes.find(c => c.id === classId)?.name || 'classe';
      const subj = availableSubjects.find(s => s.id === subjectId)?.display_name || 'matiere';
      await saveBlob(blob, `notes_${cls}_${subj}_S${semester}_${pdfMode === 'filled' ? 'remplie' : 'vide'}.pdf`);
    } catch (e) { setError(e.message); }
    finally { setPdfBusy(''); }
  };

  // Récap d'un contrôle pour toutes les matières : onglet dédié, qui lit les
  // notes ENREGISTRÉES côté serveur → on prévient si la grille a des saisies
  // en attente. La classe et le semestre affichés sont repris dans l'URL.
  const openRecap = () => {
    if (dirty && !window.confirm(
      'Des notes ne sont pas enregistrées : elles ne figureront pas dans le récap. Continuer quand même ?',
    )) return;
    navigate(`/admin/notes-recap?class=${classId}&semester=${semester}`);
  };

  // Les contrôles officiels (3 fards + activités) sont créés automatiquement
  // par le backend à l'ouverture de la grille — la modale ne sert qu'aux
  // ajouts supplémentaires : Similé (examen blanc) ou contrôle personnalisé.
  const openAdd = () => {
    setNewControl({ kind: 'simile', name: grid?.simile_name || 'Similé · امتحان تجريبي', date: new Date().toISOString().split('T')[0] });
    setAddOpen(true);
  };

  const setAddKind = (kind) => {
    if (kind === 'simile') {
      setNewControl({ kind, name: grid?.simile_name || 'Similé · امتحان تجريبي', date: new Date().toISOString().split('T')[0] });
    } else {
      setNewControl({ kind: 'custom', name: '', date: new Date().toISOString().split('T')[0] });
    }
  };

  const addControl = async () => {
    if (!newControl.name.trim()) return;
    setBusyControl('new');
    setError('');
    try {
      await api('/api/admin/notes/controls', {
        method: 'POST',
        body: JSON.stringify({
          class_id: classId,
          subject_id: subjectId,
          name: newControl.name,
          date: newControl.date,
          semester,
          control_type: newControl.kind === 'simile' ? 'simile' : 'custom',
        }),
      });
      setAddOpen(false);
      setNewControl({ kind: 'custom', name: '', date: new Date().toISOString().split('T')[0] });
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
        <div className="flex items-center gap-2 flex-wrap">
          {classId && semester && (
            <button
              onClick={openRecap}
              title="Ouvrir le récap : un contrôle, toutes les matières (impression / PDF)"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-accent"
            >
              <ClipboardList className="w-4 h-4" /> Récap par contrôle
            </button>
          )}
          {grid && (
            <>
            <button
              onClick={() => downloadPdf('blank')}
              disabled={!!pdfBusy}
              title="Télécharger la grille vierge (une page) pour la saisie manuelle sur papier"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-accent disabled:opacity-50"
            >
              {pdfBusy === 'blank' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              PDF vide
            </button>
            <button
              onClick={() => downloadPdf('filled')}
              disabled={!!pdfBusy}
              title="Télécharger la grille avec les notes saisies (une page)"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-accent disabled:opacity-50"
            >
              {pdfBusy === 'filled' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              PDF rempli
            </button>
            <button
              onClick={openAdd}
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
            </>
          )}
        </div>
      </div>

      {/* Sélecteurs classe + matière */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                <GraduationCap className="w-3.5 h-3.5 inline mr-1" />Classe
              </label>
              <select value={classId} onChange={e => selectClass(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background min-w-[180px]">
                <option value="">— choisir —</option>
                {activeClasses.map(c => <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                <BookOpen className="w-3.5 h-3.5 inline mr-1" />Matière
              </label>
              <select value={subjectId} onChange={e => setSubjectId(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background min-w-[180px]">
                <option value="">— choisir —</option>
                {availableSubjects.map(s => <option key={s.id} value={s.id}>{s.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                <CalendarRange className="w-3.5 h-3.5 inline mr-1" />Semestre (الأسدس)
              </label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {[1, 2].map(s => (
                  <button
                    key={s}
                    onClick={() => setSemester(s)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      semester === s ? 'bg-indigo-600 text-white' : 'bg-background hover:bg-accent'
                    }`}
                  >
                    S{s}
                  </button>
                ))}
              </div>
            </div>
            {grid && (
              <div className="text-sm text-muted-foreground pb-2">
                {grid.students.length} élève(s) · {filterActive ? `${displayedControls.length}/${grid.controls.length}` : grid.controls.length} contrôle(s)
                {pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                    <AlertTriangle className="w-3 h-3" /> {pendingCount} à valider
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Filtre de colonnes : n'afficher qu'un ou plusieurs contrôles.
              Le PDF téléchargé ne contient que les colonnes sélectionnées. */}
          {grid && grid.controls.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mr-1">
                <Filter className="w-3.5 h-3.5" /> Contrôles affichés :
              </span>
              <button
                onClick={() => setVisibleIds(null)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  !filterActive ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-border hover:bg-accent'
                }`}
              >
                Tous
              </button>
              {grid.controls.map(c => {
                const on = filterActive && visibleIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleVisible(c.id)}
                    title={c.name}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors max-w-[180px] truncate ${
                      on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-border hover:bg-accent'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
              {filterActive && (
                <span className="text-[11px] text-muted-foreground ml-1">
                  Le PDF ne contiendra que ces colonnes.
                </span>
              )}
            </div>
          )}
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
                      {displayedControls.map((c) => (
                        <th key={c.id} className="px-2 py-2 text-center min-w-[110px] align-top">
                          <div className="font-semibold">{c.name}</div>
                          {badgeFor(c) && (
                            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${badgeFor(c).cls}`}>
                              {badgeFor(c).label}
                            </span>
                          )}
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
                        {displayedControls.map(c => {
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

      {/* Modale : ajouter un contrôle (officiel / similé / personnalisé) */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAddOpen(false)}>
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" /> Nouveau contrôle — S{semester}
              </h3>
              <button onClick={() => setAddOpen(false)} className="p-1 hover:bg-accent rounded"><X className="w-4 h-4" /></button>
            </div>

            {/* Type de contrôle — les officiels (3 fards + activités) sont déjà créés automatiquement */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAddKind('simile')}
                className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  newControl.kind === 'simile' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-border hover:bg-accent'
                }`}
              >
                <GraduationCap className="w-4 h-4 mx-auto mb-1" /> Similé (examen blanc)
              </button>
              <button
                onClick={() => setAddKind('custom')}
                className={`px-2 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  newControl.kind === 'custom' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-border hover:bg-accent'
                }`}
              >
                <Plus className="w-4 h-4 mx-auto mb-1" /> Personnalisé
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Nom du contrôle</label>
              <input
                type="text" value={newControl.name} autoFocus
                onChange={e => setNewControl({ ...newControl, name: e.target.value })}
                placeholder={newControl.kind === 'simile' ? 'Similé · امتحان تجريبي' : 'Ex : Contrôle de rattrapage, فرض إضافي…'}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background"
              />
              {newControl.kind === 'simile' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Examen blanc de préparation — recommandé pour les années certifiantes (6AP, 3AC, 1BAC, 2BAC).
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date" value={newControl.date}
                onChange={e => setNewControl({ ...newControl, date: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background"
              />
              {grid?.bounds && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Semestre {semester} : du {grid.bounds.start} au {grid.bounds.end}
                </p>
              )}
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
