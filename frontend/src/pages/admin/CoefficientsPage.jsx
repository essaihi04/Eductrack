import { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw, Plus, Trash2, BookOpen, Download } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';

const LEVELS = [
  { group: 'Primaire', items: [
    { value: '1AP', label: '1ère AP' }, { value: '2AP', label: '2ème AP' },
    { value: '3AP', label: '3ème AP' }, { value: '4AP', label: '4ème AP' },
    { value: '5AP', label: '5ème AP' }, { value: '6AP', label: '6ème AP' }
  ]},
  { group: 'Collège', items: [
    { value: '1AC', label: '1ère AC' }, { value: '2AC', label: '2ème AC' }, { value: '3AC', label: '3ème AC' }
  ]},
  { group: 'Tronc Commun', items: [{ value: 'TC', label: 'Tronc Commun' }] },
  { group: '1ère Bac', items: [{ value: '1BAC', label: '1ère Bac' }] },
  { group: '2ème Bac', items: [{ value: '2BAC', label: '2ème Bac' }] }
];

const FILIERES = {
  TC: [
    { value: 'tc_sciences', label: 'TC Sciences' },
    { value: 'tc_tech', label: 'TC Technologique' },
    { value: 'tc_lettres', label: 'TC Lettres' }
  ],
  '1BAC': [
    { value: 'sciences_exp', label: 'Sciences Exp.' },
    { value: 'sciences_math', label: 'Sciences Math' },
    { value: 'sciences_eco', label: 'Sciences Éco.' },
    { value: 'lettres', label: 'Lettres' }
  ],
  '2BAC': [
    { value: 'svt', label: 'SVT' },
    { value: 'pc', label: 'PC' },
    { value: 'sciences_math_a', label: 'Sc. Math A' },
    { value: 'sciences_math_b', label: 'Sc. Math B' },
    { value: 'eco', label: 'Éco.' },
    { value: 'lettres', label: 'Lettres' },
    { value: 'sciences_humaines', label: 'Sc. Humaines' }
  ]
};

const CoefficientsPage = () => {
  const [level, setLevel] = useState('');
  const [filiere, setFiliere] = useState('');
  const [coefficients, setCoefficients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  const filiereOptions = FILIERES[level] || [];
  const needsFiliere = filiereOptions.length > 0;

  const fetchCoefficients = useCallback(async () => {
    if (!level) return;
    if (needsFiliere && !filiere) return;
    setLoading(true);
    setMsg('');
    try {
      const token = await getToken();
      const params = new URLSearchParams({ level });
      if (filiere) params.set('filiere', filiere);
      const res = await fetch(`${apiUrl}/api/bulletins/coefficients?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setCoefficients(data.map((c, i) => ({ ...c, _key: i })));
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [level, filiere]);

  useEffect(() => { fetchCoefficients(); }, [fetchCoefficients]);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/coefficients`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          filiere: filiere || null,
          coefficients: coefficients.map((c, idx) => ({
            subject_name: c.subject_name,
            coefficient: Number(c.coefficient),
            display_order: (idx + 1) * 10,
            subject_id: c.subject_id || null
          }))
        })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg('✅ Coefficients sauvegardés');
      fetchCoefficients();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSeed = async () => {
    if (!level) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/coefficients/seed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, filiere: filiere || null })
      });
      const data = await res.json();
      setMsg(`✅ ${data.seeded || 0} coefficients importés des défauts`);
      fetchCoefficients();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addRow = () => {
    setCoefficients(prev => [...prev, {
      _key: Date.now(), subject_name: '', coefficient: 1, display_order: (prev.length + 1) * 10
    }]);
  };

  const removeRow = (idx) => setCoefficients(prev => prev.filter((_, i) => i !== idx));

  const updateRow = (idx, field, value) => {
    setCoefficients(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <BookOpen className="w-6 h-6 text-blue-600" /> Coefficients par Matière
      </h1>

      {/* Sélecteurs */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Niveau</label>
              <select value={level} onChange={e => { setLevel(e.target.value); setFiliere(''); setCoefficients([]); }}
                className="border rounded-lg px-3 py-2 text-sm min-w-[180px]">
                <option value="">— Choisir —</option>
                {LEVELS.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            {needsFiliere && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filière</label>
                <select value={filiere} onChange={e => { setFiliere(e.target.value); setCoefficients([]); }}
                  className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
                  <option value="">— Choisir —</option>
                  {filiereOptions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            )}

            <button onClick={handleSeed} disabled={!level || loading}
              className="flex items-center gap-1 text-sm px-3 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-40">
              <Download className="w-4 h-4" /> Importer défauts MEN
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : level && (!needsFiliere || filiere) ? (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-600 w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Matière</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Coefficient</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {coefficients.map((c, idx) => (
                    <tr key={c._key ?? idx} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input type="text" value={c.subject_name} onChange={e => updateRow(idx, 'subject_name', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm" placeholder="Nom de la matière" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.5" value={c.coefficient}
                          onChange={e => updateRow(idx, 'coefficient', e.target.value)}
                          className="w-full border rounded px-2 py-1 text-sm text-center" />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeRow(idx)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <button onClick={addRow} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                <Plus className="w-4 h-4" /> Ajouter une matière
              </button>
              <button onClick={handleSave} disabled={saving || coefficients.length === 0}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {msg && <p className="text-sm font-medium">{msg}</p>}
    </div>
  );
};

export default CoefficientsPage;
