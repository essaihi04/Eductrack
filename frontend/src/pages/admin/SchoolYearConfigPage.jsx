import { useState, useEffect } from 'react';
import { Save, Calendar, Building2, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';

const SchoolYearConfigPage = () => {
  const [config, setConfig] = useState({
    academic_year: '',
    academy: '',
    region: '',
    provincial_direction: '',
    establishment_label: '',
    director_name: '',
    semester_1_start: '',
    semester_1_end: '',
    semester_2_start: '',
    semester_2_end: ''
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  // Derive default academic year
  const defaultYear = () => {
    const now = new Date();
    const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}/${y + 1}`;
  };

  useEffect(() => {
    const year = defaultYear();
    setConfig(prev => ({ ...prev, academic_year: year }));
    fetchConfig(year);
  }, []);

  const fetchConfig = async (year) => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/config/${encodeURIComponent(year)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setIsDefault(!!data.is_default);
          setConfig(prev => ({
            ...prev,
            ...data,
            academic_year: data.academic_year || year,
            semester_1_start: data.semester_1_start || '',
            semester_1_end: data.semester_1_end || '',
            semester_2_start: data.semester_2_start || '',
            semester_2_end: data.semester_2_end || ''
          }));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const token = await getToken();
      const { id, created_at, school_id, ...body } = config;
      const res = await fetch(`${apiUrl}/api/bulletins/config/${encodeURIComponent(config.academic_year)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setMsg('✅ Configuration sauvegardée');
      setIsDefault(false);
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => setConfig(prev => ({ ...prev, [field]: value }));

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="w-6 h-6 text-blue-600" /> Configuration Année Scolaire
        </h1>
        {isDefault && (
          <span className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            ℹ️ Dates officielles MEN pré-remplies — pensez à sauvegarder
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" /> Informations Établissement</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Année scolaire</label>
                  <input type="text" value={config.academic_year} onChange={e => handleChange('academic_year', e.target.value)}
                    placeholder="2025/2026" className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom officiel établissement</label>
                  <input type="text" value={config.establishment_label} onChange={e => handleChange('establishment_label', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nom affiché sur le bulletin" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Académie Régionale</label>
                  <input type="text" value={config.academy} onChange={e => handleChange('academy', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Académie Régionale d'Éducation et de Formation" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Région</label>
                  <input type="text" value={config.region} onChange={e => handleChange('region', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Casablanca-Settat" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Direction Provinciale</label>
                  <input type="text" value={config.provincial_direction} onChange={e => handleChange('provincial_direction', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Province: Berrechid" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Directeur</label>
                  <input type="text" value={config.director_name} onChange={e => handleChange('director_name', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nom du directeur" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5" /> Périodes des Semestres</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-800">Semestre 1</h3>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Début</label>
                    <input type="date" value={config.semester_1_start} onChange={e => handleChange('semester_1_start', e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Fin</label>
                    <input type="date" value={config.semester_1_end} onChange={e => handleChange('semester_1_end', e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm" />
                  </div>
                </div>
                <div className="space-y-3 p-4 bg-green-50 rounded-lg">
                  <h3 className="font-semibold text-green-800">Semestre 2</h3>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Début</label>
                    <input type="date" value={config.semester_2_start} onChange={e => handleChange('semester_2_start', e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Fin</label>
                    <input type="date" value={config.semester_2_end} onChange={e => handleChange('semester_2_end', e.target.value)}
                      className="w-full border rounded px-3 py-1.5 text-sm" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {msg && <p className="text-sm font-medium">{msg}</p>}

          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'Sauvegarde...' : 'Sauvegarder la configuration'}
          </button>
        </>
      )}
    </div>
  );
};

export default SchoolYearConfigPage;
