import { useState, useEffect } from 'react';
import { FileText, Download, Eye, RefreshCw } from 'lucide-react';
import { openPdfUrl } from '../../lib/download';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';

const ParentBulletinsPage = () => {
  const { profile } = useAuth();
  const t = useT();
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [bulletins, setBulletins] = useState([]);
  const [loading, setLoading] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  useEffect(() => { fetchChildren(); }, []);

  const fetchChildren = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/parent/children`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChildren(data);
        if (data.length > 0) {
          const firstId = data[0].student?.id || data[0].id;
          setSelectedChild(firstId);
          fetchBulletins(firstId);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchBulletins = async (childId) => {
    if (!childId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/bulletins/children/${childId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setBulletins(await res.json());
      else setBulletins([]);
    } catch (e) { console.error(e); setBulletins([]); }
    finally { setLoading(false); }
  };

  const handleChildChange = (childId) => {
    setSelectedChild(childId);
    fetchBulletins(childId);
  };

  const openPdf = async (bulletinId) => {
    const token = await getToken();
    await openPdfUrl(`${apiUrl}/api/bulletins/pdf/${bulletinId}?token=${token}`, `bulletin_${bulletinId}.pdf`);
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
        <FileText className="w-6 h-6 text-blue-600" /> {t('pbul.title')}
      </h1>

      {/* Sélecteur enfant */}
      {children.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('pbul.child')}</label>
          <select value={selectedChild} onChange={e => handleChildChange(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            {children.map(c => {
              const s = c.student || c;
              return <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>;
            })}
          </select>
        </div>
      )}

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
                      {t('pbul.semester', { year: b.academic_year, n: b.semester })}
                    </h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span>{t('pbul.average')} <strong className={mentionColor(b.general_average)}>
                        {b.general_average != null ? `${Number(b.general_average).toFixed(2)}/20` : '—'}
                      </strong></span>
                      <span>{t('pbul.rank')} <strong>{b.general_rank || '—'}/{b.total_students_in_class || '—'}</strong></span>
                      {b.mention && <span>{t('pbul.mention')} <strong className={mentionColor(b.general_average)}>{b.mention}</strong></span>}
                      {b.is_exam_level && b.certification_average != null && (
                        <span className="text-blue-700">{t('pbul.certAverage')} <strong className={mentionColor(b.certification_average)}>
                          {Number(b.certification_average).toFixed(2)}/20
                        </strong>{b.certification_mention ? ` (${b.certification_mention})` : ''}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => openPdf(b.id)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
                    <Eye className="w-4 h-4" /> {t('pbul.view')}
                  </button>
                </div>

                {/* Détails matières */}
                {b.bulletin_lines && b.bulletin_lines.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left px-2 py-1 font-medium text-gray-600">{t('pbul.col.subject')}</th>
                          <th className="text-center px-2 py-1 font-medium text-gray-600">{t('pbul.col.note')}</th>
                          <th className="text-center px-2 py-1 font-medium text-gray-600">{t('pbul.col.coef')}</th>
                          <th className="text-center px-2 py-1 font-medium text-gray-600">{t('pbul.col.rank')}</th>
                          <th className="text-left px-2 py-1 font-medium text-gray-600">{t('pbul.col.appreciation')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(b.bulletin_lines || [])
                          .sort((a, b) => (a.display_order || 999) - (b.display_order || 999))
                          .map(l => (
                          <tr key={l.id} className="border-t">
                            <td className="px-2 py-1">{l.subject_name}</td>
                            <td className="px-2 py-1 text-center font-medium">{Number(l.note_20).toFixed(2)}</td>
                            <td className="px-2 py-1 text-center">{l.coefficient}</td>
                            <td className="px-2 py-1 text-center">{l.rank_in_class || '—'}</td>
                            <td className="px-2 py-1 text-gray-500">{l.appreciation || l.appreciation_by_teacher || ''}</td>
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
          <p>{t('pbul.empty')}</p>
        </div>
      )}
    </div>
  );
};

export default ParentBulletinsPage;
