import { useCallback, useState, useEffect } from 'react';
import { FileText, Eye, RefreshCw } from 'lucide-react';
import { openBlob } from '../../lib/download';
import { Card, CardContent } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const getToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
};

const StudentBulletins = () => {
  const [bulletins, setBulletins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState(null);

  const fetchBulletins = useCallback(async () => {
    try {
      setError('');
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/my`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ([]));
      if (!res.ok) throw new Error(data?.error || 'Impossible de charger tes bulletins.');
      setBulletins(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Impossible de charger tes bulletins.');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBulletins(); }, [fetchBulletins]);

  const openPdf = async (bulletinId) => {
    setOpeningId(bulletinId);
    setError('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiUrl}/api/bulletins/pdf/${bulletinId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Impossible d’ouvrir le bulletin (${response.status}).`);
      await openBlob(await response.blob(), `bulletin_${bulletinId}.pdf`);
    } catch (openError) {
      setError(openError?.message || 'Impossible d’ouvrir ce bulletin.');
    } finally {
      setOpeningId(null);
    }
  };

  const mentionColor = (avg) => {
    if (avg >= 16) return 'text-green-600';
    if (avg >= 14) return 'text-blue-600';
    if (avg >= 12) return 'text-yellow-600';
    if (avg >= 10) return 'text-gray-600';
    return 'text-red-600';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="w-6 h-6 text-blue-600" /> Mes bulletins
      </h1>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : bulletins.length > 0 ? (
        <div className="space-y-4">
          {bulletins.map(b => (
            <Card key={b.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {b.academic_year} — Semestre {b.semester}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                      <span>Moyenne : <strong className={mentionColor(b.general_average)}>
                        {b.general_average != null ? `${Number(b.general_average).toFixed(2)}/20` : '—'}
                      </strong></span>
                      <span>Rang : <strong>{b.general_rank || '—'}/{b.total_students_in_class || '—'}</strong></span>
                      {b.mention && <span>Mention : <strong className={mentionColor(b.general_average)}>{b.mention}</strong></span>}
                      {b.is_exam_level && b.certification_average != null && (
                        <span className="text-blue-700">Moy. certification : <strong className={mentionColor(b.certification_average)}>
                          {Number(b.certification_average).toFixed(2)}/20
                        </strong>{b.certification_mention ? ` (${b.certification_mention})` : ''}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => openPdf(b.id)} disabled={openingId === b.id}
                    className="flex shrink-0 items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-60">
                    {openingId === b.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    {openingId === b.id ? 'Ouverture…' : 'Voir le PDF'}
                  </button>
                </div>

                {b.bulletin_lines && b.bulletin_lines.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left px-2 py-1 font-medium text-gray-600">Matière</th>
                          <th className="text-center px-2 py-1 font-medium text-gray-600">Ctrl</th>
                          <th className="text-center px-2 py-1 font-medium text-gray-600">Act.</th>
                          <th className="text-center px-2 py-1 font-medium text-gray-600">Note /20</th>
                          <th className="text-center px-2 py-1 font-medium text-gray-600">Coef</th>
                          <th className="text-center px-2 py-1 font-medium text-gray-600">Rang</th>
                          <th className="text-left px-2 py-1 font-medium text-gray-600">Appréciation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(b.bulletin_lines || [])
                          .sort((a, b) => (a.display_order || 999) - (b.display_order || 999))
                          .map(l => (
                          <tr key={l.id} className="border-t">
                            <td className="px-2 py-1">{l.subject_name}</td>
                            <td className="px-2 py-1 text-center">{l.controls_avg != null ? Number(l.controls_avg).toFixed(1) : '—'}</td>
                            <td className="px-2 py-1 text-center">{l.activities_avg != null ? Number(l.activities_avg).toFixed(1) : '—'}</td>
                            <td className="px-2 py-1 text-center font-semibold">{Number(l.note_20).toFixed(2)}</td>
                            <td className="px-2 py-1 text-center">{l.coefficient}</td>
                            <td className="px-2 py-1 text-center">{l.rank_in_class || '—'}</td>
                            <td className="px-2 py-1 text-gray-500 text-xs">{l.appreciation || l.appreciation_by_teacher || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun bulletin disponible pour le moment.</p>
        </div>
      )}
    </div>
  );
};

export default StudentBulletins;
