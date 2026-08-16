import { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { saveBlob } from '../../lib/download';
import { ClipboardList, RefreshCw, FileDown, Save, X, Users, AlertTriangle, Pencil, Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { useYear } from '../../contexts/YearContext';
import { sameYear } from '../../lib/schoolYear';

// Motifs des colonnes de notes Massar (contrôles + activité intégrée)
const MASSAR_GRADE_PATTERNS = [
  { pattern: /الفرض\s*(الأول|1)/, label: 'الفرض الأول', slot: 'c1', kind: 'control' },
  { pattern: /الفرض\s*(الثاني|2)/, label: 'الفرض الثاني', slot: 'c2', kind: 'control' },
  { pattern: /الفرض\s*(الثالث|3)/, label: 'الفرض الثالث', slot: 'c3', kind: 'control' },
  { pattern: /الفرض\s*(الرابع|4)/, label: 'الفرض الرابع', slot: 'c4', kind: 'control' },
  { pattern: /الأنشطة\s*المندمجة/, label: 'الأنشطة المندمجة', slot: 'activity', kind: 'activity' },
];

// Normalisation légère (FR + AR) pour matcher les noms de matières.
const normSubject = (x) => String(x ?? '')
  .trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[أإآى]/g, 'ا').replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Alias matière Massar (arabe) → { name: nom officiel (sera créé si absent), aliases }.
const SUBJECT_ALIAS_GROUPS = [
  { name: 'Langue Arabe', aliases: ['اللغة العربية', 'العربية', 'arabe', 'langue arabe'] },
  { name: 'Langue Française', aliases: ['اللغة الفرنسية', 'الفرنسية', 'francais', 'français', 'langue francaise'] },
  { name: 'Langue Anglaise', aliases: ['اللغة الإنجليزية', 'الإنجليزية', 'anglais', 'english', 'langue anglaise'] },
  { name: 'Mathématiques', aliases: ['الرياضيات', 'maths', 'mathematiques'] },
  { name: 'Physique-Chimie', aliases: ['الفيزياء والكيمياء', 'الفيزياء', 'physique chimie', 'physique-chimie', 'pc'] },
  { name: 'Sciences de la Vie et de la Terre', aliases: ['علوم الحياة والأرض', 'svt', 'sciences de la vie et de la terre'] },
  { name: 'Histoire-Géographie', aliases: ['الاجتماعيات', 'التاريخ والجغرافيا', 'sociales', 'sciences sociales', 'histoire geographie', 'histoire-géographie', 'hist geo', 'hg'] },
  { name: 'Éducation Islamique', aliases: ['التربية الإسلامية', 'education islamique', 'éducation islamique', 'islamique'] },
  { name: 'Éducation Physique et Sportive', aliases: ['التربية البدنية', 'education physique', 'éducation physique', 'eps', 'sport'] },
  { name: 'Informatique', aliases: ['المعلوميات', 'معلوميات', 'الإعلاميات', 'informatique', 'info', 'tic'] },
  { name: 'Philosophie', aliases: ['الفلسفة', 'philosophie'] },
  { name: 'Technologie', aliases: ['التكنولوجيا', 'technologie'] },
  { name: 'Arts Plastiques', aliases: ['التربية الفنية', 'التربية التشكيلية', 'arts plastiques', 'education artistique'] },
  { name: 'Musique', aliases: ['التربية الموسيقية', 'musique', 'education musicale'] },
  { name: 'Amazighe', aliases: ['اللغة الأمازيغية', 'الأمازيغية', 'amazighe', 'tamazight'] },
  { name: 'Activité Scientifique', aliases: ['النشاط العلمي', 'activité scientifique', 'activite scientifique'] },
];

// Devine l'id de matière (app) à partir du libellé Massar arabe.
const guessSubjectId = (subjectArabic, subjects) => {
  const needle = normSubject(subjectArabic);
  if (!needle || !subjects?.length) return '';
  // direct
  let hit = subjects.find(s => normSubject(s.name) === needle);
  if (hit) return hit.id;
  // via alias
  const group = SUBJECT_ALIAS_GROUPS.find(g => [g.name, ...g.aliases].some(a => normSubject(a) === needle));
  if (group) {
    const norms = [group.name, ...group.aliases].map(normSubject);
    hit = subjects.find(s => norms.includes(normSubject(s.name)));
    if (hit) return hit.id;
  }
  // inclusion partielle
  hit = subjects.find(s => {
    const n = normSubject(s.name);
    return n && (n.includes(needle) || needle.includes(n));
  });
  return hit ? hit.id : '';
};

// Nom officiel qui sera créé pour un libellé Massar non reconnu (sinon le libellé brut).
const guessCanonicalName = (subjectArabic) => {
  const needle = normSubject(subjectArabic);
  const group = SUBJECT_ALIAS_GROUPS.find(g => [g.name, ...g.aliases].some(a => normSubject(a) === needle));
  return group ? group.name : String(subjectArabic || '').trim();
};

// Renvoie la 1re cellule non vide à droite d'une cellule contenant `needle`.
const valueRightOf = (rows, needle) => {
  for (const row of rows) {
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      if (String(row[j] || '').includes(needle)) {
        for (let k = j + 1; k < row.length; k++) {
          const v = String(row[k] || '').trim();
          if (v) return v;
        }
      }
    }
  }
  return '';
};

