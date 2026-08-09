import { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Trash2, CheckCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useT } from '../../i18n';

const CompetencyLevel = ({ level, onChange }) => {
  const t = useT();
  const levels = [
    { value: 'not_acquired', label: t('mini.notAcquired'), color: 'bg-red-100 text-red-800' },
    { value: 'in_progress', label: t('mini.inProgress'), color: 'bg-yellow-100 text-yellow-800' },
    { value: 'acquired', label: t('mini.acquired'), color: 'bg-blue-100 text-blue-800' },
    { value: 'mastered', label: t('mini.mastered'), color: 'bg-green-100 text-green-800' }
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {levels.map(l => (
        <button
          key={l.value}
          onClick={() => onChange(l.value)}
          className={`px-3 py-1 rounded text-sm font-medium transition-all border-2 ${
            level === l.value
              ? `${l.color} border-current`
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
};

const MiniAssessments = () => {
  const { classId, sessionId } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const [students, setStudents] = useState([]);
  const [competencies, setCompetencies] = useState([]);
  const [assessments, setAssessments] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedStudent, setExpandedStudent] = useState(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchData();
  }, [sessionId]);

  const fetchData = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const [studentsRes, competenciesRes] = await Promise.all([
        fetch(`${apiUrl}/api/teacher/classes/${classId}/students`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/teacher/competencies`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const studentsData = await studentsRes.json();
      const competenciesData = await competenciesRes.json();

      setStudents(Array.isArray(studentsData) ? studentsData : []);
      setCompetencies(Array.isArray(competenciesData) ? competenciesData : []);

      // Initialiser les évaluations
      const initialAssessments = {};
      studentsData.forEach(student => {
        initialAssessments[student.id] = {
          assessed: false,
          competencies: {}
        };
      });
      setAssessments(initialAssessments);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAssessed = (studentId) => {
    setAssessments(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        assessed: !prev[studentId].assessed
      }
    }));
  };

  const updateCompetency = (studentId, competencyId, level) => {
    setAssessments(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        competencies: {
          ...prev[studentId].competencies,
          [competencyId]: level
        }
      }
    }));
  };

  const saveAssessments = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      for (const [studentId, data] of Object.entries(assessments)) {
        if (data.assessed) {
          await fetch(`${apiUrl}/api/teacher/mini-assessments`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              session_id: sessionId,
              student_id: studentId,
              competencies: data.competencies
            })
          });
        }
      }

      navigate(-1);
    } catch (error) {
      console.error('Error saving assessments:', error);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">{t('common.loading')}</div>;
  }

  const assessedCount = Object.values(assessments).filter(a => a.assessed).length;

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
            <h1 className="text-3xl font-bold">{t('mini.title')}</h1>
            <p className="text-muted-foreground mt-1">{t('mini.progress', { done: assessedCount, total: students.length })}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {students.map(student => (
          <Card key={student.id}>
            <div
              className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAssessed(student.id);
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      assessments[student.id]?.assessed
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {student.first_name} {student.last_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {assessments[student.id]?.assessed ? t('mini.assessed') : t('mini.notAssessed')}
                    </p>
                  </div>
                </div>
                <div className="text-gray-400">
                  {expandedStudent === student.id ? '▼' : '▶'}
                </div>
              </div>
            </div>

            {expandedStudent === student.id && assessments[student.id]?.assessed && (
              <CardContent className="pt-0 border-t border-gray-200">
                <div className="space-y-4 mt-4">
                  {competencies.map(comp => (
                    <div key={comp.id}>
                      <label className="text-sm font-medium text-gray-900 block mb-2">
                        {comp.name}
                      </label>
                      <CompetencyLevel
                        level={assessments[student.id]?.competencies[comp.id]}
                        onChange={(level) => updateCompetency(student.id, comp.id, level)}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={saveAssessments}
          disabled={assessedCount === 0}
          className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );
};

export default MiniAssessments;
