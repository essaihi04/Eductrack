import { useState, useEffect } from 'react';
import { Plus, BookOpen, Calendar, Users, Trash2, Edit2, X, Check, PieChart, Target, TrendingUp, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

const Devoirs = () => {
  const { profile } = useAuth();
  const [classes, setClasses] = useState([]);
  const [homework, setHomework] = useState([]);
  const [students, setStudents] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingHomework, setEditingHomework] = useState(null);
  
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
    setFormData(prev => ({ ...prev, [name]: value }));
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
        await fetchHomework();
        resetForm();
      }
    } catch (error) {
      console.error('Error saving homework:', error);
    }
  };

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
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce devoir ?')) return;

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

  const getTypeLabel = (type) => {
    const labels = {
      exercice: 'Exercice',
      revision: 'Révision',
      projet: 'Projet',
      recherche: 'Recherche',
      presentation: 'Présentation'
    };
    return labels[type] || type;
  };

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
        name: hw.classes?.name || 'Classe inconnue',
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
    { key: 'all', label: 'Tous', count: homework.length },
    { key: 'submitted', label: 'Soumis', count: homework.filter(hw => getHomeworkStatus(hw) === 'submitted').length },
    { key: 'partial', label: 'Partiel', count: homework.filter(hw => getHomeworkStatus(hw) === 'partial').length },
    { key: 'pending', label: 'Non soumis', count: homework.filter(hw => getHomeworkStatus(hw) === 'pending').length }
  ];

  if (loading) {
    return <div className="p-8">Chargement...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Devoirs</h1>
          <p className="text-muted-foreground mt-2">Gérez les devoirs de vos classes</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Donner un devoir
        </button>
      </div>

      {homework.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-indigo-600 to-indigo-500 text-white">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span>Total assignés</span>
                  <PieChart className="w-5 h-5 opacity-80" />
                </div>
                <p className="text-3xl font-bold">{totalAssigned}</p>
                <p className="text-xs text-indigo-100">Tous devoirs confondus</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-600 to-emerald-500 text-white">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span>Soumissions</span>
                  <TrendingUp className="w-5 h-5 opacity-80" />
                </div>
                <p className="text-3xl font-bold">{totalSubmitted}</p>
                <p className="text-xs text-emerald-100">Dont {averageSubmissionRate}% rendus</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span>En attente</span>
                  <Clock className="w-5 h-5 opacity-80" />
                </div>
                <p className="text-3xl font-bold">{totalPending}</p>
                <p className="text-xs text-amber-100">À relancer</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-slate-600">
                  <Target className="w-4 h-4" />
                  <span className="text-sm font-semibold">Meilleure classe</span>
                </div>
                {bestClass ? (
                  <>
                    <p className="text-lg font-semibold">{bestClass.name}</p>
                    <p className="text-sm text-slate-500">
                      {bestClass.rate}% remis ({bestClass.submitted}/{bestClass.assigned || 0})
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Aucune donnée disponible</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Progression par devoir</CardTitle>
              <CardDescription>Prochains devoirs à échéance</CardDescription>
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
                          À rendre le{' '}
                          {new Date(hw.due_date).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short'
                          })}{' '}
                          • {hw.submitted_count}/{hw.assigned_count || 0} remis
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
                <p className="text-sm text-gray-500">Aucun devoir planifié pour le moment.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Formulaire (modal) */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl">
            <Card className="shadow-xl">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>{editingHomework ? 'Modifier le devoir' : 'Nouveau devoir'}</CardTitle>
                  <CardDescription>Remplissez les informations pour créer un devoir</CardDescription>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Fermer
                </button>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">Titre *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Titre du devoir"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Description du devoir (optionnel)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium block mb-2">Classe *</label>
                  <select
                    name="classId"
                    value={formData.classId}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sélectionner une classe</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-2">Type *</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="exercice">📝 Exercice</option>
                    <option value="revision">📚 Révision</option>
                    <option value="projet">🎯 Projet</option>
                    <option value="recherche">🔍 Recherche</option>
                    <option value="presentation">🎤 Présentation</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Date de remise *</label>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleInputChange}
                  required
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">Cible *</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="targetType"
                      value="all"
                      checked={formData.targetType === 'all'}
                      onChange={handleInputChange}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>Toute la classe</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="targetType"
                      value="group"
                      checked={formData.targetType === 'group'}
                      onChange={handleInputChange}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>Groupe d'élèves</span>
                  </label>
                </div>
              </div>

              {formData.targetType === 'group' && (
                <div>
                  <label className="text-sm font-medium block mb-2">
                    Sélectionner les élèves ({formData.studentIds.length} sélectionné(s))
                  </label>
                  <div className="border rounded-lg p-3 max-h-60 overflow-y-auto">
                    {students.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Sélectionnez d'abord une classe
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {students.map(student => (
                          <button
                            key={student.id}
                            type="button"
                            onClick={() => toggleStudentSelection(student.id)}
                            className={`flex items-center gap-2 p-2 rounded-lg border-2 transition-all ${
                              formData.studentIds.includes(student.id)
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <span className="text-2xl">{student.avatar || '👤'}</span>
                            <span className="text-sm font-medium">
                              {student.first_name} {student.last_name}
                            </span>
                            {formData.studentIds.includes(student.id) && (
                              <Check className="w-4 h-4 text-blue-600 ml-auto" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingHomework ? 'Modifier' : 'Créer'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Annuler
                </button>
              </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

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
              <p className="text-gray-500">Aucun devoir pour ce filtre.</p>
              <p className="text-sm text-gray-400 mt-2">Essayez un autre statut ou créez un devoir.</p>
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
                          ? 'Soumis'
                          : getHomeworkStatus(hw) === 'partial'
                            ? 'Partiel'
                            : isOverdue(hw.due_date)
                              ? 'En retard'
                              : 'Non soumis'}
                      </span>
                    </div>
                    
                    {hw.description && (
                      <p className="text-sm text-gray-600 mb-2">{hw.description}</p>
                    )}
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{hw.classes?.name || 'Classe inconnue'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {new Date(hw.due_date).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    {hw.target_type === 'group' && hw.homework_students && hw.homework_students.length > 0 && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-gray-500">Élèves concernés :</span>
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
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4 text-blue-600" />
                    </button>
                    <button
                      onClick={() => handleDelete(hw.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Supprimer"
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
