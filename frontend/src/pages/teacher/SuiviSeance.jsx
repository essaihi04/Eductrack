import { useState, useEffect } from 'react';
import { ChevronLeft, Save, AlertCircle, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';

const SuiviSeance = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
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
      setAutoSaveStatus('Sauvegarde en cours...');

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

      setAutoSaveStatus('✓ Sauvegardé');
      setTimeout(() => setAutoSaveStatus(''), 2000);
    } catch (error) {
      console.error('Erreur de sauvegarde:', error);
      setAutoSaveStatus('✗ Erreur de sauvegarde');
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
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  const selectedClassData = classes.find(c => c.id === selectedClass);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Suivi de Séance</h1>
          <p className="text-muted-foreground mt-1">Enregistrez la présence, le travail, la discipline et l'usage du téléphone</p>
        </div>
        <div className="text-right">
          {autoSaveStatus && (
            <p className={`text-sm font-medium ${autoSaveStatus.includes('✓') ? 'text-green-600' : 'text-blue-600'}`}>
              {autoSaveStatus}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">Sauvegarde automatique</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Classe</label>
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
          <label className="text-sm font-medium text-gray-700">Date</label>
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
            Sauvegarder
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-900">Conseil</p>
          <p className="text-sm text-blue-800 mt-1">Cliquez sur les boutons pour changer le statut. Sauvegarde automatique toutes les 2 secondes.</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-300">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 sticky left-0 bg-gray-100 z-10">
                Élève
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                <div className="flex flex-col items-center gap-1">
                  <span>Présence</span>
                  <span className="text-xs font-normal text-gray-500">P/A/R/E</span>
                </div>
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                <div className="flex flex-col items-center gap-1">
                  <span>Travail</span>
                  <span className="text-xs font-normal text-gray-500">E/B/M/P</span>
                </div>
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                <div className="flex flex-col items-center gap-1">
                  <span>Discipline</span>
                  <span className="text-xs font-normal text-gray-500">E/B/M/P</span>
                </div>
              </th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                <div className="flex flex-col items-center gap-1">
                  <span>Téléphone</span>
                  <span className="text-xs font-normal text-gray-500">O/N</span>
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
                      { value: 'present', label: 'P', color: 'bg-green-500' },
                      { value: 'absent', label: 'A', color: 'bg-red-500' },
                      { value: 'late', label: 'R', color: 'bg-yellow-500' },
                      { value: 'excused', label: 'E', color: 'bg-blue-500' }
                    ].map(status => (
                      <button
                        key={status.value}
                        onClick={() => updateTracking(student.id, 'presence', status.value)}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                          tracking[student.id]?.presence === status.value
                            ? `${status.color} text-white`
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={status.value}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex gap-1 justify-center">
                    {[
                      { value: 'excellent', label: 'E', color: 'bg-green-500' },
                      { value: 'good', label: 'B', color: 'bg-blue-500' },
                      { value: 'average', label: 'M', color: 'bg-yellow-500' },
                      { value: 'poor', label: 'P', color: 'bg-red-500' }
                    ].map(status => (
                      <button
                        key={status.value}
                        onClick={() => updateTracking(student.id, 'work_status', status.value)}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                          tracking[student.id]?.work_status === status.value
                            ? `${status.color} text-white`
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={status.value}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex gap-1 justify-center">
                    {[
                      { value: 'excellent', label: 'E', color: 'bg-green-500' },
                      { value: 'good', label: 'B', color: 'bg-blue-500' },
                      { value: 'average', label: 'M', color: 'bg-yellow-500' },
                      { value: 'poor', label: 'P', color: 'bg-red-500' }
                    ].map(status => (
                      <button
                        key={status.value}
                        onClick={() => updateTracking(student.id, 'discipline', status.value)}
                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${
                          tracking[student.id]?.discipline === status.value
                            ? `${status.color} text-white`
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                        title={status.value}
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
                    title="Téléphone"
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
          Retour
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
