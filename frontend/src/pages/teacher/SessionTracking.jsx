import { useState, useEffect } from 'react';
import { ChevronLeft, Save, Clock, AlertCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useT } from '../../i18n';

const StatusButton = ({ value, onChange, options, label }) => {
  const t = useT();
  const colors = {
    present: 'bg-green-100 text-green-800 border-green-300',
    absent: 'bg-red-100 text-red-800 border-red-300',
    late: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    excellent: 'bg-green-100 text-green-800 border-green-300',
    good: 'bg-blue-100 text-blue-800 border-blue-300',
    average: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    poor: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex gap-1 flex-wrap">
        {options.map(option => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`px-3 py-1 rounded text-sm font-medium border-2 transition-all ${
              value === option ? colors[option] : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {t(`track.status.${option}`)}
          </button>
        ))}
      </div>
    </div>
  );
};

const SessionTracking = () => {
  const { classId, sessionId } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const [session, setSession] = useState(null);
  const [students, setStudents] = useState([]);
  const [tracking, setTracking] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (Object.keys(tracking).length > 0) {
        saveTracking();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [tracking]);

  const fetchData = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const [sessionRes, studentsRes] = await Promise.all([
        fetch(`${apiUrl}/api/teacher/sessions/${sessionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/teacher/classes/${classId}/students`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const sessionData = await sessionRes.json();
      const studentsData = await studentsRes.json();

      setSession(sessionData);
      setStudents(Array.isArray(studentsData) ? studentsData : []);

      // Initialiser le tracking
      const initialTracking = {};
      studentsData.forEach(student => {
        initialTracking[student.id] = {
          presence: 'present',
          work_status: 'good',
          discipline: 'good',
          phone_use: false
        };
      });
      setTracking(initialTracking);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveTracking = async () => {
    try {
      setSaving(true);
      setAutoSaveStatus(t('track.saving'));

      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

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
      console.error('Error saving tracking:', error);
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

  if (loading) {
    return <div className="flex items-center justify-center h-screen">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold">{t('track.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('track.subtitle', { topic: session?.topic || t('track.session'), n: students.length })}
            </p>
          </div>
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

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-900">{t('track.tip')}</p>
          <p className="text-sm text-blue-800 mt-1">{t('track.tipText')}</p>
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
                    {['present', 'absent', 'late', 'excused'].map(status => (
                      <button
                        key={status}
                        onClick={() => updateTracking(student.id, 'presence', status)}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                          tracking[student.id]?.presence === status
                            ? status === 'present' ? 'bg-green-500 text-white' :
                              status === 'absent' ? 'bg-red-500 text-white' :
                              status === 'late' ? 'bg-yellow-500 text-white' :
                              'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={t(`track.status.${status}`)}
                      >
                        {t(`track.abbr.${status}`)}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex gap-1 justify-center">
                    {['excellent', 'good', 'average', 'poor'].map(status => (
                      <button
                        key={status}
                        onClick={() => updateTracking(student.id, 'work_status', status)}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                          tracking[student.id]?.work_status === status
                            ? status === 'excellent' ? 'bg-green-500 text-white' :
                              status === 'good' ? 'bg-blue-500 text-white' :
                              status === 'average' ? 'bg-yellow-500 text-white' :
                              'bg-red-500 text-white'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={t(`track.status.${status}`)}
                      >
                        {t(`track.abbr.${status}`)}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex gap-1 justify-center">
                    {['excellent', 'good', 'average', 'poor'].map(status => (
                      <button
                        key={status}
                        onClick={() => updateTracking(student.id, 'discipline', status)}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                          tracking[student.id]?.discipline === status
                            ? status === 'excellent' ? 'bg-green-500 text-white' :
                              status === 'good' ? 'bg-blue-500 text-white' :
                              status === 'average' ? 'bg-yellow-500 text-white' :
                              'bg-red-500 text-white'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={t(`track.status.${status}`)}
                      >
                        {t(`track.abbr.${status}`)}
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
          {t('common.save')}
        </button>
      </div>
    </div>
  );
};

export default SessionTracking;
