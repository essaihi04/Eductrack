import { useState, useEffect } from 'react';
import { ChevronLeft, Save, AlertCircle, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useT } from '../../i18n';

const SuiviSeance = () => {
  const navigate = useNavigate();
  const t = useT();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students, setStudents] = useState([]);
  const [tracking, setTracking] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
    }
  }, [selectedClass]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (Object.keys(tracking).length > 0) {
        saveTracking();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [tracking]);

  const fetchClasses = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const res = await fetch(`${apiUrl}/api/teacher/my-classes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setClasses(Array.isArray(data) ? data : []);
      if (data.length > 0) {
        setSelectedClass(data[0].id);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const res = await fetch(`${apiUrl}/api/teacher/classes/${selectedClass}/students`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);

      // Initialiser le tracking
      const initialTracking = {};
      (Array.isArray(data) ? data : []).forEach(student => {
        initialTracking[student.id] = {
          presence: 'present',
          work_status: 'good',
          discipline: 'good',
          phone_use: false
        };
      });
      setTracking(initialTracking);
    } catch (error) {
      console.error('Erreur lors du chargement des élèves:', error);
    }
  };

  const saveTracking = async () => {
    try {
      setSaving(true);
      setAutoSaveStatus(t('track.saving'));

      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      // Créer une séance si elle n'existe pas
      let sessionId = sessionStorage.getItem(`session_${selectedClass}_${sessionDate}`);
      
      if (!sessionId) {
        const sessionRes = await fetch(`${apiUrl}/api/teacher/sessions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            class_id: selectedClass,
            date: sessionDate
          })
        });
        const sessionData = await sessionRes.json();
        sessionId = sessionData.id;
        sessionStorage.setItem(`session_${selectedClass}_${sessionDate}`, sessionId);
      }

      // Enregistrer le suivi
      for (const [studentId, data] of Object.entries(tracking)) {
        await fetch(`${apiUrl}/api/teacher/session-tracking`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            session_id: sessionId,
            student_id: studentId,
            ...data
          })
        });
      }

      setAutoSaveStatus(t('track.saved'));
      setTimeout(() => setAutoSaveStatus(''), 2000);
    } catch (error) {
      console.error('Erreur de sauvegarde:', error);
      setAutoSaveStatus(t('track.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const updateTracking = (studentId, field, value) => {
    setTracking(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [field]: value
      }
    }));
  };

  const getPresenceColor = (value) => {
    switch (value) {
      case 'present': return 'bg-green-500 text-white';
      case 'absent': return 'bg-red-500 text-white';
      case 'late': return 'bg-yellow-500 text-white';
      case 'excused': return 'bg-blue-500 text-white';
      default: return 'bg-gray-200 text-gray-600';
    }
  };

  const getWorkColor = (value) => {
    switch (value) {
      case 'excellent': return 'bg-green-500 text-white';
      case 'good': return 'bg-blue-500 text-white';
      case 'average': return 'bg-yellow-500 text-white';
      case 'poor': return 'bg-red-500 text-white';
      default: return 'bg-gray-200 text-gray-600';
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">{t('common.loading')}</div>;
  }

  const selectedClassData = classes.find(c => c.id === selectedClass);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('track.pageTitle')}</h1>
          <p className="text-muted-foreground mt-1">{t('track.pageSubtitle')}</p>
        </div>
        <div className="text-right">
          {autoSaveStatus && (
            <p className={`text-sm font-medium ${autoSaveStatus.includes('✓') ? 'text-green-600' : 'text-blue-600'}`}>
              {autoSaveStatus}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{t('track.autoSave')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">{t('common.class')}</label>
          <select
            value={selectedClass || ''}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>
                {cls.name} - {cls.level}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">{t('track.date')}</label>
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={saveTracking}
            disabled={saving}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {t('common.save')}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-900">{t('track.tip')}</p>
          <p className="text-sm text-blue-800 mt-1">{t('track.tipButtons')}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-300">
              <th className="px-4 py-3 text-start text-sm font-semibold text-gray-700 sticky left-0 bg-gray-100 z-10">
                {t('track.student')}
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                <div className="flex flex-col items-center gap-1">
                  <span>{t('track.presence')}</span>
                  <span className="text-xs font-normal text-gray-500">{t('track.legend.presence')}</span>
                </div>
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                <div className="flex flex-col items-center gap-1">
                  <span>{t('track.work')}</span>
                  <span className="text-xs font-normal text-gray-500">{t('track.legend.quality')}</span>
                </div>
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                <div className="flex flex-col items-center gap-1">
                  <span>{t('track.discipline')}</span>
                  <span className="text-xs font-normal text-gray-500">{t('track.legend.quality')}</span>
                </div>
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                <div className="flex flex-col items-center gap-1">
                  <span>{t('track.phone')}</span>
                  <span className="text-xs font-normal text-gray-500">{t('track.legend.yesno')}</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, idx) => (
              <tr key={student.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 sticky left-0 z-10 bg-inherit border-r border-gray-200">
                  {student.first_name} {student.last_name}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex gap-1 justify-center">
                    {[
                      { value: 'present', label: t('track.abbr.present'), color: 'bg-green-500' },
                      { value: 'absent', label: t('track.abbr.absent'), color: 'bg-red-500' },
                      { value: 'late', label: t('track.abbr.late'), color: 'bg-yellow-500' },
                      { value: 'excused', label: t('track.abbr.excused'), color: 'bg-blue-500' }
                    ].map(status => (
                      <button
                        key={status.value}
                        onClick={() => updateTracking(student.id, 'presence', status.value)}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                          tracking[student.id]?.presence === status.value
                            ? `${status.color} text-white`
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={t(`track.status.${status.value}`)}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex gap-1 justify-center">
                    {[
                      { value: 'excellent', label: t('track.abbr.excellent'), color: 'bg-green-500' },
                      { value: 'good', label: t('track.abbr.good'), color: 'bg-blue-500' },
                      { value: 'average', label: t('track.abbr.average'), color: 'bg-yellow-500' },
                      { value: 'poor', label: t('track.abbr.poor'), color: 'bg-red-500' }
                    ].map(status => (
                      <button
                        key={status.value}
                        onClick={() => updateTracking(student.id, 'work_status', status.value)}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                          tracking[student.id]?.work_status === status.value
                            ? `${status.color} text-white`
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={t(`track.status.${status.value}`)}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex gap-1 justify-center">
                    {[
                      { value: 'excellent', label: t('track.abbr.excellent'), color: 'bg-green-500' },
                      { value: 'good', label: t('track.abbr.good'), color: 'bg-blue-500' },
                      { value: 'average', label: t('track.abbr.average'), color: 'bg-yellow-500' },
                      { value: 'poor', label: t('track.abbr.poor'), color: 'bg-red-500' }
                    ].map(status => (
                      <button
                        key={status.value}
                        onClick={() => updateTracking(student.id, 'discipline', status.value)}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                          tracking[student.id]?.discipline === status.value
                            ? `${status.color} text-white`
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={t(`track.status.${status.value}`)}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => updateTracking(student.id, 'phone_use', !tracking[student.id]?.phone_use)}
                    className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                      tracking[student.id]?.phone_use
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                    title={t('track.phone')}
                  >
                    {tracking[student.id]?.phone_use ? '✓' : '○'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {t('common.back')}
        </button>
        <button
          onClick={saveTracking}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          Sauvegarder
        </button>
      </div>
    </div>
  );
};

export default SuiviSeance;
