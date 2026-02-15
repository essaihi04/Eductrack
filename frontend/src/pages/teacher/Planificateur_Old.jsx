import { useState, useEffect } from 'react';
import { Calendar, Clock, FileText, Plus, Edit2, Trash2, Save, X, CheckCircle, Users, TrendingUp, UserX, Package, Shield, Phone, AlertTriangle, Eye, FileCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';

const Planificateur = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();

  // Composant pour afficher une carte de contrôle avec statistiques
  const ControlCard = ({ control }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      const fetchControlStats = async () => {
        if (control.status !== 'completed') {
          setStats(null);
          return;
        }

        setLoading(true);
        try {
          const token = await getAuthToken();
          
          // Récupérer les sessions de contrôle pour ce contrôle
          const sessionsRes = await fetch(`${apiUrl}/api/teacher/classes/${control.class_id}/sessions?date=${control.date}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (sessionsRes.ok) {
            const sessions = await sessionsRes.json();
            const controlSessions = sessions.filter(s => s.type === 'control');
            
            let allTrackingData = [];
            for (const session of controlSessions) {
              const trackingRes = await fetch(`${apiUrl}/api/teacher/sessions/${session.id}/control-tracking`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (trackingRes.ok) {
                const trackingData = await trackingRes.json();
                allTrackingData = [...allTrackingData, ...trackingData];
              }
            }
            
            if (allTrackingData.length > 0) {
              const controlStats = {
                totalStudents: allTrackingData.length,
                absences: allTrackingData.filter(t => t.presence === 'absent').length,
                materialComplete: allTrackingData.filter(t => t.material_status === 'complete').length,
                disciplineGood: allTrackingData.filter(t => t.discipline_status === 'good').length,
                phoneUsage: allTrackingData.filter(t => t.phone_use).length,
                cheatingAttempts: allTrackingData.filter(t => t.discipline_notes?.toLowerCase().includes('triche')).length,
                cheatingCaught: allTrackingData.filter(t => t.discipline_notes?.toLowerCase().includes('trich')).length,
                copiesSubmitted: allTrackingData.filter(t => t.copy_submitted).length
              };
              setStats(controlStats);
            }
          }
        } catch (error) {
          console.error('Erreur lors de la récupération des statistiques:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchControlStats();
    }, [control]);

    return (
      <div className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-gray-900">{control.name}</h3>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(control.status)}`}>
                {getStatusLabel(control.status)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(control.date).toLocaleDateString('fr-FR')}
              </div>
              {control.start_time && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {control.start_time} {control.end_time ? `- ${control.end_time}` : ''}
                </div>
              )}
              <div className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {control.class_name}
              </div>
            </div>
            {control.description && (
              <p className="text-sm text-gray-700">{control.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {control.status === 'planned' && (
              <button
                onClick={() => navigate(`/teacher/rapide?controlId=${control.id}&classId=${control.class_id}&date=${control.date}&name=${encodeURIComponent(control.name)}&description=${encodeURIComponent(control.description || '')}&startTime=${control.start_time || ''}&endTime=${control.end_time || ''}`)}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Démarrer
              </button>
            )}
            <button
              onClick={() => handleEdit(control)}
              className="p-2 hover:bg-blue-100 rounded transition"
              title="Modifier"
            >
              <Edit2 className="w-4 h-4 text-blue-600" />
            </button>
            <button
              onClick={() => handleDelete(control.id)}
              className="p-2 hover:bg-red-100 rounded transition"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          </div>
        </div>

        {/* Statistiques détaillées pour les contrôles terminés */}
        {control.status === 'completed' && (
          <div className="border-t pt-4">
            {loading ? (
              <div className="text-center text-gray-500">Chargement des statistiques...</div>
            ) : stats && stats.totalStudents > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <UserX className="w-4 h-4 text-red-500" />
                  <span className="font-medium">Absences:</span>
                  <span className="text-red-600">{stats.absences}/{stats.totalStudents}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-4 h-4 text-green-500" />
                  <span className="font-medium">Matériel:</span>
                  <span className="text-green-600">{stats.materialComplete}/{stats.totalStudents}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">Discipline:</span>
                  <span className="text-blue-600">{stats.disciplineGood}/{stats.totalStudents}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-orange-500" />
                  <span className="font-medium">Téléphone:</span>
                  <span className="text-orange-600">{stats.phoneUsage}/{stats.totalStudents}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="font-medium">Tentatives:</span>
                  <span className="text-yellow-600">{stats.cheatingAttempts}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Eye className="w-4 h-4 text-red-600" />
                  <span className="font-medium">Triches:</span>
                  <span className="text-red-600">{stats.cheatingCaught}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FileCheck className="w-4 h-4 text-purple-500" />
                  <span className="font-medium">Copies:</span>
                  <span className="text-purple-600">{stats.copiesSubmitted}/{stats.totalStudents}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="font-medium">Réussite:</span>
                  <span className="text-green-600">{Math.round((stats.copiesSubmitted / stats.totalStudents) * 100)}%</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 text-sm">Aucune statistique disponible</div>
            )}
          </div>
        )}
      </div>
    );
  };
  const [classes, setClasses] = useState([]);
  const [controls, setControls] = useState([]);
  const [calendarControls, setCalendarControls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingControl, setEditingControl] = useState(null);
  const [saving, setSaving] = useState(false);

  // États pour le filtre
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [controlStats, setControlStats] = useState({
    totalStudents: 0,
    successRate: 0,
    absences: 0,
    materialComplete: 0,
    disciplineGood: 0,
    phoneUsage: 0,
    cheatingAttempts: 0,
    cheatingCaught: 0,
    copiesSubmitted: 0
  });

  const [formData, setFormData] = useState({
    class_id: '',
    name: '',
    date: '',
    start_time: '',
    end_time: '',
    description: ''
  });

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Filtrer les contrôles en fonction des critères
  const filteredControls = controls.filter(control => {
    // Filtre par statut
    if (filterStatus !== 'all' && control.status !== filterStatus) {
      return false;
    }
    
    // Filtre par classe
    if (filterClass !== 'all' && control.class_id !== filterClass) {
      return false;
    }
    
    // Filtre par période
    const controlDate = new Date(control.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (filterPeriod === 'upcoming' && controlDate < today) {
      return false;
    }
    if (filterPeriod === 'past' && controlDate >= today) {
      return false;
    }
    if (filterPeriod === 'today') {
      const isToday = controlDate.toDateString() === today.toDateString();
      if (!isToday) return false;
    }
    
    return true;
  });

  // Calculer les statistiques des contrôles
  useEffect(() => {
    const calculateStats = async () => {
      const completedControls = filteredControls.filter(c => c.status === 'completed');
      
      if (completedControls.length === 0) {
        setControlStats({
          totalStudents: 0,
          successRate: 0,
          absences: 0,
          materialComplete: 0,
          disciplineGood: 0,
          phoneUsage: 0,
          cheatingAttempts: 0,
          cheatingCaught: 0,
          copiesSubmitted: 0
        });
        return;
      }

      try {
        const token = await getAuthToken();
        const stats = {
          totalStudents: 0,
          successRate: 0,
          absences: 0,
          materialComplete: 0,
          disciplineGood: 0,
          phoneUsage: 0,
          cheatingAttempts: 0,
          cheatingCaught: 0,
          copiesSubmitted: 0
        };

        // Pour chaque contrôle terminé, récupérer les statistiques de tracking
        for (const control of completedControls) {
          // Récupérer les sessions de contrôle pour ce contrôle
          const sessionsRes = await fetch(`${apiUrl}/api/teacher/classes/${control.class_id}/sessions?date=${control.date}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (sessionsRes.ok) {
            const sessions = await sessionsRes.json();
            const controlSessions = sessions.filter(s => s.type === 'control');
            
            for (const session of controlSessions) {
              // Récupérer le tracking de cette session
              const trackingRes = await fetch(`${apiUrl}/api/teacher/sessions/${session.id}/control-tracking`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (trackingRes.ok) {
                const trackingData = await trackingRes.json();
                
                stats.totalStudents += trackingData.length;
                stats.absences += trackingData.filter(t => t.presence === 'absent').length;
                stats.materialComplete += trackingData.filter(t => t.material_status === 'complete').length;
                stats.disciplineGood += trackingData.filter(t => t.discipline_status === 'good').length;
                stats.phoneUsage += trackingData.filter(t => t.phone_use).length;
                stats.cheatingAttempts += trackingData.filter(t => t.discipline_notes?.toLowerCase().includes('triche')).length;
                stats.cheatingCaught += trackingData.filter(t => t.discipline_notes?.toLowerCase().includes('trich')).length;
                stats.copiesSubmitted += trackingData.filter(t => t.copy_submitted).length;
              }
            }
          }
        }
        
        // Calculer le taux de réussite
        if (stats.totalStudents > 0) {
          stats.successRate = Math.round((stats.copiesSubmitted / stats.totalStudents) * 100);
        }
        
        setControlStats(stats);
      } catch (error) {
        console.error('Erreur lors du calcul des statistiques:', error);
      }
    };

    calculateStats();
  }, [filteredControls]);

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

  const fetchData = async () => {
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
      setClasses(Array.isArray(classesData) ? classesData : []);
      setControls(Array.isArray(controlsData) ? controlsData : []);
      setCalendarControls(Array.isArray(calendarData) ? calendarData : []);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSubjectColor = (subjectName) => {
    const colors = {
      'Mathématiques': 'bg-blue-500',
      'Sciences': 'bg-green-500',
      'Français': 'bg-purple-500',
      'Histoire': 'bg-orange-500',
      'Géographie': 'bg-yellow-500',
      'Anglais': 'bg-pink-500',
      'Physique': 'bg-red-500',
      'Chimie': 'bg-indigo-500',
      'SVT': 'bg-teal-500',
      default: 'bg-gray-500'
    };
    
    return colors[subjectName] || colors.default;
  };

  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    return `${hours}:${minutes}`;
  };

  const groupControlsByDate = () => {
    const grouped = {};
    calendarControls.forEach(control => {
      const date = control.date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(control);
    });
    return grouped;
  };

  const CalendarView = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedControls, setSelectedControls] = useState([]);

    const getDaysInMonth = (date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startingDayOfWeek = firstDay.getDay();
      
      const days = [];
      
      // Ajouter les jours vides au début
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
      setShowDetailsModal(true);
    };

    const navigateMonth = (direction) => {
      setCurrentDate(prev => {
        const newDate = new Date(prev);
        if (direction === 'prev') {
          newDate.setMonth(newDate.getMonth() - 1);
        } else {
          newDate.setMonth(newDate.getMonth() + 1);
        }
        return newDate;
      });
    };

    const days = getDaysInMonth(currentDate);
    const weekDays = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                       'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Calendrier des Contrôles
          </h3>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            <span className="text-lg font-medium">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </span>
            
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Jours de la semaine */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Jours du mois */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((date, index) => {
            const controls = date ? getControlsForDate(date) : [];
            const isToday = date && date.toDateString() === new Date().toDateString();
            const isCurrentMonth = date && date.getMonth() === currentDate.getMonth();
            
            return (
              <div
                key={index}
                onClick={() => date && controls.length > 0 && handleDateClick(date, controls)}
                className={`
                  min-h-[80px] border rounded-lg p-2 relative
                  ${!date ? 'bg-gray-50' : 'bg-white'}
                  ${isToday ? 'border-blue-500 border-2' : 'border-gray-200'}
                  ${date && controls.length > 0 ? 'cursor-pointer hover:bg-gray-50' : ''}
                  ${!isCurrentMonth && date ? 'text-gray-400' : ''}
                `}
              >
                {date && (
                  <>
                    <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : ''}`}>
                      {date.getDate()}
                    </div>
                    
                    {controls.length > 0 && (
                      <div className="space-y-1">
                        {controls.slice(0, 2).map((control, idx) => {
                          const subjectName = control.subject_name || 'Non spécifié';
                          const colorClass = getSubjectColor(subjectName);
                          const bgColorClass = colorClass.replace('bg-', 'bg-opacity-20 bg-');
                          const textColorClass = colorClass.replace('bg-', 'text-');
                          
                          return (
                            <div
                              key={control.id}
                              className={`text-xs p-1 ${bgColorClass} ${textColorClass} rounded truncate border-l-2 ${colorClass.replace('bg-', 'border-')}`}
                              title={`${subjectName} - ${control.name}`}
                            >
                              {formatTime(control.start_time)} {control.name}
                            </div>
                          );
                        })}
                        
                        {controls.length > 2 && (
                          <div className="text-xs text-gray-500 text-center">
                            +{controls.length - 2} plus
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

        {/* Modal des détails */}
        {showDetailsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">
                  Contrôles du {selectedDate?.toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </h2>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {selectedControls
                  .sort((a, b) => a.start_time.localeCompare(b.start_time))
                  .map(control => {
                    const subjectName = control.subject_name || 'Non spécifié';
                    const colorClass = getSubjectColor(subjectName);
                    
                    return (
                      <div
                        key={control.id}
                        className={`p-4 rounded-lg border-l-4 ${colorClass.replace('bg-', 'border-')} ${colorClass} bg-opacity-10`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`inline-block w-3 h-3 rounded-full ${colorClass}`}></span>
                          <span className="font-medium text-gray-900">{control.name}</span>
                          <span className="text-xs px-2 py-1 bg-white rounded-full text-gray-600">
                            {subjectName}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatTime(control.start_time)} - {formatTime(control.end_time)}
                          </span>
                          
                          <span className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            {control.classes?.name} ({control.classes?.level})
                          </span>
                          
                          <span className="text-xs text-gray-500">
                            Prof: {control.profiles?.first_name} {control.profiles?.last_name}
                          </span>
                        </div>
                        
                        {control.description && (
                          <p className="text-sm text-gray-600 mt-2">{control.description}</p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const url = editingControl
        ? `${apiUrl}/api/teacher/controls-plan/${editingControl.id}`
        : `${apiUrl}/api/teacher/controls-plan`;

      const response = await fetch(url, {
        method: editingControl ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
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
      }
    } catch (error) {
      console.error('Erreur lors de la création du contrôle:', error);
    } finally {
      setSaving(false);
    }
  };

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

  const handleDelete = async (id) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce contrôle ?')) {
      return;
    }

    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const response = await fetch(`${apiUrl}/api/teacher/controls-plan/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchData(); // Rafraîchir les contrôles et le calendrier
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'planned': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'planned': return 'Planifié';
      case 'in_progress': return 'En cours';
      case 'completed': return 'Terminé';
      case 'cancelled': return 'Annulé';
      default: return status;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Planificateur de Contrôles</h1>
          <p className="text-muted-foreground mt-2">Planifiez et gérez vos contrôles</p>
        </div>
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
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nouveau Contrôle
        </button>
      </div>

      <CalendarView />

      {/* Filtre professionnel */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Filtre des Contrôles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">Statut</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Tous les contrôles</option>
                <option value="planned">Planifiés</option>
                <option value="completed">Terminés</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">Classe</label>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Toutes les classes</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">Période</label>
              <select
                value={filterPeriod}
                onChange={(e) => setFilterPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Toutes les périodes</option>
                <option value="upcoming">À venir</option>
                <option value="past">Passés</option>
                <option value="today">Aujourd'hui</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistiques détaillées */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Contrôles Planifiés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {filteredControls.filter(c => c.status === 'planned').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Contrôles Terminés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {filteredControls.filter(c => c.status === 'completed').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Total Élèves
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">
              {controlStats.totalStudents}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              Taux de Réussite
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">
              {controlStats.successRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mes Contrôles</CardTitle>
          <CardDescription>Liste de tous vos contrôles planifiés</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredControls.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">Aucun contrôle trouvé</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Créer un contrôle
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredControls.map(control => (
                <ControlCard key={control.id} control={control} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingControl ? 'Modifier le Contrôle' : 'Nouveau Contrôle'}
              </h2>
              <button
                onClick={() => {
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
                }}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Classe *</label>
                <select
                  value={formData.class_id}
                  onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                >
                  <option value="">Sélectionner une classe</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} - {cls.level}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Nom du contrôle *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Devoir surveillé n°1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Date *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Heure de début</label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Heure de fin</label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description (optionnel)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description du contrôle, chapitres concernés, etc."
                  rows="3"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
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
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sauvegarde...
                    </>
                  ) : editingControl ? (
                    <>
                      <Save className="w-4 h-4" />
                      Modifier
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Créer
                    </>
                  )}
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
