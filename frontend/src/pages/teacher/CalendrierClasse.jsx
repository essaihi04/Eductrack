import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, Edit2, Trash2, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useI18n } from '../../i18n';

const CalendrierClasse = () => {
  const { t, lang } = useI18n();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const [classes, setClasses] = useState([]);
  const [controls, setControls] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchData();
  }, [selectedClass, currentMonth]);

  const fetchData = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      if (!selectedClass) {
        const classesRes = await fetch(`${apiUrl}/api/teacher/my-classes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const classesData = await classesRes.json();
        setClasses(Array.isArray(classesData) ? classesData : []);
        if (classesData.length > 0) {
          setSelectedClass(classesData[0].id);
        }
      } else {
        const controlsRes = await fetch(`${apiUrl}/api/controls-plan/class/${selectedClass}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const controlsData = await controlsRes.json();
        setControls(Array.isArray(controlsData) ? controlsData : []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const getControlsForDay = (day) => {
    if (!day) return [];
    const dateStr = day.toISOString().split('T')[0];
    return controls.filter(control => {
      const controlDate = new Date(control.date).toISOString().split('T')[0];
      return controlDate === dateStr;
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'planned': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusLabel = (status) => (
    ['planned', 'in_progress', 'completed', 'cancelled'].includes(status)
      ? t(`cal.status.${status}`)
      : status
  );

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const filteredControls = controls.filter(control => {
    if (selectedFilter === 'all') return true;
    return control.status === selectedFilter;
  });

  if (loading) {
    return <div className="flex items-center justify-center h-screen">{t('common.loading')}</div>;
  }

  const days = getDaysInMonth(currentMonth);
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((d) => t(`cal.weekday.${d}`));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold">{t('cal.title')}</h1>
        <p className="text-muted-foreground mt-2">{t('cal.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('cal.filters')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('common.class')}</label>
              <select
                value={selectedClass || ''}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} - {cls.level}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('cal.status')}</label>
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="all">{t('cal.filter.all')}</option>
                <option value="planned">{t('cal.filter.planned')}</option>
                <option value="in_progress">{t('cal.filter.inProgress')}</option>
                <option value="completed">{t('cal.filter.completed')}</option>
                <option value="cancelled">{t('cal.filter.cancelled')}</option>
              </select>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-medium mb-3">{t('cal.legend')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
                  <span>{t('cal.status.planned')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></div>
                  <span>{t('cal.status.in_progress')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
                  <span>{t('cal.status.completed')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
                  <span>{t('cal.status.cancelled')}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {currentMonth.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })}
                </CardTitle>
                <CardDescription>
                  {selectedClass ? classes.find(c => c.id === selectedClass)?.name : t('cal.pickClass')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={previousMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date())}
                  className="px-3 py-2 text-sm font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {t('cal.today')}
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(day => (
                <div key={day} className="text-center font-medium text-sm text-gray-600 py-2">
                  {day}
                </div>
              ))}
              {days.map((day, index) => {
                const dayControls = getControlsForDay(day);
                const isToday = day && day.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={index}
                    className={`min-h-24 p-2 border border-gray-200 rounded-lg ${
                      isToday ? 'bg-blue-50 border-blue-300' : 'bg-white'
                    }`}
                  >
                    {day && (
                      <>
                        <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : ''}`}>
                          {day.getDate()}
                        </div>
                        <div className="space-y-1">
                          {dayControls.map(control => (
                            <div
                              key={control.id}
                              className={`p-1.5 rounded text-xs border ${getStatusColor(control.status)}`}
                              title={`${control.name} - ${control.start_time || ''}`}
                            >
                              <div className="font-medium truncate">{control.name}</div>
                              {control.start_time && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Clock className="w-3 h-3" />
                                  {control.start_time}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('cal.listTitle')}</CardTitle>
          <CardDescription>
            {selectedClass ? classes.find(c => c.id === selectedClass)?.name : t('cal.allClasses')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredControls.length === 0 ? (
            <div className="text-center py-8">
              <CalendarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">{t('cal.empty')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredControls.map(control => (
                <div
                  key={control.id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{control.name}</h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(control.status)}`}>
                          {getStatusLabel(control.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="w-4 h-4" />
                          {new Date(control.date).toLocaleDateString(dateLocale)}
                        </div>
                        {control.start_time && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {control.start_time} {control.end_time ? `- ${control.end_time}` : ''}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{t('cal.teacherAbbr')}</span>
                          {control.first_name} {control.last_name}
                        </div>
                      </div>
                      {control.description && (
                        <p className="text-sm text-gray-700">{control.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CalendrierClasse;
