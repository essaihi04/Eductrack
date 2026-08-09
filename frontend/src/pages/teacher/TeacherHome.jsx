import { useState, useEffect } from 'react';
import { Plus, Clock, BookOpen, BarChart3, CheckSquare, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';

const TeacherHome = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const t = useT();
  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sessionType, setSessionType] = useState('normal');
  const [sessionTopic, setSessionTopic] = useState('');
  const [sessionStartTime, setSessionStartTime] = useState('');
  const [sessionEndTime, setSessionEndTime] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [sessionFilter, setSessionFilter] = useState('all');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const [classesRes, subjectsRes] = await Promise.all([
        fetch(`${apiUrl}/api/teacher/my-classes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/teacher/my-subjects`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const classesData = await classesRes.json();
      const subjectsData = await subjectsRes.json();
      setClasses(Array.isArray(classesData) ? classesData : []);
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);

      if (classesData.length > 0) {
        setSelectedClass(classesData[0].id);
        fetchSessions(classesData[0].id, token);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async (classId, token) => {
    try {
      const res = await fetch(`${apiUrl}/api/teacher/classes/${classId}/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const handleClassChange = async (classId) => {
    setSelectedClass(classId);
    const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    const token = authSession?.access_token;
    fetchSessions(classId, token);
  };

  const createSession = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const today = new Date().toISOString().split('T')[0];

      const res = await fetch(`${apiUrl}/api/teacher/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          class_id: selectedClass,
          date: today,
          type: sessionType,
          topic: sessionTopic,
          subject_id: selectedSubject,
          start_time: sessionStartTime,
          end_time: sessionEndTime
        })
      });

      const newSession = await res.json();
      setShowCreateModal(false);
      setSessionTopic('');
      setSessionStartTime('');
      setSessionEndTime('');
      setSelectedSubject('');
      setSessionType('normal');
      
      if (sessionType === 'control') {
        navigate(`/teacher/control/${selectedClass}/${newSession.id}`);
      } else {
        navigate(`/teacher/session/${selectedClass}/${newSession.id}`);
      }
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const openCreateModal = () => {
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setSessionTopic('');
    setSessionStartTime('');
    setSessionEndTime('');
    setSelectedSubject('');
    setSessionType('normal');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">{t('common.loading')}</div>;
  }

  const selectedClassData = classes.find(c => c.id === selectedClass);
  const todaySessions = sessions.filter(s => s.date === new Date().toISOString().split('T')[0]);
  const todayNormalSessions = todaySessions.filter(s => s.type === 'normal' || !s.type);
  const todayControlSessions = todaySessions.filter(s => s.type === 'control');

  return (
    <div className="space-y-4 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-4xl font-bold">{t('home.welcome', { name: profile.first_name })}</h1>
        <p className="text-muted-foreground mt-2">{t('home.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('home.pickClass')}</CardTitle>
            <CardDescription>{t('home.pickClassHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {classes.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => handleClassChange(cls.id)}
                  className={`p-4 rounded-lg border-2 transition-all text-start ${
                    selectedClass === cls.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{cls.name}</p>
                  <p className="text-sm text-gray-600 mt-1">{cls.level} - {cls.academic_year}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('home.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              onClick={openCreateModal}
              disabled={!selectedClass}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
              {t('home.newSession')}
            </button>
            <button
              onClick={() => navigate(`/teacher/planificateur`)}
              className="w-full px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <CheckSquare className="w-5 h-5" />
              {t('home.planner')}
            </button>
          </CardContent>
        </Card>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-900">{t('home.newFeatures')}</p>
          <p className="text-sm text-blue-800 mt-1">
            {t('home.newFeaturesText')}
          </p>
        </div>
      </div>

      {selectedClassData && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('home.todaySessions')}</CardTitle>
                  <CardDescription>{selectedClassData.name}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSessionFilter('all')}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      sessionFilter === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {t('home.filterAll')}
                  </button>
                  <button
                    onClick={() => setSessionFilter('normal')}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      sessionFilter === 'normal'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {t('home.filterNormal')}
                  </button>
                  <button
                    onClick={() => setSessionFilter('control')}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      sessionFilter === 'control'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {t('home.filterControl')}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {todaySessions.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">{t('home.noSessionToday')}</p>
                  <button
                    onClick={openCreateModal}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    {t('home.createSession')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {todaySessions
                    .filter(session => {
                      if (sessionFilter === 'all') return true;
                      if (sessionFilter === 'normal') return session.type === 'normal' || !session.type;
                      if (sessionFilter === 'control') return session.type === 'control';
                      return true;
                    })
                    .map(session => (
                    <div
                      key={session.id}
                      className={`p-4 border-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer ${
                        session.type === 'control'
                          ? 'border-red-200 bg-red-50 hover:bg-red-100'
                          : 'border-gray-200'
                      }`}
                      onClick={() => {
                        if (session.type === 'control') {
                          navigate(`/teacher/control/${selectedClass}/${session.id}`);
                        } else {
                          navigate(`/teacher/session/${selectedClass}/${session.id}`);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {session.type === 'control' ? (
                            <CheckSquare className="w-5 h-5 text-red-600" />
                          ) : (
                            <BookOpen className="w-5 h-5 text-blue-600" />
                          )}
                          <div>
                            <p className="font-semibold text-gray-900">
                              {session.topic || (session.type === 'control' ? t('home.control') : t('home.untitledSession'))}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {session.start_time && `${session.start_time} - ${session.end_time}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${
                            session.type === 'control' ? 'text-red-600' : 'text-blue-600'
                          }`}>
                            {session.type === 'control' ? t('home.track') : t('home.continue')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('home.lastSessions')}</CardTitle>
              <CardDescription>{t('home.sessionsHistory')}</CardDescription>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-gray-600 text-center py-8">{t('home.noSession')}</p>
              ) : (
                <div className="space-y-2">
                  {sessions.slice(0, 5).map(session => (
                    <div
                      key={session.id}
                      className={`p-3 border-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-between ${
                        session.type === 'control'
                          ? 'border-red-200 bg-red-50 hover:bg-red-100'
                          : 'border-gray-200'
                      }`}
                      onClick={() => {
                        if (session.type === 'control') {
                          navigate(`/teacher/control/${selectedClass}/${session.id}`);
                        } else {
                          navigate(`/teacher/session/${selectedClass}/${session.id}`);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {session.type === 'control' ? (
                          <CheckSquare className="w-4 h-4 text-red-600" />
                        ) : (
                          <BookOpen className="w-4 h-4 text-gray-400" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {session.topic || (session.type === 'control' ? t('home.control') : t('home.session'))}
                          </p>
                          <p className="text-xs text-gray-600">{session.date}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">{t('home.createModalTitle')}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('home.sessionType')}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSessionType('normal')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      sessionType === 'normal'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <BookOpen className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                      <p className="font-medium">{t('home.normalSession')}</p>
                      <p className="text-xs text-gray-600 mt-1">{t('home.standardCourse')}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setSessionType('control')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      sessionType === 'control'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <CheckSquare className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                      <p className="font-medium">{t('home.control')}</p>
                      <p className="text-xs text-gray-600 mt-1">{t('home.examEvaluation')}</p>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('home.topic')}</label>
                <input
                  type="text"
                  value={sessionTopic}
                  onChange={(e) => setSessionTopic(e.target.value)}
                  placeholder={t('home.topicPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('common.subject')}</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('home.pickSubject')}</option>
                  {subjects.map(subject => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('home.startTime')}</label>
                  <input
                    type="time"
                    value={sessionStartTime}
                    onChange={(e) => setSessionStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('home.endTime')}</label>
                  <input
                    type="time"
                    value={sessionEndTime}
                    onChange={(e) => setSessionEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeCreateModal}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={createSession}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherHome;
