import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Clock, FileText, Plus, Edit2, Trash2, Save, X, CheckCircle, Users, TrendingUp, AlertTriangle, FileCheck, Upload, BarChart3, Edit3, Activity, TrendingDown, Search, ClipboardPaste } from 'lucide-react';
import { saveBlob } from '../../lib/download';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useI18n } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import TaskModal from '../../components/ui/TaskModal';

const ControlsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedAction = searchParams.get('action');
  const requestedClassId = searchParams.get('classId') || '';
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const isControlOwner = useCallback(
    (control) => control.is_owner ?? control.teacher_id === profile?.id,
    [profile?.id]
  );
  // La dispersion est stockee en francais (valeur metier) : on ne traduit que l'affichage.
  const dispersionLabel = (d) => (
    d === 'Faible' ? t('cp.dispersion.low') : d === 'Moyen' ? t('cp.dispersion.medium') : t('cp.dispersion.high')
  );

  // Composant pour afficher une carte de contrôle avec statistiques (optimisé avec cache)
  const ControlCard = ({ control }) => {
    const stats = controlsStatsCache[control.id];
    const isOwner = isControlOwner(control);

    return (
      <div className={`p-3 sm:p-4 border rounded-xl transition-colors ${isOwner ? 'border-gray-200 bg-white hover:border-blue-200' : 'border-indigo-100 bg-indigo-50/30 hover:border-indigo-200'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{control.name}</h3>
              {control.kind === 'activity' && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 flex-shrink-0">{t('cp.activity')}</span>
              )}
              <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${getStatusColor(control.status)}`}>
                {getStatusLabel(control.status)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600 mb-2">
              <div className="flex items-center gap-1 flex-shrink-0">
                <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                {new Date(control.date).toLocaleDateString(dateLocale)}
              </div>
              {control.start_time && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                  {control.start_time} {control.end_time ? `- ${control.end_time}` : ''}
                </div>
              )}
              <div className="flex items-center gap-1 flex-shrink-0">
                <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="truncate">{control.class_name}</span>
              </div>
              {control.subject_name && (
                <span>{t('cp.subjectLabel', { name: control.subject_name })}</span>
              )}
              {control.teacher_name && (
                <span>{t('cp.teacherLabel', { name: control.teacher_name })}</span>
              )}
            </div>
            {!isOwner && (
              <p className="mb-2 text-xs font-medium text-indigo-600">{t('cp.sharedControl')}</p>
            )}
            {control.description && (
              <p className="text-xs sm:text-sm text-gray-700 line-clamp-2">{control.description}</p>
            )}
          </div>
          {isOwner && <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <button
              onClick={() => {
                setSelectedControlForNotes(control);
                setShowNotesModal(true);
                setActiveNotesTab('manual');
              }}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5 flex-shrink-0 shadow-sm"
            >
              <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {t('cp.enterGrades')}
            </button>
            {control.status === 'planned' && (
              <button
                onClick={() => navigate(`/teacher/rapide?controlId=${control.id}&classId=${control.class_id}&date=${control.date}&name=${encodeURIComponent(control.name)}&description=${encodeURIComponent(control.description || '')}&startTime=${control.start_time || ''}&endTime=${control.end_time || ''}`)}
                className="px-3 py-2 border border-green-200 bg-green-50 text-green-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-green-100 transition-colors flex-shrink-0"
              >
                {t('cp.start')}
              </button>
            )}
            <button
              onClick={() => handleEdit(control)}
              className="p-1.5 sm:p-2 hover:bg-blue-100 rounded transition flex-shrink-0"
              title={t('common.modify')}
            >
              <Edit2 className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
            </button>
            <button
              onClick={() => handleDelete(control.id)}
              className="p-1.5 sm:p-2 hover:bg-red-100 rounded transition flex-shrink-0"
              title={t('sr.delete')}
            >
              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
            </button>
          </div>}
        </div>

        {/* Résumé compact : l'analyse complète reste disponible dans l'espace notes. */}
        {isOwner && control.status === 'completed' && (
          <div className="border-t border-gray-100 pt-3">
            {statsLoading && !stats ? (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <span>{t('cp.loadingStats')}</span>
              </div>
            ) : stats && stats.totalStudents > 0 ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm">
                <div>
                  <span className="text-gray-500">{t('cp.notedStudents')}</span>{' '}
                  <strong className="text-gray-900">{stats.notedStudents || 0}/{stats.totalStudents}</strong>
                </div>
                <div>
                  <span className="text-gray-500">{t('cp.average')}</span>{' '}
                  <strong className="text-blue-700">{Number(stats.average || 0).toFixed(1)}/20</strong>
                </div>
                <div>
                  <span className="text-gray-500">{t('cp.successRate')}</span>{' '}
                  <strong className="text-green-700">{stats.successRate || 0}%</strong>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-xs">
                {statsLoading ? t('common.loading') : t('cp.noStats')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const [classes, setClasses] = useState([]);
  const [controls, setControls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingControl, setEditingControl] = useState(null);
  const [saving, setSaving] = useState(false);

  // États pour le filtre
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [controlScope, setControlScope] = useState('mine');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(12);

  // Cache global pour les statistiques par contrôle
  const [controlsStatsCache, setControlsStatsCache] = useState({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [classStats, setClassStats] = useState({
    totalClasses: 0,
    totalStudents: 0
  });

  // États pour le debounce
  const [debouncedFilterStatus, setDebouncedFilterStatus] = useState('all');
  const [debouncedFilterClass, setDebouncedFilterClass] = useState('all');

  // États pour la modal de gestion des notes
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [selectedControlForNotes, setSelectedControlForNotes] = useState(null);
  const [activeNotesTab, setActiveNotesTab] = useState('manual'); // 'manual', 'stats'
  const [classStudents, setClassStudents] = useState([]);
  const [studentsNotes, setStudentsNotes] = useState({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [pasteNotesText, setPasteNotesText] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showFailingModal, setShowFailingModal] = useState(false);
  const [failingStudents, setFailingStudents] = useState([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsData, setDetailsData] = useState(null);

  // États pour l'import Excel des notes (multi-fichiers)
  // excelFiles: [{ id, file, classId, parsing, parsed, mappings, error, importResult }]
  const [excelFiles, setExcelFiles] = useState([]);
  const [excelImporting, setExcelImporting] = useState(false);
  const [excelGlobalError, setExcelGlobalError] = useState(null);
  const [excelGlobalResult, setExcelGlobalResult] = useState(null);
  const [showExcelImportSection, setShowExcelImportSection] = useState(false);
  const [excelImportTarget, setExcelImportTarget] = useState(null);
  const [notesVersion, setNotesVersion] = useState(0);
  const [excelDragOver, setExcelDragOver] = useState(false);

  const [formData, setFormData] = useState({
    class_id: '',
    name: '',
    date: '',
    start_time: '',
    end_time: '',
    description: '',
    kind: 'control'
  });

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    if (requestedAction !== 'create') return;
    setEditingControl(null);
    setFormData({
      class_id: requestedClassId,
      name: '',
      date: '',
      start_time: '',
      end_time: '',
      description: '',
      kind: 'control'
    });
    setShowCreateModal(true);
  }, [requestedAction, requestedClassId]);

  // Debounce pour le filtre de statut
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilterStatus(filterStatus);
    }, 300);

    return () => clearTimeout(timer);
  }, [filterStatus]);

  // Debounce pour le filtre de classe
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilterClass(filterClass);
    }, 300);

    return () => clearTimeout(timer);
  }, [filterClass]);

  // Fonction pour charger toutes les statistiques des contrôles terminés
  const loadAllControlsStats = async (forceReload = false) => {
    const completedControls = controls.filter(c => c.status === 'completed' && isControlOwner(c));
    
    if (completedControls.length === 0) {
      setControlsStatsCache({});
      return;
    }

    setStatsLoading(true);
    
    try {
      const token = await getAuthToken();
      const cache = forceReload ? {} : { ...controlsStatsCache };

      // Identifier les contrôles qui ne sont pas encore dans le cache
      const controlsToLoad = completedControls.filter(control => !cache[control.id]);

      if (controlsToLoad.length === 0) {
        setStatsLoading(false);
        return;
      }

      // Récupérer toutes les données en parallèle
      const statsPromises = controlsToLoad.map(async (control) => {
        try {
          // Récupérer les sessions de contrôle pour ce contrôle
          const sessionsRes = await fetch(`${apiUrl}/api/teacher/classes/${control.class_id}/sessions?date=${control.date}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          let allTrackingData = [];
          if (sessionsRes.ok) {
            const sessions = await sessionsRes.json();
            const controlSessions = sessions.filter(s => s.type === 'control');
            
            const trackingPromises = controlSessions.map(async (session) => {
              const trackingRes = await fetch(`${apiUrl}/api/teacher/sessions/${session.id}/control-tracking`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              
              if (trackingRes.ok) {
                return await trackingRes.json();
              }
              return [];
            });

            const trackingResults = await Promise.all(trackingPromises);
            allTrackingData = trackingResults.flat();
          }

          // Récupérer les notes du contrôle
          let notesData = [];
          try {
            const notesRes = await fetch(`${apiUrl}/api/teacher/controls/${control.id}/notes`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (notesRes.ok) {
              notesData = await notesRes.json();
            }
          } catch (e) {
            console.error(`Erreur notes contrôle ${control.id}:`, e);
          }

          // Récupérer le nombre d'élèves de la classe
          let classStudentCount = allTrackingData.length;
          if (classStudentCount === 0) {
            try {
              const studentsRes = await fetch(`${apiUrl}/api/teacher/classes/${control.class_id}/students`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (studentsRes.ok) {
                const students = await studentsRes.json();
                classStudentCount = Array.isArray(students) ? students.length : 0;
              }
            } catch (e) {}
          }

          // Calculer les stats de notes
          const validNotes = notesData
            .filter(n => n.note !== null && n.note !== undefined)
            .map(n => parseFloat(n.note))
            .filter(n => !isNaN(n));

          const notedStudents = validNotes.length;
          const average = notedStudents > 0 ? validNotes.reduce((s, n) => s + n, 0) / notedStudents : 0;
          const high = validNotes.filter(n => n >= 15).length;
          const medium = validNotes.filter(n => n >= 10 && n < 15).length;
          const low = validNotes.filter(n => n < 10).length;
          const minNote = notedStudents > 0 ? Math.min(...validNotes) : 0;
          const maxNote = notedStudents > 0 ? Math.max(...validNotes) : 0;

          let dispersion = 'Faible';
          if (notedStudents > 0) {
            const variance = validNotes.reduce((s, n) => s + Math.pow(n - average, 2), 0) / notedStudents;
            const stdDev = Math.sqrt(variance);
            if (stdDev > 4) dispersion = 'Élevé';
            else if (stdDev > 2) dispersion = 'Moyen';
          }
            
          const controlStats = {
            totalStudents: classStudentCount || allTrackingData.length,
            absences: allTrackingData.filter(t => t.presence === 'absent').length,
            materialComplete: allTrackingData.filter(t => t.material_status === 'complete').length,
            disciplineGood: allTrackingData.filter(t => t.discipline_status === 'good').length,
            phoneUsage: allTrackingData.filter(t => t.phone_use).length,
            cheatingAttempts: allTrackingData.filter(t => t.discipline_notes?.toLowerCase().includes('triche')).length,
            cheatingCaught: allTrackingData.filter(t => t.discipline_notes?.toLowerCase().includes('trich')).length,
            copiesSubmitted: allTrackingData.filter(t => t.copy_submitted).length,
            // Stats de notes
            notedStudents,
            average,
            minNote,
            maxNote,
            dispersion,
            successRate: notedStudents > 0 ? Math.round((high + medium) / notedStudents * 100) : 0,
            distribution: {
              high: notedStudents > 0 ? Math.round((high / notedStudents) * 100) : 0,
              medium: notedStudents > 0 ? Math.round((medium / notedStudents) * 100) : 0,
              low: notedStudents > 0 ? Math.round((low / notedStudents) * 100) : 0
            },
            notesRaw: notesData
          };

          return { controlId: control.id, stats: controlStats };
        } catch (error) {
          console.error(`Erreur pour le contrôle ${control.id}:`, error);
          return { controlId: control.id, stats: null };
        }
      });

      const results = await Promise.all(statsPromises);
      
      // Mettre à jour le cache
      const newCache = { ...cache };
      results.forEach(({ controlId, stats }) => {
        if (stats) {
          newCache[controlId] = stats;
        }
      });

      setControlsStatsCache(newCache);
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fonction pour enregistrer les notes
  const handleSaveNotes = async () => {
    const notesData = Object.entries(studentsNotes).flatMap(([studentId, noteData]) => {
      const rawNote = noteData.note;
      if (rawNote === undefined || rawNote === null || String(rawNote).trim() === '') return [];
      const note = Number(String(rawNote).replace(',', '.'));
      return [{
        student_id: studentId,
        control_id: selectedControlForNotes.id,
        note,
        appreciation: noteData.appreciation || ''
      }];
    });

    const invalidNotes = notesData.filter(({ note }) => !Number.isFinite(note) || note < 0 || note > 20);
    if (invalidNotes.length > 0) {
      alert(t('cp.invalidGrades', { n: invalidNotes.length }));
      return;
    }

    if (notesData.length === 0) {
      alert(t('cp.noNoteToSave'));
      return;
    }

    setSavingNotes(true);
    try {
      const token = await getAuthToken();

      console.log('Enregistrement des notes:', notesData);

      // Appel API pour sauvegarder les notes
      const res = await fetch(`${apiUrl}/api/teacher/controls/${selectedControlForNotes.id}/notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: notesData })
      });

      if (res.ok) {
        const result = await res.json();
        console.log('Notes enregistrées avec succès:', result);
        
        // Afficher un message de succès
        alert(t('cp.notesSaved', { n: notesData.length }));
        
        // Fermer automatiquement la modal de saisie manuelle
        setShowNotesModal(false);
        
        // Réinitialiser les données des notes
        setStudentsNotes({});
        
        // Mettre à jour les statistiques des contrôles pour refléter les nouvelles notes
        await loadAllControlsStats(true);
        
        // Optionnel : Recharger les données du contrôle pour mettre à jour l'interface
        // loadClassStudents(selectedControlForNotes.class_id);
      } else {
        const error = await res.json();
        console.error('Erreur lors de l\'enregistrement:', error);
        alert(t('cp.saveNotesError', { detail: error.error || t('cp.unknownError') }));
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert(t('cp.saveNotesFailed'));
    } finally {
      setSavingNotes(false);
    }
  };

  // Fonction pour traiter le collage des notes
  const handlePasteNotes = () => {
    const lines = pasteNotesText.split('\n').filter(line => line.trim());
    const notes = lines.map(line => Number(line.trim().replace(',', '.')));
    const invalidCount = notes.filter(note => !Number.isFinite(note) || note < 0 || note > 20).length;
    if (invalidCount > 0) {
      alert(t('cp.pasteInvalid', { n: invalidCount }));
      return;
    }

    // Mettre à jour les notes des élèves dans l'ordre
    const updatedNotes = { ...studentsNotes };
    classStudents.forEach((student, index) => {
      if (index < notes.length) {
        updatedNotes[student.id] = {
          ...updatedNotes[student.id],
          note: lines[index].trim() // Garder le format original (avec virgule si présente)
        };
      }
    });

    setStudentsNotes(updatedNotes);
    
    // Fermer la modal de collage
    setShowPasteModal(false);
    setPasteNotesText('');
    
    // Afficher un message de confirmation
    const notesCount = notes.length;
    const studentsCount = Math.min(notesCount, classStudents.length);
    alert(t('cp.pasted', { students: studentsCount, notes: notesCount }));
  };

  // Fonction pour calculer les statistiques d'un contrôle
  const calculateControlStats = (controlId) => {
    const cachedStats = controlsStatsCache[controlId];
    
    // Vérifier si on a des notes live dans la modal (studentsNotes non vide)
    const hasLiveNotes = Object.keys(studentsNotes).length > 0 && classStudents.length > 0;

    // Si pas de cache ET pas de notes live, retourner des valeurs par défaut
    if (!cachedStats && !hasLiveNotes) {
      return {
        average: 0,
        totalStudents: 0,
        notedStudents: 0,
        notedPercentage: 0,
        successRate: 0,
        minNote: 0,
        maxNote: 0,
        dispersion: 'Faible',
        distribution: { high: 0, medium: 0, low: 0 },
        failingStudents: []
      };
    }

    // Si la modal est ouverte avec des notes live, utiliser celles-ci (plus récentes, édition en temps réel)
    if (hasLiveNotes) {
      const notesFromStudents = Object.values(studentsNotes)
        .filter(noteData => {
          const hasNote = noteData.note !== undefined && noteData.note !== null && noteData.note !== '';
          if (!hasNote) return false;
          if (typeof noteData.note === 'string') return noteData.note.trim() !== '';
          if (typeof noteData.note === 'number') return !isNaN(noteData.note);
          return false;
        })
        .map(noteData => {
          const noteValue = typeof noteData.note === 'string' 
            ? parseFloat(noteData.note.replace(',', '.'))
            : noteData.note;
          return noteValue;
        })
        .filter(note => !isNaN(note));

      const high = notesFromStudents.filter(note => note >= 15).length;
      const medium = notesFromStudents.filter(note => note >= 10 && note < 15).length;
      const low = notesFromStudents.filter(note => note < 10).length;
      const total = notesFromStudents.length;
      const totalStudents = classStudents.length || 0;

      let dispersion = 'Faible';
      if (total > 0) {
        const avg = notesFromStudents.reduce((sum, note) => sum + note, 0) / total;
        const variance = notesFromStudents.reduce((sum, note) => sum + Math.pow(note - avg, 2), 0) / total;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 4) dispersion = 'Élevé';
        else if (stdDev > 2) dispersion = 'Moyen';
      }

      const minNote = total > 0 ? Math.min(...notesFromStudents) : 0;
      const maxNote = total > 0 ? Math.max(...notesFromStudents) : 0;

      const failingStudents = Object.entries(studentsNotes)
        .filter(([_, noteData]) => {
          const hasNote = noteData.note !== undefined && noteData.note !== null && noteData.note !== '';
          if (!hasNote) return false;
          let noteValue;
          if (typeof noteData.note === 'string') noteValue = parseFloat(noteData.note.replace(',', '.'));
          else if (typeof noteData.note === 'number') noteValue = noteData.note;
          else return false;
          return !isNaN(noteValue) && noteValue < 10;
        })
        .map(([studentId, noteData]) => {
          const student = classStudents.find(s => s.id === studentId);
          const studentName = student ? `${student.first_name} ${student.last_name}` : t('cp.unknownStudent');
          return { id: studentId, name: studentName, note: noteData.note };
        });

      return {
        average: total > 0 ? notesFromStudents.reduce((sum, note) => sum + note, 0) / total : 0,
        totalStudents,
        notedStudents: total,
        notedPercentage: totalStudents > 0 ? Math.round((total / totalStudents) * 100) : 0,
        successRate: total > 0 ? Math.round((high + medium) / total * 100) : 0,
        minNote,
        maxNote,
        dispersion,
        distribution: {
          high: total > 0 ? Math.round((high / total) * 100) : 0,
          medium: total > 0 ? Math.round((medium / total) * 100) : 0,
          low: total > 0 ? Math.round((low / total) * 100) : 0
        },
        failingStudents
      };
    }

    // Sinon, utiliser les stats du cache (après import Excel, hors modal)
    const failingFromCache = (cachedStats.notesRaw || [])
      .filter(n => n.note !== null && n.note !== undefined && parseFloat(n.note) < 10)
      .map(n => ({
        id: n.student_id,
        name: n.student_name || t('cp.studentFallback'),
        note: n.note
      }));

    return {
      average: cachedStats.average || 0,
      totalStudents: cachedStats.totalStudents || 0,
      notedStudents: cachedStats.notedStudents || 0,
      notedPercentage: cachedStats.totalStudents > 0 ? Math.round((cachedStats.notedStudents / cachedStats.totalStudents) * 100) : 0,
      successRate: cachedStats.successRate || 0,
      minNote: cachedStats.minNote || 0,
      maxNote: cachedStats.maxNote || 0,
      dispersion: cachedStats.dispersion || 'Faible',
      distribution: cachedStats.distribution || { high: 0, medium: 0, low: 0 },
      failingStudents: failingFromCache
    };
  };

  // Fonction pour gérer l'encodage des noms arabes dans le PDF
  const handleArabicName = (name, index) => {
    // Vérifier si le nom contient des caractères arabes
    const arabicRegex = /[\u0600-\u06FF]/;
    if (arabicRegex.test(name)) {
      // jsPDF a des problèmes connus avec l'UTF-8 et les caractères arabes
      // On utilise un fallback qui préserve la lisibilité
      return `[Élève ${index + 1}]`;
    }
    return name;
  };

  // Fonction pour convertir le texte arabe en image pour le PDF
  const createArabicTextImage = (text, fontSize = 12) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Configurer la police et la taille avec une meilleure qualité
    const actualFontSize = fontSize * 2; // Multiplier pour meilleure qualité
    ctx.font = `${actualFontSize}px 'Noto Sans Arabic', 'Arial Unicode MS', Arial, sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Activer l'anti-aliasing pour une meilleure qualité
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Mesurer le texte
    const metrics = ctx.measureText(text);
    const width = metrics.width + 20; // Plus de marge
    const height = actualFontSize + 20;
    
    // Définir la taille du canvas avec une résolution plus élevée
    canvas.width = width * 2; // Double résolution
    canvas.height = height * 2;
    
    // Redessiner avec la bonne taille et résolution
    ctx.scale(2, 2); // Mettre à l'échelle pour la haute résolution
    ctx.font = `${actualFontSize}px 'Noto Sans Arabic', 'Arial Unicode MS', Arial, sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Activer l'anti-aliasing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Dessiner le texte
    ctx.fillText(text, 10, height / 2);
    
    // Retourner l'image en base64
    return canvas.toDataURL('image/png', 1.0);
  };

  // Fonction pour récupérer le nom de la classe à partir des différentes sources
  const getClassName = (control) => {
    // Essayer différentes sources pour le nom de la classe
    if (control.class_name) {
      return control.class_name;
    }
    
    if (control.classes && control.classes.name) {
      return control.classes.name;
    }
    
    if (control.classes && Array.isArray(control.classes) && control.classes.length > 0) {
      return control.classes[0].name;
    }
    
    // Chercher dans la liste des classes
    const classData = classes.find(c => c.id === control.class_id);
    if (classData) {
      return classData.name;
    }
    
    return t('cp.notDefined');
  };

  // Fonction pour exporter un contrôle en PDF
  const exportControlToPDF = async (control) => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;
      const res = await fetch(`${apiUrl}/api/controls-plan/${control.id}/report-pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const blob = await res.blob();
      await saveBlob(blob, `rapport_controle_${(control.name || 'controle').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
    } catch (error) {
      console.error('Erreur lors de l\'exportation PDF:', error);
      alert(t('cp.pdfError'));
    }
  };

  // Fonction pour voir les détails d'un contrôle
  const viewControlDetails = (control) => {
    // Debug: Vérifier la structure du contrôle
    console.log('Control data for details:', control);
    console.log('Control class_name:', control.class_name);
    console.log('Control classes:', control.classes);
    
    const stats = calculateControlStats(control.id);
    const details = {
      control: control,
      stats: stats
    };
    setDetailsData(details);
    setShowDetailsModal(true);
  };
    // Fonction pour afficher les élèves en échec
  const showFailingStudents = (stats) => {
    setFailingStudents(stats.failingStudents);
    setShowFailingModal(true);
  };

  // Fonction pour afficher l'interprétation de la dispersion
  const showDispersionInterpretation = (dispersion) => {
    let interpretation = '';
    let advice = '';
    
    switch(dispersion) {
      case 'Faible':
        interpretation = t('cp.interp.low');
        advice = t('cp.advice.low');
        break;
      case 'Moyen':
        interpretation = t('cp.interp.medium');
        advice = t('cp.advice.medium');
        break;
      case 'Élevé':
        interpretation = t('cp.interp.high');
        advice = t('cp.advice.high');
        break;
    }
    
    alert(`${interpretation}\n\n${advice}`);
  };

  // Fonction pour charger les élèves de la classe ET leurs notes existantes
  const loadClassStudents = async (classId) => {
    setLoadingStudents(true);
    try {
      const token = await getAuthToken();
      
      // Charger les élèves de la classe
      const studentsRes = await fetch(`${apiUrl}/api/teacher/classes/${classId}/students`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (studentsRes.ok) {
        const students = await studentsRes.json();
        console.log('Students data received:', students);
        setClassStudents(Array.isArray(students) ? students : []);
        
        // Debug: Vérifier si selectedControlForNotes contient les infos de classe
        if (selectedControlForNotes) {
          console.log('Selected control for notes:', selectedControlForNotes);
          console.log('Selected control class_name:', selectedControlForNotes.class_name);
          console.log('Selected control classes:', selectedControlForNotes.classes);
        }
        
        // Charger les notes existantes pour ce contrôle
        let existingNotes = {};
        if (selectedControlForNotes) {
          const notesRes = await fetch(`${apiUrl}/api/teacher/controls/${selectedControlForNotes.id}/notes`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (notesRes.ok) {
            const notes = await notesRes.json();
            // Organiser les notes par student_id
            notes.forEach(note => {
              existingNotes[note.student_id] = note;
            });
          }
        }
        
        // Initialiser les notes des élèves avec les notes existantes
        const initialNotes = {};
        students.forEach(student => {
          const existingNote = existingNotes[student.id];
          initialNotes[student.id] = {
            note: existingNote?.note !== null && existingNote?.note !== undefined ? existingNote.note : '',
            appreciation: existingNote?.appreciation || ''
          };
        });
        setStudentsNotes(initialNotes);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setClassStudents([]);
      setStudentsNotes({});
    } finally {
      setLoadingStudents(false);
    }
  };

  // ==================== IMPORT EXCEL HANDLERS (MULTI-FICHIERS) ====================

  const openExcelImport = (control = null) => {
    setExcelImportTarget(control);
    setShowExcelImportSection(true);
  };

  const closeExcelImport = () => {
    setShowExcelImportSection(false);
    setExcelImportTarget(null);
  };

  const resetExcelImport = () => {
    setExcelFiles([]);
    setExcelGlobalError(null);
    setExcelGlobalResult(null);
    setExcelImporting(false);
  };

  // Ajouter des fichiers (depuis input ou drag-drop)
  const addExcelFiles = (fileList) => {
    const defaultClassId = excelImportTarget?.class_id || (filterClass !== 'all' ? filterClass : '');
    const newFiles = Array.from(fileList)
      .filter(f => /\.(xlsx|xls|csv)$/i.test(f.name))
      .map(f => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file: f,
        classId: defaultClassId,
        parsing: false,
        parsed: null,
        mappings: {},
        error: null,
        importResult: null
      }));
    if (newFiles.length === 0) {
      setExcelGlobalError(t('cp.excelNoValidFile'));
      return;
    }
    setExcelFiles(prev => [...prev, ...newFiles]);
    setExcelGlobalError(null);
    setExcelGlobalResult(null);
    if (defaultClassId) {
      newFiles.forEach(fileEntry => {
        setTimeout(() => parseExcelFile(fileEntry), 100);
      });
    }
  };

  const handleExcelFilesSelect = (e) => {
    if (e.target.files) addExcelFiles(e.target.files);
    e.target.value = '';
  };

  const handleExcelDrop = (e) => {
    e.preventDefault();
    setExcelDragOver(false);
    if (e.dataTransfer.files) addExcelFiles(e.dataTransfer.files);
  };

  const removeExcelFile = (fileId) => {
    setExcelFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Mettre à jour un fichier dans le state
  const updateExcelFile = (fileId, updates) => {
    setExcelFiles(prev => prev.map(f => f.id === fileId ? { ...f, ...updates } : f));
  };

  // Auto-mapper les colonnes détectées aux contrôles existants
  const autoMapColumns = (data) => {
    const autoMappings = {};
    if (data.detectedColumns && data.dbControls) {
      const importableColumns = data.detectedColumns.filter(col => col.controlNumber !== 'activities');
      const targetExists = excelImportTarget?.id && data.dbControls.some(control => control.id === excelImportTarget.id);
      if (targetExists && importableColumns.length === 1) {
        autoMappings[importableColumns[0].label] = excelImportTarget.id;
      }
      data.detectedColumns.forEach(col => {
        if (col.controlNumber === 'activities') return;
        const numLabels = {
          1: ['1', 'الأول', 'premier', 'first'],
          2: ['2', 'الثاني', 'deuxième', 'second'],
          3: ['3', 'الثالث', 'troisième', 'third'],
          4: ['4', 'الرابع', 'quatrième', 'fourth']
        };
        const labels = numLabels[col.controlNumber] || [];
        const match = data.dbControls.find(c =>
          labels.some(l => c.name.includes(l)) || c.name.includes(String(col.controlNumber))
        );
        if (match && !autoMappings[col.label]) {
          autoMappings[col.label] = match.id;
        }
      });
    }
    return autoMappings;
  };

  // Parser un fichier pour une classe donnée
  const parseExcelFile = async (fileEntry) => {
    if (!fileEntry.classId) {
      updateExcelFile(fileEntry.id, { error: t('cp.excelPickClass') });
      return;
    }
    updateExcelFile(fileEntry.id, { parsing: true, error: null, parsed: null, mappings: {} });
    try {
      const token = await getAuthToken();
      const fd = new FormData();
      fd.append('file', fileEntry.file);
      fd.append('classId', fileEntry.classId);

      const res = await fetch(`${apiUrl}/api/teacher/controls/parse-excel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) {
        updateExcelFile(fileEntry.id, { parsing: false, error: data.error || t('cp.excelParseError') });
        return;
      }
      const mappings = autoMapColumns(data);
      updateExcelFile(fileEntry.id, { parsing: false, parsed: data, mappings });
    } catch (err) {
      console.error('Erreur parse Excel:', err);
      updateExcelFile(fileEntry.id, { parsing: false, error: t('cp.excelParseFailed') });
    }
  };

  // Assigner une classe à un fichier et lancer le parsing automatiquement
  const setExcelFileClass = (fileId, classId) => {
    setExcelFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        const updated = { ...f, classId, parsed: null, mappings: {}, error: null, importResult: null };
        // Lancer le parsing après mise à jour du state
        if (classId) {
          setTimeout(() => parseExcelFile({ ...updated, classId }), 100);
        }
        return updated;
      }
      return f;
    }));
  };

  // Mettre à jour le mapping d'un fichier
  const setExcelFileMapping = (fileId, colLabel, controlId) => {
    setExcelFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        return { ...f, mappings: { ...f.mappings, [colLabel]: controlId } };
      }
      return f;
    }));
  };

  // Importer toutes les notes de tous les fichiers parsés
  const handleExcelImportAll = async () => {
    const readyFiles = excelFiles.filter(f => f.parsed && Object.values(f.mappings).some(v => v));
    if (readyFiles.length === 0) {
      setExcelGlobalError(t('cp.excelNothingReady'));
      return;
    }

    setExcelImporting(true);
    setExcelGlobalError(null);
    setExcelGlobalResult(null);

    let totalInserted = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    const allDetails = {};

    try {
      const token = await getAuthToken();

      for (const fileEntry of readyFiles) {
        const studentsPayload = fileEntry.parsed.students.map(s => ({
          matchedStudentId: s.matched ? s.matchedStudent?.id : null,
          grades: s.grades
        }));

        try {
          const res = await fetch(`${apiUrl}/api/teacher/controls/import-excel-notes`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              classId: fileEntry.classId,
              mappings: fileEntry.mappings,
              students: studentsPayload
            })
          });

          const data = await res.json();
          if (!res.ok) {
            updateExcelFile(fileEntry.id, { importResult: { success: false, error: data.error } });
            totalErrors++;
          } else {
            updateExcelFile(fileEntry.id, { importResult: data });
            totalInserted += data.totalInserted || 0;
            totalSkipped += data.skippedStudents || 0;
            if (data.details) {
              const className = classes.find(c => c.id === fileEntry.classId)?.name || fileEntry.classId;
              Object.entries(data.details).forEach(([k, v]) => {
                allDetails[`${className} - ${v.name || k}`] = v;
              });
            }
          }
        } catch (err) {
          updateExcelFile(fileEntry.id, { importResult: { success: false, error: err.message } });
          totalErrors++;
        }
      }

      setExcelGlobalResult({
        success: true,
        message: t('cp.excelImported', { notes: totalInserted, files: readyFiles.length }),
        totalInserted,
        totalErrors,
        skippedStudents: totalSkipped,
        details: allDetails
      });

      // Rafraîchir les données
      setControlsStatsCache({});
      await fetchData();
      setNotesVersion(prev => prev + 1);
    } catch (err) {
      console.error('Erreur import Excel:', err);
      setExcelGlobalError(t('cp.excelImportError'));
    } finally {
      setExcelImporting(false);
    }
  };

  // Charger les élèves quand la modal s'ouvre (ou après import Excel via notesVersion)
  useEffect(() => {
    if (showNotesModal && selectedControlForNotes) {
      loadClassStudents(selectedControlForNotes.class_id);
    }
  }, [showNotesModal, selectedControlForNotes, notesVersion]);
  useEffect(() => {
    if (controls.length > 0 && !statsLoading) {
      loadAllControlsStats(notesVersion > 0);
    }
  }, [controls.length, notesVersion]); // Recharger quand les contrôles changent ou après import Excel

  // Calculer les statistiques des classes (avec dépendances optimisées)
  useEffect(() => {
    const calculateClassStats = async () => {
      const uniqueClasses = [...new Set(controls.map(c => c.class_id))];
      const totalClasses = uniqueClasses.length;
      
      // Récupérer le vrai nombre d'élèves par classe
      try {
        const token = await getAuthToken();
        let totalStudents = 0;
        
        // Pour chaque classe unique, récupérer le nombre d'élèves
        for (const classId of uniqueClasses) {
          const studentsRes = await fetch(`${apiUrl}/api/teacher/classes/${classId}/students`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (studentsRes.ok) {
            const students = await studentsRes.json();
            totalStudents += Array.isArray(students) ? students.length : 0;
          }
        }

        setClassStats({
          totalClasses,
          totalStudents
        });
      } catch (error) {
        console.error('Erreur lors du calcul des statistiques des classes:', error);
        // En cas d'erreur, utiliser une estimation
        const estimatedTotal = uniqueClasses.length * 30; // 30 élèves par classe en moyenne
        setClassStats({
          totalClasses,
          totalStudents: estimatedTotal
        });
      }
    };

    if (controls.length > 0) {
      calculateClassStats();
    }
  }, [controls.length]); // Seulement quand le nombre de contrôles change

  // La page sépare clairement le travail du professeur des contrôles partagés.
  const filteredControls = useMemo(() => controls.filter(control => {
    if (debouncedFilterStatus !== 'all' && control.status !== debouncedFilterStatus) return false;
    if (debouncedFilterClass !== 'all' && control.class_id !== debouncedFilterClass) return false;
    return true;
  }), [controls, debouncedFilterStatus, debouncedFilterClass]);

  const scopeCounts = useMemo(() => ({
    mine: filteredControls.filter(isControlOwner).length,
    shared: filteredControls.filter(control => !isControlOwner(control)).length
  }), [filteredControls, isControlOwner]);

  const visibleControls = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase(lang === 'ar' ? 'ar' : 'fr');
    return filteredControls.filter(control => {
      const matchesScope = controlScope === 'mine' ? isControlOwner(control) : !isControlOwner(control);
      if (!matchesScope) return false;
      if (!normalizedSearch) return true;
      return [control.name, control.class_name, control.subject_name, control.teacher_name]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase(lang === 'ar' ? 'ar' : 'fr').includes(normalizedSearch));
    });
  }, [filteredControls, controlScope, searchQuery, lang, isControlOwner]);

  const displayedControls = visibleControls.slice(0, visibleLimit);

  const gradeDraftStats = useMemo(() => {
    const values = Object.values(studentsNotes)
      .map(entry => entry?.note)
      .filter(value => value !== undefined && value !== null && String(value).trim() !== '');
    const invalid = values.filter(value => {
      const note = Number(String(value).replace(',', '.'));
      return !Number.isFinite(note) || note < 0 || note > 20;
    }).length;
    return { entered: values.length, invalid };
  }, [studentsNotes]);

  const handleGradeKeyDown = (event, index) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const nextInput = Array.from(document.querySelectorAll(`[data-grade-index="${index + 1}"]`))
      .find(input => input.offsetParent !== null);
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  useEffect(() => {
    setVisibleLimit(12);
  }, [controlScope, searchQuery, debouncedFilterStatus, debouncedFilterClass]);

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

      const [classesRes, controlsRes] = await Promise.all([
        fetch(`${apiUrl}/api/teacher/my-classes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/teacher/controls-plan`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const classesData = await classesRes.json();
      const controlsData = await controlsRes.json();

      if (!classesRes.ok || !controlsRes.ok) {
        throw new Error(classesData?.error || controlsData?.error || t('common.loadError'));
      }

      setClasses(Array.isArray(classesData) ? classesData : []);
      setControls(Array.isArray(controlsData) ? controlsData : []);
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
    ['planned', 'in_progress', 'completed'].includes(status) ? t(`cp.status.${status}`) : status
  );

  const handleEdit = (control) => {
    setEditingControl(control);
    setFormData({
      class_id: control.class_id,
      name: control.name,
      date: control.date,
      start_time: control.start_time || '',
      end_time: control.end_time || '',
      description: control.description || '',
      kind: control.kind || 'control'
    });
    setShowCreateModal(true);
  };

  const handleDelete = async (controlId) => {
    if (!confirm(t('cp.confirmDelete'))) {
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
        alert(t('cp.deleteError'));
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert(t('cp.deleteError'));
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
          description: '',
          kind: 'control'
        });
        fetchData();
      } else {
        alert(t('cp.saveError'));
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert(t('cp.saveError'));
    } finally {
      setSaving(false);
    }
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
    <div className="p-3 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-4xl font-bold truncate">{t('cp.title')}</h1>
          <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">{t('cp.subtitle')}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-shrink-0">
          <button
            type="button"
            onClick={() => openExcelImport()}
            className="px-4 py-2.5 border border-green-200 bg-green-50 text-green-700 rounded-xl font-semibold hover:bg-green-100 transition-colors flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm">{t('cp.importGrades')}</span>
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
                description: '',
                kind: 'control'
              });
              setShowCreateModal(true);
            }}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">{t('cp.newControl')}</span>
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

      {/* Recherche et filtres compacts */}
      <Card className="mb-5">
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_240px]">
            <label className="relative block">
              <span className="sr-only">{t('cp.search')}</span>
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('cp.searchPlaceholder')}
                className="w-full rounded-xl border border-gray-300 py-2.5 ps-10 pe-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label>
              <span className="sr-only">{t('cp.status')}</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{t('cp.allControls')}</option>
                <option value="planned">{t('cp.planned')}</option>
                <option value="completed">{t('cp.completed')}</option>
              </select>
            </label>
            <label>
              <span className="sr-only">{t('common.class')}</span>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">{t('cp.allClasses')}</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Espace d'import autonome : il conserve le contexte du contrôle choisi. */}
      {showExcelImportSection && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 sm:text-xl">
                  <Upload className="h-5 w-5 flex-shrink-0 text-green-600" />
                  <span className="truncate">{t('cp.excelTitle')}</span>
                  {excelFiles.length > 0 && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">{t('cp.excelFiles', { n: excelFiles.length })}</span>
                  )}
                </h2>
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                  {excelImportTarget
                    ? t('cp.importTargetHint', { name: excelImportTarget.name, class: excelImportTarget.class_name })
                    : t('cp.excelSubtitle')}
                </p>
              </div>
              <button type="button" onClick={closeExcelImport} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label={t('common.close')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 sm:p-6">
              <div className="space-y-4">

              {/* Résultat global d'import */}
              {excelGlobalResult && (
                <div className="bg-green-50 border border-green-300 rounded-lg p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <h4 className="font-semibold text-green-800 text-lg">{excelGlobalResult.message}</h4>
                  </div>
                  {excelGlobalResult.details && Object.keys(excelGlobalResult.details).length > 0 && (
                    <div className="space-y-3 text-sm text-green-700">
                      {Object.entries(excelGlobalResult.details).map(([key, d], i) => {
                        const levelStyle = {
                          red:    { dot: 'bg-red-500',    text: 'text-red-700',    chip: 'bg-red-100 text-red-700' },
                          orange: { dot: 'bg-orange-500', text: 'text-orange-700', chip: 'bg-orange-100 text-orange-700' },
                          yellow: { dot: 'bg-amber-400',  text: 'text-amber-700',  chip: 'bg-amber-100 text-amber-700' },
                          gray:   { dot: 'bg-gray-400',   text: 'text-gray-600',   chip: 'bg-gray-100 text-gray-600' },
                        };
                        const flagged = d.flagged || [];
                        const counts = d.flaggedCounts || {};
                        return (
                          <div key={i} className="bg-white/60 rounded-lg border border-green-200 p-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              {d.success ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
                              <span className="font-semibold text-green-800">{key}</span>
                              <span className="text-green-700">: {d.success ? t('cp.notesCount', { n: d.count }) : d.error}</span>
                              {d.success && d.totalStudents != null && (
                                <span className="text-xs text-gray-500">• {t('cp.noted', { noted: d.notedStudents, total: d.totalStudents })}</span>
                              )}
                              {['red','orange','yellow','gray'].map(lvl => counts[lvl] ? (
                                <span key={lvl} className={`text-xs px-2 py-0.5 rounded-full font-medium ${levelStyle[lvl].chip}`}>
                                  {counts[lvl]} {lvl === 'red' ? t('cp.critical') : lvl === 'orange' ? t('cp.incidents') : lvl === 'yellow' ? t('cp.noNote') : t('cp.absent')}
                                </span>
                              ) : null)}
                            </div>
                            {flagged.length > 0 && (
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                {flagged.map((f, j) => (
                                  <div key={j} className="flex items-center gap-2 text-xs">
                                    <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${levelStyle[f.level]?.dot || 'bg-gray-300'}`}></span>
                                    <span className="font-medium text-gray-800 truncate">{f.name}</span>
                                    <span className={`${levelStyle[f.level]?.text || 'text-gray-500'} truncate`}>— {f.status}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {excelGlobalResult.skippedStudents > 0 && (
                    <p className="text-sm text-yellow-700 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> {t('cp.skipped', { n: excelGlobalResult.skippedStudents })}
                    </p>
                  )}
                  <button onClick={resetExcelImport} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
                    {t('cp.newImport')}
                  </button>
                </div>
              )}

              {/* Erreur globale */}
              {excelGlobalError && !excelGlobalResult && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-red-800 font-medium">{excelGlobalError}</p>
                    <button onClick={() => setExcelGlobalError(null)} className="text-sm text-red-600 underline mt-1">{t('common.close')}</button>
                  </div>
                </div>
              )}

              {/* Zone de dépôt / sélection de fichiers */}
              {!excelGlobalResult && (
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setExcelDragOver(true); }}
                    onDragLeave={() => setExcelDragOver(false)}
                    onDrop={handleExcelDrop}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                      excelDragOver
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                  >
                    <Upload className={`w-10 h-10 mx-auto mb-3 ${excelDragOver ? 'text-green-500' : 'text-gray-400'}`} />
                    <p className="text-gray-700 font-medium mb-1">
                      {t('cp.dropFiles')}
                    </p>
                    <p className="text-sm text-gray-500 mb-3">{t('cp.or')}</p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer text-sm font-medium">
                      <Upload className="w-4 h-4" />
                      {t('cp.pickFiles')}
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        multiple
                        onChange={handleExcelFilesSelect}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-400 mt-3">{t('cp.formats')}</p>
                  </div>

                  {/* Liste des fichiers ajoutés */}
                  {excelFiles.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-800">{t('cp.filesAdded', { n: excelFiles.length })}</h4>
                        <button onClick={resetExcelImport} className="text-sm text-red-500 hover:text-red-700 underline">{t('cp.removeAll')}</button>
                      </div>

                      {excelFiles.map((fileEntry, fileIdx) => {
                        const className_file = classes.find(c => c.id === fileEntry.classId)?.name;
                        const hasMappings = Object.values(fileEntry.mappings).some(v => v);
                        const isReady = fileEntry.parsed && hasMappings;
                        const hasResult = fileEntry.importResult;

                        return (
                          <div key={fileEntry.id} className={`border rounded-xl overflow-hidden ${
                            hasResult?.success ? 'border-green-300 bg-green-50/50' :
                            hasResult && !hasResult.success ? 'border-red-300 bg-red-50/50' :
                            isReady ? 'border-blue-300 bg-blue-50/30' :
                            fileEntry.error ? 'border-red-300 bg-red-50/30' :
                            'border-gray-200'
                          }`}>
                            {/* En-tête du fichier */}
                            <div className="p-3 flex items-center gap-3 bg-white/80">
                              <div className="flex-shrink-0">
                                {fileEntry.parsing ? (
                                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                ) : hasResult?.success ? (
                                  <CheckCircle className="w-8 h-8 text-green-500" />
                                ) : hasResult && !hasResult.success ? (
                                  <AlertTriangle className="w-8 h-8 text-red-500" />
                                ) : isReady ? (
                                  <CheckCircle className="w-8 h-8 text-blue-500" />
                                ) : fileEntry.error ? (
                                  <AlertTriangle className="w-8 h-8 text-red-400" />
                                ) : (
                                  <FileCheck className="w-8 h-8 text-gray-400" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-800 truncate">{fileEntry.file.name}</p>
                                <p className="text-xs text-gray-500">
                                  {(fileEntry.file.size / 1024).toFixed(1)} Ko
                                  {className_file && <span className="ml-2 text-blue-600 font-medium">{className_file}</span>}
                                  {fileEntry.parsed && (
                                    <span className="ml-2 text-green-600">
                                      {t('cp.recognized', { matched: fileEntry.parsed.totalMatchedStudents, total: fileEntry.parsed.totalExcelStudents, cols: fileEntry.parsed.detectedColumns?.length || 0 })}
                                    </span>
                                  )}
                                </p>
                                {fileEntry.error && <p className="text-xs text-red-600 mt-0.5">{fileEntry.error}</p>}
                                {hasResult?.success && <p className="text-xs text-green-700 mt-0.5">{hasResult.message}</p>}
                                {hasResult && !hasResult.success && <p className="text-xs text-red-600 mt-0.5">{hasResult.error}</p>}
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Sélection de classe */}
                                {!hasResult && (
                                  <select
                                    value={fileEntry.classId}
                                    onChange={(e) => setExcelFileClass(fileEntry.id, e.target.value)}
                                    disabled={fileEntry.parsing}
                                    className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[180px]"
                                  >
                                    <option value="">{t('cp.classPlaceholder')}</option>
                                    {classes.map(cls => (
                                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  onClick={() => removeExcelFile(fileEntry.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Mapping des colonnes (si parsé et pas encore importé) */}
                            {fileEntry.parsed && !hasResult && (
                              <div className="px-3 pb-3 space-y-2">
                                <div className="border-t border-gray-200 pt-2">
                                  <p className="text-xs font-medium text-gray-600 mb-2">{t('cp.mapColumns')}</p>
                                  <div className="space-y-1.5">
                                    {fileEntry.parsed.detectedColumns?.map((col, idx) => (
                                      <div key={idx} className="flex items-center gap-2 text-sm">
                                        <span className="font-medium text-gray-700 min-w-[120px]" dir="rtl">{col.label}</span>
                                        <span className="text-gray-400">→</span>
                                        <select
                                          value={fileEntry.mappings[col.label] || ''}
                                          onChange={(e) => setExcelFileMapping(fileEntry.id, col.label, e.target.value)}
                                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                          <option value="">{t('cp.dontImport')}</option>
                                          {fileEntry.parsed.dbControls?.map(c => (
                                            <option key={c.id} value={c.id}>
                                              {c.name} ({new Date(c.date).toLocaleDateString(dateLocale)})
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    ))}
                                  </div>
                                  {fileEntry.parsed.dbControls?.length === 0 && (
                                    <p className="text-xs text-yellow-700 mt-1">{t('cp.noControlForClass')}</p>
                                  )}
                                </div>

                                {/* Aperçu compact des élèves */}
                                <details className="group">
                                  <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800 font-medium">
                                    {t('cp.previewStudents', { n: fileEntry.parsed.students?.length })}
                                  </summary>
                                  <div className="mt-2 overflow-x-auto max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                                    <table className="w-full text-xs">
                                      <thead className="bg-gray-100 sticky top-0">
                                        <tr>
                                          <th className="px-2 py-1 text-left">#</th>
                                          <th className="px-2 py-1 text-start">{t('cp.name')}</th>
                                          <th className="px-2 py-1 text-start">{t('cp.match')}</th>
                                          {fileEntry.parsed.detectedColumns?.map((col, i) => (
                                            <th key={i} className="px-2 py-1 text-center whitespace-nowrap">{col.label}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {fileEntry.parsed.students?.map((student, idx) => (
                                          <tr key={idx} className={student.matched ? '' : 'bg-red-50'}>
                                            <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                                            <td className="px-2 py-1 font-medium" dir="rtl">{student.studentName}</td>
                                            <td className="px-2 py-1">
                                              {student.matched ? (
                                                <span className="text-green-600">&#10003;</span>
                                              ) : (
                                                <span className="text-red-500">&#10007;</span>
                                              )}
                                            </td>
                                            {fileEntry.parsed.detectedColumns?.map((col, i) => (
                                              <td key={i} className="px-2 py-1 text-center font-mono">
                                                {student.grades?.[col.label] !== null && student.grades?.[col.label] !== undefined
                                                  ? student.grades[col.label]
                                                  : <span className="text-gray-300">-</span>
                                                }
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </details>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Boutons d'action */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="text-sm text-gray-500">
                          {t('cp.filesReady', { ready: excelFiles.filter(f => f.parsed && Object.values(f.mappings).some(v => v)).length, total: excelFiles.length })}
                        </div>
                        <button
                          onClick={handleExcelImportAll}
                          disabled={excelImporting || excelFiles.filter(f => f.parsed && Object.values(f.mappings).some(v => v)).length === 0}
                          className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {excelImporting ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              {t('cp.importing')}
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              {t('cp.importAll')}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Info format */}
                  {excelFiles.length === 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-800 mb-2">{t('cp.formatTitle')}</h4>
                      <ul className="text-sm text-blue-700 space-y-1">
                        <li>- <strong>رقم التلميذ</strong>{t('cp.formatMassar')}</li>
                        <li>- <strong>إسم التلميذ</strong>{t('cp.formatName')}</li>
                        <li>- <strong>الفرض الأول، الفرض الثاني...</strong>{t('cp.formatControls')}</li>
                        <li>- <strong>الأنشطة المندمجة</strong>{t('cp.formatActivities')}</li>
                      </ul>
                      <p className="text-xs text-blue-600 mt-2">{t('cp.formatHint')}</p>
                    </div>
                  )}
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-gray-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex w-full rounded-xl bg-gray-100 p-1 sm:w-auto">
              <button
                type="button"
                onClick={() => setControlScope('mine')}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${controlScope === 'mine' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t('cp.scopeMine')} <span className="ms-1 text-xs">({scopeCounts.mine})</span>
              </button>
              <button
                type="button"
                onClick={() => setControlScope('shared')}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${controlScope === 'shared' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t('cp.scopeShared')} <span className="ms-1 text-xs">({scopeCounts.shared})</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span><strong className="text-blue-700">{filteredControls.filter(control => control.status === 'planned').length}</strong> {t('cp.planned').toLocaleLowerCase(lang)}</span>
              <span><strong className="text-green-700">{filteredControls.filter(control => control.status === 'completed').length}</strong> {t('cp.completed').toLocaleLowerCase(lang)}</span>
              <span><strong className="text-gray-900">{classStats.totalClasses}</strong> {t('cp.classesShort')}</span>
            </div>
          </div>
          <div className="pt-1">
            <CardTitle>{controlScope === 'mine' ? t('cp.myControls') : t('cp.sharedControlsTitle')}</CardTitle>
            <CardDescription>{controlScope === 'mine' ? t('cp.myControlsSubtitle') : t('cp.sharedControlsSubtitle')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {visibleControls.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">{t('cp.empty')}</p>
              {controlScope === 'mine' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  {t('cp.createControl')}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {displayedControls.map(control => (
                  <ControlCard key={control.id} control={control} />
                ))}
              </div>
              {displayedControls.length < visibleControls.length && (
                <div className="mt-5 text-center">
                  <button type="button" onClick={() => setVisibleLimit(limit => limit + 12)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    {t('cp.showMore', { n: visibleControls.length - displayedControls.length })}
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de gestion des notes */}
      {showNotesModal && selectedControlForNotes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between p-2 sm:p-4 border-b flex-shrink-0">
              <div className="min-w-0 flex-1 pr-2">
                <h2 className="text-sm sm:text-xl font-bold flex items-center gap-1 sm:gap-2 truncate">
                  <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                  <span className="truncate">{t('cp.notesFor', { name: selectedControlForNotes.name })}</span>
                </h2>
                <p className="text-gray-600 mt-0.5 sm:mt-1 text-[10px] sm:text-sm truncate">
                  {selectedControlForNotes.class_name} · {new Date(selectedControlForNotes.date).toLocaleDateString(dateLocale)}
                </p>
              </div>
              <button
                onClick={() => setShowNotesModal(false)}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Navigation simple : deux vues et deux méthodes d'entrée. */}
            <div className="flex flex-shrink-0 flex-col gap-2 border-b bg-gray-50/70 px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div className="inline-flex rounded-lg bg-gray-100 p-1">
                <button
                  onClick={() => setActiveNotesTab('manual')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:flex-none sm:text-sm ${
                    activeNotesTab === 'manual'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('cp.tab.quickEntry')}
                </button>
                <button
                  onClick={() => setActiveNotesTab('stats')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition sm:flex-none sm:text-sm ${
                    activeNotesTab === 'stats'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('cp.tab.results')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => setShowPasteModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 sm:text-sm"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  {t('cp.pasteColumn')}
                </button>
                <button
                  type="button"
                  onClick={() => openExcelImport(selectedControlForNotes)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 sm:text-sm"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t('cp.importExcel')}
                </button>
              </div>
            </div>

            {/* Contenu des onglets */}
            <div className="p-2 sm:p-4 overflow-y-auto flex-1">
              {activeNotesTab === 'manual' && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-blue-950 sm:text-base">{t('cp.quickEntryTitle')}</h3>
                      <p className="mt-0.5 text-xs text-blue-700">{t('cp.quickEntryHint')}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-semibold text-blue-800">{t('cp.enteredCount', { entered: gradeDraftStats.entered, total: classStudents.length })}</span>
                      {gradeDraftStats.invalid > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-1 font-semibold text-red-700">{t('cp.invalidCount', { n: gradeDraftStats.invalid })}</span>
                      )}
                    </div>
                  </div>
                  
                  {loadingStudents ? (
                    <div className="text-center py-4 sm:py-8">
                      <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto mb-2 sm:mb-4"></div>
                      <p className="text-xs sm:text-sm text-gray-600">{t('common.loading')}</p>
                    </div>
                  ) : classStudents.length === 0 ? (
                    <div className="text-center py-4 sm:py-8">
                      <Users className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-2 sm:mb-4" />
                      <p className="text-xs sm:text-sm text-gray-600">{t('cp.noStudent')}</p>
                    </div>
                  ) : (
                    <>
                      {/* Vue carte mobile */}
                      <div className="md:hidden space-y-1.5">
                        {classStudents.map((student, index) => {
                          const rawNote = studentsNotes[student.id]?.note ?? '';
                          const parsedNote = rawNote === '' ? null : Number(String(rawNote).replace(',', '.'));
                          const isInvalid = rawNote !== '' && (!Number.isFinite(parsedNote) || parsedNote < 0 || parsedNote > 20);
                          return (
                          <div key={student.id} className="flex items-center gap-1.5 p-1.5 border border-gray-200 rounded bg-white">
                            <div className="flex-1 min-w-0">
                              <span className="block text-xs font-medium text-gray-900 truncate">{student.first_name} {student.last_name}</span>
                            </div>
                            <input
                              type="text"
                              inputMode="decimal"
                              data-grade-index={index}
                              value={rawNote}
                              onChange={(e) => setStudentsNotes(prev => ({ ...prev, [student.id]: { ...prev[student.id], note: e.target.value } }))}
                              onKeyDown={(event) => handleGradeKeyDown(event, index)}
                              placeholder="/20"
                              aria-label={`${t('cp.noteOn20')} — ${student.first_name} ${student.last_name}`}
                              className={`w-14 rounded border px-1 py-1 text-center text-xs ${isInvalid ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-300'}`}
                            />
                          </div>
                          );
                        })}
                      </div>

                      {/* Vue tableau desktop */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full border border-gray-200 rounded-lg">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-700">{t('sr.col.student')}</th>
                              <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">{t('cp.noteOn20')}</th>
                              <th className="px-4 py-3 text-start text-sm font-medium text-gray-700">{t('cp.appreciation')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {classStudents.map((student, index) => {
                              const rawNote = studentsNotes[student.id]?.note ?? '';
                              const parsedNote = rawNote === '' ? null : Number(String(rawNote).replace(',', '.'));
                              const isInvalid = rawNote !== '' && (!Number.isFinite(parsedNote) || parsedNote < 0 || parsedNote > 20);
                              return (
                              <tr key={student.id}>
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">
                                    {student.first_name} {student.last_name}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    data-grade-index={index}
                                    placeholder="—"
                                    value={rawNote}
                                    onChange={(e) => {
                                      setStudentsNotes(prev => ({
                                        ...prev,
                                        [student.id]: {
                                          ...prev[student.id],
                                          note: e.target.value
                                        }
                                      }));
                                    }}
                                    onKeyDown={(event) => handleGradeKeyDown(event, index)}
                                    aria-label={`${t('cp.noteOn20')} — ${student.first_name} ${student.last_name}`}
                                    className={`w-full rounded-lg border px-3 py-2 text-center font-semibold focus:ring-2 ${isInvalid ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-300' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    type="text"
                                    placeholder={t('cp.appreciationPlaceholder')}
                                    value={studentsNotes[student.id]?.appreciation || ''}
                                    onChange={(e) => {
                                      setStudentsNotes(prev => ({
                                        ...prev,
                                        [student.id]: {
                                          ...prev[student.id],
                                          appreciation: e.target.value
                                        }
                                      }));
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  />
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="sticky bottom-0 -mx-2 mt-3 flex flex-col gap-2 border-t bg-white/95 px-2 py-3 backdrop-blur sm:-mx-4 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                        <div className="text-xs text-gray-600 sm:text-sm">
                          {gradeDraftStats.invalid > 0 ? t('cp.fixInvalidBeforeSave') : t('cp.readyToSave', { n: gradeDraftStats.entered })}
                        </div>
                        <button 
                          onClick={handleSaveNotes}
                          disabled={savingNotes || gradeDraftStats.entered === 0 || gradeDraftStats.invalid > 0}
                          className="w-full rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                        >
                          {savingNotes ? t('common.saving') : t('cp.saveGrades', { n: gradeDraftStats.entered })}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeNotesTab === 'stats' && (
                <div className="space-y-3 sm:space-y-6">
                  <h3 className="text-sm sm:text-lg font-semibold">{t('cp.statsTitle')}</h3>
                  
                  {/* Statistiques calculées dynamiquement */}
                  {(() => {
                    const stats = calculateControlStats(selectedControlForNotes.id);
                    return (
                      <>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-4">
                            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                              <h4 className="text-xs sm:text-sm font-medium text-blue-800">{t('cp.average')}</h4>
                            </div>
                            <p className="text-lg sm:text-2xl font-bold text-blue-600">{stats.average.toFixed(2)}/20</p>
                            <p className="text-[10px] sm:text-sm text-blue-600 truncate">{t('cp.classLabel', { name: getClassName(selectedControlForNotes) })}</p>
                          </div>
                          
                          <div className="bg-green-50 border border-green-200 rounded-lg p-2 sm:p-4">
                            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                              <h4 className="text-xs sm:text-sm font-medium text-green-800">{t('cp.notedStudents')}</h4>
                            </div>
                            <p className="text-lg sm:text-2xl font-bold text-green-600">{stats.notedStudents}/{stats.totalStudents}</p>
                            <p className="text-[10px] sm:text-sm text-green-600">{t('cp.notedPercentage', { n: stats.notedPercentage })}</p>
                          </div>
                          
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 sm:p-4">
                            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                              <h4 className="text-xs sm:text-sm font-medium text-purple-800 truncate">{t('cp.successRate')}</h4>
                            </div>
                            <button
                              onClick={() => showFailingStudents(stats)}
                              className="text-lg sm:text-2xl font-bold text-purple-600 hover:text-purple-700 transition-colors cursor-pointer block"
                              title={t('cp.clickFailing')}
                            >
                              {stats.successRate}%
                            </button>
                            <p className="text-[10px] sm:text-sm text-purple-600">{t('cp.passThreshold')}</p>
                          </div>

                          <div className={`border rounded-lg p-2 sm:p-4 ${
                            stats.dispersion === 'Faible' ? 'bg-green-50 border-green-200' :
                            stats.dispersion === 'Moyen' ? 'bg-yellow-50 border-yellow-200' :
                            'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                              <h4 className="text-xs sm:text-sm font-medium text-gray-800">{t('cp.dispersion')}</h4>
                            </div>
                            <button
                              onClick={() => showDispersionInterpretation(stats.dispersion)}
                              className={`text-lg sm:text-2xl font-bold hover:opacity-80 transition-opacity cursor-pointer block ${
                                stats.dispersion === 'Faible' ? 'text-green-600' :
                                stats.dispersion === 'Moyen' ? 'text-yellow-600' :
                                'text-red-600'
                              }`}
                              title={t('cp.clickInterpretation')}
                            >
                              {dispersionLabel(stats.dispersion)}
                            </button>
                            <p className="text-[10px] sm:text-sm text-gray-600 truncate">
                              {stats.dispersion === 'Faible' ? t('cp.homogeneous') :
                               stats.dispersion === 'Moyen' ? t('cp.mediumGaps') :
                               t('cp.bigGaps')} {t('cp.clickable')}
                            </p>
                          </div>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                          <h4 className="text-sm sm:text-base font-medium text-gray-800 mb-2 sm:mb-4">{t('cp.distribution')}</h4>
                          <div className="space-y-2 sm:space-y-3">
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-12 sm:w-20 text-xs sm:text-sm">15-20</div>
                              <div className="flex-1 bg-gray-200 rounded-full h-4 sm:h-6">
                                <div className="bg-green-500 h-4 sm:h-6 rounded-full" style={{width: `${stats.distribution.high}%`}}></div>
                              </div>
                              <div className="w-10 sm:w-12 text-xs sm:text-sm text-right">{stats.distribution.high}%</div>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-12 sm:w-20 text-xs sm:text-sm">10-14</div>
                              <div className="flex-1 bg-gray-200 rounded-full h-4 sm:h-6">
                                <div className="bg-blue-500 h-4 sm:h-6 rounded-full" style={{width: `${stats.distribution.medium}%`}}></div>
                              </div>
                              <div className="w-10 sm:w-12 text-xs sm:text-sm text-right">{stats.distribution.medium}%</div>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="w-12 sm:w-20 text-xs sm:text-sm">0-9</div>
                              <div className="flex-1 bg-gray-200 rounded-full h-4 sm:h-6">
                                <div className="bg-red-500 h-4 sm:h-6 rounded-full" style={{width: `${stats.distribution.low}%`}}></div>
                              </div>
                              <div className="w-10 sm:w-12 text-xs sm:text-sm text-right">{stats.distribution.low}%</div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:gap-4">
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 sm:p-4">
                            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                              <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                              <h4 className="text-xs sm:text-sm font-medium text-orange-800">{t('cp.minNote')}</h4>
                            </div>
                            <p className="text-lg sm:text-2xl font-bold text-orange-600">{stats.minNote}/20</p>
                            <p className="text-[10px] sm:text-sm text-orange-600">{t('cp.whoDropped')}</p>
                          </div>
                          
                          <div className="bg-teal-50 border border-teal-200 rounded-lg p-2 sm:p-4">
                            <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600" />
                              <h4 className="text-xs sm:text-sm font-medium text-teal-800">{t('cp.maxNote')}</h4>
                            </div>
                            <p className="text-lg sm:text-2xl font-bold text-teal-600">{stats.maxNote}/20</p>
                            <p className="text-[10px] sm:text-sm text-teal-600">{t('cp.tooHard')}</p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-2 sm:mt-0">
                          <button 
                            onClick={() => exportControlToPDF(selectedControlForNotes)}
                            className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                          >
                            {t('cp.exportPdf')}
                          </button>
                          <button 
                            onClick={() => viewControlDetails(selectedControlForNotes)}
                            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                          >
                            {t('cp.viewDetails')}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de collage des notes */}
      {showPasteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between p-4 md:p-6 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <ClipboardPaste className="w-5 h-5 text-purple-600" />
                {t('cp.pasteTitle')}
              </h3>
              <button
                onClick={() => setShowPasteModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 md:p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('cp.pasteLabel')}
                </label>
                <textarea
                  value={pasteNotesText}
                  onChange={(e) => setPasteNotesText(e.target.value)}
                  placeholder="12,00&#10;10,00&#10;12,00&#10;18,00&#10;15,25&#10;13,75&#10;8,75&#10;13,00&#10;12,00&#10;10,00&#10;12,25&#10;9,25&#10;8,00&#10;11,00&#10;12,00&#10;9,00&#10;8,25&#10;9,50&#10;0,00"
                  className="w-full resize-none rounded-xl border border-gray-300 px-3 py-3 font-mono text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500"
                  rows={9}
                />
              </div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-purple-50 px-3 py-2 text-sm text-purple-800">
                <span>{t('cp.pasteSimpleHint')}</span>
                <strong>{t('cp.pastePreview', { notes: pasteNotesText.split('\n').filter(line => line.trim()).length, students: classStudents.length })}</strong>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowPasteModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handlePasteNotes}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold"
                >
                  {t('cp.applyToTable')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TaskModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleSubmit}
        busy={saving}
        title={editingControl ? t('cp.editControl') : t('cp.newControl')}
        subtitle={t('cp.compactFormHint')}
        closeLabel={t('common.close')}
        maxWidth="max-w-3xl"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              disabled={saving}
              className="flex-1 rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 hover:bg-white disabled:opacity-50 sm:flex-none"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:flex-none"
            >
              {saving ? t('common.saving') : (editingControl ? t('common.modify') : t('common.create'))}
            </button>
          </>
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('cp.classRequired')}</label>
            <select
              value={formData.class_id}
              onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">{t('cp.pickClass')}</option>
              {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('cp.nameRequired')}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('cp.dateRequired')}</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('home.startTime')}</label>
              <input type="time" value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('home.endTime')}</label>
              <input type="time" value={formData.end_time} onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('cp.description')}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('cp.type')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setFormData({ ...formData, kind: 'control' })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${formData.kind !== 'activity' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {t('cp.control')}
              </button>
              <button type="button" onClick={() => setFormData({ ...formData, kind: 'activity' })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${formData.kind === 'activity' ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {t('cp.activityIntegrated')}
              </button>
            </div>
          </div>
        </div>
      </TaskModal>

      {/* Modal des détails du contrôle */}
      {showDetailsModal && detailsData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 md:p-6 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                {t('cp.detailsTitle')}
              </h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 md:p-6 space-y-6">
              {/* Informations générales */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                {t('cp.generalInfo')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-blue-700">{t('cp.fieldName')}</span>
                    <span className="ml-2 text-blue-900">{detailsData.control.name}</span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700">{t('cp.fieldDate')}</span>
                    <span className="ml-2 text-blue-900">
                      {new Date(detailsData.control.date).toLocaleDateString(dateLocale)}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700">{t('cp.fieldHours')}</span>
                    <span className="ml-2 text-blue-900">
                      {detailsData.control.start_time} - {detailsData.control.end_time}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700">{t('cp.fieldClass')}</span>
                    <span className="ml-2 text-blue-900">{getClassName(detailsData.control)}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="font-medium text-blue-700">{t('cp.fieldDescription')}</span>
                    <span className="ml-2 text-blue-900">
                      {detailsData.control.description || t('cp.noDescription')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Statistiques principales */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                    <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                    <h5 className="text-xs sm:text-sm font-medium text-green-800">{t('cp.average')}</h5>
                  </div>
                  <p className="text-lg sm:text-xl font-bold text-green-600">
                    {detailsData.stats.average.toFixed(2)}/20
                  </p>
                </div>
                
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                    <h5 className="text-xs sm:text-sm font-medium text-purple-800 leading-tight">{t('cp.notedStudents')}</h5>
                  </div>
                  <p className="text-lg sm:text-xl font-bold text-purple-600">
                    {detailsData.stats.notedStudents}/{detailsData.stats.totalStudents}
                  </p>
                  <p className="text-[10px] sm:text-xs text-purple-600">
                    {detailsData.stats.notedPercentage}%
                  </p>
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                    <h5 className="text-xs sm:text-sm font-medium text-orange-800">{t('cp.success')}</h5>
                  </div>
                  <p className="text-lg sm:text-xl font-bold text-orange-600">
                    {detailsData.stats.successRate}%
                  </p>
                  <p className="text-[10px] sm:text-xs text-orange-600">{t('cp.passThresholdShort')}</p>
                </div>

                <div className={`border rounded-lg p-3 sm:p-4 ${
                  detailsData.stats.dispersion === 'Faible' ? 'bg-green-50 border-green-200' :
                  detailsData.stats.dispersion === 'Moyen' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                    <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    <h5 className="text-xs sm:text-sm font-medium text-gray-800">{t('cp.dispersion')}</h5>
                  </div>
                  <p className={`text-lg sm:text-xl font-bold ${
                    detailsData.stats.dispersion === 'Faible' ? 'text-green-600' :
                    detailsData.stats.dispersion === 'Moyen' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {dispersionLabel(detailsData.stats.dispersion)}
                  </p>
                </div>
              </div>

              {/* Notes extrêmes */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                    <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                    <h5 className="text-xs sm:text-sm font-medium text-red-800 truncate">{t('cp.minShort')}</h5>
                  </div>
                  <p className="text-lg sm:text-xl font-bold text-red-600">
                    {detailsData.stats.minNote}/20
                  </p>
                  <p className="text-[10px] sm:text-xs text-red-600">{t('cp.whoDropped')}</p>
                </div>
                
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center gap-1 sm:gap-2 mb-1 sm:mb-2">
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600" />
                    <h5 className="text-xs sm:text-sm font-medium text-teal-800 truncate">{t('cp.maxShort')}</h5>
                  </div>
                  <p className="text-lg sm:text-xl font-bold text-teal-600">
                    {detailsData.stats.maxNote}/20
                  </p>
                  <p className="text-[10px] sm:text-xs text-teal-600">{t('cp.tooHard')}</p>
                </div>
              </div>

              {/* Répartition détaillée */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                <h4 className="text-sm sm:text-base font-medium text-gray-800 mb-3 sm:mb-4">{t('cp.detailedDistribution')}</h4>
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-12 sm:w-20 text-xs sm:text-sm font-medium">15-20</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-4 sm:h-6">
                      <div className="bg-green-500 h-4 sm:h-6 rounded-full flex items-center justify-end pr-1 sm:pr-2" 
                           style={{width: `${detailsData.stats.distribution.high}%`}}>
                        <span className="text-[10px] sm:text-xs text-white font-medium">
                          {detailsData.stats.distribution.high}%
                        </span>
                      </div>
                    </div>
                    <div className="w-12 sm:w-16 text-xs sm:text-sm text-right leading-tight">
                      {Math.round(detailsData.stats.notedStudents * detailsData.stats.distribution.high / 100)} {t('cp.studentsUnit')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-12 sm:w-20 text-xs sm:text-sm font-medium">10-14</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-4 sm:h-6">
                      <div className="bg-blue-500 h-4 sm:h-6 rounded-full flex items-center justify-end pr-1 sm:pr-2" 
                           style={{width: `${detailsData.stats.distribution.medium}%`}}>
                        <span className="text-[10px] sm:text-xs text-white font-medium">
                          {detailsData.stats.distribution.medium}%
                        </span>
                      </div>
                    </div>
                    <div className="w-12 sm:w-16 text-xs sm:text-sm text-right leading-tight">
                      {Math.round(detailsData.stats.notedStudents * detailsData.stats.distribution.medium / 100)} {t('cp.studentsUnit')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-12 sm:w-20 text-xs sm:text-sm font-medium">0-9</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-4 sm:h-6">
                      <div className="bg-red-500 h-4 sm:h-6 rounded-full flex items-center justify-end pr-1 sm:pr-2" 
                           style={{width: `${detailsData.stats.distribution.low}%`}}>
                        <span className="text-[10px] sm:text-xs text-white font-medium">
                          {detailsData.stats.distribution.low}%
                        </span>
                      </div>
                    </div>
                    <div className="w-12 sm:w-16 text-xs sm:text-sm text-right leading-tight">
                      {Math.round(detailsData.stats.notedStudents * detailsData.stats.distribution.low / 100)} {t('cp.studentsUnit')}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                >
                  {t('common.close')}
                </button>
                <button
                  onClick={() => exportControlToPDF(detailsData.control)}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Exporter en PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal des élèves en échec */}
      {showFailingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-3 sm:p-4 md:p-6 border-b">
              <h3 className="text-base sm:text-lg font-semibold flex items-center gap-1 sm:gap-2">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                {t('cp.failingTitle')}
              </h3>
              <button
                onClick={() => setShowFailingModal(false)}
                className="p-1 sm:p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
            
            <div className="p-3 sm:p-4 md:p-6">
              {failingStudents.length === 0 ? (
                <div className="text-center py-4 sm:py-8">
                  <CheckCircle className="w-8 h-8 sm:w-12 sm:h-12 text-green-500 mx-auto mb-2 sm:mb-4" />
                  <p className="text-sm sm:text-base text-gray-600">{t('cp.noFailing')}</p>
                  <p className="text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">{t('cp.noFailingHint')}</p>
                </div>
              ) : (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm text-red-800">
                      <div>
                        <strong>{t('cp.failingCount')}</strong> {failingStudents.length}
                      </div>
                      <div>
                        <strong>{t('cp.failingPercentage')}</strong> {Math.round((failingStudents.length / classStudents.length) * 100)}%
                      </div>
                      <div>
                        <strong>{t('cp.successRateShort')}</strong> {100 - Math.round((failingStudents.length / classStudents.length) * 100)}%
                      </div>
                    </div>
                  </div>
                  
                  {/* Vue mobile: cartes pour les élèves en échec */}
                  <div className="sm:hidden space-y-2 mb-3">
                    {failingStudents.map((student, index) => {
                      const note = parseFloat(student.note.replace(',', '.'));
                      const gap = (10 - note).toFixed(2);
                      return (
                        <div key={student.id} className="p-3 border border-red-200 rounded-lg bg-red-50/50 flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-900 truncate pr-2">{student.name}</span>
                          <div className="flex flex-col items-end">
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-bold mb-1">
                              {student.note}/20
                            </span>
                            <span className="text-xs text-red-600 font-medium">
                              -{gap} pts
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Vue desktop: tableau pour les élèves en échec */}
                  <div className="hidden sm:block overflow-x-auto mb-4">
                    <table className="w-full border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-start text-sm font-medium text-gray-700">{t('sr.col.student')}</th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">{t('cp.notes')}</th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">{t('cp.gapTo10')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {failingStudents.map((student, index) => {
                          const note = parseFloat(student.note.replace(',', '.'));
                          const gap = (10 - note).toFixed(2);
                          return (
                            <tr key={student.id} className="hover:bg-red-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">
                                  {student.name}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm font-medium">
                                  {student.note}/20
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-red-600 font-medium">
                                  -{gap}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 mt-3 sm:mt-4">
                    <h4 className="text-sm font-medium text-yellow-800 mb-1 sm:mb-2">{t('cp.recoTitle')}</h4>
                    <ul className="text-xs sm:text-sm text-yellow-700 space-y-1 pl-1">
                      <li>• {t('cp.reco1')}</li>
                      <li>• {t('cp.reco2')}</li>
                      <li>• {t('cp.reco3')}</li>
                      <li>• {t('cp.reco4')}</li>
                    </ul>
                  </div>
                </>
              )}
              
              <div className="flex justify-end gap-2 sm:gap-3 mt-4 sm:mt-6">
                <button
                  onClick={() => setShowFailingModal(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlsPage;
