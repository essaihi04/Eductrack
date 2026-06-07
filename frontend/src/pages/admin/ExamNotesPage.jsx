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

// Normalisation : minuscules, sans accents/diacritiques arabes, sans espaces multiples
const norm = (x) => String(x ?? '')
  .trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ًͯ-ٰٟ]/g, '') // diacritiques latins + harakat arabes
  .replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/\s+/g, ' ').trim();

// Alias de colonnes pour reconnaître les fichiers Massar (en-têtes arabes/français)
const CODE_ALIASES   = ['code massar', 'رمز التلميذ', 'رمز مسار', 'رمز', 'code eleve', 'code élève', 'cne', 'gresa', 'الرمز', 'ر.ت'].map(norm);
const LASTNAME_ALIASES  = ['nom', 'النسب', 'الاسم العائلي', 'اللقب'].map(norm);
const FIRSTNAME_ALIASES = ['prénom', 'prenom', 'الاسم', 'الاسم الشخصي'].map(norm);
const FULLNAME_ALIASES  = ['الاسم والنسب', 'النسب والاسم', 'الاسم الكامل', 'nom et prénom', 'nom complet', 'الاسم الكامل للتلميذ'].map(norm);
const NOTE_ALIASES   = ['note', 'النقطة', 'النقط', 'المعدل', 'نقطة', 'الدرجة'].map(norm);

// Alias des matières (Massar utilise les libellés arabes) → nom interne de l'app
const SUBJECT_ALIASES = {
  'Arabe': ['اللغة العربية', 'العربية', 'arabe', 'اللغة العربية وآدابها'],
  'Français': ['اللغة الفرنسية', 'الفرنسية', 'francais', 'français'],
  'Anglais': ['اللغة الإنجليزية', 'الإنجليزية', 'english', 'anglais', 'اللغة الانجليزية'],
  'Mathématiques': ['الرياضيات', 'maths', 'mathematiques', 'mathématiques'],
  'PC': ['الفيزياء والكيمياء', 'الفيزياء', 'علوم فيزيائية', 'physique', 'physique-chimie', 'pc'],
  'SVT': ['علوم الحياة والأرض', 'svt', 'sciences de la vie et de la terre'],
  'Sociales': ['الاجتماعيات', 'sociales', 'الاجتماعيات (تاريخ وجغرافيا)'],
  'Histoire-Géographie': ['التاريخ والجغرافيا', 'histoire-géographie', 'histoire geographie', 'الاجتماعيات'],
  'Éducation islamique': ['التربية الإسلامية', 'الإسلامية', 'education islamique', 'éducation islamique', 'التربية الاسلامية'],
  'Philosophie': ['الفلسفة', 'philosophie'],
  'Économie générale': ['الاقتصاد العام والإحصاء', 'الاقتصاد العام', 'economie generale', 'économie générale'],
  'Comptabilité': ['المحاسبة', 'المحاسبة والرياضيات المالية', 'comptabilite', 'comptabilité'],
  'Sciences de l\'ingénieur': ['علوم المهندس', 'sciences de l\'ingénieur'],
  'Activité scientifique': ['النشاط العلمي', 'activité scientifique', 'activite scientifique'],
  'Droit': ['القانون', 'droit'],
  'Informatique de gestion': ['معلوميات التدبير', 'المعلوميات', 'informatique de gestion'],
  'Économie et organisation administrative': ['الاقتصاد والتنظيم الإداري', 'economie et organisation administrative'],
};

