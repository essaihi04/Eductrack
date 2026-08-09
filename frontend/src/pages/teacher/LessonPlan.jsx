import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Edit2, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useI18n } from '../../i18n';

const LessonPlan = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [lessons, setLessons] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingLesson, setEditingLesson] = useState(null);
  const [formData, setFormData] = useState({
    topic: '',
    objectives: '',
    resources: '',
    homework: ''
  });

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const dayLabels = days.map((d) => t(`plan.day.${d}`));

  function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  useEffect(() => {
    fetchLessons();
  }, [weekStart]);

  const fetchLessons = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const weekStartStr = weekStart.toISOString().split('T')[0];
      const res = await fetch(`${apiUrl}/api/teacher/lesson-plan/${classId}?week_start=${weekStartStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      const lessonsMap = {};
      data.forEach(lesson => {
        lessonsMap[lesson.day_of_week] = lesson;
      });
      setLessons(lessonsMap);
    } catch (error) {
      console.error('Error fetching lessons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevWeek = () => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() - 7);
    setWeekStart(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() + 7);
    setWeekStart(newDate);
  };

  const startEditing = (day) => {
    const lesson = lessons[day];
    setEditingLesson(day);
    setFormData({
      topic: lesson?.topic || '',
      objectives: lesson?.objectives || '',
      resources: lesson?.resources || '',
      homework: lesson?.homework || ''
    });
  };

  const saveLesson = async (day) => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const weekStartStr = weekStart.toISOString().split('T')[0];
      const method = lessons[day]?.id ? 'PUT' : 'POST';
      const url = lessons[day]?.id
        ? `${apiUrl}/api/teacher/lesson-plan/${lessons[day].id}`
        : `${apiUrl}/api/teacher/lesson-plan`;

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          class_id: classId,
          day_of_week: day,
          week_start: weekStartStr,
          ...formData
        })
      });

      const savedLesson = await res.json();
      setLessons(prev => ({
        ...prev,
        [day]: savedLesson
      }));
      setEditingLesson(null);
    } catch (error) {
      console.error('Error saving lesson:', error);
    }
  };

  const deleteLesson = async (day) => {
    if (!lessons[day]?.id) return;

    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      await fetch(`${apiUrl}/api/teacher/lesson-plan/${lessons[day].id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setLessons(prev => {
        const newLessons = { ...prev };
        delete newLessons[day];
        return newLessons;
      });
    } catch (error) {
      console.error('Error deleting lesson:', error);
    }
  };

  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 4);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('plan.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('plan.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
        <button
          onClick={handlePrevWeek}
          className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="font-semibold text-gray-900">
            {t('plan.week', { from: weekStart.toLocaleDateString(dateLocale), to: weekEndDate.toLocaleDateString(dateLocale) })}
          </p>
        </div>
        <button
          onClick={handleNextWeek}
          className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {days.map((day, idx) => {
          const dayDate = new Date(weekStart);
          dayDate.setDate(dayDate.getDate() + idx);
          const lesson = lessons[day];
          const isEditing = editingLesson === day;

          return (
            <Card key={day} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{dayLabels[idx]}</CardTitle>
                <CardDescription className="text-xs">
                  {dayDate.toLocaleDateString(dateLocale)}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col">
                {isEditing ? (
                  <div className="space-y-3 flex-1">
                    <div>
                      <label className="text-xs font-medium text-gray-700">{t('plan.theme')}</label>
                      <input
                        type="text"
                        value={formData.topic}
                        onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                        placeholder={t('plan.themePlaceholder')}
                        className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">{t('plan.objectives')}</label>
                      <textarea
                        value={formData.objectives}
                        onChange={(e) => setFormData({ ...formData, objectives: e.target.value })}
                        placeholder={t('plan.objectivesPlaceholder')}
                        className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm resize-none"
                        rows="2"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">{t('plan.resources')}</label>
                      <input
                        type="text"
                        value={formData.resources}
                        onChange={(e) => setFormData({ ...formData, resources: e.target.value })}
                        placeholder={t('plan.resourcesPlaceholder')}
                        className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">{t('plan.homework')}</label>
                      <input
                        type="text"
                        value={formData.homework}
                        onChange={(e) => setFormData({ ...formData, homework: e.target.value })}
                        placeholder={t('plan.homeworkPlaceholder')}
                        className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => saveLesson(day)}
                        className="flex-1 px-2 py-1 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors"
                      >
                        {t('common.save')}
                      </button>
                      <button
                        onClick={() => setEditingLesson(null)}
                        className="flex-1 px-2 py-1 bg-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-400 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {lesson ? (
                      <div className="space-y-2 flex-1">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{lesson.topic}</p>
                          {lesson.objectives && (
                            <p className="text-xs text-gray-600 mt-1">{lesson.objectives}</p>
                          )}
                          {lesson.homework && (
                            <p className="text-xs text-blue-600 mt-2">📝 {lesson.homework}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-xs text-gray-500 text-center">{t('plan.none')}</p>
                      </div>
                    )}
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => startEditing(day)}
                        className="flex-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition-colors flex items-center justify-center gap-1"
                      >
                        <Edit2 className="w-3 h-3" />
                        {t('plan.edit')}
                      </button>
                      {lesson && (
                        <button
                          onClick={() => deleteLesson(day)}
                          className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default LessonPlan;
