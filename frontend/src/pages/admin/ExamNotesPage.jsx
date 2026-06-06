import { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { GraduationCap, Download, Upload, Save, RefreshCw, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';

// Libellés des types d'examen
const EXAM_TYPES = {
  national: { label: 'Examen national', ar: 'الامتحان الوطني' },
  regional: { label: 'Examen régional', ar: 'الامتحان الجهوي' },
  local:    { label: 'Examen local',    ar: 'الامتحان المحلي' },
};

const SCENARIOS = {
  real: { label: 'Réel', desc: 'Notes officielles de l\'examen passé' },
  mock: { label: 'Examen blanc (simili)', desc: 'Notes de l\'examen blanc / simulation' },
};

const defaultYear = () => {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${y + 1}`;
};

const ExamNotesPage = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  const [classes, setClasses] = useState([]);
  const [examLevels, setExamLevels] = useState({});
  const [selectedClass, setSelectedClass] = useState('');
  const [academicYear, setAcademicYear] = useState(defaultYear());
  const [examType, setExamType] = useState('');
  const [scenario, setScenario] = useState('real');

  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);        // [{subject_name, coefficient}]
  const [notes, setNotes] = useState({});              // { `${studentId}__${subject}`: note }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const cls = useMemo(() => classes.find(c => c.id === selectedClass), [classes, selectedClass]);
  const availableExamTypes = useMemo(() => {
    if (!cls) return [];
    return examLevels[cls.level]?.exams || [];
  }, [cls, examLevels]);

  // Chargement initial : classes + config niveaux
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const [cRes, elRes] = await Promise.all([
          fetch(`${apiUrl}/api/admin/classes`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiUrl}/api/bulletins/exam-levels`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (cRes.ok) setClasses(await cRes.json());
        if (elRes.ok) setExamLevels(await elRes.json());
      } catch (e) { console.error(e); }
    })();
  }, []);

  // Quand la classe change → reset type d'examen au 1er disponible
  useEffect(() => {
    if (availableExamTypes.length && !availableExamTypes.includes(examType)) {
      setExamType(availableExamTypes[0]);
    }
    if (!availableExamTypes.length) setExamType('');
  }, [availableExamTypes]);

  const loadGrid = useCallback(async () => {
    if (!selectedClass || !cls || !examType) { setStudents([]); setSubjects([]); setNotes({}); return; }
    setLoading(true);
    setMsg('');
    try {
      const token = await getToken();
      const params = new URLSearchParams({ level: cls.level, exam_type: examType });
      if (cls.filiere) params.set('filiere', cls.filiere);

      const [stuRes, subRes, notesRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/students`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/bulletins/exam-coefficients?${params}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/bulletins/exam-notes?class_id=${selectedClass}&academic_year=${encodeURIComponent(academicYear)}&scenario=${scenario}`,
          { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const allStudents = stuRes.ok ? await stuRes.json() : [];
      const classStudents = allStudents
        .filter(s => s.class_id === selectedClass)
        .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
      setStudents(classStudents);

      const subs = subRes.ok ? await subRes.json() : [];
      setSubjects(subs);

      const existing = notesRes.ok ? await notesRes.json() : [];
      const map = {};
      existing.filter(n => n.exam_type === examType).forEach(n => {
        map[`${n.student_id}__${n.subject_name}`] = n.note;
      });
      setNotes(map);

      if (!subs.length) setMsg('⚠️ Aucune matière d\'examen configurée pour ce niveau/filière/type. Vérifiez les coefficients d\'examen.');
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedClass, cls, examType, scenario, academicYear]);

  useEffect(() => { loadGrid(); }, [loadGrid]);

  const setNote = (studentId, subject, value) => {
    setNotes(prev => ({ ...prev, [`${studentId}__${subject}`]: value }));
  };

  // ─── Télécharger le modèle Excel ───
  const downloadTemplate = () => {
    if (!students.length || !subjects.length) return;
    const header = ['Code Massar', 'Nom', 'Prénom', ...subjects.map(s => s.subject_name)];
    const rows = students.map(s => [
      s.massar_code || '', s.last_name || '', s.first_name || '',
      ...subjects.map(sub => notes[`${s.id}__${sub.subject_name}`] ?? '')
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Notes');
    const fname = `modele_${EXAM_TYPES[examType]?.label.replace(/\s/g, '_')}_${cls?.name || ''}_${scenario}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

  // ─── Importer un Excel rempli ───
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!rows.length) { setMsg('❌ Fichier vide'); return; }

        const header = rows[0].map(h => String(h).trim());
        // Index des colonnes matières (par nom exact ou insensible casse/espaces)
        const norm = (x) => String(x).trim().toLowerCase();
        const subjCols = {};
        subjects.forEach(sub => {
          const idx = header.findIndex(h => norm(h) === norm(sub.subject_name));
          if (idx >= 0) subjCols[sub.subject_name] = idx;
        });
        const massarIdx = header.findIndex(h => norm(h).includes('massar'));

        // Index élève par massar et par nom complet
        const byMassar = new Map(students.filter(s => s.massar_code).map(s => [norm(s.massar_code), s]));
        const byName = new Map(students.map(s => [norm(`${s.last_name} ${s.first_name}`), s]));
        const byNameRev = new Map(students.map(s => [norm(`${s.first_name} ${s.last_name}`), s]));

        const nameIdxL = header.findIndex(h => norm(h) === 'nom');
        const nameIdxF = header.findIndex(h => norm(h).includes('prénom') || norm(h).includes('prenom'));

        const next = { ...notes };
        let matched = 0, unmatched = 0;
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.every(c => c === '')) continue;
          let student = null;
          if (massarIdx >= 0 && row[massarIdx]) student = byMassar.get(norm(row[massarIdx]));
          if (!student && nameIdxL >= 0 && nameIdxF >= 0) {
            const full = norm(`${row[nameIdxL]} ${row[nameIdxF]}`);
            student = byName.get(full) || byNameRev.get(norm(`${row[nameIdxF]} ${row[nameIdxL]}`));
          }
          if (!student) { unmatched++; continue; }
          matched++;
          for (const [subject, idx] of Object.entries(subjCols)) {
            const v = row[idx];
            if (v !== '' && v != null) next[`${student.id}__${subject}`] = v;
          }
        }
        setNotes(next);
        setMsg(`✅ Import : ${matched} élève(s) reconnus${unmatched ? `, ${unmatched} non reconnus` : ''}. Cliquez sur « Enregistrer » pour valider.`);
      } catch (err) {
        setMsg(`❌ Erreur lecture fichier : ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // ─── Enregistrer les notes ───
  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const token = await getToken();
      const payloadNotes = [];
      students.forEach(s => {
        subjects.forEach(sub => {
          const v = notes[`${s.id}__${sub.subject_name}`];
          if (v !== '' && v != null) {
            payloadNotes.push({ student_id: s.id, subject_name: sub.subject_name, note: Number(v) });
          }
        });
      });
      const res = await fetch(`${apiUrl}/api/bulletins/exam-notes`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: selectedClass, academic_year: academicYear,
          exam_type: examType, scenario, notes: payloadNotes
        })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setMsg(`✅ ${data.saved} note(s) enregistrée(s)`);
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <GraduationCap className="w-6 h-6 text-blue-600" /> Notes d'examens (certification)
      </h1>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Classe</label>
              <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
                <option value="">— Choisir —</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.level ? `(${c.level}${c.filiere ? '/' + c.filiere : ''})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Année scolaire</label>
              <input type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-32" placeholder="2025/2026" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type d'examen</label>
              <select value={examType} onChange={e => setExamType(e.target.value)}
                disabled={!availableExamTypes.length}
                className="border rounded-lg px-3 py-2 text-sm min-w-[170px] disabled:bg-gray-100">
                {!availableExamTypes.length && <option value="">— N/A —</option>}
                {availableExamTypes.map(t => <option key={t} value={t}>{EXAM_TYPES[t]?.label || t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scénario</label>
              <select value={scenario} onChange={e => setScenario(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
                {Object.entries(SCENARIOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {cls && !availableExamTypes.length && (
            <div className="mt-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Le niveau <b>{cls.level}</b> n'est pas une année de certification (examens : seuls 6AP, 3AC, 1BAC, 2BAC).</span>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedClass && availableExamTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
              <span>{EXAM_TYPES[examType]?.label} — {SCENARIOS[scenario]?.label}</span>
              <div className="flex gap-2">
                <button onClick={downloadTemplate} disabled={!students.length || !subjects.length}
                  className="flex items-center gap-1 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 disabled:opacity-40">
                  <Download className="w-4 h-4" /> Modèle Excel
                </button>
                <label className="flex items-center gap-1 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <Upload className="w-4 h-4" /> Importer Excel
                  <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
                </label>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : !students.length ? (
              <p className="text-sm text-gray-500">Aucun élève dans cette classe.</p>
            ) : !subjects.length ? (
              <p className="text-sm text-amber-600">Aucune matière d'examen configurée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="sticky left-0 bg-gray-50 text-left px-3 py-2 font-medium text-gray-600 border-b min-w-[200px]">Élève</th>
                      {subjects.map(sub => (
                        <th key={sub.subject_name} className="px-2 py-2 font-medium text-gray-600 border-b text-center min-w-[90px]">
                          <div>{sub.subject_name}</div>
                          <div className="text-[10px] text-gray-400 font-normal">coef {sub.coefficient}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => (
                      <tr key={s.id} className={i % 2 ? 'bg-gray-50/50' : ''}>
                        <td className="sticky left-0 bg-inherit px-3 py-1.5 border-b">
                          <div className="font-medium">{s.last_name} {s.first_name}</div>
                          <div className="text-[10px] text-gray-400">{s.massar_code || '—'}</div>
                        </td>
                        {subjects.map(sub => (
                          <td key={sub.subject_name} className="px-1 py-1 border-b text-center">
                            <input type="number" min="0" max="20" step="0.25"
                              value={notes[`${s.id}__${sub.subject_name}`] ?? ''}
                              onChange={e => setNote(s.id, sub.subject_name, e.target.value)}
                              className="w-16 border rounded px-1 py-1 text-center text-sm" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-500">{SCENARIOS[scenario]?.desc}</p>
              <button onClick={handleSave} disabled={saving || !students.length || !subjects.length}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {msg && <p className="text-sm font-medium">{msg}</p>}
    </div>
  );
};

export default ExamNotesPage;
