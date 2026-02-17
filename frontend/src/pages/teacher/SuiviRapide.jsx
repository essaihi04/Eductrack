import { useState, useEffect, useRef } from 'react';
import { Save, Trash2, BookOpen, CheckSquare, Clock, RefreshCw, Plus, ChevronDown, Users, CalendarDays, Zap, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const DEFAULT_TRACKING_OPTIONS = {
  presence: true,
  cahier_present: true,
  sleeping: true,
  homework: false,
  participation: true,
  discipline: true,
  phone_use: true,
  cahier: false,
  attitude: false,
  writing: true
};

const SuiviRapide = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [students, setStudents] = useState([]);
  const [tracking, setTracking] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionInfo, setSessionInfo] = useState('');
  const [sessionSaved, setSessionSaved] = useState(false);
  const [existingSessions, setExistingSessions] = useState([]);
  const [trackingOptions, setTrackingOptions] = useState({ ...DEFAULT_TRACKING_OPTIONS });
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });
  const [activeHomework, setActiveHomework] = useState([]);
  const [sessionType, setSessionType] = useState('normal');
  const [controlName, setControlName] = useState('');
  const [controlDescription, setControlDescription] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');
  const [editingLesson, setEditingLesson] = useState(false);
  const [timetableSlots, setTimetableSlots] = useState([]);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // État pour stocker les paramètres d'URL du contrôle planifié
  const [urlParams, setUrlParams] = useState({});
  // Ref pour préserver les paramètres d'URL et éviter leur réinitialisation
  const urlParamsRef = useRef({});

  // Lire les paramètres d'URL pour pré-remplir le formulaire avec les informations du contrôle planifié
  useEffect(() => {
    const controlId = searchParams.get('controlId');
    const classId = searchParams.get('classId');
    const date = searchParams.get('date');
    const name = searchParams.get('name');
    const description = searchParams.get('description');
    const startTimeParam = searchParams.get('startTime');
    const endTimeParam = searchParams.get('endTime');

    console.log('[DEBUG] URL Parameters:', { controlId, classId, date, name, startTimeParam, endTimeParam });

    if (controlId && classId) {
      const params = { classId, startTime: startTimeParam, endTime: endTimeParam };
      console.log('[DEBUG] Setting urlParams and selectedClass:', params);
      setUrlParams(params);
      urlParamsRef.current = params;
      setSelectedClass(classId);
      setSessionDate(date || new Date().toISOString().split('T')[0]);
      setSessionType('control');
      setControlName(name || '');
      setControlDescription(description || '');
      setStartTime(startTimeParam || '');
      setEndTime(endTimeParam || '');
      setSessionInfo(`Contrôle planifié: ${name}`);
    }
  }, [searchParams]);

  // Effet pour surveiller les changements de urlParamsRef et mettre à jour selectedClass
  useEffect(() => {
    if (urlParamsRef.current.classId && !selectedClass) {
      console.log('[DEBUG] Updating selectedClass from urlParamsRef:', urlParamsRef.current.classId);
      setSelectedClass(urlParamsRef.current.classId);
    }
  }, [urlParamsRef.current.classId, selectedClass]);

  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();
    return authSession?.access_token;
  };

  const loadSessionById = async (sessionId) => {
    if (!sessionId) return;
    setSessionLoading(true);
    setSessionError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Impossible de charger la séance.');
      }
      applySessionData(data);
      fetchSessionTracking(sessionId);
    } catch (error) {
      console.error('Erreur lors du chargement de la séance:', error);
      setSessionError(error.message || 'Impossible de charger la séance.');
    } finally {
      setSessionLoading(false);
    }
  };

  const getSessionStorageKey = () => {
    if (!selectedClass || !sessionDate || !profile?.id) return null;
    return `session_${profile.id}_${selectedClass}_${sessionDate}`;
  };

  const formatTimeDisplay = (timeValue) => (timeValue ? timeValue.slice(0, 5) : '—');
  const formatTimeForInput = (timeValue) => (timeValue ? timeValue.slice(0, 5) : '');

  const describeSession = (session) => {
    if (!session) return '';
    const start = formatTimeDisplay(session.start_time);
    const end = formatTimeDisplay(session.end_time);
    const dateLabel = session.date || sessionDate;
    const range =
      start !== '—'
        ? `${start}${end !== '—' ? ` - ${end}` : ''}`
        : 'Horaire non défini';
    return `Séance du ${dateLabel} • ${range}`;
  };

  const applySessionData = (sessionData, options = { persist: true, updateDate: true }) => {
    if (!sessionData) return;
    setCurrentSession(sessionData);
    if (options.updateDate && sessionData.date && sessionData.date !== sessionDate) {
      setSessionDate(sessionData.date);
    }
    setStartTime(formatTimeForInput(sessionData.start_time));
    setEndTime(formatTimeForInput(sessionData.end_time));
    setSessionInfo(describeSession(sessionData));
    if (sessionData.type !== 'control') {
      setLessonTitle(sessionData.topic || '');
      setLessonDescription(sessionData.notes || '');
    }
    setEditingLesson(false);
    const mergedOptions = {
      ...DEFAULT_TRACKING_OPTIONS,
      ...(sessionData.tracking_options || {})
    };
    setTrackingOptions(mergedOptions);
    if (options.persist) {
      persistSession(sessionData);
    }
    setSessionError('');
  };

  const loadSessionFromStorage = () => {
    const key = getSessionStorageKey();
    if (!key) return null;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error('Impossible de lire la séance en cache:', error);
      sessionStorage.removeItem(key);
      return null;
    }
  };

  const persistSession = (sessionData) => {
    const key = getSessionStorageKey();
    if (!key || !sessionData) return;
    sessionStorage.setItem(key, JSON.stringify(sessionData));
  };

  const clearStoredSession = () => {
    const key = getSessionStorageKey();
    if (key) {
      sessionStorage.removeItem(key);
    }
  };

  const hydrateSessionFromStorage = () => {
    // Ne pas hydrater si une séance est déjà chargée depuis l'API
    if (currentSession) return false;
    
    const storedSession = loadSessionFromStorage();
    if (!storedSession) return false;

    if (storedSession.teacher_id && storedSession.teacher_id !== profile?.id) {
      clearStoredSession();
      return false;
    }

    applySessionData(storedSession, { persist: false, updateDate: false });
    return true;
  };

  const handleResetSession = () => {
    clearStoredSession();
    setCurrentSession(null);
    setStartTime('');
    setEndTime('');
    setSessionInfo('');
    setSessionError('');
    setAutoSaveStatus('');
    setSessionSaved(false);
    setTracking({});
  };

  useEffect(() => {
    fetchClasses();
  }, [urlParams]);

  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
      fetchExistingSessions();
      fetchActiveHomework();
    }
  }, [selectedClass]);

  useEffect(() => {
    if (!selectedClass || !sessionDate) return;
    // Ne pas charger automatiquement - toujours proposer la création d'une nouvelle séance
    // L'utilisateur doit cliquer sur une séance existante dans la liste ou créer une nouvelle
    clearStoredSession();
    setCurrentSession(null);
    fetchActiveHomework();
    fetchTimetableSlots();
  }, [selectedClass, sessionDate, urlParams]);

  const fetchTimetableSlots = async () => {
    if (!selectedClass || !sessionDate) return;
    try {
      const token = await getAuthToken();
      const dateObj = new Date(sessionDate + 'T00:00:00');
      const jsDow = dateObj.getDay();
      const dbDow = jsDow === 0 ? 7 : jsDow;
      const res = await fetch(
        `${apiUrl}/api/teacher/classes/${selectedClass}/timetable?day_of_week=${dbDow}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      // Filtrer pour n'afficher que les créneaux du professeur connecté
      const mySlots = (Array.isArray(data) ? data : []).filter(slot => slot.teacher_id === profile?.id);
      setTimetableSlots(mySlots);
    } catch (error) {
      console.error('Erreur chargement emploi du temps:', error);
      setTimetableSlots([]);
    }
  };

  const selectTimetableSlot = (slot) => {
    setStartTime(slot.start_time?.substring(0, 5) || '');
    setEndTime(slot.end_time?.substring(0, 5) || '');
    if (slot.subject?.id) {
      setSelectedSubject(slot.subject.id);
    }
    setSessionError('');
  };

  const fetchClasses = async () => {
    console.log('[DEBUG] fetchClasses called, urlParams:', urlParams, 'urlParamsRef.current:', urlParamsRef.current, 'selectedClass:', selectedClass);
    try {
      const token = await getAuthToken();
      const [res, subjectsRes] = await Promise.all([
        fetch(`${apiUrl}/api/teacher/my-classes`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/teacher/my-subjects`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const data = await res.json();
      const subjectsData = await subjectsRes.json();
      console.log('[DEBUG] Classes loaded:', data);
      setClasses(Array.isArray(data) ? data : []);

      const subs = Array.isArray(subjectsData) ? subjectsData : [];
      setSubjects(subs);
      if (subs.length > 0 && !selectedSubject) setSelectedSubject(subs[0].id);
      
      // Préserver selectedClass s'il a été défini par les paramètres d'URL
      if (Array.isArray(data) && data.length > 0) {
        // Utiliser urlParamsRef.current au lieu de urlParams pour éviter la réinitialisation
        const targetClassId = urlParamsRef.current.classId || selectedClass;
        
        if (targetClassId) {
          console.log('[DEBUG] Setting class from preserved data:', targetClassId);
          setSelectedClass(targetClassId);
        } else if (!selectedClass) {
          console.log('[DEBUG] Setting default class to:', data[0].id);
          setSelectedClass(data[0].id);
        } else {
          console.log('[DEBUG] Preserving existing selectedClass:', selectedClass);
        }
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    if (!selectedClass) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/classes/${selectedClass}/students`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStudents(Array.isArray(data) ? data : []);

      const initialTracking = {};
      (Array.isArray(data) ? data : []).forEach((student) => {
        initialTracking[student.id] = {
          presence: null,
          cahier_present: null,
          sleeping: null,
          homework: null,
          participation: null,
          discipline: null,
          phone_use: null,
          mini_eval: null,
          cahier_lesson: null,
          cahier_documents: null,
          cahier_readability: null,
          attitude: null,
          comment: null,
          notes: null,
          writing: null,
        };
      });
      setTracking(initialTracking);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const fetchActiveHomework = async () => {
    if (!selectedClass || !sessionDate) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/homework`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      // Filtrer les devoirs pour la classe et la date
      const active = (Array.isArray(data) ? data : []).filter(hw => {
        const hwDate = hw.due_date.split('T')[0];
        const assignedCount = hw.assigned_count || (hw.target_type === 'group' ? (hw.homework_students?.length || 0) : 0);
        const submittedCount = hw.submitted_count || 0;
        const fullySubmitted = assignedCount > 0 && submittedCount >= assignedCount;
        return hw.class_id === selectedClass && hwDate >= sessionDate && !fullySubmitted;
      });

      setActiveHomework(active);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const setAllPresence = (presenceValue) => {
    const updatedTracking = {};
    students.forEach((student) => {
      updatedTracking[student.id] = {
        ...tracking[student.id],
        presence: presenceValue,
      };
    });
    setTracking(updatedTracking);
  };

  const setAllCahierPresent = (value) => {
    const updatedTracking = {};
    students.forEach((student) => {
      updatedTracking[student.id] = {
        ...tracking[student.id],
        cahier_present: value,
      };
    });
    setTracking(updatedTracking);
  };

  const setAllWriting = (value) => {
    const updatedTracking = {};
    students.forEach((student) => {
      updatedTracking[student.id] = {
        ...tracking[student.id],
        writing: value,
      };
    });
    setTracking(updatedTracking);
  };

  const setAllHomework = (value) => {
    const updatedTracking = {};
    students.forEach((student) => {
      updatedTracking[student.id] = {
        ...tracking[student.id],
        homework: value ? 'done' : null,
      };
    });
    setTracking(updatedTracking);
  };

  const setAllAttitude = (value) => {
    const updatedTracking = {};
    students.forEach((student) => {
      updatedTracking[student.id] = {
        ...tracking[student.id],
        attitude: value,
      };
    });
    setTracking(updatedTracking);
  };

  const setAllPresenceToggle = (value) => {
    const allMatch = students.length > 0 && students.every(s => tracking[s.id]?.presence === value);
    setAllPresence(allMatch ? null : value);
  };

  const fetchExistingSessions = async () => {
    if (!selectedClass) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/classes/${selectedClass}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setExistingSessions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erreur lors du chargement des séances:', error);
    }
  };

  const deleteSession = async (sessionId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette séance ? Cette action est irréversible.')) {
      return;
    }

    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Erreur lors de la suppression');
      }

      setAutoSaveStatus('✓ Séance supprimée');
      setTimeout(() => setAutoSaveStatus(''), 2000);
      fetchExistingSessions();
    } catch (error) {
      console.error('Erreur:', error);
      setAutoSaveStatus('✗ Erreur lors de la suppression');
    }
  };

  const fetchSessionTracking = async (sessionId) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${apiUrl}/api/teacher/sessions/${sessionId}/tracking`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();

      let trackingData = {};
      if (Array.isArray(data)) {
        data.forEach(record => {
          trackingData[record.student_id] = {
            presence: record.presence,
            cahier_present: record.cahier_present,
            sleeping: record.sleeping,
            homework: record.homework,
            participation: record.participation,
            discipline: record.discipline,
            phone_use: record.phone_use,
            mini_eval: record.mini_eval,
            cahier_lesson: record.cahier_lesson,
            cahier_documents: record.cahier_documents,
            cahier_readability: record.cahier_readability,
            attitude: record.attitude,
            comment: record.comment,
            notes: record.notes,
            writing: record.writing,
          };
        });
      }

      // Récupérer les soumissions de devoirs pour cette séance
      const hwRes = await fetch(`${apiUrl}/api/teacher/homework-submissions?session_id=${sessionId}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
      });
      const hwData = await hwRes.json();
      console.log('Soumissions de devoirs reçues:', hwData);
      console.log('Nombre de soumissions:', Array.isArray(hwData) ? hwData.length : 0);
      
      if (Array.isArray(hwData)) {
        hwData.forEach(submission => {
          const homeworkKey = `homework_${submission.homework_id}`;
          if (!trackingData[submission.student_id]) {
            trackingData[submission.student_id] = {};
          }
          if (submission.status === 'submitted') {
            trackingData[submission.student_id][homeworkKey] = 'done';
            console.log(`Marqué comme done: student=${submission.student_id}, homework=${homeworkKey}, status=${submission.status}`);
          }
        });
      }

      setTracking(trackingData);
    } catch (error) {
      console.error('Erreur lors du chargement des suivis:', error);
    }
  };

  const fetchSessionFromApi = async (date = sessionDate) => {
    if (!selectedClass || !date) return;
    setSessionLoading(true);
    setSessionError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${apiUrl}/api/teacher/classes/${selectedClass}/sessions?date=${date}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        applySessionData(data[0]);
        fetchSessionTracking(data[0].id);
      } else {
        clearStoredSession();
        setCurrentSession(null);
        // Ne pas réinitialiser startTime et endTime s'ils viennent des paramètres d'URL
        if (!urlParamsRef.current.startTime) {
          setStartTime('');
        }
        if (!urlParamsRef.current.endTime) {
          setEndTime('');
        }
        setSessionInfo('');
        setSessionError('Aucune séance créée pour cette date.');
      }
    } catch (error) {
      console.error('Erreur:', error);
      setSessionError("Impossible de charger la séance. Veuillez réessayer.");
    } finally {
      setSessionLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!selectedClass) {
      setSessionError('Veuillez choisir une classe.');
      return;
    }
    if (!sessionDate) {
      setSessionError('Veuillez choisir une date.');
      return;
    }
    if (!startTime) {
      setSessionError("L'heure de début est obligatoire.");
      return;
    }
    if (sessionType === 'control' && !controlName) {
      setSessionError('Le nom du contrôle est obligatoire.');
      return;
    }
    if (currentSession) {
      setSessionError('Une séance existe déjà pour cette date.');
      return;
    }

    try {
      setSessionLoading(true);
      setSessionError('');
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          class_id: selectedClass,
          date: sessionDate,
          start_time: startTime,
          end_time: endTime || null,
          tracking_options: trackingOptions,
          type: sessionType,
          subject_id: selectedSubject || null,
          topic: sessionType === 'control' ? controlName : (lessonTitle || null),
          notes: sessionType === 'control' ? controlDescription : (lessonDescription || null),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setSessionError('⚠️ Séance déjà enregistrée pour cette date et cet horaire.');
        } else {
          setSessionError(data?.error || 'Impossible de créer la séance.');
        }
        return;
      }

      setAutoSaveStatus('✓ Séance créée');
      fetchExistingSessions();
      fetchActiveHomework();

      // Rediriger selon le type de séance
      if (sessionType === 'control') {
        navigate(`/teacher/control/${selectedClass}/${data.id}`);
      } else {
        applySessionData(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setSessionError("Erreur lors de la création de la séance.");
    } finally {
      setSessionLoading(false);
    }
  };

  const saveTracking = async () => {
    if (!selectedClass) return;
    if (!currentSession) {
      setSessionError('Veuillez créer une séance avant de commencer le suivi.');
      return;
    }

    // Vérifier que tous les élèves ont une présence enregistrée
    const missingPresence = students.filter(
      student => !tracking[student.id]?.presence
    );

    if (missingPresence.length > 0) {
      setSessionError(
        `Présence obligatoire pour tous les élèves. ${missingPresence.length} élève(s) sans présence enregistrée.`
      );
      return;
    }

    try {
      setSaving(true);
      setAutoSaveStatus('Sauvegarde...');
      setSaveProgress({ current: 0, total: Object.keys(tracking).length });

      let successCount = 0;
      let errorCount = 0;
      const studentIds = Object.keys(tracking);

      for (let i = 0; i < studentIds.length; i++) {
        const studentId = studentIds[i];
        const data = tracking[studentId];
        
        try {
          const token = await getAuthToken();
          const response = await fetch(`${apiUrl}/api/teacher/session-tracking`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              session_id: currentSession.id,
              student_id: studentId,
              presence: data.presence,
              cahier_present: data.cahier_present ?? false,
              sleeping: data.sleeping ?? false,
              homework: data.homework || null,
              participation: data.participation || null,
              discipline: data.discipline || null,
              phone_use: data.phone_use || false,
              mini_eval: data.mini_eval || null,
              cahier_lesson: data.cahier_lesson || null,
              cahier_documents: data.cahier_documents || null,
              cahier_readability: data.cahier_readability || null,
              attitude: data.attitude || null,
              comment: data.comment || null,
              notes: data.notes || null,
              writing: data.writing || false,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error(`Erreur pour élève ${studentId}:`, errorData);
            errorCount++;
          } else {
            successCount++;
          }

          // Enregistrer les soumissions de devoirs marqués comme faits
          for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('homework_') && value === 'done') {
              const homeworkId = key.replace('homework_', '');
              try {
                const hwToken = await getAuthToken();
                await fetch(`${apiUrl}/api/teacher/homework/${homeworkId}/submit/${studentId}`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${hwToken}`,
                    'Content-Type': 'application/json',
                  },
                });
              } catch (hwError) {
                console.error(`Erreur enregistrement devoir ${homeworkId}:`, hwError);
              }
            }
          }
        } catch (studentError) {
          console.error(`Erreur réseau pour élève ${studentId}:`, studentError);
          errorCount++;
        }

        setSaveProgress({ current: i + 1, total: studentIds.length });
      }

      if (errorCount === 0) {
        setAutoSaveStatus('✓ Séance enregistrée');
        setSessionSaved(true);
        setTimeout(() => {
          setAutoSaveStatus('');
          navigate('/teacher/dashboard');
        }, 1500);
        // Recharger les données depuis l'API pour synchroniser l'état
        await fetchSessionTracking(currentSession.id);
        fetchExistingSessions();
        fetchActiveHomework();
        
        // Si c'est un contrôle, le marquer comme terminé
        if (sessionType === 'control' && urlParamsRef.current.controlId) {
          await markControlAsCompleted(urlParamsRef.current.controlId);
        }
      } else {
        setAutoSaveStatus(`⚠️ ${successCount}/${students.length} élèves sauvegardés`);
        setTimeout(() => setAutoSaveStatus(''), 5000);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setAutoSaveStatus('✗ Erreur');
    } finally {
      setSaving(false);
    }
  };

  const updateTracking = (studentId, field, value) => {
    if (!currentSession) {
      setSessionError("Créez d'abord une séance pour cette date.");
      return;
    }
    
    setTracking(prev => {
      const updatedStudent = {
        ...prev[studentId],
        [field]: value
      };
      
      // Règle automatique : si distrait → participation faible
      if (field === 'discipline' && value === 'distrait') {
        updatedStudent.participation = 'faible';
      }
      
      return {
        ...prev,
        [studentId]: updatedStudent
      };
    });
  };

  const markControlAsCompleted = async (controlId) => {
    console.log('[DEBUG] markControlAsCompleted called with controlId:', controlId);
    try {
      const token = await getAuthToken();
      
      const res = await fetch(`${apiUrl}/api/teacher/controls-plan/${controlId}/complete`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('[DEBUG] markControlAsCompleted response status:', res.status);
      
      if (res.ok) {
        console.log('[DEBUG] Contrôle marqué comme terminé:', controlId);
        // Optionnel : rafraîchir les données du planificateur
        // window.location.href = '/teacher/planificateur';
      } else {
        const errorData = await res.json();
        console.error('Erreur lors de la mise à jour du contrôle:', errorData);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const cahierLabels = {
    cahier_lecon: 'Écriture de la leçon',
    cahier_collage: 'Collage des documents',
    cahier_lisibilite: 'Lisibilité de l’écriture'
  };

  const cahierStatusLabels = {
    cahier_lecon: {
      good: 'Complète',
      medium: 'Partielle',
      bad: 'Absente'
    },
    cahier_collage: {
      good: 'Correct',
      medium: 'Incomplet',
      bad: 'Non collé'
    },
    cahier_lisibilite: {
      good: 'Lisible',
      medium: 'Moyenne',
      bad: 'Difficile'
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Chargement...</p>
      </div>
    );
  }

  const selectedClassData = classes.find(c => c.id === selectedClass);

  return (
    <div className="space-y-4 pb-24">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-200">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Suivi Rapide</h1>
            <p className="text-xs text-gray-500">{selectedClassData?.name || 'Sélectionnez une classe'} • {students.length} élèves</p>
          </div>
        </div>
        {autoSaveStatus && (
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full animate-pulse ${
            autoSaveStatus.includes('✓') ? 'bg-green-100 text-green-700' :
            autoSaveStatus.includes('✗') || autoSaveStatus.includes('⚠') ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {autoSaveStatus}
          </span>
        )}
      </div>

      {/* ── Sélecteurs : Classe / Matière / Date ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Classe</label>
          <select
            value={selectedClass || ''}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          >
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Matière</label>
          <select
            value={selectedSubject || ''}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          >
            {subjects.map(sub => (
              <option key={sub.id} value={sub.id}>{sub.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Date</label>
          <div className="flex gap-2">
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
            <button
              onClick={fetchSessionFromApi}
              disabled={sessionLoading}
              className="px-2.5 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-blue-600 disabled:opacity-50 transition"
              title="Recharger la séance"
            >
              <RefreshCw className={`w-4 h-4 ${sessionLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Panneau Séance ── */}
      {!currentSession ? (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* En-tête du panneau */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Séance du {sessionDate ? new Date(sessionDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
              currentSession ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {currentSession ? <><CheckCircle2 className="w-3 h-3" /> Active</> : <><AlertCircle className="w-3 h-3" /> Aucune</>}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {sessionError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{sessionError}</p>
            </div>
          )}

          <>
            {/* Type de séance */}
            <div className="flex gap-2">
              <button
                onClick={() => setSessionType('normal')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                  sessionType === 'normal'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <BookOpen className="w-4 h-4" /> Cours
              </button>
              <button
                onClick={() => setSessionType('control')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                  sessionType === 'control'
                    ? 'border-red-500 bg-red-50 text-red-700 shadow-sm'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <CheckSquare className="w-4 h-4" /> Contrôle
              </button>
            </div>

            {/* Créneaux emploi du temps */}
            {timetableSlots.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Mes créneaux — {{ monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche' }[timetableSlots[0]?.day_of_week] || ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {timetableSlots.map((slot) => {
                    const slotStart = slot.start_time?.substring(0, 5);
                    const slotEnd = slot.end_time?.substring(0, 5);
                    const isSelected = startTime === slotStart && endTime === slotEnd;
                    const hasSession = existingSessions.some(s => s.start_time?.substring(0, 5) === slotStart);
                    return (
                      <button
                        key={slot.id}
                        onClick={() => !hasSession && selectTimetableSlot(slot)}
                        disabled={hasSession}
                        className={`relative px-3 py-2 rounded-lg border-2 text-left transition-all min-w-[110px] ${
                          hasSession
                            ? 'border-green-300 bg-green-50 opacity-50 cursor-not-allowed'
                            : isSelected
                              ? 'border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-200'
                              : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm cursor-pointer'
                        }`}
                      >
                        {hasSession && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px]">✓</span>
                        )}
                        <p className="text-xs font-bold text-gray-900">{slotStart} — {slotEnd}</p>
                        <p className="text-[10px] text-gray-500 truncate">{slot.subject?.name || '—'}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : selectedClass && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2">
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">Aucun créneau programmé</span> pour vous dans cette classe à cette date. Veuillez définir manuellement l'horaire ou contacter l'administration.
                </p>
              </div>
            )}

            {/* Horaires + Bouton créer */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Début *</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => { setStartTime(e.target.value); setSessionError(''); }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Fin</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => { setEndTime(e.target.value); setSessionError(''); }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleCreateSession}
                disabled={sessionLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 shadow-sm shadow-blue-200 transition whitespace-nowrap"
              >
                {sessionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {sessionLoading ? 'Création...' : 'Créer'}
              </button>
            </div>

            {/* Cahier de texte (cours) */}
            {sessionType === 'normal' && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> Cahier de texte
                </p>
                <input
                  type="text"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  placeholder="Chapitre / Titre de la leçon"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <textarea
                  value={lessonDescription}
                  onChange={(e) => setLessonDescription(e.target.value)}
                  placeholder="Objectif / Description de la séance"
                  rows="2"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            )}

            {/* Infos contrôle */}
            {sessionType === 'control' && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" /> Informations du contrôle
                </p>
                <input
                  type="text"
                  value={controlName}
                  onChange={(e) => { setControlName(e.target.value); setSessionError(''); }}
                  placeholder="Nom du contrôle *"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
                <textarea
                  value={controlDescription}
                  onChange={(e) => setControlDescription(e.target.value)}
                  placeholder="Description (optionnel)"
                  rows="2"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm resize-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>
            )}

            {/* Éléments à suivre (cours uniquement) */}
            {sessionType !== 'control' && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Éléments à suivre</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'cahier_present', label: '📘 Cahier', checked: trackingOptions.cahier_present },
                    { key: 'cahier', label: '🗂️ Cahier détails', checked: trackingOptions.cahier },
                    { key: 'discipline', label: '👁️ Vigilance', checked: trackingOptions.discipline },
                    { key: 'participation', label: '🙋 Participation', checked: trackingOptions.participation },
                    { key: 'attitude', label: '🙂 Attitude', checked: trackingOptions.attitude },
                    { key: 'sleeping', label: '😴 Veille', checked: trackingOptions.sleeping },
                    { key: 'phone_use', label: '📱 Téléphone', checked: trackingOptions.phone_use },
                    { key: 'writing', label: '✍️ Écriture', checked: trackingOptions.writing },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setTrackingOptions({...trackingOptions, [opt.key]: !opt.checked})}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                        opt.checked
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {activeHomework.length > 0 ? (
                    activeHomework.map(hw => {
                      const hwKey = `homework_${hw.id}`;
                      return (
                        <button
                          key={hw.id}
                          onClick={() => setTrackingOptions({...trackingOptions, [hwKey]: !trackingOptions[hwKey]})}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                            trackingOptions[hwKey]
                              ? 'bg-green-100 text-green-700 border-green-300'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          📚 {hw.title}
                        </button>
                      );
                    })
                  ) : (
                    <button
                      onClick={() => setTrackingOptions({...trackingOptions, homework: !trackingOptions.homework})}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                        trackingOptions.homework
                          ? 'bg-green-100 text-green-700 border-green-300'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      📚 Devoirs
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        </div>
      </div>
      ) : null}

      {!currentSession && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800">Créez une séance ci-dessus pour commencer le suivi des élèves.</p>
        </div>
      )}

      {!currentSession && existingSessions.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white shadow-sm group">
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 transition rounded-xl">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Séances enregistrées
              <span className="text-xs font-normal text-gray-400">({existingSessions.length})</span>
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="px-4 pb-3 space-y-1.5 max-h-60 overflow-y-auto">
            {existingSessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm cursor-pointer transition group/item ${
                  session.type === 'control'
                    ? 'hover:bg-red-50 border border-transparent hover:border-red-200'
                    : 'hover:bg-blue-50 border border-transparent hover:border-blue-200'
                }`}
                onClick={() => {
                  if (session.type === 'control') {
                    navigate(`/teacher/control/${selectedClass}/${session.id}`);
                  } else {
                    const dateStr = typeof session.date === 'string' ? session.date : new Date(session.date).toISOString().split('T')[0];
                    setSessionDate(dateStr);
                    setStartTime(session.start_time);
                    setEndTime(session.end_time || '');
                    fetchSessionFromApi(dateStr);
                  }
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {session.type === 'control' ? (
                    <CheckSquare className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  ) : (
                    <BookOpen className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">
                      {session.topic || (session.type === 'control' ? 'Contrôle' : 'Séance')}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {new Date(session.date).toLocaleDateString('fr-FR')} • {session.start_time?.substring(0,5)}{session.end_time ? ` — ${session.end_time?.substring(0,5)}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(session.id);
                  }}
                  className="p-1.5 rounded-lg hover:bg-red-100 transition opacity-0 group-hover/item:opacity-100"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {sessionSaved && (
        <div className="rounded-xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-5 text-center shadow-sm">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
          <p className="text-base font-semibold text-green-900 mb-1">Séance enregistrée avec succès</p>
          <p className="text-sm text-green-700 mb-4">Tous les suivis ont été sauvegardés.</p>
          <button
            onClick={handleResetSession}
            className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" /> Nouvelle séance
          </button>
        </div>
      )}

      {!sessionSaved && currentSession && trackingOptions && (
        <>
          <div className="space-y-4">
            {/* ── Actions rapides ── */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mr-1">Actions rapides</span>
                {(() => {
                  const allPresent = students.length > 0 && students.every(s => tracking[s.id]?.presence === 'present');
                  return (
                    <button
                      onClick={() => setAllPresenceToggle('present')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition text-xs font-semibold ${allPresent ? 'bg-green-600 text-white border-green-600' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}
                    >
                      ✔️ Tout présent
                    </button>
                  );
                })()}
                {(() => {
                  const allAbsent = students.length > 0 && students.every(s => tracking[s.id]?.presence === 'absent');
                  return (
                    <button
                      onClick={() => setAllPresenceToggle('absent')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition text-xs font-semibold ${allAbsent ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                    >
                      ✖️ Tout absent
                    </button>
                  );
                })()}
                {trackingOptions?.cahier_present && (() => {
                  const allChecked = students.length > 0 && students.every(s => tracking[s.id]?.cahier_present);
                  return (
                    <button
                      onClick={() => setAllCahierPresent(!allChecked)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border transition text-xs font-semibold ${allChecked ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}
                    >
                      📘 Tout cahier
                    </button>
                  );
                })()}
                {trackingOptions?.writing && (() => {
                  const allChecked = students.length > 0 && students.every(s => tracking[s.id]?.writing);
                  return (
                    <button
                      onClick={() => setAllWriting(!allChecked)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border transition text-xs font-semibold ${allChecked ? 'bg-purple-600 text-white border-purple-600' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'}`}
                    >
                      ✍️ Tout écrit
                    </button>
                  );
                })()}
                {trackingOptions?.homework && (() => {
                  const allChecked = students.length > 0 && students.every(s => tracking[s.id]?.homework === 'done' || tracking[s.id]?.homework === true);
                  return (
                    <button
                      onClick={() => setAllHomework(!allChecked)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border transition text-xs font-semibold ${allChecked ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                    >
                      📚 Tout devoirs
                    </button>
                  );
                })()}
                {trackingOptions?.attitude && (() => {
                  const allChecked = students.length > 0 && students.every(s => tracking[s.id]?.attitude === 'correct');
                  return (
                    <button
                      onClick={() => setAllAttitude(allChecked ? null : 'correct')}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border transition text-xs font-semibold ${allChecked ? 'bg-pink-600 text-white border-pink-600' : 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100'}`}
                    >
                      🙂 Tout correct
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Tableau restructuré */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[10px]">
                    <th className="px-2 py-1 sticky left-0 bg-gray-50 z-10 font-bold">Élève</th>
                    <th className="px-1 py-1 bg-blue-50 font-bold">P</th>
                    {trackingOptions?.cahier_present && <th className="px-1 py-1 bg-blue-50 font-bold">📘 Cahier</th>}
                    {trackingOptions?.writing && <th className="px-1 py-1 bg-purple-50 font-bold">✍️ Écrit.</th>}
                    {trackingOptions?.cahier && (
                      <>
                        <th className="px-1 py-1 bg-orange-50 font-bold">✏️ Leçon</th>
                        <th className="px-1 py-1 bg-orange-50 font-bold">📄 Docs</th>
                        <th className="px-1 py-1 bg-orange-50 font-bold">🔍 Lisib.</th>
                      </>
                    )}
                    {trackingOptions?.discipline && <th className="px-1 py-1 bg-yellow-50 font-bold">👁️ Vigilance</th>}
                    {activeHomework.length > 0 ? activeHomework.map(hw => {
                      const homeworkKey = `homework_${hw.id}`;
                      if (trackingOptions[homeworkKey]) {
                        return (
                          <th key={hw.id} className="px-1 py-1 bg-green-50 font-bold text-[10px]">
                            📚 {hw.title}
                          </th>
                        );
                      }
                      return null;
                    }) : trackingOptions?.homework && (
                      <th className="px-1 py-1 bg-green-50 font-bold">📚 Devoir</th>
                    )}
                    {trackingOptions?.participation && <th className="px-1 py-1 bg-green-50 font-bold">🙋 Partic.</th>}
                    {trackingOptions?.attitude && <th className="px-1 py-1 bg-pink-50 font-bold">🙂 Attitude</th>}
                    {trackingOptions?.sleeping && <th className="px-1 py-1 bg-blue-50 font-bold">😴 Veille</th>}
                    {trackingOptions?.phone_use && <th className="px-1 py-1 bg-yellow-50 font-bold">📱 Tél.</th>}
                    <th className="px-1 py-1 bg-pink-50 font-bold">🗒️ Notes</th>
                  </tr>
                </thead>
              <tbody>
                {students.map((student, idx) => {
                  const hasPresence = !!tracking[student.id]?.presence;
                  return (
                    <tr key={student.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className={`px-2 py-1 font-medium sticky left-0 z-10 bg-inherit border-r border-gray-200 whitespace-nowrap ${
                        !hasPresence ? 'bg-red-50' : ''
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${hasPresence ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          {student.first_name} {student.last_name}
                        </div>
                      </td>

                      {/* Présence */}
                      <td className="px-1 py-1 text-center">
                        <div className="flex gap-0.5 justify-center">
                          {[
                            { value: 'present', icon: '✔️', label: 'Présent' },
                            { value: 'absent', icon: '✖️', label: 'Absent' },
                            { value: 'late', icon: '⏱️', label: 'Retard' }
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => updateTracking(student.id, 'presence', opt.value)}
                              className={`w-6 h-6 rounded text-xs ${
                                tracking[student.id]?.presence === opt.value
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-200 hover:bg-gray-300'
                              }`}
                              title={`Présence : ${opt.label}`}
                            >
                              {opt.icon}
                            </button>
                          ))}
                        </div>
                      </td>

                      {/* Cahier Présent */}
                      {trackingOptions?.cahier_present && (
                        <td className="px-1 py-1 text-center bg-blue-50">
                          {tracking[student.id]?.presence === 'absent' ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={tracking[student.id]?.cahier_present || false}
                              onChange={(e) => updateTracking(student.id, 'cahier_present', e.target.checked)}
                              className="w-4 h-4 cursor-pointer"
                              title="Cahier présent"
                            />
                          )}
                        </td>
                      )}

                      {/* Écriture */}
                      {trackingOptions?.writing && (
                        <td className="px-1 py-1 text-center bg-purple-50">
                          {tracking[student.id]?.presence === 'absent' ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <button
                              onClick={() =>
                                updateTracking(
                                  student.id,
                                  'writing',
                                  !tracking[student.id]?.writing
                                )
                              }
                              className={`w-7 h-7 rounded-full text-base flex items-center justify-center ${
                                tracking[student.id]?.writing
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                              title="Cliquez si l'élève a écrit"
                            >
                              ✍️
                            </button>
                          )}
                        </td>
                      )}

                      {/* Cahier détaillé */}
                      {trackingOptions?.cahier && (
                        <>
                          <td className="px-1 py-1 text-center bg-orange-50">
                            {tracking[student.id]?.presence === 'absent' || !tracking[student.id]?.cahier_present ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={tracking[student.id]?.cahier_lesson === 'complete' || false}
                                onChange={(e) => updateTracking(student.id, 'cahier_lesson', e.target.checked ? 'complete' : null)}
                                className="w-4 h-4 cursor-pointer"
                                title="Leçon complète"
                              />
                            )}
                          </td>
                          <td className="px-1 py-1 text-center bg-orange-50">
                            {tracking[student.id]?.presence === 'absent' || !tracking[student.id]?.cahier_present ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={tracking[student.id]?.cahier_documents === 'correct' || false}
                                onChange={(e) => updateTracking(student.id, 'cahier_documents', e.target.checked ? 'correct' : null)}
                                className="w-4 h-4 cursor-pointer"
                                title="Documents corrects"
                              />
                            )}
                          </td>
                          <td className="px-1 py-1 text-center bg-orange-50">
                            {tracking[student.id]?.presence === 'absent' || !tracking[student.id]?.cahier_present ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={tracking[student.id]?.cahier_readability === 'readable' || false}
                                onChange={(e) => updateTracking(student.id, 'cahier_readability', e.target.checked ? 'readable' : null)}
                                className="w-4 h-4 cursor-pointer"
                                title="Cahier lisible"
                              />
                            )}
                          </td>
                        </>
                      )}

                      {/* Vigilance */}
                      {trackingOptions?.discipline && (
                        <td className="px-1 py-1 text-center bg-yellow-50">
                          {tracking[student.id]?.presence === 'absent' ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex gap-0.5 justify-center">
                              {[
                                { value: 'concentre', icon: '🟢', label: 'Concentré' },
                                { value: 'moyen', icon: '🟡', label: 'Moyen' },
                                { value: 'distrait', icon: '🔴', label: 'Distrait' }
                              ].map(opt => (
                                <button
                                  key={opt.value}
                                  onClick={() => updateTracking(student.id, 'discipline', tracking[student.id]?.discipline === opt.value ? null : opt.value)}
                                  className={`w-6 h-6 rounded text-xs ${
                                    tracking[student.id]?.discipline === opt.value
                                      ? 'bg-yellow-600 text-white'
                                      : 'bg-gray-200 hover:bg-gray-300'
                                  }`}
                                  title={opt.label}
                                >
                                  {opt.icon}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Devoirs */}
                      {activeHomework.length > 0 ? activeHomework.map(hw => {
                        const homeworkKey = `homework_${hw.id}`;
                        const isChecked = trackingOptions[homeworkKey];

                        // N'afficher la colonne que si elle est cochée dans les options
                        if (!isChecked) return null;

                        // Vérifier si ce devoir s'applique à cet étudiant
                        const appliesToAll = hw.target_type === 'all';
                        const appliesToGroup = hw.target_type === 'group' && hw.homework_students?.some(hs => hs.student_id === student.id);

                        // Vérifier si l'étudiant a déjà soumis ce devoir
                        const studentSubmitted = hw.homework_submissions?.some(sub => sub.student_id === student.id && (sub.status === 'submitted' || sub.status === 'graded'));

                        return (
                          <td key={hw.id} className="px-1 py-1 text-center bg-green-50">
                            {!appliesToAll && !appliesToGroup ? (
                              <span className="text-gray-300">—</span>
                            ) : studentSubmitted ? (
                              <span className="text-green-600 font-semibold">✓</span>
                            ) : tracking[student.id]?.presence === 'absent' ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={tracking[student.id]?.[homeworkKey] === 'done' || false}
                                onChange={(e) => updateTracking(student.id, homeworkKey, e.target.checked ? 'done' : null)}
                                className="w-4 h-4 cursor-pointer"
                                title={hw.title}
                              />
                            )}
                          </td>
                        );
                      }) : trackingOptions?.homework && (
                        <td className="px-1 py-1 text-center bg-green-50">
                          {tracking[student.id]?.presence === 'absent' ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={tracking[student.id]?.homework === 'done' || tracking[student.id]?.homework === true || false}
                              onChange={(e) => updateTracking(student.id, 'homework', e.target.checked ? 'done' : null)}
                              className="w-4 h-4 cursor-pointer"
                              title="Devoir fait"
                            />
                          )}
                        </td>
                      )}

                      {/* Participation */}
                      {trackingOptions?.participation && (
                        <td className="px-1 py-1 text-center bg-green-50">
                          {tracking[student.id]?.presence === 'absent' ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex gap-0.5 justify-center">
                              {[
                                { value: 'faible', icon: '😐', label: 'Faible' },
                                { value: 'bon', icon: '🙋', label: 'Bonne' },
                                { value: 'excellent', icon: '⭐', label: 'Excellente' }
                              ].map(opt => (
                                <button
                                  key={opt.value}
                                  onClick={() => updateTracking(student.id, 'participation', tracking[student.id]?.participation === opt.value ? null : opt.value)}
                                  className={`w-6 h-6 rounded text-xs ${
                                    tracking[student.id]?.participation === opt.value
                                      ? 'bg-green-600 text-white'
                                      : 'bg-gray-200 hover:bg-gray-300'
                                  }`}
                                  title={opt.label}
                                >
                                  {opt.icon}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Attitude */}
                      {trackingOptions?.attitude && (
                        <td className="px-1 py-1 text-center bg-pink-50">
                          {tracking[student.id]?.presence === 'absent' ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex gap-0.5 justify-center">
                              {[
                                { value: 'correct', icon: '✓', label: 'Correct' },
                                { value: 'bavarre', icon: '💬', label: 'Bavarre' },
                                { value: 'perturbateur', icon: '⚠️', label: 'Perturbateur' }
                              ].map(opt => (
                                <button
                                  key={opt.value}
                                  onClick={() => updateTracking(student.id, 'attitude', tracking[student.id]?.attitude === opt.value ? null : opt.value)}
                                  className={`w-6 h-6 rounded text-xs ${
                                    tracking[student.id]?.attitude === opt.value
                                      ? 'bg-pink-600 text-white'
                                      : 'bg-gray-200 hover:bg-gray-300'
                                  }`}
                                  title={opt.label}
                                >
                                  {opt.icon}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Dormance (Veille) */}
                      {trackingOptions?.sleeping && (
                        <td className="px-1 py-1 text-center bg-blue-50">
                          {tracking[student.id]?.presence === 'absent' ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <button
                              onClick={() =>
                                updateTracking(
                                  student.id,
                                  'sleeping',
                                  !tracking[student.id]?.sleeping
                                )
                              }
                              className={`w-7 h-7 rounded-full text-base flex items-center justify-center ${
                                tracking[student.id]?.sleeping
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                              title="Cliquez si l'élève s'est endormi"
                            >
                              😴
                            </button>
                          )}
                        </td>
                      )}

                      {/* Téléphone */}
                      {trackingOptions?.phone_use && (
                        <td className="px-1 py-1 text-center bg-yellow-50">
                          {tracking[student.id]?.presence === 'absent' ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <button
                              onClick={() =>
                                updateTracking(
                                  student.id,
                                  'phone_use',
                                  !tracking[student.id]?.phone_use
                                )
                              }
                              className={`w-7 h-7 rounded-full text-base flex items-center justify-center ${
                                tracking[student.id]?.phone_use
                                  ? 'bg-yellow-500 text-white'
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                              title="Cliquez si l'élève a utilisé le téléphone"
                            >
                              📱
                            </button>
                          )}
                        </td>
                      )}

                      {/* Observation - Commentaire */}
                      <td className="px-1 py-1 bg-pink-50">
                        <input
                          type="text"
                          placeholder="..."
                          maxLength="50"
                          value={tracking[student.id]?.comment || ''}
                          onChange={(e) => updateTracking(student.id, 'comment', e.target.value)}
                          className="w-16 h-6 text-xs border border-gray-300 rounded px-1"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Barre de progression de sauvegarde */}
          {saving && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-blue-900">Enregistrement...</p>
                <p className="text-xs text-blue-700 font-medium">
                  {saveProgress.current} / {saveProgress.total}
                </p>
              </div>
              <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${(saveProgress.current / saveProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Barre flottante de sauvegarde ── */}
      {!sessionSaved && currentSession && (
        <div className="fixed bottom-0 left-64 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between px-6 py-3 max-w-full">
            {/* Indicateur de complétude */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  {students.filter(s => tracking[s.id]?.presence).length}/{students.length} présences
                </span>
              </div>
              <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    students.filter(s => tracking[s.id]?.presence).length === students.length
                      ? 'bg-green-500'
                      : 'bg-amber-400'
                  }`}
                  style={{ width: `${students.length > 0 ? (students.filter(s => tracking[s.id]?.presence).length / students.length) * 100 : 0}%` }}
                />
              </div>
              {students.filter(s => tracking[s.id]?.presence).length < students.length && (
                <span className="text-[11px] text-amber-600 font-medium">
                  {students.length - students.filter(s => tracking[s.id]?.presence).length} restant(s)
                </span>
              )}
            </div>

            {/* Bouton sauvegarder */}
            <button
              onClick={saveTracking}
              disabled={saving || students.filter(s => tracking[s.id]?.presence).length < students.length}
              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition shadow-sm ${
                students.filter(s => tracking[s.id]?.presence).length === students.length
                  ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Enregistrement...' : 'Enregistrer la séance'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuiviRapide;
