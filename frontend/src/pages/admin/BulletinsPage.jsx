import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, Send, Eye, CheckCircle, Download, Printer, MessageCircle } from 'lucide-react';
import { openPdfUrl } from '../../lib/download';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';

const BulletinsPage = () => {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [semester, setSemester] = useState(1);
  const [bulletins, setBulletins] = useState([]);
  const [mode, setMode] = useState('real'); // 'real' | 'simili' (années de certification)
  const [years, setYears] = useState([]);
  const [currentYear, setCurrentYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [sendingWA, setSendingWA] = useState(false);
  const [msg, setMsg] = useState('');
  const [genResult, setGenResult] = useState(null);

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
    fetchClasses();
    fetchCurrentSemester();
    fetchYears();
  }, []);

  // Liste des années (archives + en cours)
  const fetchYears = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/years`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setYears(data.years || []);
        setCurrentYear(data.current || '');
      }
    } catch (e) { console.error(e); }
  };

  // Récupère le semestre en cours selon les dates officielles MEN / config école
  const fetchCurrentSemester = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/current-semester`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.academicYear) setAcademicYear(data.academicYear);
        if (data?.semester) setSemester(data.semester);
      }
    } catch (e) { console.error(e); }
  };

  const fetchClasses = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/classes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setClasses(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchBulletins = useCallback(async () => {
    if (!selectedClass || !academicYear) return;
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ academic_year: academicYear, semester: String(semester) });
      const res = await fetch(`${apiUrl}/api/bulletins/class/${selectedClass}?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setBulletins(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedClass, academicYear, semester]);

  useEffect(() => { fetchBulletins(); }, [fetchBulletins]);

  const handleGenerate = async () => {
    if (!selectedClass) return;
    setGenerating(true);
    setMsg('');
    setGenResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: selectedClass, academic_year: academicYear, semester, mode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGenResult(data);
      setMsg(`✅ ${data.generated} bulletins générés — Moyenne de classe : ${data.classAverage ?? '—'}/20`);
      fetchBulletins();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setMsg('');
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: selectedClass, academic_year: academicYear, semester })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`✅ ${data.published} bulletins publiés`);
      fetchBulletins();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleSendWhatsApp = async () => {
    const publishedIds = bulletins.filter(b => b.status === 'published').map(b => b.id);
    if (publishedIds.length === 0) { setMsg('⚠️ Aucun bulletin publié à envoyer'); return; }
    setSendingWA(true);
    setMsg('');
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/send-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulletin_ids: publishedIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`✅ ${data.sent} bulletins envoyés via WhatsApp${data.errors?.length ? ` — ${data.errors.length} erreurs` : ''}`);
      fetchBulletins();
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setSendingWA(false);
    }
  };

  const openPdf = async (bulletinId) => {
    const token = await getToken();
    await openPdfUrl(`${apiUrl}/api/bulletins/pdf/${bulletinId}?token=${token}&mode=${mode}`, `bulletin_${bulletinId}.pdf`);
  };

  // La classe sélectionnée est-elle une année de certification ?
  const selectedClassObj = classes.find(c => c.id === selectedClass);
  const EXAM_LEVELS = ['6AP', '3AC', '1BAC', '2BAC'];
  const isExamClass = selectedClassObj && EXAM_LEVELS.includes(selectedClassObj.level);
  const anyExamBulletin = bulletins.some(b => b.is_exam_level);

  const statusBadge = (status) => {
    const map = {
      draft: { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' },
      published: { label: 'Publié', cls: 'bg-green-100 text-green-700' },
      sent: { label: 'Envoyé', cls: 'bg-blue-100 text-blue-700' }
    };
    const s = map[status] || map.draft;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
  };

  const draftCount = bulletins.filter(b => b.status === 'draft').length;
  const publishedCount = bulletins.filter(b => b.status === 'published').length;
  const sentCount = bulletins.filter(b => b.status === 'sent').length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="w-6 h-6 text-blue-600" /> Gestion des Bulletins
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
                {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Année scolaire</label>
              <select value={academicYear} onChange={e => setAcademicYear(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-40 bg-white">
                {/* Toujours inclure l'année courante en tête, puis archives */}
                {!years.includes(academicYear) && academicYear && (
                  <option value={academicYear}>{academicYear} (en cours)</option>
                )}
                {years.map(y => (
                  <option key={y} value={y}>
                    {y}{y === currentYear ? ' (en cours)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Semestre</label>
              <select value={semester} onChange={e => setSemester(Number(e.target.value))}
                className="border rounded-lg px-3 py-2 text-sm">
                <option value={1}>Semestre 1</option>
                <option value={2}>Semestre 2</option>
              </select>
            </div>
            {isExamClass && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mode examen <span className="text-blue-600">(certification)</span>
                </label>
                <select value={mode} onChange={e => setMode(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm bg-white min-w-[200px]">
                  <option value="real">Réel (examens officiels)</option>
                  <option value="simili">Simulé (examen blanc)</option>
                </select>
              </div>
            )}
          </div>
          {isExamClass && (
            <p className="mt-3 text-xs text-gray-500">
              ℹ️ Niveau de certification (<b>{selectedClassObj.level}</b>) : le bulletin inclut la moyenne d'examen
              ({mode === 'simili' ? 'mode simulé — utilise les notes d\'examen blanc' : 'mode réel — utilise les notes officielles'}).
              Saisissez les notes via <b>Notes d'examens</b>. Générez une fois par mode pour obtenir les deux bulletins.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      {selectedClass && (
        <div className="flex flex-wrap gap-3">
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {generating ? 'Génération...' : 'Générer les bulletins'}
          </button>
          <button onClick={handlePublish} disabled={publishing || draftCount === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            <CheckCircle className="w-4 h-4" /> Publier ({draftCount})
          </button>
          <button onClick={handleSendWhatsApp} disabled={sendingWA || publishedCount === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            <MessageCircle className="w-4 h-4" /> Envoyer WhatsApp ({publishedCount})
          </button>
        </div>
      )}

      {msg && <p className="text-sm font-medium">{msg}</p>}

      {/* Stats rapides */}
      {bulletins.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-gray-700">{draftCount}</div>
            <div className="text-xs text-gray-500">Brouillons</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-700">{publishedCount}</div>
            <div className="text-xs text-green-600">Publiés</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{sentCount}</div>
            <div className="text-xs text-blue-600">Envoyés</div>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : bulletins.length > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 font-medium text-gray-600">Rang</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Élève</th>
                    <th className="px-3 py-2 font-medium text-gray-600">Massar</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-center">Moy. CC</th>
                    {anyExamBulletin && (
                      <th className="px-3 py-2 font-medium text-blue-700 text-center">Moy. Certif.</th>
                    )}
                    <th className="px-3 py-2 font-medium text-gray-600 text-center">Mention</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-center">Statut</th>
                    <th className="px-3 py-2 font-medium text-gray-600 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bulletins.map(b => (
                    <tr key={b.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{b.general_rank || '—'}</td>
                      <td className="px-3 py-2">
                        {b.profiles?.first_name} {b.profiles?.last_name}
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{b.profiles?.massar_code || '—'}</td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {b.general_average != null ? `${Number(b.general_average).toFixed(2)}/20` : '—'}
                      </td>
                      {anyExamBulletin && (
                        <td className="px-3 py-2 text-center font-bold text-blue-700">
                          {b.certification_average != null ? `${Number(b.certification_average).toFixed(2)}/20` : '—'}
                          {b.certification_mode && (
                            <span className="block text-[10px] font-normal text-gray-400">
                              {b.certification_mode === 'simili' ? 'simulé' : 'réel'}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs font-medium ${
                          b.general_average >= 16 ? 'text-green-600' :
                          b.general_average >= 14 ? 'text-blue-600' :
                          b.general_average >= 12 ? 'text-yellow-600' :
                          b.general_average >= 10 ? 'text-gray-600' : 'text-red-600'
                        }`}>{b.mention || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-center">{statusBadge(b.status)}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => openPdf(b.id)} title="Voir PDF"
                          className="text-blue-500 hover:text-blue-700 p-1">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : selectedClass ? (
        <p className="text-gray-400 text-sm text-center py-8">Aucun bulletin. Cliquez "Générer" pour calculer les bulletins de cette classe.</p>
      ) : null}
    </div>
  );
};

export default BulletinsPage;