// Trouve l'index de la ligne d'en-tête dans un fichier (Massar a ~10 lignes de métadonnées au-dessus)
const findHeaderRow = (rows) => {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] || []).map(norm);
    const hasCode = cells.some(c => CODE_ALIASES.includes(c) || c.includes('massar') || c.includes('رمز'));
    const hasName = cells.some(c => [...LASTNAME_ALIASES, ...FULLNAME_ALIASES].includes(c) || c.includes('الاسم') || c.includes('نسب'));
    if (hasCode || (hasName && cells.length >= 2)) return i;
  }
  return 0;
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
  const [importSubject, setImportSubject] = useState(''); // matière cible pour un fichier Massar par matière

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

  // ─── Exporter au format Massar : un onglet par matière (en-têtes arabes) ───
  //   Reproduit la grille Massar « par matière » (رمز التلميذ / النسب / الاسم / النقطة).
  const downloadMassar = () => {
    if (!students.length || !subjects.length) return;
    const wb = XLSX.utils.book_new();
    subjects.forEach(sub => {
      const meta = [
        ['المؤسسة :', cls?.name || ''],
        ['السنة الدراسية :', academicYear],
        ['المادة :', sub.subject_name],
        ['نوع الامتحان :', EXAM_TYPES[examType]?.ar || ''],
        [],
        ['رمز التلميذ', 'النسب', 'الاسم', 'النقطة'],
      ];
      const body = students.map(s => [
        s.massar_code || '', s.last_name || '', s.first_name || '',
        notes[`${s.id}__${sub.subject_name}`] ?? ''
      ]);
      const ws = XLSX.utils.aoa_to_sheet([...meta, ...body]);
      ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
      // Nom d'onglet ≤ 31 caractères, sans caractères interdits
      const tab = sub.subject_name.replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'Matiere';
      XLSX.utils.book_append_sheet(wb, ws, tab);
    });
    XLSX.writeFile(wb, `massar_${EXAM_TYPES[examType]?.label.replace(/\s/g, '_')}_${cls?.name || ''}_${scenario}.xlsx`);
  };

  // ─── Importer un Excel rempli (modèle app OU export Massar) ───
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

        // 1. Localiser la ligne d'en-tête (les fichiers Massar ont des métadonnées au-dessus)
        const hIdx = findHeaderRow(rows);
        const header = (rows[hIdx] || []).map(h => String(h).trim());
        const hNorm = header.map(norm);

        // 2. Colonne code Massar + nom/prénom
        const massarIdx = hNorm.findIndex(h => CODE_ALIASES.includes(h) || h.includes('massar') || h.includes('رمز'));
        const lastIdx   = hNorm.findIndex(h => LASTNAME_ALIASES.includes(h));
        const firstIdx  = hNorm.findIndex(h => FIRSTNAME_ALIASES.includes(h));
        const fullIdx   = hNorm.findIndex(h => FULLNAME_ALIASES.includes(h));

        // 3. Colonnes de matières (alias arabes/français). Si une seule colonne « note »
        //    générique → fichier Massar par matière, on l'affecte à la matière choisie.
        const subjCols = {};
        subjects.forEach(sub => {
          const aliases = [norm(sub.subject_name), ...(SUBJECT_ALIASES[sub.subject_name] || []).map(norm)];
          const idx = hNorm.findIndex(h => h && aliases.includes(h));
          if (idx >= 0) subjCols[sub.subject_name] = idx;
        });
        const genericNoteIdx = hNorm.findIndex(h => NOTE_ALIASES.includes(h));
        if (!Object.keys(subjCols).length && genericNoteIdx >= 0) {
          if (!importSubject) {
            setMsg('⚠️ Fichier Massar par matière détecté (colonne « note » unique). Choisissez d\'abord « Matière du fichier » puis réimportez.');
            return;
          }
          subjCols[importSubject] = genericNoteIdx;
        }
        if (!Object.keys(subjCols).length) {
          setMsg('❌ Aucune colonne de note reconnue. En-têtes attendus : Code Massar / رمز التلميذ + nom de matière ou « النقطة ».');
          return;
        }

        // 4. Index élèves : par code Massar (clé Massar) puis par nom
        const byMassar = new Map(students.filter(s => s.massar_code).map(s => [norm(s.massar_code), s]));
        const byName = new Map(students.map(s => [norm(`${s.last_name} ${s.first_name}`), s]));
        const byNameRev = new Map(students.map(s => [norm(`${s.first_name} ${s.last_name}`), s]));

        const next = { ...notes };
        let matched = 0, unmatched = 0;
        for (let r = hIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.every(c => c === '')) continue;
          let student = null;
          if (massarIdx >= 0 && row[massarIdx]) student = byMassar.get(norm(row[massarIdx]));
          if (!student && fullIdx >= 0 && row[fullIdx]) {
            const f = norm(row[fullIdx]);
            student = byName.get(f) || byNameRev.get(f);
          }
          if (!student && lastIdx >= 0 && firstIdx >= 0) {
            student = byName.get(norm(`${row[lastIdx]} ${row[firstIdx]}`))
              || byNameRev.get(norm(`${row[firstIdx]} ${row[lastIdx]}`));
          }
          if (!student) { unmatched++; continue; }
          matched++;
          for (const [subject, idx] of Object.entries(subjCols)) {
            let v = row[idx];
            if (typeof v === 'string') v = v.replace(',', '.').trim(); // Massar utilise la virgule décimale
            if (v !== '' && v != null && !isNaN(Number(v))) next[`${student.id}__${subject}`] = Number(v);
          }
        }
        setNotes(next);
        const cols = Object.keys(subjCols).join(', ');
        setMsg(`✅ Import : ${matched} élève(s) reconnus${unmatched ? `, ${unmatched} non reconnus (code Massar absent ?)` : ''} — matière(s) : ${cols}. Cliquez sur « Enregistrer ».`);
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
              <div className="flex gap-2 flex-wrap items-center">
                <select value={importSubject} onChange={e => setImportSubject(e.target.value)}
                  title="Matière cible si vous importez un fichier Massar par matière (1 seule colonne note)"
                  className="border rounded-lg px-2 py-1.5 text-xs max-w-[160px]">
                  <option value="">Matière du fichier Massar…</option>
                  {subjects.map(sub => <option key={sub.subject_name} value={sub.subject_name}>{sub.subject_name}</option>)}
                </select>
                <button onClick={downloadTemplate} disabled={!students.length || !subjects.length}
                  className="flex items-center gap-1 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 disabled:opacity-40">
                  <Download className="w-4 h-4" /> Modèle
                </button>
                <button onClick={downloadMassar} disabled={!students.length || !subjects.length}
                  title="Exporter un classeur au format Massar (un onglet par matière, en-têtes arabes)"
                  className="flex items-center gap-1 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 disabled:opacity-40">
                  <Download className="w-4 h-4" /> Format Massar
                </button>
                <label className="flex items-center gap-1 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <Upload className="w-4 h-4" /> Importer (app/Massar)
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
