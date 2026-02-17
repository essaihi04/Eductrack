import { useState, useEffect } from 'react';
import { ChevronLeft, Save, Clock, AlertCircle, CheckSquare, Phone, BookOpen, FileText, AlertTriangle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';

const ControlTracking = () => {
  const { classId, sessionId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [session, setSession] = useState(null);
  const [students, setStudents] = useState([]);
  const [tracking, setTracking] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [trackingInitialized, setTrackingInitialized] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  // Sauvegarde manuelle uniquement (bouton Save)

  const fetchData = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const [sessionRes, studentsRes, trackingRes] = await Promise.all([
        fetch(`${apiUrl}/api/teacher/sessions/${sessionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/teacher/classes/${classId}/students`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/teacher/sessions/${sessionId}/control-tracking`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const sessionData = await sessionRes.json();
      const studentsData = await studentsRes.json();
      const trackingData = await trackingRes.json();

      setSession(sessionData);
      setStudents(Array.isArray(studentsData) ? studentsData : []);

      if (trackingData && trackingData.length > 0) {
        const initialTracking = {};
        trackingData.forEach(item => {
          initialTracking[item.student_id] = {
            id: item.id,
            presence: item.presence || 'present',
            presence_reason: item.presence_reason || '',
            material_status: item.material_status || 'complete',
            missing_materials: item.missing_materials || '',
            phone_use: item.phone_use || false,
            phone_confiscated: item.phone_confiscated || false,
            discipline_status: item.discipline_status || 'good',
            discipline_notes: item.discipline_notes || '',
            copy_submitted: item.copy_submitted || false,
            copy_notes: item.copy_notes || ''
          };
        });
        setTracking(initialTracking);
        setTrackingInitialized(true);
      } else {
        initializeTracking(studentsData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeTracking = async (studentsData) => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const res = await fetch(`${apiUrl}/api/teacher/sessions/${sessionId}/control-tracking/batch`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const initialTracking = {};
        data.data.forEach(item => {
          initialTracking[item.student_id] = {
            id: item.id,
            presence: item.presence || 'present',
            presence_reason: item.presence_reason || '',
            material_status: item.material_status || 'complete',
            missing_materials: item.missing_materials || '',
            phone_use: item.phone_use || false,
            phone_confiscated: item.phone_confiscated || false,
            discipline_status: item.discipline_status || 'good',
            discipline_notes: item.discipline_notes || '',
            copy_submitted: item.copy_submitted || false,
            copy_notes: item.copy_notes || ''
          };
        });
        setTracking(initialTracking);
        setTrackingInitialized(true);
      }
    } catch (error) {
      console.error('Error initializing tracking:', error);
    }
  };

  const saveTracking = async () => {
    try {
      setSaving(true);
      setAutoSaveStatus('Sauvegarde en cours...');

      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      for (const [studentId, data] of Object.entries(tracking)) {
        // Ne pas sauvegarder les données si l'élève est absent ou excusé
        if (data.presence === 'absent' || data.presence === 'excused') {
          continue;
        }

        await fetch(`${apiUrl}/api/teacher/control-tracking`, {
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

  const toggleAllPresence = () => {
    const allPresent = students.length > 0 && students.every(s => tracking[s.id]?.presence === 'present');
    const newValue = allPresent ? null : 'present';
    const updatedTracking = {};
    students.forEach((student) => {
      updatedTracking[student.id] = {
        ...tracking[student.id],
        presence: newValue,
      };
    });
    setTracking(updatedTracking);
  };

  const toggleAllMaterial = () => {
    const allComplete = students.length > 0 && students.every(s => tracking[s.id]?.material_status === 'complete');
    const newValue = allComplete ? null : 'complete';
    const updatedTracking = {};
    students.forEach((student) => {
      updatedTracking[student.id] = {
        ...tracking[student.id],
        material_status: newValue,
      };
    });
    setTracking(updatedTracking);
  };

  const toggleAllDiscipline = () => {
    const allGood = students.length > 0 && students.every(s => tracking[s.id]?.discipline_status === 'good');
    const newValue = allGood ? null : 'good';
    const updatedTracking = {};
    students.forEach((student) => {
      updatedTracking[student.id] = {
        ...tracking[student.id],
        discipline_status: newValue,
      };
    });
    setTracking(updatedTracking);
  };

  const toggleAllCopySubmitted = () => {
    const allSubmitted = students.length > 0 && students.every(s => tracking[s.id]?.copy_submitted === true);
    const newValue = !allSubmitted;
    const updatedTracking = {};
    students.forEach((student) => {
      updatedTracking[student.id] = {
        ...tracking[student.id],
        copy_submitted: newValue,
      };
    });
    setTracking(updatedTracking);
  };

  const PresenceCell = ({ student, trackingData }) => {
    const presenceColors = {
      present: 'bg-green-100 text-green-800 border-green-300',
      absent: 'bg-red-100 text-red-800 border-red-300',
      excused: 'bg-blue-100 text-blue-800 border-blue-300',
      late: 'bg-yellow-100 text-yellow-800 border-yellow-300'
    };

    const presenceEmojis = {
      present: '✅',
      absent: '❌',
      excused: '📝',
      late: '⏰'
    };

    return (
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          {['present', 'absent', 'excused', 'late'].map(status => (
            <button
              key={status}
              onClick={() => updateTracking(student.id, 'presence', status)}
              className={`px-1 py-1 rounded text-xs border-2 transition-all ${
                trackingData.presence === status 
                  ? presenceColors[status] 
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
              title={status === 'present' ? 'Présent' : status === 'absent' ? 'Absent' : status === 'excused' ? 'Excusé' : 'Retard'}
            >
              {presenceEmojis[status]}
            </button>
          ))}
        </div>
        {trackingData.presence === 'absent' || trackingData.presence === 'excused' ? (
          <input
            type="text"
            value={trackingData.presence_reason}
            onChange={(e) => updateTracking(student.id, 'presence_reason', e.target.value)}
            placeholder="Justification"
            className="w-full px-1 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : null}
      </div>
    );
  };

  const MaterialCell = ({ student, trackingData }) => {
    if (trackingData.presence === 'absent' || trackingData.presence === 'excused') {
      return <span className="text-gray-400 text-[10px]">—</span>;
    }

    const materialColors = {
      complete: 'bg-green-100 text-green-800 border-green-300',
      incomplete: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      missing: 'bg-red-100 text-red-800 border-red-300'
    };

    const materialEmojis = {
      complete: '✅',
      incomplete: '⚠️',
      missing: '❌'
    };

    return (
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          {['complete', 'incomplete', 'missing'].map(status => (
            <button
              key={status}
              onClick={() => updateTracking(student.id, 'material_status', status)}
              className={`px-1 py-1 rounded text-xs border-2 transition-all ${
                trackingData.material_status === status 
                  ? materialColors[status] 
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
              title={status === 'complete' ? 'Complet' : status === 'incomplete' ? 'Incomplet' : 'Manquant'}
            >
              {materialEmojis[status]}
            </button>
          ))}
        </div>
        {trackingData.material_status !== 'complete' ? (
          <input
            type="text"
            value={trackingData.missing_materials}
            onChange={(e) => updateTracking(student.id, 'missing_materials', e.target.value)}
            placeholder="Matériel manquant"
            className="w-full px-1 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : null}
      </div>
    );
  };

  const PhoneCell = ({ student, trackingData }) => {
    if (trackingData.presence === 'absent' || trackingData.presence === 'excused') {
      return <span className="text-gray-400 text-[10px]">—</span>;
    }

    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <button
            onClick={() => updateTracking(student.id, 'phone_use', !trackingData.phone_use)}
            className={`px-1 py-1 rounded text-xs border-2 transition-all ${
              trackingData.phone_use 
                ? 'bg-red-100 text-red-800 border-red-300' 
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
            title={trackingData.phone_use ? 'Téléphone utilisé' : 'Téléphone non utilisé'}
          >
            {trackingData.phone_use ? '📱' : '📵'}
          </button>
        </div>
        {trackingData.phone_use && (
          <label className="flex items-center gap-1 text-[10px]">
            <input
              type="checkbox"
              checked={trackingData.phone_confiscated}
              onChange={(e) => updateTracking(student.id, 'phone_confiscated', e.target.checked)}
              className="rounded w-3 h-3"
            />
            🔒 Confisqué
          </label>
        )}
      </div>
    );
  };

  const DisciplineCell = ({ student, trackingData }) => {
    if (trackingData.presence === 'absent' || trackingData.presence === 'excused') {
      return <span className="text-gray-400 text-[10px]">—</span>;
    }

    const disciplineColors = {
      good: 'bg-green-100 text-green-800 border-green-300',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      cheating_attempt: 'bg-orange-100 text-orange-800 border-orange-300',
      cheating_confirmed: 'bg-red-100 text-red-800 border-red-300'
    };

    const disciplineEmojis = {
      good: '✅',
      warning: '⚠️',
      cheating_attempt: '🚨',
      cheating_confirmed: '❌'
    };

    return (
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">
          {['good', 'warning', 'cheating_attempt', 'cheating_confirmed'].map(status => (
            <button
              key={status}
              onClick={() => updateTracking(student.id, 'discipline_status', status)}
              className={`px-1 py-1 rounded text-xs border-2 transition-all ${
                trackingData.discipline_status === status 
                  ? disciplineColors[status] 
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
              title={status === 'good' ? 'Bon' : status === 'warning' ? 'Avertissement' : status === 'cheating_attempt' ? 'Tentative de triche' : 'Triche confirmée'}
            >
              {disciplineEmojis[status]}
            </button>
          ))}
        </div>
        {trackingData.discipline_status !== 'good' && (
          <input
            type="text"
            value={trackingData.discipline_notes}
            onChange={(e) => updateTracking(student.id, 'discipline_notes', e.target.value)}
            placeholder="Notes"
            className="w-full px-1 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
      </div>
    );
  };

  const CopyCell = ({ student, trackingData }) => {
    if (trackingData.presence === 'absent' || trackingData.presence === 'excused') {
      return <span className="text-gray-400 text-[10px]">—</span>;
    }

    return (
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
          <input
            type="checkbox"
            checked={trackingData.copy_submitted}
            onChange={(e) => updateTracking(student.id, 'copy_submitted', e.target.checked)}
            className="rounded w-3 h-3"
          />
          {trackingData.copy_submitted ? '📄' : '📋'} Copie rendue
        </label>
        {trackingData.copy_submitted && (
          <input
            type="text"
            value={trackingData.copy_notes}
            onChange={(e) => updateTracking(student.id, 'copy_notes', e.target.value)}
            placeholder="Notes sur la copie"
            className="w-full px-1 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/teacher/home`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CheckSquare className="w-6 h-6 text-red-600" />
              Suivi de Contrôle
            </h1>
            <p className="text-muted-foreground mt-1">
              {session?.topic || 'Contrôle sans titre'} - {new Date(session?.date).toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>
        {autoSaveStatus && (
          <span className={`text-sm ${autoSaveStatus.includes('✓') ? 'text-green-600' : 'text-red-600'}`}>
            {autoSaveStatus}
          </span>
        )}
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-900">Suivi rapide de contrôle</p>
          <p className="text-sm text-red-800 mt-1">
            Cochez les cases et utilisez les boutons pour suivre rapidement la présence, le matériel, l'utilisation du téléphone, la discipline et la remise des copies.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {(() => {
          const allPresent = students.length > 0 && students.every(s => tracking[s.id]?.presence === 'present');
          return (
            <button
              onClick={toggleAllPresence}
              className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                allPresent ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <span>{allPresent ? '❌' : '✅'}</span> {allPresent ? 'Tout désélectionner' : 'Tout présent'}
            </button>
          );
        })()}
        {(() => {
          const allComplete = students.length > 0 && students.every(s => tracking[s.id]?.material_status === 'complete');
          return (
            <button
              onClick={toggleAllMaterial}
              className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                allComplete ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <span>{allComplete ? '❌' : '✅'}</span> {allComplete ? 'Tout désélectionner' : 'Tout matériel complet'}
            </button>
          );
        })()}
        {(() => {
          const allGood = students.length > 0 && students.every(s => tracking[s.id]?.discipline_status === 'good');
          return (
            <button
              onClick={toggleAllDiscipline}
              className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                allGood ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-yellow-600 text-white hover:bg-yellow-700'
              }`}
            >
              <span>{allGood ? '❌' : '✅'}</span> {allGood ? 'Tout désélectionner' : 'Tout discipline bon'}
            </button>
          );
        })()}
        {(() => {
          const allSubmitted = students.length > 0 && students.every(s => tracking[s.id]?.copy_submitted === true);
          return (
            <button
              onClick={toggleAllCopySubmitted}
              className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                allSubmitted ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              <span>{allSubmitted ? '❌' : '📄'}</span> {allSubmitted ? 'Tout désélectionner' : 'Toutes les copies rendues'}
            </button>
          );
        })()}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-2 py-1 text-left text-[10px] font-bold text-gray-600 uppercase sticky left-0 bg-gray-50 z-10 min-w-[150px]">
                    Élève
                  </th>
                  <th className="px-1 py-1 text-left text-[10px] font-bold text-gray-600 uppercase bg-green-50">
                    ✅ Présence
                  </th>
                  <th className="px-1 py-1 text-left text-[10px] font-bold text-gray-600 uppercase bg-blue-50">
                    ✅ Matériel
                  </th>
                  <th className="px-1 py-1 text-left text-[10px] font-bold text-gray-600 uppercase bg-red-50">
                    📱 Téléphone
                  </th>
                  <th className="px-1 py-1 text-left text-[10px] font-bold text-gray-600 uppercase bg-yellow-50">
                    ⚠️ Discipline
                  </th>
                  <th className="px-1 py-1 text-left text-[10px] font-bold text-gray-600 uppercase bg-purple-50">
                    📄 Copie
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {students.map(student => {
                  const studentTracking = tracking[student.id] || {};
                  const isAbsent = studentTracking.presence === 'absent' || studentTracking.presence === 'excused';
                  return (
                    <tr key={student.id} className={`hover:bg-gray-50 ${isAbsent ? 'bg-gray-100 opacity-50' : ''}`}>
                      <td className="px-2 py-1 sticky left-0 bg-white z-10">
                        <div>
                          <p className="font-medium text-gray-900 text-xs">{student.first_name} {student.last_name}</p>
                        </div>
                      </td>
                      <td className="px-1 py-1">
                        <PresenceCell student={student} trackingData={studentTracking} />
                      </td>
                      <td className="px-1 py-1">
                        <MaterialCell student={student} trackingData={studentTracking} />
                      </td>
                      <td className="px-1 py-1">
                        <PhoneCell student={student} trackingData={studentTracking} />
                      </td>
                      <td className="px-1 py-1">
                        <DisciplineCell student={student} trackingData={studentTracking} />
                      </td>
                      <td className="px-1 py-1">
                        <CopyCell student={student} trackingData={studentTracking} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    saving ? 'bg-blue-600' : autoSaveStatus.includes('✓') ? 'bg-green-600' : 'bg-gray-400'
                  }`}
                  style={{ width: saving ? '50%' : autoSaveStatus.includes('✓') ? '100%' : '0%' }}
                ></div>
              </div>
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
                {saving ? 'Sauvegarde en cours...' : autoSaveStatus || 'Prêt à sauvegarder'}
              </span>
            </div>
          </div>
          <button
            onClick={saveTracking}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Sauvegarde...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ControlTracking;