// Parse un fichier Massar « NotesCC » → { className, subjectArabic, semester, rows }.
const parseNotesCC = (workbook) => {
  const sheet = workbook.Sheets['NotesCC'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const className = valueRightOf(rows, 'القسم');
  const subjectArabic = valueRightOf(rows, 'المادة');
  const dorra = valueRightOf(rows, 'الدورة');
  const semester = /الثاني/.test(dorra) ? 2 : 1;

  // Ligne d'en-tête = celle contenant « إسم التلميذ »
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    if ((rows[i] || []).some(c => String(c || '').includes('إسم التلميذ'))) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return { className, subjectArabic, semester, rows: [], gradeCols: [] };

  const header = rows[headerIdx] || [];
  let massarCol = header.findIndex(c => String(c || '').includes('رقم'));
  let nameCol = header.findIndex(c => String(c || '').includes('إسم التلميذ'));

  // Colonnes de notes (dédupliquées par slot — cellules fusionnées note/التغيب)
  const gradeCols = [];
  const seen = new Set();
  for (let j = 0; j < header.length; j++) {
    const cell = String(header[j] || '').trim();
    if (!cell) continue;
    for (const gp of MASSAR_GRADE_PATTERNS) {
      if (gp.pattern.test(cell) && !seen.has(gp.slot)) {
        seen.add(gp.slot);
        gradeCols.push({ colIndex: j, slot: gp.slot, kind: gp.kind, label: gp.label });
        break;
      }
    }
  }

  // Données dès header + 2 (saute le sous-en-tête النقطة/التغيب)
  const dataStart = headerIdx + 2;
  const dataRows = [];
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const name = String(row[nameCol] || '').trim();
    const massar = String(row[massarCol] || '').trim();
    if (!name || name.includes('إسم') || name.includes('اسم') || name.includes('رقم')) continue;
    if (!name && !massar) continue;
    const grades = [];
    for (const gc of gradeCols) {
      const raw = row[gc.colIndex];
      if (raw === '' || raw === null || raw === undefined) continue;
      grades.push({ slot: gc.slot, kind: gc.kind, label: gc.label, value: raw });
    }
    dataRows.push({ massar_code: massar, student_full_name: name, grades });
  }

  return { className, subjectArabic, semester, gradeCols, rows: dataRows };
};

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
  const { year } = useYear();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]); // matières de l'école (pour mapping)
  const [selectedClass, setSelectedClass] = useState('');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Édition d'un contrôle
  const [editCtrl, setEditCtrl] = useState(null);   // { control, subject, rows, hasTracking }
  const [editRows, setEditRows] = useState([]);     // notes éditables
  const [savingEdit, setSavingEdit] = useState(false);
  const [exporting, setExporting] = useState(false);
  const activeClasses = useMemo(
    () => classes.filter((item) => !item.academic_year || sameYear(item.academic_year, year)),
    [classes, year],
  );

  // Import Massar (notes de contrôle continu) — multi-fichiers
  const [massarFiles, setMassarFiles] = useState([]); // [{ fileName, className, subjectArabic, semester, gradeCols, rows, error }]
  const [massarPreview, setMassarPreview] = useState(null); // résultats dryRun
  const [massarResult, setMassarResult] = useState(null);   // résultats import réel
  const [massarBusy, setMassarBusy] = useState(false);
  const [createMissing, setCreateMissing] = useState(true); // créer les matières absentes

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const [cRes, sRes] = await Promise.all([
          fetch(`${apiUrl}/api/admin/classes`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiUrl}/api/admin/subjects`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (cRes.ok) setClasses(await cRes.json());
        if (sRes.ok) {
          const subs = await sRes.json();
          setSubjects((Array.isArray(subs) ? subs : []).sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr')));
        }
      } catch (e) { console.error(e); }
    })();
  }, []);

  useEffect(() => {
    if (selectedClass && !activeClasses.some((item) => item.id === selectedClass)) {
      setSelectedClass('');
      return;
    }
    if (!selectedClass && activeClasses.length > 0) setSelectedClass(activeClasses[0].id);
  }, [activeClasses, selectedClass]);

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
      await saveBlob(blob, 'rapport_controle.pdf');
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setExporting(false); }
  };

  // ─── Import Massar (notes CC) : sélection + parsing client ───
  const handleMassarFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setMassarResult(null); setMassarPreview(null); setMsg('');
    const parsed = [];
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const p = parseNotesCC(wb);
        if (!p || !p.rows.length) {
          parsed.push({ fileName: file.name, error: 'Format NotesCC non reconnu (ou aucun élève)' });
          continue;
        }
        parsed.push({ fileName: file.name, ...p, subjectId: guessSubjectId(p.subjectArabic, subjects) });
      } catch {
        parsed.push({ fileName: file.name, error: 'Erreur de lecture du fichier' });
      }
    }
    setMassarFiles(parsed);
    e.target.value = '';
  };

  // Envoie au backend (dryRun = aperçu, sinon import réel)
  const runMassarImport = async (dryRun) => {
    const ready = massarFiles.filter(f => !f.error && f.rows?.length);
    if (!ready.length) { setMsg('❌ Aucun fichier exploitable'); return; }
    setMassarBusy(true); setMsg('');
    try {
      const token = await getToken();
      const payload = {
        dryRun,
        createMissing,
        files: ready.map(f => ({
          fileName: f.fileName,
          className: f.className,
          subjectArabic: f.subjectArabic,
          subject_id: f.subjectId || null,
          semester: f.semester,
          rows: f.rows,
        })),
      };
      const res = await fetch(`${apiUrl}/api/admin/classes/import-massar-notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
      const data = await res.json();
      if (dryRun) { setMassarPreview(data.results); setMassarResult(null); }
      else {
        setMassarResult(data.results); setMassarPreview(null);
        const tot = data.results.reduce((a, r) => a + (r.notesUpserted || 0), 0);
        setMsg(`✅ Import terminé : ${tot} note(s) enregistrée(s)`);
        loadOverview();
      }
    } catch (e) { setMsg(`❌ ${e.message}`); }
    finally { setMassarBusy(false); }
  };

  const setFileSubject = (idx, subjectId) =>
    setMassarFiles(prev => prev.map((f, i) => i === idx ? { ...f, subjectId } : f));

  const closeMassar = () => {
    setMassarFiles([]); setMassarPreview(null); setMassarResult(null);
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
            {activeClasses.map(c => (
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

      {/* ─── Import Massar (notes de contrôle continu, multi-classes) ─── */}
      <Card className="border-indigo-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            Import Massar — notes de contrôle continu (plusieurs classes/matières)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            Sélectionnez <strong>un ou plusieurs fichiers</strong> Massar « <code>export_notesCC_*.xlsx</code> »
            (un par classe/matière). La classe, la matière, le semestre, le nombre de contrôles et la note
            d'activité sont détectés automatiquement.
          </div>

          <label className="inline-flex items-center gap-2 text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 cursor-pointer w-fit">
            <Upload className="w-4 h-4" /> Choisir des fichiers Massar
            <input type="file" accept=".xlsx,.xls" multiple onChange={handleMassarFiles} className="hidden" />
          </label>

          {massarFiles.length > 0 && (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-600">
                      <th className="px-3 py-2 border-b">Fichier</th>
                      <th className="px-3 py-2 border-b">Classe</th>
                      <th className="px-3 py-2 border-b">Matière (Massar)</th>
                      <th className="px-3 py-2 border-b">Matière (app)</th>
                      <th className="px-3 py-2 border-b text-center">Sem.</th>
                      <th className="px-3 py-2 border-b text-center">Contrôles</th>
                      <th className="px-3 py-2 border-b text-center">Élèves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {massarFiles.map((f, i) => {
                      const nbControls = (f.gradeCols || []).filter(c => c.kind === 'control').length;
                      const hasActivity = (f.gradeCols || []).some(c => c.kind === 'activity');
                      return (
                        <tr key={i} className="border-b">
                          <td className="px-3 py-1.5 text-gray-700 truncate max-w-[180px]" title={f.fileName}>{f.fileName}</td>
                          {f.error ? (
                            <td colSpan={6} className="px-3 py-1.5 text-red-600">⚠️ {f.error}</td>
                          ) : (
                            <>
                              <td className="px-3 py-1.5 font-medium">{f.className || '—'}</td>
                              <td className="px-3 py-1.5" dir="rtl">{f.subjectArabic || '—'}</td>
                              <td className="px-3 py-1.5">
                                <select
                                  value={f.subjectId || ''}
                                  onChange={e => setFileSubject(i, e.target.value)}
                                  className={`border rounded px-2 py-1 text-sm min-w-[170px] ${
                                    f.subjectId ? '' : createMissing ? 'border-green-400 bg-green-50' : 'border-amber-400 bg-amber-50'
                                  }`}
                                >
                                  <option value="">
                                    {createMissing
                                      ? `➕ Créer : ${guessCanonicalName(f.subjectArabic) || f.subjectArabic}`
                                      : '— À choisir —'}
                                  </option>
                                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-1.5 text-center">{f.semester}</td>
                              <td className="px-3 py-1.5 text-center">
                                {nbControls}
                                {hasActivity && <span className="ml-1 text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full">+ activité</span>}
                              </td>
                              <td className="px-3 py-1.5 text-center">{f.rows?.length || 0}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Aperçu (dryRun) : résolution classe/matière/prof côté serveur */}
              {massarPreview && (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <p className="text-sm font-medium text-gray-700 mb-2">Aperçu (rien n'est encore enregistré)</p>
                  <div className="space-y-1 text-sm">
                    {massarPreview.map((r, i) => (
                      <div key={i} className={`flex flex-wrap items-center gap-x-2 ${r.error ? 'text-red-600' : 'text-gray-700'}`}>
                        <span className="font-medium">{r.className || r.fileName}</span>
                        {r.error ? <span>— ⚠️ {r.error}</span> : (
                          <span>
                            — {r.subject} • prof : {r.teacher} • sem. {r.semester} •{' '}
                            {r.controlsCreated} contrôle(s) à créer, {r.controlsReused} réutilisé(s) •{' '}
                            {r.matched} élève(s) reconnu(s){r.unmatched ? `, ${r.unmatched} non reconnu(s)` : ''} •{' '}
                            {r.notesUpserted} note(s)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Résultat import réel */}
              {massarResult && (
                <div className="border rounded-lg p-3 bg-green-50">
                  <p className="text-sm font-medium text-green-800 mb-2 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Import terminé
                  </p>
                  <div className="space-y-1 text-sm">
                    {massarResult.map((r, i) => (
                      <div key={i} className={`${r.error ? 'text-red-600' : 'text-gray-700'}`}>
                        <span className="font-medium">{r.className || r.fileName}</span>
                        {r.error ? ` — ⚠️ ${r.error}` : ` — ${r.subject} : ${r.controlsCreated} créé(s), ${r.controlsReused} réutilisé(s), ${r.notesUpserted} note(s), ${r.matched} élève(s)${r.unmatched ? `, ${r.unmatched} non reconnu(s)` : ''}`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
                <input type="checkbox" checked={createMissing} onChange={e => setCreateMissing(e.target.checked)} />
                Créer automatiquement les matières absentes (selon le fichier Massar)
              </label>

              <div className="flex items-center gap-2">
                <button onClick={() => runMassarImport(true)} disabled={massarBusy}
                  className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  {massarBusy ? '…' : 'Aperçu'}
                </button>
                <button onClick={() => runMassarImport(false)} disabled={massarBusy}
                  className="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
                  <Save className="w-4 h-4" /> {massarBusy ? 'Import…' : 'Importer'}
                </button>
                <button onClick={closeMassar} disabled={massarBusy}
                  className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  Fermer
                </button>
              </div>
            </div>
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
