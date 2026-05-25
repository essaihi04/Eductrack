import { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Wand2, MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';

const AppreciationsPage = () => {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [semester, setSemester] = useState(1);
  const [appreciations, setAppreciations] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [msg, setMsg] = useState('');
  const [teacherSubject, setTeacherSubject] = useState('');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  const defaultYear = () => {
    const now = new Date();
    const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}/${y + 1}`;
  };

  useEffect(() => {
    setAcademicYear(defaultYear());
    fetchTeacherData();
  }, []);

  const fetchTeacherData = async () => {
    try {
      const token = await getToken();
      // Fetch teacher's classes
      const classRes = await fetch(`${apiUrl}/api/teacher/classes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (classRes.ok) {
        const data = await classRes.json();
        setClasses(data);
      }
      // Fetch teacher's subject
      const subjRes = await fetch(`${apiUrl}/api/teacher/subjects`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (subjRes.ok) {
        const subjects = await subjRes.json();
        if (subjects.length > 0) {
          const name = subjects[0].subjects?.name || subjects[0].name || '';
          setTeacherSubject(name);
          setSubjectName(name);
        }
      }
    } catch (e) { console.error(e); }
  };

  const fetchAppreciations = useCallback(async () => {
    if (!selectedClass || !academicYear || !subjectName) return;
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        class_id: selectedClass,
        academic_year: academicYear,
        semester: String(semester)
      });
      const res = await fetch(`${apiUrl}/api/bulletins/appreciations?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Filter by subject
        const filtered = data.filter(a => a.subject_name === subjectName);
        setAppreciations(filtered);
      }

      // Also fetch students
      const studRes = await fetch(`${apiUrl}/api/teacher/classes/${selectedClass}/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (studRes.ok) {
        setStudents(await studRes.json());
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedClass, academicYear, semester, subjectName]);

  useEffect(() => { fetchAppreciations(); }, [fetchAppreciations]);

  // Merge students with their appreciations
  const mergedRows = students.map(s => {
    const existing = appreciations.find(a => a.student_id === s.id);
    return {
      student_id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      appreciation: existing?.appreciation || '',
      is_auto_generated: existing?.is_auto_generated || false
    };
  });

  const updateAppreciation = (studentId, value) => {
    setAppreciations(prev => {
      const idx = prev.findIndex(a => a.student_id === studentId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], appreciation: value, is_auto_generated: false };
        return updated;
      }
      return [...prev, { student_id: studentId, subject_name: subjectName, appreciation: value, is_auto_generated: false }];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const token = await getToken();
      const rows = mergedRows
        .filter(r => r.appreciation.trim())
        .map(r => ({
          student_id: r.student_id,
          class_id: selectedClass,
          subject_name: subjectName,
          academic_year: academicYear,
          semester,
          appreciation: r.appreciation,
          is_auto_generated: r.is_auto_generated
        }));

      const res = await fetch(`${apiUrl}/api/bulletins/appreciations`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ appreciations: rows })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg(`✅ ${rows.length} appréciations sauvegardées`);
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoGenerate = async () => {
    setAutoGenerating(true);
    setMsg('');
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/appreciations/auto-generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: selectedClass,
          academic_year: academicYear,
          semester,
          subject_name: subjectName
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`✅ ${data.generated} appréciations auto-générées`);
      fetchAppreciations();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setAutoGenerating(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <MessageSquare className="w-6 h-6 text-blue-600" /> Appréciations par Matière
      </h1>

      {/* Filtres */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Classe</label>
              <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
                <option value="">— Choisir —</option>
                {classes.map(c => (
                  <option key={c.id || c.class_id} value={c.id || c.class_id}>
                    {c.name || c.classes?.name} ({c.level || c.classes?.level})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Matière</label>
              <input type="text" value={subjectName} onChange={e => setSubjectName(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-48"
                placeholder={teacherSubject || 'Nom de la matière'} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Année</label>
              <input type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-28" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Semestre</label>
              <select value={semester} onChange={e => setSemester(Number(e.target.value))}
                className="border rounded-lg px-3 py-2 text-sm">
                <option value={1}>S1</option>
                <option value={2}>S2</option>
              </select>
            </div>
            <button onClick={handleAutoGenerate} disabled={autoGenerating || !selectedClass || !subjectName}
              className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-yellow-50 text-yellow-700 border-yellow-300 disabled:opacity-40">
              {autoGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Auto-générer
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : selectedClass && subjectName && mergedRows.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-600 w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Élève</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Appréciation</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 w-16">Auto</th>
                  </tr>
                </thead>
                <tbody>
                  {mergedRows.map((r, idx) => (
                    <tr key={r.student_id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium">{r.first_name} {r.last_name}</td>
                      <td className="px-3 py-2">
                        <input type="text" value={r.appreciation}
                          onChange={e => updateAppreciation(r.student_id, e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm"
                          placeholder="Saisir l'appréciation..." />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.is_auto_generated && <span className="text-xs text-yellow-500">🤖</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4">
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </CardContent>
        </Card>
      ) : selectedClass ? (
        <p className="text-gray-400 text-sm text-center py-8">Sélectionnez une classe et une matière pour commencer.</p>
      ) : null}

      {msg && <p className="text-sm font-medium">{msg}</p>}
    </div>
  );
};

export default AppreciationsPage;
