import { useState, useEffect } from 'react';
import { Plus, BookOpen, Calendar, Users, Trash2, Edit2, X, PieChart, Target, TrendingUp, Clock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useI18n } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { useSearchParams } from 'react-router-dom';
import TaskModal from '../../components/ui/TaskModal';

const Devoirs = () => {
  const { t, lang } = useI18n();
  const [searchParams] = useSearchParams();
  const requestedAction = searchParams.get('action');
  const requestedClassId = searchParams.get('classId') || '';
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const [classes, setClasses] = useState([]);
  const [homework, setHomework] = useState([]);
  const [students, setStudents] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingHomework, setEditingHomework] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // toast: { type: 'success' | 'error', message: string } | null
  const [toast, setToast] = useState(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'exercice',
    classId: '',
    targetType: 'all',
    studentIds: [],
    dueDate: ''
  });

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchClasses();
    fetchHomework();
  }, []);

  useEffect(() => {
    if (requestedAction !== 'create') return;
    setEditingHomework(null);
    setFormData((previous) => ({
      ...previous,
      classId: requestedClassId || previous.classId,
    }));
    setShowForm(true);
  }, [requestedAction, requestedClassId]);

  useEffect(() => {
    if (formData.classId) {
      fetchStudents(formData.classId);
    }
  }, [formData.classId]);

  const fetchClasses = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/teacher/my-classes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setClasses(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchHomework = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/teacher/homework`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setHomework(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching homework:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async (classId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/teacher/classes/${classId}/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'classId' ? { studentIds: [] } : {}),
    }));
  };

  const toggleStudentSelection = (studentId) => {
    setFormData(prev => {
      const newStudentIds = prev.studentIds.includes(studentId)
        ? prev.studentIds.filter(id => id !== studentId)
        : [...prev.studentIds, studentId];
      return { ...prev, studentIds: newStudentIds };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return; // anti double-clic
    setSubmitting(true);
    setToast(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const method = editingHomework ? 'PUT' : 'POST';
      const url = editingHomework
        ? `${apiUrl}/api/teacher/homework/${editingHomework.id}`
        : `${apiUrl}/api/teacher/homework`;

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          type: formData.type,
          classId: formData.classId,
          targetType: formData.targetType,
          studentIds: formData.targetType === 'group' ? formData.studentIds : [],
          dueDate: formData.dueDate
        })
      });

      if (res.ok) {
        const wasEdit = !!editingHomework;
        const targetCount = formData.targetType === 'group'
          ? formData.studentIds.length
          : (students.length || null);
        await fetchHomework();
        resetForm();
        setToast({
          type: 'success',
          message: wasEdit
            ? t('hw.toast.updated')
            : (targetCount ? t('hw.toast.sentTo', { n: targetCount }) : t('hw.toast.sent')),
        });
      } else {
        let detail = '';
        try { const j = await res.json(); detail = j?.error || j?.message || ''; } catch {}
        setToast({
          type: 'error',
          message: detail ? t('hw.toast.failedDetail', { detail }) : t('hw.toast.failed'),
        });
      }
    } catch (error) {
      console.error('Error saving homework:', error);
      setToast({
        type: 'error',
        message: t('hw.toast.network', { message: error.message || t('hw.toast.networkFallback') }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-dismiss du toast après 4s (succès) ou 6s (erreur)
  useEffect(() => {
    if (!toast) return;
    const ms = toast.type === 'success' ? 4000 : 6000;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast]);

  const handleEdit = (homework) => {
    setEditingHomework(homework);
    setFormData({
      title: homework.title,
      description: homework.description || '',
      type: homework.type,
      classId: homework.class_id,
      targetType: homework.target_type,
      studentIds: homework.homework_students?.map(hs => hs.student_id) || [],
      dueDate: homework.due_date
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm(t('hw.confirmDelete'))) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/teacher/homework/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setHomework(homework.filter(h => h.id !== id));
      }
    } catch (error) {
      console.error('Error deleting homework:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'exercice',
      classId: '',
      targetType: 'all',
      studentIds: [],
      dueDate: ''
    });
    setEditingHomework(null);
    setShowForm(false);
    setStudents([]);
  };

  const getTypeIcon = (type) => {
    const icons = {
      exercice: '📝',
      revision: '📚',
      projet: '🎯',
      recherche: '🔍',
      presentation: '🎤'
    };
    return icons[type] || '📄';
  };

  const getTypeLabel = (type) => (
    ['exercice', 'revision', 'projet', 'recherche', 'presentation'].includes(type)
      ? t(`hw.type.${type}`)
      : type
  );

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date();
  };

  const getHomeworkStatus = (hw) => {
    const assigned = hw.assigned_count || 0;
    const submitted = hw.submitted_count || 0;

    if (assigned === 0) return 'pending';
    if (submitted === 0) return 'pending';
    if (submitted >= assigned) return 'submitted';
    return 'partial';
  };

  const totalAssigned = homework.reduce((sum, hw) => sum + (hw.assigned_count || 0), 0);
  const totalSubmitted = homework.reduce((sum, hw) => sum + (hw.submitted_count || 0), 0);
  const totalPending = homework.reduce((sum, hw) => sum + (hw.pending_count || 0), 0);
  const averageSubmissionRate = totalAssigned > 0 ? Math.round((totalSubmitted / totalAssigned) * 100) : 0;
  const classStats = homework.reduce((acc, hw) => {
    if (!acc[hw.class_id]) {
      acc[hw.class_id] = {
        name: hw.classes?.name || t('hw.unknownClass'),
        assigned: 0,
        submitted: 0
      };
    }
    acc[hw.class_id].assigned += hw.assigned_count || 0;
    acc[hw.class_id].submitted += hw.submitted_count || 0;
    return acc;
  }, {});
  const bestClass = Object.values(classStats).reduce((best, cls) => {
    const rate = cls.assigned > 0 ? Math.round((cls.submitted / cls.assigned) * 100) : 0;
    if (!best || rate > best.rate) {
      return { ...cls, rate };
    }
    return best;
  }, null);
  const nextDeadlines = [...homework]
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 4);
  const filteredHomework = homework.filter(hw => {
    if (statusFilter === 'all') return true;
    return getHomeworkStatus(hw) === statusFilter;
  });
  const filterOptions = [
    { key: 'all', label: t('hw.filter.all'), count: homework.length },
    { key: 'submitted', label: t('hw.filter.submitted'), count: homework.filter(hw => getHomeworkStatus(hw) === 'submitted').length },
    { key: 'partial', label: t('hw.filter.partial'), count: homework.filter(hw => getHomeworkStatus(hw) === 'partial').length },
    { key: 'pending', label: t('hw.filter.pending'), count: homework.filter(hw => getHomeworkStatus(hw) === 'pending').length }
  ];

  if (loading) {
    return <div className="p-8">{t('common.loading')}</div>;
  }

  return (
    <div className="p-8 space-y-6">
      {/* Toast feedback (succès / erreur) */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] animate-in slide-in-from-top-4">
          <div
            className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border min-w-[280px] max-w-md ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {toast.type === 'success'
              ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
              : <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />}
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-current opacity-60 hover:opacity-100"
              aria-label={t('hw.close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Animation barre de progression indetermine */}
      <style>{`
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('hw.title')}</h1>
          <p className="text-muted-foreground mt-2">{t('hw.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          {t('hw.give')}
        </button>
      </div>

      {homework.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-indigo-600 to-indigo-500 text-white">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span>{t('hw.totalAssigned')}</span>
                  <PieChart className="w-5 h-5 opacity-80" />
                </div>
                <p className="text-3xl font-bold">{totalAssigned}</p>
                <p className="text-xs text-indigo-100">{t('hw.allHomework')}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-600 to-emerald-500 text-white">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span>{t('hw.submissions')}</span>
                  <TrendingUp className="w-5 h-5 opacity-80" />
                </div>
                <p className="text-3xl font-bold">{totalSubmitted}</p>
                <p className="text-xs text-emerald-100">{t('hw.submittedRate', { n: averageSubmissionRate })}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span>{t('hw.pending')}</span>
                  <Clock className="w-5 h-5 opacity-80" />
                </div>
                <p className="text-3xl font-bold">{totalPending}</p>
                <p className="text-xs text-amber-100">{t('hw.toFollowUp')}</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-slate-600">
                  <Target className="w-4 h-4" />
                  <span className="text-sm font-semibold">{t('hw.bestClass')}</span>
                </div>
                {bestClass ? (
                  <>
                    <p className="text-lg font-semibold">{bestClass.name}</p>
                    <p className="text-sm text-slate-500">
                      {t('hw.bestClassRate', { rate: bestClass.rate, submitted: bestClass.submitted, assigned: bestClass.assigned || 0 })}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">{t('hw.noData')}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('hw.progressTitle')}</CardTitle>
              <CardDescription>{t('hw.progressSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {nextDeadlines.map(hw => {
                const rate = hw.submission_rate || 0;
                return (
                  <div key={hw.id}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{hw.title}</p>
                        <p className="text-xs text-gray-500">
                          {t('hw.dueOn', {
                            date: new Date(hw.due_date).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }),
                            submitted: hw.submitted_count,
                            assigned: hw.assigned_count || 0,
                          })}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold ${rate >= 70 ? 'text-emerald-600' : rate >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {rate}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                        style={{ width: `${Math.min(rate, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {nextDeadlines.length === 0 && (
                <p className="text-sm text-gray-500">{t('hw.nonePlanned')}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <TaskModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleSubmit}
        busy={submitting}
        title={editingHomework ? t('hw.editTitle') : t('hw.newTitle')}
        subtitle={t('hw.formSubtitle')}
        closeLabel={t('hw.close')}
        maxWidth="max-w-4xl"
        footer={(
          <>
            <button
              type="button"
              onClick={resetForm}
              disabled={submitting}
              className="flex-1 rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-white disabled:opacity-50 sm:flex-none"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:flex-none"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting
                ? (editingHomework ? t('hw.modifying') : t('hw.sendingShort'))
                : (editingHomework ? t('common.modify') : t('hw.createAndSend'))}
            </button>
          </>
        )}
      >
        {submitting && (
          <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
            {editingHomework ? t('hw.updating') : t('hw.sending')}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('hw.fieldTitle')}</label>
              <input type="text" name="title" value={formData.title} onChange={handleInputChange} required
                className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('hw.titlePlaceholder')} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">{t('hw.description')}</label>
              <textarea name="description" value={formData.description} onChange={handleInputChange} rows={3}
                className="w-full resize-none rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('hw.descriptionPlaceholder')} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium">{t('hw.classRequired')}</label>
                <select name="classId" value={formData.classId} onChange={handleInputChange} required
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t('hw.pickClass')}</option>
                  {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t('hw.typeRequired')}</label>
                <select name="type" value={formData.type} onChange={handleInputChange} required
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="exercice">📝 {t('hw.type.exercice')}</option>
                  <option value="revision">📚 {t('hw.type.revision')}</option>
                  <option value="projet">🎯 {t('hw.type.projet')}</option>
                  <option value="recherche">🔍 {t('hw.type.recherche')}</option>
                  <option value="presentation">🎤 {t('hw.type.presentation')}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('hw.dueDateRequired')}</label>
              <input type="date" name="dueDate" value={formData.dueDate} onChange={handleInputChange} required
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">{t('hw.targetRequired')}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'all', label: t('hw.wholeClass') },
                  { value: 'group', label: t('hw.studentGroup') },
                ].map((target) => (
                  <label key={target.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${formData.targetType === target.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'}`}>
                    <input type="radio" name="targetType" value={target.value} checked={formData.targetType === target.value} onChange={handleInputChange} className="h-4 w-4 text-blue-600" />
                    <span>{target.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {formData.targetType === 'group' && (
              <div className="rounded-lg border border-gray-200 p-3">
                <label className="mb-1 block text-sm font-medium">{t('hw.pickStudents', { n: formData.studentIds.length })}</label>
                <select
                  value=""
                  onChange={(event) => event.target.value && toggleStudentSelection(event.target.value)}
                  disabled={!formData.classId || students.length === 0}
                  className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  <option value="">{formData.classId ? t('hw.addStudent') : t('hw.pickClassFirst')}</option>
                  {students.filter((student) => !formData.studentIds.includes(student.id)).map((student) => (
                    <option key={student.id} value={student.id}>{student.first_name} {student.last_name}</option>
                  ))}
                </select>
                {formData.studentIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {formData.studentIds.map((studentId) => {
                      const student = students.find((item) => item.id === studentId);
                      if (!student) return null;
                      return (
                        <button key={studentId} type="button" onClick={() => toggleStudentSelection(studentId)}
                          className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-red-100 hover:text-red-700">
                          {student.first_name} {student.last_name} ×
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </TaskModal>

      {/* Filtres */}
      {homework.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filterOptions.map(option => (
            <button
              key={option.key}
              onClick={() => setStatusFilter(option.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                statusFilter === option.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>
      )}

      {/* Liste des devoirs */}
      <div className="grid gap-4">
        {filteredHomework.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <BookOpen className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">{t('hw.emptyFilter')}</p>
              <p className="text-sm text-gray-400 mt-2">{t('hw.emptyFilterHint')}</p>
            </CardContent>
          </Card>
        ) : (
          filteredHomework.map(hw => (
            <Card
              key={hw.id}
              className={`border-l-4 ${
                getHomeworkStatus(hw) === 'submitted'
                  ? 'border-l-emerald-500'
                  : getHomeworkStatus(hw) === 'partial'
                    ? 'border-l-amber-500'
                    : isOverdue(hw.due_date)
                      ? 'border-l-red-500'
                      : 'border-l-blue-500'
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{getTypeIcon(hw.type)}</span>
                      <h3 className="text-lg font-semibold">{hw.title}</h3>
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                        {getTypeLabel(hw.type)}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          getHomeworkStatus(hw) === 'submitted'
                            ? 'bg-emerald-100 text-emerald-700'
                            : getHomeworkStatus(hw) === 'partial'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {getHomeworkStatus(hw) === 'submitted'
                          ? t('hw.status.submitted')
                          : getHomeworkStatus(hw) === 'partial'
                            ? t('hw.status.partial')
                            : isOverdue(hw.due_date)
                              ? t('hw.status.overdue')
                              : t('hw.status.pending')}
                      </span>
                    </div>
                    
                    {hw.description && (
                      <p className="text-sm text-gray-600 mb-2">{hw.description}</p>
                    )}
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{hw.classes?.name || t('hw.unknownClass')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {new Date(hw.due_date).toLocaleDateString(dateLocale, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    {hw.target_type === 'group' && hw.homework_students && hw.homework_students.length > 0 && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-gray-500">{t('hw.concernedStudents')}</span>
                        <div className="flex -space-x-2">
                          {hw.homework_students.slice(0, 5).map(hs => (
                            <div
                              key={hs.student_id}
                              className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-lg border-2 border-white"
                              title={`${hs.profiles?.first_name} ${hs.profiles?.last_name}`}
                            >
                              {hs.profiles?.avatar || '👤'}
                            </div>
                          ))}
                          {hw.homework_students.length > 5 && (
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium border-2 border-white">
                              +{hw.homework_students.length - 5}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(hw)}
                      className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
                      title={t('common.modify')}
                    >
                      <Edit2 className="w-4 h-4 text-blue-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(hw.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title={t('hw.delete')}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default Devoirs;
