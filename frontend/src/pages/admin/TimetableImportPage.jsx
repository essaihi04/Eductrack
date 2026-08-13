import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, UploadCloud, FileText, Image as ImageIcon, Sparkles, X,
  AlertTriangle, CheckCircle2, Loader2, Wand2, Trash2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';

const DAYS = [
  { key: 'monday', label: 'Lundi' },
  { key: 'tuesday', label: 'Mardi' },
  { key: 'wednesday', label: 'Mercredi' },
  { key: 'thursday', label: 'Jeudi' },
  { key: 'friday', label: 'Vendredi' },
  { key: 'saturday', label: 'Samedi' },
];

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getToken = async () => {
  const { supabase } = await import('../../lib/supabase');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
};

/**
 * Import d'emplois du temps depuis des images ou des PDF multi-pages.
 *
 * Le flux est volontairement en trois temps — déposer, relire, importer — car
 * l'IA se trompe : rien n'est écrit tant que l'admin n'a pas validé la grille.
 */
const TimetableImportPage = () => {
  const navigate = useNavigate();

  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState('upload'); // upload | working | review
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const [groups, setGroups] = useState([]);
  const [reference, setReference] = useState({ classes: [], subjects: [], teachers: [] });
  const [pageReports, setPageReports] = useState([]);
  const [aiStatus, setAiStatus] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/api/admin/timetable-import/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setAiStatus(await res.json());
      } catch { /* l'écran reste utilisable sans le bandeau d'état */ }
    })();
  }, []);

  // ── Sélection de fichiers ───────────────────────────────────────────────

  const addFiles = (incoming) => {
    const accepted = Array.from(incoming).filter(
      (f) => f.type === 'application/pdf' || f.type.startsWith('image/') || /\.pdf$/i.test(f.name),
    );
    if (accepted.length === 0) {
      setError('Formats acceptés : images (JPG, PNG, HEIC converti) et PDF.');
      return;
    }
    setError('');
    setFiles((prev) => [...prev, ...accepted]);
  };

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  // ── Analyse ─────────────────────────────────────────────────────────────

  const analyze = async () => {
    if (files.length === 0) return;
    setPhase('working');
    setError('');
    setResults(null);

    try {
      setProgress('Préparation des pages…');
      // Chargé à la demande : pdf.js pèse lourd et ne sert qu'à cet écran.
      const { filesToPages } = await import('../../lib/pdfToImages');
      const pages = await filesToPages(files, (done, total) => {
        setProgress(`Rendu du PDF : page ${done}/${total}`);
      });

      if (pages.length === 0) throw new Error('Aucune page exploitable dans les fichiers déposés.');
      const maxPages = aiStatus?.max_pages || 20;
      if (pages.length > maxPages) {
        throw new Error(`${pages.length} pages détectées — le maximum est de ${maxPages} par import. Déposez les fichiers en plusieurs fois.`);
      }

      setProgress(`Lecture de ${pages.length} page(s) par l'IA — cela peut prendre une minute…`);

      const form = new FormData();
      pages.forEach((p, i) => {
        const ext = p.blob.type === 'application/pdf' ? 'png' : (p.blob.type.split('/')[1] || 'png');
        form.append('files', p.blob, `page-${i + 1}.${ext}`);
      });
      form.append('meta', JSON.stringify(pages.map((p) => ({ name: p.name, text: p.text, source: p.source }))));

      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/timetable-import/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'analyse a échoué");

      if (!data.groups?.length) {
        throw new Error(
          data.warnings?.length
            ? data.warnings.join(' • ')
            : "Aucun emploi du temps n'a été reconnu dans ces pages. Vérifiez que la grille est bien lisible.",
        );
      }

      setGroups(data.groups.map((g) => ({ ...g, selected: true })));
      setReference(data.reference || { classes: [], subjects: [], teachers: [] });
      setPageReports(data.pages || []);
      setPhase('review');
    } catch (e) {
      setError(e.message);
      setPhase('upload');
    } finally {
      setProgress('');
    }
  };

  // ── Édition de la grille relue ──────────────────────────────────────────

  const updateGroup = (tempId, patch) =>
    setGroups((prev) => prev.map((g) => (g.temp_id === tempId ? { ...g, ...patch } : g)));

  const updateSlot = (tempId, day, order, patch) =>
    setGroups((prev) => prev.map((g) => {
      if (g.temp_id !== tempId) return g;
      return {
        ...g,
        slots: g.slots.map((s) =>
          (s.day_of_week === day && s.slot_order === order ? { ...s, ...patch } : s)),
      };
    }));

  /** Corrige l'horaire d'une ligne : s'applique à tous les créneaux de la ligne. */
  const updateRowTime = (tempId, rowIdx, field, value) =>
    setGroups((prev) => prev.map((g) => {
      if (g.temp_id !== tempId) return g;
      return {
        ...g,
        time_rows: g.time_rows.map((r, i) => (i === rowIdx ? { ...r, [field]: value } : r)),
        slots: g.slots.map((s) => (s.slot_order === rowIdx + 1 ? { ...s, [field]: value } : s)),
      };
    }));

  const removeSlot = (tempId, day, order) =>
    setGroups((prev) => prev.map((g) => {
      if (g.temp_id !== tempId) return g;
      return { ...g, slots: g.slots.filter((s) => !(s.day_of_week === day && s.slot_order === order)) };
    }));

  /** Crée en base les matières que l'IA a lues mais qui n'existent pas encore. */
  const createMissingSubjects = async (names) => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/timetable-import/subjects`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ names }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error || 'Création impossible');

      const nextSubjects = [...reference.subjects, ...created];
      setReference((r) => ({ ...r, subjects: nextSubjects }));

      // Rattache automatiquement les créneaux qui portaient ces libellés.
      const byName = new Map(created.map((s) => [s.name.trim().toLowerCase(), s.id]));
      setGroups((prev) => prev.map((g) => ({
        ...g,
        slots: g.slots.map((s) => {
          if (s.subject_id) return s;
          const hit = byName.get((s.subject_raw || '').trim().toLowerCase());
          return hit ? { ...s, subject_id: hit, subject_status: 'created' } : s;
        }),
        unknown_subjects: g.unknown_subjects.filter((n) => !byName.has(n.trim().toLowerCase())),
      })));
    } catch (e) {
      setError(e.message);
    }
  };

  // ── Import final ────────────────────────────────────────────────────────

  const commit = async () => {
    const payload = groups
      .filter((g) => g.selected && g.class_id)
      .map((g) => ({ class_id: g.class_id, slots: g.slots }));

    if (payload.length === 0) {
      setError('Sélectionnez au moins une classe et associez-la à une classe existante.');
      return;
    }

    setCommitting(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/timetable-import/commit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imports: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'import a échoué");
      setResults(data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setCommitting(false);
    }
  };

  const className = (id) => reference.classes.find((c) => c.id === id)?.name || id;

  // ── Rendu ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/classes')} className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" /> Import d'emplois du temps
          </h1>
          <p className="text-sm text-muted-foreground">
            Déposez des photos, des captures ou un PDF de plusieurs pages : l'IA lit les grilles et les prépare pour vous.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {aiStatus && !aiStatus.ocr_ai && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            L'OCR n'est pas configuré (<code>MISTRAL_API_KEY</code>) : les PDF contenant
            du texte fonctionnent, mais les photos et les PDF scannés seront refusés.
          </span>
        </div>
      )}

      {phase !== 'review' && (
        <UploadStep
          files={files}
          dragging={dragging}
          setDragging={setDragging}
          addFiles={addFiles}
          removeFile={removeFile}
          analyze={analyze}
          working={phase === 'working'}
          progress={progress}
        />
      )}

      {phase === 'review' && (
        <>
          {pageReports.length > 0 && (
            <Card>
              <CardContent className="p-4 flex flex-wrap gap-2 text-xs">
                {pageReports.map((p, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 rounded-full border ${p.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-muted border-transparent text-muted-foreground'}`}
                    title={p.error || ''}
                  >
                    {p.name} · {p.error ? 'échec' : `${p.found} grille(s) · ${p.method}`}
                  </span>
                ))}
              </CardContent>
            </Card>
          )}

          {results && (
            <Card>
              <CardContent className="p-4 space-y-2">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-sm ${r.ok ? 'text-green-700' : 'text-red-700'}`}>
                    {r.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    <span className="font-medium">{className(r.class_id)}</span>
                    <span>{r.ok ? `${r.slots} créneaux importés` : r.error}</span>
                    {r.ok && r.skipped?.length > 0 && (
                      <span className="text-amber-700">— {r.skipped.length} créneau(x) en conflit ignoré(s)</span>
                    )}
                    {r.ok && (
                      <button
                        onClick={() => navigate(`/classes/${r.class_id}/timetable`)}
                        className="ml-auto text-xs underline"
                      >
                        Ouvrir la grille
                      </button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {groups.map((group) => (
            <GroupReview
              key={group.temp_id}
              group={group}
              reference={reference}
              onGroupChange={(patch) => updateGroup(group.temp_id, patch)}
              onSlotChange={(day, order, patch) => updateSlot(group.temp_id, day, order, patch)}
              onSlotRemove={(day, order) => removeSlot(group.temp_id, day, order)}
              onRowTimeChange={(rowIdx, field, value) => updateRowTime(group.temp_id, rowIdx, field, value)}
              onCreateSubjects={createMissingSubjects}
            />
          ))}

          <div className="flex items-center justify-between gap-3 sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t">
            <button
              onClick={() => { setPhase('upload'); setGroups([]); setResults(null); }}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
            >
              Recommencer
            </button>
            <button
              onClick={commit}
              disabled={committing}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Importer {groups.filter((g) => g.selected && g.class_id).length} emploi(s) du temps
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ── Étape 1 : dépôt des fichiers ──────────────────────────────────────────

const UploadStep = ({ files, dragging, setDragging, addFiles, removeFile, analyze, working, progress }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Fichiers à importer</CardTitle>
      <CardDescription>
        Un PDF de plusieurs pages, plusieurs images, ou un mélange des deux.
        Une page peut contenir plusieurs classes : elles seront séparées automatiquement.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-2 p-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:bg-muted/40'}`}
      >
        <UploadCloud className="w-8 h-8 text-muted-foreground" />
        <span className="text-sm font-medium">Glissez vos fichiers ici, ou cliquez pour parcourir</span>
        <span className="text-xs text-muted-foreground">PDF, JPG, PNG — jusqu'à 20 pages par import</span>
        <input
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-3 p-2 border rounded-lg text-sm">
              {f.type === 'application/pdf' ? <FileText className="w-4 h-4 text-red-500" /> : <ImageIcon className="w-4 h-4 text-blue-500" />}
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{Math.round(f.size / 1024)} Ko</span>
              <button onClick={() => removeFile(i)} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={analyze}
          disabled={files.length === 0 || working}
          className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Analyser
        </button>
        {progress && <span className="text-sm text-muted-foreground">{progress}</span>}
      </div>
    </CardContent>
  </Card>
);

