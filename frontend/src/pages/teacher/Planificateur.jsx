import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, FileText, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useI18n } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';

const Planificateur = () => {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';

  const [classes, setClasses] = useState([]);
  const [controls, setControls] = useState([]);
  const [calendarControls, setCalendarControls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingControl, setEditingControl] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    class_id: '',
    name: '',
    date: '',
    start_time: '',
    end_time: '',
    description: ''
  });

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchData();
  }, []);

  // Rafraîchir les données quand la page reçoit le focus
  useEffect(() => {
    const handleFocus = () => {
      fetchData();
    };

    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();
    return authSession?.access_token;
  };

  const fetchData = async () => {
    setLoadError('');
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const [classesRes, controlsRes, calendarRes] = await Promise.all([
        fetch(`${apiUrl}/api/teacher/my-classes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/teacher/controls-plan`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/controls-plan-calendar`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const classesData = await classesRes.json();
      const controlsData = await controlsRes.json();
      const calendarData = await calendarRes.json();

      if (!classesRes.ok || !controlsRes.ok || !calendarRes.ok) {
        throw new Error(
          classesData?.error || controlsData?.error || calendarData?.error || t('common.loadError')
        );
      }

      setClasses(Array.isArray(classesData) ? classesData : []);
      setControls(Array.isArray(controlsData) ? controlsData : []);
      setCalendarControls(Array.isArray(calendarData) ? calendarData : []);
    } catch (error) {
      console.error('Erreur:', error);
      setLoadError(error.message || t('common.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'planned':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => (
    ['planned', 'in_progress', 'completed'].includes(status) ? t(`planif.status.${status}`) : status
  );

  const handleEdit = (control) => {
    setEditingControl(control);
    setFormData({
      class_id: control.class_id,
      name: control.name,
      date: control.date,
      start_time: control.start_time || '',
      end_time: control.end_time || '',
      description: control.description || ''
    });
    setShowCreateModal(true);
  };

  const handleDelete = async (controlId) => {
    if (!confirm(t('planif.confirmDelete'))) {
      return;
    }

    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/controls-plan/${controlId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setControls(controls.filter(c => c.id !== controlId));
      } else {
        alert(t('planif.deleteError'));
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert(t('planif.deleteError'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const token = await getAuthToken();
      const endpoint = editingControl 
        ? `${apiUrl}/api/teacher/controls-plan/${editingControl.id}`
        : `${apiUrl}/api/teacher/controls-plan`;

      const method = editingControl ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setShowCreateModal(false);
        setEditingControl(null);
        setFormData({
          class_id: '',
          name: '',
          date: '',
          start_time: '',
          end_time: '',
          description: ''
        });
        fetchData();
      } else {
        alert(t('planif.saveError'));
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert(t('planif.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // Composant CalendarView
  const CalendarView = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [selectedControls, setSelectedControls] = useState([]);

    const getDaysInMonth = (date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDayOfWeek = firstDay.getDay();

      const days = [];
      // Ajouter les jours vides du début
      for (let i = 0; i < startingDayOfWeek; i++) {
        days.push(null);
      }
      // Ajouter tous les jours du mois
      for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i));
      }

      return days;
    };

    const getControlsForDate = (date) => {
      if (!date) return [];
      const dateStr = date.toISOString().split('T')[0];
      return calendarControls.filter(control => control.date === dateStr);
    };

    const handleDateClick = (date, controls) => {
      setSelectedDate(date);
      setSelectedControls(controls);
      setShowModal(true);
    };

    const classColors = [
      { event: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
      { event: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' },
      { event: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
      { event: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500' },
      { event: 'bg-purple-100 text-purple-800 border-purple-200', dot: 'bg-purple-500' },
      { event: 'bg-pink-100 text-pink-800 border-pink-200', dot: 'bg-pink-500' },
      { event: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500' },
      { event: 'bg-orange-100 text-orange-800 border-orange-200', dot: 'bg-orange-500' }
    ];

    const classLegend = Array.from(new Map(
      calendarControls
        .filter(control => control.class_id)
        .map(control => [control.class_id, control])
    ).values()).sort((a, b) => (a.class_name || '').localeCompare(b.class_name || '', dateLocale));
    const classColorIndex = new Map(
      classLegend.map((control, index) => [control.class_id, index % classColors.length])
    );

    const getClassColor = (control) => {
      const key = control.class_id || control.class_name || '';
      if (control.class_id && classColorIndex.has(control.class_id)) {
        return classColors[classColorIndex.get(control.class_id)];
      }
      const hash = key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      return classColors[hash % classColors.length];
    };

    const days = getDaysInMonth(currentDate);
    const monthNames = Array.from({ length: 12 }, (_, i) => t(`planif.month.${i}`));

    return (
      <>
        <Card>
          <CardHeader className="p-3 sm:p-6">
            <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
              <span className="text-base sm:text-lg">{t('planif.calendarTitle')}</span>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded"
                >
                  <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <span className="font-medium text-sm sm:text-base">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </span>
                <button
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded"
                >
                  <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-6">
            {classLegend.length > 0 && (
              <div className="mb-3 rounded-lg bg-gray-50 p-2 sm:p-3">
                <p className="mb-2 text-xs font-medium text-gray-600">{t('planif.classLegend')}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {classLegend.map(control => (
                    <span key={control.class_id} className="flex items-center gap-1.5 text-xs text-gray-700">
                      <span className={`h-2.5 w-2.5 rounded-full ${getClassColor(control).dot}`} />
                      {control.class_name || control.classes?.name || t('planif.unspecified')}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => t(`cal.weekday.${d}`)).map(day => (
                <div key={day} className="text-center text-[10px] sm:text-sm font-medium text-gray-600 p-1 sm:p-2">
                  {day}
                </div>
              ))}
              {days.map((date, index) => {
                const controls = date ? getControlsForDate(date) : [];
                const isToday = date && date.toDateString() === new Date().toDateString();
                const isCurrentMonth = date && date.getMonth() === currentDate.getMonth();
                
                return (
                  <div
                    key={index}
                    onClick={() => date && controls.length > 0 && handleDateClick(date, controls)}
                    className={`
                      min-h-[60px] sm:min-h-[80px] border rounded p-1 sm:p-2 relative
                      ${!date ? 'bg-gray-50' : 'bg-white'}
                      ${isToday ? 'border-blue-500 border-2' : 'border-gray-200'}
                      ${date && controls.length > 0 ? 'cursor-pointer hover:bg-gray-50' : ''}
                      ${!isCurrentMonth && date ? 'text-gray-400' : ''}
                    `}
                  >
                    {date && (
                      <>
                        <div className={`text-[10px] sm:text-sm font-medium mb-0.5 sm:mb-1 ${isToday ? 'text-blue-600' : ''}`}>
                          {date.getDate()}
                        </div>
                        
                        {controls.length > 0 && (
                          <div className="space-y-0.5 sm:space-y-1">
                            {controls.slice(0, 2).map((control, idx) => {
                              const className = control.class_name || control.classes?.name || t('planif.unspecified');
                              const color = getClassColor(control);
                              
                              return (
                                <div
                                  key={idx}
                                  className={`truncate rounded border p-0.5 text-[8px] sm:p-1 sm:text-xs ${color.event}`}
                                  title={`${className} · ${control.name}`}
                                >
                                  <span className="font-semibold">{className}</span> · {control.name}
                                </div>
                              );
                            })}
                            {controls.length > 2 && (
                              <div className="text-[8px] sm:text-xs text-gray-500">
                                +{controls.length - 2}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Modal pour afficher les détails d'une journée */}
        {showModal && selectedDate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-bold">
                  {t('planif.dayControls', { date: selectedDate.toLocaleDateString(dateLocale) })}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1.5 sm:p-2 hover:bg-gray-100 rounded flex-shrink-0"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {selectedControls.length === 0 ? (
                <p className="text-gray-600 text-center py-8">
                  {t('planif.noControlThatDay')}
                </p>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {selectedControls.map(control => (
                    <div key={control.id} className="border rounded-lg p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-base sm:text-lg mb-2 truncate">{control.name}</h3>
                          <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <FileText className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span className="truncate">{control.class_name}</span>
                            </div>
                            {control.start_time && (
                              <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                <span>{control.start_time} {control.end_time ? `- ${control.end_time}` : ''}</span>
                              </div>
                            )}
                            {control.subject_name && (
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{t('planif.subjectLabel')}</span>
                                <span className="truncate">{control.subject_name}</span>
                              </div>
                            )}
                            {control.teacher_name && (
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{t('planif.teacherLabel')}</span>
                                <span className="truncate">{control.teacher_name}</span>
                              </div>
                            )}
                            {control.description && (
                              <p className="text-gray-700 mt-2 line-clamp-2">{control.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap sm:flex-col items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${getStatusColor(control.status)}`}>
                            {getStatusLabel(control.status)}
                          </span>
                          {control.status === 'planned' && control.teacher_id === profile?.id && (
                            <button
                              onClick={() => navigate(`/teacher/rapide?controlId=${control.id}&classId=${control.class_id}&date=${control.date}&name=${encodeURIComponent(control.name)}&description=${encodeURIComponent(control.description || '')}&startTime=${control.start_time || ''}&endTime=${control.end_time || ''}`)}
                              className="px-3 py-1.5 bg-green-600 text-white rounded text-xs sm:text-sm font-medium hover:bg-green-700 transition-colors flex-shrink-0"
                            >
                              {t('planif.start')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto pb-20 md:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-4xl font-bold truncate">{t('planif.title')}</h1>
          <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">{t('planif.subtitle')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/teacher/controls')}
            className="w-full sm:w-auto px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>{t('planif.manageControls')}</span>
          </button>
          <button
            onClick={() => {
              setEditingControl(null);
              setFormData({
                class_id: '',
                name: '',
                date: '',
                start_time: '',
                end_time: '',
                description: ''
              });
              setShowCreateModal(true);
            }}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>{t('planif.newControl')}</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <button type="button" onClick={fetchData} className="font-medium underline">
            {t('common.retry')}
          </button>
        </div>
      )}

      <CalendarView />

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-bold">
                {editingControl ? t('planif.editControl') : t('planif.newControl')}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded flex-shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('planif.classRequired')}
                </label>
                <select
                  value={formData.class_id}
                  onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">{t('planif.pickClass')}</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('planif.nameRequired')}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('planif.dateRequired')}
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('home.startTime')}
                  </label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('home.endTime')}
                  </label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('planif.description')}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? t('common.saving') : (editingControl ? t('common.modify') : t('common.create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Planificateur;
