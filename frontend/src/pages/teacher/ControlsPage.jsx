import { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, FileText, Plus, Edit2, Trash2, Save, X, CheckCircle, Users, TrendingUp, UserX, Package, Shield, Phone, AlertTriangle, Eye, FileCheck, Upload, BarChart3, Edit3, Activity, TrendingDown } from 'lucide-react';
import { saveBlob } from '../../lib/download';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useI18n } from '../../i18n';

const ControlsPage = () => {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  // La dispersion est stockee en francais (valeur metier) : on ne traduit que l'affichage.
  const dispersionLabel = (d) => (
    d === 'Faible' ? t('cp.dispersion.low') : d === 'Moyen' ? t('cp.dispersion.medium') : t('cp.dispersion.high')
  );

  // Composant pour afficher une carte de contrôle avec statistiques (optimisé avec cache)
  const ControlCard = ({ control }) => {
    const stats = controlsStatsCache[control.id];

    return (
      <div className="p-3 sm:p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
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
            </div>
            {control.description && (
              <p className="text-xs sm:text-sm text-gray-700 line-clamp-2">{control.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            {control.status === 'planned' && (
              <button
                onClick={() => navigate(`/teacher/rapide?controlId=${control.id}&classId=${control.class_id}&date=${control.date}&name=${encodeURIComponent(control.name)}&description=${encodeURIComponent(control.description || '')}&startTime=${control.start_time || ''}&endTime=${control.end_time || ''}`)}
                className="px-2 py-1 sm:px-3 sm:py-1.5 bg-green-600 text-white rounded text-xs sm:text-sm font-medium hover:bg-green-700 transition-colors flex-shrink-0"
              >
                {t('cp.start')}
              </button>
            )}
            <button
              onClick={() => {
                setSelectedControlForNotes(control);
                setShowNotesModal(true);
                setActiveNotesTab('manual');
              }}
              className="px-2 py-1 sm:px-3 sm:py-1.5 bg-blue-600 text-white rounded text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1 flex-shrink-0"
            >
              <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4" />
              {t('cp.notes')}
            </button>
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
          </div>
        </div>

        {/* Statistiques détaillées pour les contrôles terminés */}
        {control.status === 'completed' && (
          <div className="border-t pt-4">
            {statsLoading && !stats ? (
              <div className="text-center text-gray-500 py-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto mb-2"></div>
                {t('cp.loadingStats')}
              </div>
            ) : stats && stats.totalStudents > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-start py-2">{t('cp.category')}</th>
                      <th className="text-center py-2">{t('cp.count')}</th>
                      <th className="text-center py-2">{t('cp.percentage')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <UserX className="w-4 h-4 text-red-500" />
                        <span>{t('cp.absences')}</span>
                      </td>
                      <td className="text-center text-red-600 font-medium">{stats.absences}</td>
                      <td className="text-center text-red-600">
                        {Math.round((stats.absences / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <Package className="w-4 h-4 text-green-500" />
                        <span>{t('cp.materialComplete')}</span>
                      </td>
                      <td className="text-center text-green-600 font-medium">{stats.materialComplete}</td>
                      <td className="text-center text-green-600">
                        {Math.round((stats.materialComplete / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-500" />
                        <span>{t('cp.disciplineGood')}</span>
                      </td>
                      <td className="text-center text-blue-600 font-medium">{stats.disciplineGood}</td>
                      <td className="text-center text-blue-600">
                        {Math.round((stats.disciplineGood / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-orange-500" />
                        <span>{t('cp.phoneUse')}</span>
                      </td>
                      <td className="text-center text-orange-600 font-medium">{stats.phoneUsage}</td>
                      <td className="text-center text-orange-600">
                        {Math.round((stats.phoneUsage / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        <span>{t('cp.cheatingAttempts')}</span>
                      </td>
                      <td className="text-center text-yellow-600 font-medium">{stats.cheatingAttempts}</td>
                      <td className="text-center text-yellow-600">
                        {stats.totalStudents > 0 ? Math.round((stats.cheatingAttempts / stats.totalStudents) * 100) : 0}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <Eye className="w-4 h-4 text-red-600" />
                        <span>{t('cp.cheatingConfirmed')}</span>
                      </td>
                      <td className="text-center text-red-600 font-medium">{stats.cheatingCaught}</td>
                      <td className="text-center text-red-600">
                        {stats.totalStudents > 0 ? Math.round((stats.cheatingCaught / stats.totalStudents) * 100) : 0}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-purple-500" />
                        <span>{t('cp.copiesSubmitted')}</span>
                      </td>
                      <td className="text-center text-purple-600 font-medium">{stats.copiesSubmitted}</td>
                      <td className="text-center text-purple-600">
                        {Math.round((stats.copiesSubmitted / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span>{t('cp.successRate')}</span>
                      </td>
                      <td className="text-center text-green-600" colSpan="2">
                        {Math.round((stats.copiesSubmitted / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-2 text-xs text-gray-500 text-center">
                  {t('cp.totalStudents', { n: stats.totalStudents })}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 text-sm py-2">
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingControl, setEditingControl] = useState(null);
  const [saving, setSaving] = useState(false);

  // États pour le filtre
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClass, setFilterClass] = useState('all');

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
  const [activeNotesTab, setActiveNotesTab] = useState('manual'); // 'import', 'manual', 'stats'
  const [classStudents, setClassStudents] = useState([]);
  const [studentsNotes, setStudentsNotes] = useState({});
  const [loadingStudents, setLoadingStudents] = useState(false);
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
    const completedControls = controls.filter(c => c.status === 'completed');
    
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
    try {
      const token = await getAuthToken();
      
      // Préparer les données pour l'API
      const notesData = Object.entries(studentsNotes)
        .filter(([_, noteData]) => noteData.note && typeof noteData.note === 'string' && noteData.note.trim() !== '')
        .map(([studentId, noteData]) => ({
          student_id: studentId,
          control_id: selectedControlForNotes.id,
          note: parseFloat(noteData.note.replace(',', '.')),
          appreciation: noteData.appreciation || ''
        }));

      if (notesData.length === 0) {
        alert(t('cp.noNoteToSave'));
        return;
      }

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
    }
  };

  // Fonction pour traiter le collage des notes
  const handlePasteNotes = () => {
    console.log('Début du collage des notes');
    console.log('Texte collé:', pasteNotesText);
    console.log('Nombre d\'élèves:', classStudents.length);
    
    // Diviser le texte par lignes et nettoyer
    const lines = pasteNotesText.split('\n').filter(line => line.trim());
    console.log('Lignes détectées:', lines.length);
    
    const notes = lines.map(line => {
      // Garder la note telle quelle (avec virgule ou point)
      const cleanNote = line.trim();
      // Validation simple : vérifier que c'est un nombre valide
      const note = parseFloat(cleanNote.replace(',', '.'));
      return isNaN(note) ? null : Math.min(20, Math.max(0, note)); // Limiter entre 0 et 20
    }).filter(note => note !== null);
    
    console.log('Notes valides:', notes);

    // Mettre à jour les notes des élèves dans l'ordre
    const updatedNotes = { ...studentsNotes };
    classStudents.forEach((student, index) => {
      if (index < notes.length) {
        updatedNotes[student.id] = {
          ...updatedNotes[student.id],
          note: lines[index].trim() // Garder le format original (avec virgule si présente)
        };
        console.log(`Élève ${student.first_name} ${student.last_name}: ${lines[index].trim()}`);
      }
    });

    console.log('Notes mises à jour:', updatedNotes);
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

  const resetExcelImport = () => {
    setExcelFiles([]);
    setExcelGlobalError(null);
    setExcelGlobalResult(null);
    setExcelImporting(false);
  };

  // Ajouter des fichiers (depuis input ou drag-drop)
  const addExcelFiles = (fileList) => {
    const newFiles = Array.from(fileList)
      .filter(f => /\.(xlsx|xls|csv)$/i.test(f.name))
      .map(f => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file: f,
        classId: '',
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
        if (match) {
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

  // Filtrer les contrôles en fonction des critères (avec debounce)
  const filteredControls = controls.filter(control => {
    // Filtre par statut (debounced)
    if (debouncedFilterStatus !== 'all' && control.status !== debouncedFilterStatus) {
      return false;
    }
    
    // Filtre par classe (debounced)
    if (debouncedFilterClass !== 'all' && control.class_id !== debouncedFilterClass) {
      return false;
    }
    
    return true;
  });

  // Calculer les statistiques des contrôles (optimisé avec useMemo)
  const controlStats = useMemo(() => {
    const completedControls = filteredControls.filter(c => c.status === 'completed');
    
    if (completedControls.length === 0) {
      return {
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
    }

    // Calculer les statistiques à partir du cache
    let totalStudents = 0;
    let absences = 0;
    let materialComplete = 0;
    let disciplineGood = 0;
    let phoneUsage = 0;
    let cheatingAttempts = 0;
    let cheatingCaught = 0;
    let copiesSubmitted = 0;

    completedControls.forEach(control => {
      const stats = controlsStatsCache[control.id];
      if (stats) {
        totalStudents += stats.totalStudents;
        absences += stats.absences;
        materialComplete += stats.materialComplete;
        disciplineGood += stats.disciplineGood;
        phoneUsage += stats.phoneUsage;
        cheatingAttempts += stats.cheatingAttempts;
        cheatingCaught += stats.cheatingCaught;
        copiesSubmitted += stats.copiesSubmitted;
      }
    });

    const successRate = totalStudents > 0 ? Math.round((copiesSubmitted / totalStudents) * 100) : 0;

    return {
      totalStudents,
      successRate,
      absences,
      materialComplete,
      disciplineGood,
      phoneUsage,
      cheatingAttempts,
      cheatingCaught,
      copiesSubmitted
    };
  }, [filteredControls, controlsStatsCache]);

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

      setClasses(Array.isArray(classesData) ? classesData : []);
      setControls(Array.isArray(controlsData) ? controlsData : []);
    } catch (error) {
      console.error('Erreur:', error);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-4xl font-bold truncate">{t('cp.title')}</h1>
          <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">{t('cp.subtitle')}</p>
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
              description: '',
              kind: 'control'
            });
            setShowCreateModal(true);
          }}
          className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 flex-shrink-0"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-sm sm:text-base">{t('cp.newControl')}</span>
        </button>
      </div>

      {/* Filtre professionnel */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">{t('cp.filterTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('cp.status')}</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">{t('cp.allControls')}</option>
                <option value="planned">{t('cp.planned')}</option>
                <option value="completed">{t('cp.completed')}</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('common.class')}</label>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">{t('cp.allClasses')}</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Excel des notes (Multi-fichiers) */}
      <Card className="mb-6">
        <CardHeader className="cursor-pointer" onClick={() => setShowExcelImportSection(prev => !prev)}>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-5 h-5 text-green-600" />
            {t('cp.excelTitle')}
            {excelFiles.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-normal">{t('cp.excelFiles', { n: excelFiles.length })}</span>
            )}
            <span className="ml-auto text-sm text-gray-400">{showExcelImportSection ? t('cp.hide') : t('cp.show')}</span>
          </CardTitle>
          <CardDescription>{t('cp.excelSubtitle')}</CardDescription>
        </CardHeader>
        {showExcelImportSection && (
          <CardContent>
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
          </CardContent>
        )}
      </Card>

      {/* Statistiques détaillées */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              {t('cp.plannedControls')}
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
              {t('cp.completedControls')}
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
              {t('cp.assignedClasses')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">
              {classStats.totalClasses}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-600" />
              {t('cp.totalStudentsShort')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">
              {classStats.totalStudents}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('cp.myControls')}</CardTitle>
          <CardDescription>{t('cp.myControlsSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredControls.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600">{t('cp.empty')}</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                {t('cp.createControl')}
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

            {/* Onglets */}
            <div className="border-b flex-shrink-0">
              <div className="flex w-full overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setActiveNotesTab('import')}
                  className={`flex-1 min-w-[70px] sm:min-w-[80px] px-1 sm:px-4 py-2 font-medium flex flex-col sm:flex-row items-center justify-center gap-1 border-b-2 transition-colors text-[10px] sm:text-sm ${
                    activeNotesTab === 'import'
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Upload className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{t('cp.tab.import')}</span>
                  <span className="sm:hidden">{t('cp.tab.importShort')}</span>
                </button>
                <button
                  onClick={() => setActiveNotesTab('manual')}
                  className={`flex-1 min-w-[70px] sm:min-w-[80px] px-1 sm:px-4 py-2 font-medium flex flex-col sm:flex-row items-center justify-center gap-1 border-b-2 transition-colors text-[10px] sm:text-sm ${
                    activeNotesTab === 'manual'
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Edit3 className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span>{t('cp.tab.manual')}</span>
                </button>
                <button
                  onClick={() => setActiveNotesTab('stats')}
                  className={`flex-1 min-w-[70px] sm:min-w-[80px] px-1 sm:px-4 py-2 font-medium flex flex-col sm:flex-row items-center justify-center gap-1 border-b-2 transition-colors text-[10px] sm:text-sm ${
                    activeNotesTab === 'stats'
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span>{t('cp.tab.stats')}</span>
                </button>
              </div>
            </div>

            {/* Contenu des onglets */}
            <div className="p-2 sm:p-4 overflow-y-auto flex-1">
              {activeNotesTab === 'import' && (
                <div className="text-center py-4">
                  <Upload className="w-8 h-8 sm:w-12 sm:h-12 text-green-400 mx-auto mb-2 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-2">{t('cp.importAbove')}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 mb-4">
                    {t('cp.importAboveHint')}
                  </p>
                  <button
                    onClick={() => {
                      setShowNotesModal(false);
                      setShowExcelImportSection(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-4 py-2 sm:px-6 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium inline-flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {t('cp.goToImport')}
                  </button>
                </div>
              )}

              {activeNotesTab === 'manual' && (
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold hidden sm:block">{t('cp.manualTitle')}</h3>
                  
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
                        {classStudents.map((student) => (
                          <div key={student.id} className="flex items-center gap-1.5 p-1.5 border border-gray-200 rounded bg-white">
                            <div className="flex-1 min-w-0">
                              <span className="block text-xs font-medium text-gray-900 truncate">{student.first_name} {student.last_name}</span>
                            </div>
                            <input
                              type="number"
                              min="0" max="20" step="0.25"
                              value={studentsNotes[student.id]?.note ?? ''}
                              onChange={(e) => setStudentsNotes(prev => ({ ...prev, [student.id]: { ...prev[student.id], note: e.target.value } }))}
                              placeholder="/20"
                              className="w-12 text-center border border-gray-300 rounded px-1 py-1 text-xs"
                            />
                          </div>
                        ))}
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
                            {classStudents.map((student) => (
                              <tr key={student.id}>
                                <td className="px-4 py-3">
                                  <div className="font-medium text-gray-900">
                                    {student.first_name} {student.last_name}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {student.email}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <input
                                    type="text"
                                    placeholder="20,00"
                                    value={studentsNotes[student.id]?.note || ''}
                                    onChange={(e) => {
                                      setStudentsNotes(prev => ({
                                        ...prev,
                                        [student.id]: {
                                          ...prev[student.id],
                                          note: e.target.value
                                        }
                                      }));
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 mt-3 sm:mt-4">
                        <div className="flex w-full sm:w-auto items-center justify-between sm:justify-start gap-2">
                          <button 
                            onClick={() => setShowPasteModal(true)}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none"
                          >
                            <Upload className="w-3 h-3 sm:w-4 sm:h-4" />
                            {t('cp.pasteNotes')}
                          </button>
                          <div className="text-[10px] sm:text-sm text-gray-600">
                            {t('cp.studentsCount', { n: classStudents.length })}
                          </div>
                        </div>
                        <button 
                          onClick={handleSaveNotes}
                          className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          {t('sr.saveShort')}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 md:p-6 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-600" />
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm resize-none"
                  rows={8}
                  style={{ minHeight: '200px' }}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <h4 className="font-medium text-purple-800 mb-2">{t('cp.instructions')}</h4>
                  <ul className="text-sm text-purple-700 space-y-1">
                    <li>• <strong>{t('cp.instr1')}</strong></li>
                    <li>• <strong>{t('cp.instr2')}</strong></li>
                    <li>• <strong>{t('cp.instr3')}</strong></li>
                    <li>• <strong>{t('cp.instr4')}</strong></li>
                  </ul>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="text-sm text-green-800">
                    <strong>{t('cp.autoResult')}</strong><br/>
                    {t('cp.autoResultText')}
                  </div>
                </div>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-yellow-800">
                  <div>
                    <strong>{t('cp.concernedStudents')}</strong> {t('cp.studentsCount', { n: classStudents.length })}
                  </div>
                  <div>
                    <strong>{t('cp.detectedNotes')}</strong> {t('cp.notesCount', { n: pasteNotesText.split('\n').filter(line => line.trim()).length })}
                  </div>
                </div>
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
                  {t('cp.pasteAndClose')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {editingControl ? t('cp.editControl') : t('cp.newControl')}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('cp.classRequired')}
                </label>
                <select
                  value={formData.class_id}
                  onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">{t('cp.pickClass')}</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('cp.nameRequired')}
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
                  {t('cp.dateRequired')}
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
                  {t('cp.description')}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('cp.type')}</label>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setFormData({ ...formData, kind: 'control' })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      formData.kind !== 'activity' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}>{t('cp.control')}</button>
                  <button type="button" onClick={() => setFormData({ ...formData, kind: 'activity' })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      formData.kind === 'activity' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}>{t('cp.activityIntegrated')}</button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
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