// ── Étape 2 : relecture d'une classe détectée ─────────────────────────────

const STATUS_STYLES = {
  matched: '',
  created: '',
  ambiguous: 'ring-1 ring-amber-400',
  unmatched: 'ring-1 ring-red-400',
};

const GroupReview = ({ group, reference, onGroupChange, onSlotChange, onSlotRemove, onRowTimeChange, onCreateSubjects }) => {
  const slotMap = useMemo(() => {
    const map = new Map();
    group.slots.forEach((s) => map.set(`${s.day_of_week}_${s.slot_order}`, s));
    return map;
  }, [group.slots]);

  const rows = group.time_rows || [];
  const pending = group.slots.filter((s) => !s.subject_id).length;

  return (
    <Card className={group.selected ? '' : 'opacity-60'}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={group.selected}
              onChange={(e) => onGroupChange({ selected: e.target.checked })}
              className="rounded"
            />
            <div>
              <CardTitle className="text-base">
                {group.detected_class_name || 'Classe non identifiée sur le document'}
              </CardTitle>
              <CardDescription>
                {group.slots.length} créneaux · {group.pages.join(', ')}
                {pending > 0 && <span className="text-amber-700"> · {pending} matière(s) à confirmer</span>}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Importer dans</span>
            <select
              value={group.class_id || ''}
              onChange={(e) => onGroupChange({ class_id: e.target.value || null })}
              className={`text-sm border rounded-lg px-3 py-2 ${group.class_id ? '' : 'border-red-300 bg-red-50'}`}
            >
              <option value="">— Choisir une classe —</option>
              {reference.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {group.unknown_subjects?.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-amber-800">
              Matières absentes de la base : {group.unknown_subjects.join(', ')}
            </span>
            <button
              onClick={() => onCreateSubjects(group.unknown_subjects)}
              className="ml-auto flex items-center gap-1 px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
            >
              <Wand2 className="w-3 h-3" /> Les créer
            </button>
          </div>
        )}

        {group.unknown_teachers?.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            Professeurs non reconnus (à choisir manuellement) : {group.unknown_teachers.join(', ')}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 pt-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-xs font-semibold text-muted-foreground text-left w-28">Horaire</th>
                {DAYS.map((d) => (
                  <th key={d.key} className="p-2 text-xs font-semibold text-center min-w-[160px]">{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2 align-top">
                    <div className="space-y-1 bg-blue-50 rounded p-1">
                      <input
                        type="time"
                        value={row.start_time || ''}
                        onChange={(e) => onRowTimeChange(idx, 'start_time', e.target.value)}
                        className="w-full text-[11px] font-semibold text-blue-800 bg-white border rounded px-1 py-0.5"
                      />
                      <input
                        type="time"
                        value={row.end_time || ''}
                        onChange={(e) => onRowTimeChange(idx, 'end_time', e.target.value)}
                        className="w-full text-[11px] font-semibold text-blue-800 bg-white border rounded px-1 py-0.5"
                      />
                    </div>
                  </td>
                  {DAYS.map((d) => {
                    const slot = slotMap.get(`${d.key}_${idx + 1}`);
                    if (!slot) {
                      return <td key={d.key} className="p-1 align-top"><div className="min-h-[70px] rounded-lg border border-dashed border-gray-200 bg-gray-50/40" /></td>;
                    }
                    return (
                      <td key={d.key} className="p-1 align-top">
                        <div className={`border rounded-lg p-2 space-y-1.5 bg-white ${STATUS_STYLES[slot.subject_status] || ''}`}>
                          <div className="flex items-start gap-1">
                            <span className="text-[10px] text-muted-foreground truncate flex-1" title={slot.subject_raw}>
                              « {slot.subject_raw} »
                            </span>
                            <button
                              onClick={() => onSlotRemove(d.key, slot.slot_order)}
                              className="p-0.5 text-red-400 hover:text-red-600"
                              title="Retirer ce créneau"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <select
                            value={slot.subject_id || ''}
                            onChange={(e) => onSlotChange(d.key, slot.slot_order, { subject_id: e.target.value || null })}
                            className="w-full text-xs border rounded px-1.5 py-1"
                          >
                            <option value="">— Matière —</option>
                            {reference.subjects.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          <select
                            value={slot.teacher_id || ''}
                            onChange={(e) => onSlotChange(d.key, slot.slot_order, { teacher_id: e.target.value || null })}
                            className="w-full text-xs border rounded px-1.5 py-1"
                            title={slot.teacher_raw ? `Lu sur le document : ${slot.teacher_raw}` : undefined}
                          >
                            <option value="">— Prof —</option>
                            {reference.teachers.map((t) => (
                              <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Salle"
                            value={slot.room || ''}
                            onChange={(e) => onSlotChange(d.key, slot.slot_order, { room: e.target.value })}
                            className="w-full text-xs border rounded px-1.5 py-1"
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default TimetableImportPage;
