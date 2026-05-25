import { useState, useEffect } from 'react';
import { FileText, Eye, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';

const StudentBulletins = () => {
  const [bulletins, setBulletins] = useState([]);
  const [loading, setLoading] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  useEffect(() => { fetchBulletins(); }, []);

  const fetchBulletins = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/my`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setBulletins(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openPdf = async (bulletinId) => {
    const token = await getToken();
    window.open(`${apiUrl}/api/bulletins/pdf/${bulletinId}?token=${token}`, '_blank');
  };

  const mentionColor = (avg) => {
    if (avg >= 16) return 'text-green-600';
    if (avg >= 14) return 'text-blue-600';
    if (avg >= 12) return 'text-yellow-600';
    if (avg >= 10) return 'text-gray-600';
    return 'text-red-600';
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="w-6 h-6 text-blue-600" /> Mes Bulletins
      </h1>

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : bulletins.length > 0 ? (
        <div className="space-y-4">
          {bulletins.map(b => (
            <Card key={b.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {b.academic_year} — Semestre {b.semester}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span>Moyenne : <strong className={mentionColor(b.general_average)}>
                        {b.general_average != null ? `${Number(b.general_average).toFixed(2)}/20` : '—'}
                      </strong></span>
                      <span>Rang : <strong>{b.general_rank || '—'}/{b.total_students_in_class || '—'}</strong></span>
                      {b.mention && <span>Mention : <strong className={mentionColor(b.general_average)}>{b.mention}</strong></span>}
                    </div>
                  </div>
                  <button onClick={() => openPdf(b.id)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
                    <Eye className="w-4 h-4" /> Voir PDF
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
