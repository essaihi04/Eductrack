import { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, FileText, Plus, Edit2, Trash2, Save, X, CheckCircle, Users, TrendingUp, UserX, Package, Shield, Phone, AlertTriangle, Eye, FileCheck, Upload, BarChart3, Edit3, Activity, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';

const ControlsPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();

  // Composant pour afficher une carte de contrôle avec statistiques (optimisé avec cache)
  const ControlCard = ({ control }) => {
    const stats = controlsStatsCache[control.id];

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
              onClick={() => {
                setSelectedControlForNotes(control);
                setShowNotesModal(true);
                setActiveNotesTab('manual');
              }}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1"
            >
              <BarChart3 className="w-4 h-4" />
              Notes
            </button>
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
            {statsLoading && !stats ? (
              <div className="text-center text-gray-500 py-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto mb-2"></div>
                Chargement des statistiques...
              </div>
            ) : stats && stats.totalStudents > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Catégorie</th>
                      <th className="text-center py-2">Nombre</th>
                      <th className="text-center py-2">Pourcentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <UserX className="w-4 h-4 text-red-500" />
                        <span>Absences</span>
                      </td>
                      <td className="text-center text-red-600 font-medium">{stats.absences}</td>
                      <td className="text-center text-red-600">
                        {Math.round((stats.absences / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <Package className="w-4 h-4 text-green-500" />
                        <span>Matériel complet</span>
                      </td>
                      <td className="text-center text-green-600 font-medium">{stats.materialComplete}</td>
                      <td className="text-center text-green-600">
                        {Math.round((stats.materialComplete / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-500" />
                        <span>Bonne discipline</span>
                      </td>
                      <td className="text-center text-blue-600 font-medium">{stats.disciplineGood}</td>
                      <td className="text-center text-blue-600">
                        {Math.round((stats.disciplineGood / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <Phone className="w-4 h-4 text-orange-500" />
                        <span>Utilisation téléphone</span>
                      </td>
                      <td className="text-center text-orange-600 font-medium">{stats.phoneUsage}</td>
                      <td className="text-center text-orange-600">
                        {Math.round((stats.phoneUsage / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        <span>Tentatives de triche</span>
                      </td>
                      <td className="text-center text-yellow-600 font-medium">{stats.cheatingAttempts}</td>
                      <td className="text-center text-yellow-600">
                        {stats.totalStudents > 0 ? Math.round((stats.cheatingAttempts / stats.totalStudents) * 100) : 0}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <Eye className="w-4 h-4 text-red-600" />
                        <span>Triches confirmées</span>
                      </td>
                      <td className="text-center text-red-600 font-medium">{stats.cheatingCaught}</td>
                      <td className="text-center text-red-600">
                        {stats.totalStudents > 0 ? Math.round((stats.cheatingCaught / stats.totalStudents) * 100) : 0}%
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-purple-500" />
                        <span>Copies rendues</span>
                      </td>
                      <td className="text-center text-purple-600 font-medium">{stats.copiesSubmitted}</td>
                      <td className="text-center text-purple-600">
                        {Math.round((stats.copiesSubmitted / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span>Taux de réussite</span>
                      </td>
                      <td className="text-center text-green-600" colSpan="2">
                        {Math.round((stats.copiesSubmitted / stats.totalStudents) * 100)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-2 text-xs text-gray-500 text-center">
                  Total élèves: {stats.totalStudents}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500 text-sm py-2">
                {statsLoading ? 'Chargement...' : 'Aucune statistique disponible'}
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
    description: ''
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
        alert('Aucune note à enregistrer');
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
        alert(`✅ ${notesData.length} note(s) enregistrée(s) avec succès !`);
        
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
        alert(`❌ Erreur lors de l'enregistrement: ${error.error || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de l\'enregistrement des notes');
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
    alert(`✅ ${studentsCount} note(s) collée(s) avec succès !\n\n📝 ${notesCount} note(s) assignée(s) aux élèves\n\n💾 Cliquez sur "Enregistrer les notes" pour sauvegarder.`);
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
          const studentName = student ? `${student.first_name} ${student.last_name}` : 'Inconnu';
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
        name: n.student_name || 'Élève',
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
    
    return 'Non définie';
  };

  // Fonction pour exporter un contrôle en PDF
  const exportControlToPDF = async (control) => {
    try {
      // Debug: Vérifier la structure du contrôle
      console.log('Control data for PDF:', control);
      console.log('Control class_name:', control.class_name);
      console.log('Control classes:', control.classes);
      console.log('Classes list:', classes);
      
      // Récupérer le nom de la classe
      const className = getClassName(control);
      console.log('Final class name:', className);
      
      // Importation dynamique de jsPDF pour éviter les erreurs Vite
      const { default: jsPDF } = await import('jspdf');
      const stats = calculateControlStats(control.id);
      
      // Créer un nouveau document PDF
      const doc = new jsPDF();
      
      // Configuration des polices et couleurs
      doc.setFontSize(20);
      doc.setTextColor(41, 98, 255); // Bleu
      
      // Titre principal
      doc.text('Rapport de Contrôle', 105, 20, { align: 'center' });
      
      // Informations générales
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('Informations générales', 20, 40);
      
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      doc.text(`Nom du contrôle : ${control.name}`, 20, 50);
      doc.text(`Date : ${new Date(control.date).toLocaleDateString('fr-FR')}`, 20, 60);
      doc.text(`Heures : ${control.start_time} - ${control.end_time}`, 20, 70);
      doc.text(`Classe : ${className}`, 20, 80);
      
      if (control.description) {
        const descriptionLines = doc.splitTextToSize(control.description, 170);
        doc.text(`Description :`, 20, 90);
        doc.setFontSize(10);
        doc.text(descriptionLines, 20, 100);
      }
      
      // Statistiques principales
      let yPos = control.description ? 120 : 100;
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('Statistiques principales', 20, yPos);
      
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      yPos += 15;
      doc.text(`Moyenne : ${stats.average.toFixed(2)}/20`, 20, yPos);
      doc.text(`Élèves notés : ${stats.notedStudents}/${stats.totalStudents} (${stats.notedPercentage}%)`, 20, yPos + 10);
      doc.text(`Taux de réussite : ${stats.successRate}% (≥10/20)`, 20, yPos + 20);
      doc.text(`Dispersion : ${stats.dispersion}`, 20, yPos + 30);
      doc.text(`Note minimale : ${stats.minNote}/20`, 20, yPos + 40);
      doc.text(`Note maximale : ${stats.maxNote}/20`, 20, yPos + 50);
      
      // Répartition des notes avec barres visuelles
      yPos += 70;
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('Répartition des notes', 20, yPos);
      
      // Barre 15-20
      yPos += 15;
      doc.setFontSize(12);
      doc.setTextColor(60, 60, 60);
      doc.text('15-20', 20, yPos);
      
      // Barre de progression
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(200, 200, 200);
      doc.rect(60, yPos - 5, 100, 8, 'F'); // Fond gris
      doc.setFillColor(34, 197, 94); // Vert
      doc.rect(60, yPos - 5, stats.distribution.high, 8, 'F'); // Barre verte
      doc.text(`${stats.distribution.high}% (${Math.round(stats.notedStudents * stats.distribution.high / 100)} élèves)`, 170, yPos);
      
      // Barre 10-14
      yPos += 15;
      doc.text('10-14', 20, yPos);
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(200, 200, 200);
      doc.rect(60, yPos - 5, 100, 8, 'F'); // Fond gris
      doc.setFillColor(59, 130, 246); // Bleu
      doc.rect(60, yPos - 5, stats.distribution.medium, 8, 'F'); // Barre bleue
      doc.text(`${stats.distribution.medium}% (${Math.round(stats.notedStudents * stats.distribution.medium / 100)} élèves)`, 170, yPos);
      
      // Barre 0-9
      yPos += 15;
      doc.text('0-9', 20, yPos);
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(200, 200, 200);
      doc.rect(60, yPos - 5, 100, 8, 'F'); // Fond gris
      doc.setFillColor(239, 68, 68); // Rouge
      doc.rect(60, yPos - 5, stats.distribution.low, 8, 'F'); // Barre rouge
      doc.text(`${stats.distribution.low}% (${Math.round(stats.notedStudents * stats.distribution.low / 100)} élèves)`, 170, yPos);
      
      // Élèves en échec (s'il y en a)
      if (stats.failingStudents.length > 0) {
        yPos += 30;
        doc.setFontSize(16);
        doc.setTextColor(220, 38, 38); // Rouge
        doc.text('Élèves en echec (< 10/20)', 20, yPos);
        
        // Note explicative pour les noms arabes
        yPos += 12;
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('* Note: Les noms en caracteres arabes sont affiches comme images pour compatibilite PDF', 20, yPos);
        
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        yPos += 15;
        
        stats.failingStudents.forEach((student, index) => {
          if (yPos > 270) { // Nouvelle page si nécessaire
            doc.addPage();
            yPos = 20;
          }
          
          // Vérifier si le nom contient des caractères arabes
          const arabicRegex = /[\u0600-\u06FF]/;
          const isArabic = arabicRegex.test(student.name);
          
          if (isArabic) {
            // Créer une image du nom arabe avec de meilleures dimensions
            const nameImage = createArabicTextImage(student.name, 10);
            
            // Calculer les dimensions dynamiquement
            const imgWidth = Math.min(80, student.name.length * 4); // Largeur max 80px
            const imgHeight = 12;
            
            // Positionnement amélioré
            doc.addImage(nameImage, 'PNG', 25, yPos - 4, imgWidth, imgHeight);
            doc.text(`${index + 1}.`, 10, yPos);
            doc.text(`: ${student.note}/20`, imgWidth + 30, yPos);
          } else {
            // Afficher normalement pour les noms non arabes
            doc.text(`${index + 1}. ${student.name} : ${student.note}/20`, 20, yPos);
          }
          
          yPos += 12;
        });
      }
      
      // Pied de page
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} / ${pageCount}`, 105, 290, { align: 'center' });
        doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 105, 285, { align: 'center' });
      }
      
      // Télécharger le PDF
      const fileName = `rapport_controle_${(control.name || 'controle').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date(control.date).toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      console.log('PDF exporté avec succès:', fileName);
      
    } catch (error) {
      console.error('Erreur lors de l\'exportation PDF:', error);
      alert('❌ Erreur lors de l\'exportation PDF. Veuillez réessayer.');
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
        interpretation = '📉 Interprétation\n\nLa classe est homogène.\nLes élèves ont un niveau similaire\net maîtrisent bien la matière.';
        advice = '💡 Recommandations\n\n• Poursuivre la progression actuelle\n• Proposer des exercices d\'approfondissement\n• Envisager des activités de groupe';
        break;
      case 'Moyen':
        interpretation = '📉 Interprétation\n\nLa classe présente des écarts notables.\nCertains élèves maîtrisent bien,\nd\'autres sont en difficulté.';
        advice = '💡 Recommandations\n\n• Prévoir une différenciation pédagogique\n• Organiser des groupes de niveau\n• Proposer un soutien personnalisé\n• Adapter les exercices';
        break;
      case 'Élevé':
        interpretation = '📉 Interprétation\n\nLa classe est très hétérogène.\nGros écarts entre les élèves.\nNécessite une attention particulière.';
        advice = '💡 Recommandations\n\n• Repenser l\'approche pédagogique\n• Créer des groupes de compétences\n• Planifier des évaluations adaptées\n• Envisager un tutorat par pairs';
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
      setExcelGlobalError('Aucun fichier Excel valide sélectionné (.xlsx, .xls, .csv)');
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
      updateExcelFile(fileEntry.id, { error: 'Veuillez sélectionner une classe.' });
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
        updateExcelFile(fileEntry.id, { parsing: false, error: data.error || 'Erreur analyse' });
        return;
      }
      const mappings = autoMapColumns(data);
      updateExcelFile(fileEntry.id, { parsing: false, parsed: data, mappings });
    } catch (err) {
      console.error('Erreur parse Excel:', err);
      updateExcelFile(fileEntry.id, { parsing: false, error: 'Erreur lors de l\'analyse du fichier' });
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
      setExcelGlobalError('Aucun fichier prêt à importer. Assignez une classe et des contrôles.');
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
        message: `${totalInserted} note(s) importée(s) depuis ${readyFiles.length} fichier(s)`,
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
      setExcelGlobalError('Erreur lors de l\'importation des notes');
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

  const getStatusLabel = (status) => {
    switch (status) {
      case 'planned':
        return 'Planifié';
      case 'in_progress':
        return 'En cours';
      case 'completed':
        return 'Terminé';
      default:
        return status;
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

  const handleDelete = async (controlId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce contrôle ?')) {
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
        alert('Erreur lors de la suppression du contrôle');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la suppression du contrôle');
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
        alert('Erreur lors de la sauvegarde du contrôle');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la sauvegarde du contrôle');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-bold">Gestion des Contrôles</h1>
          <p className="text-muted-foreground mt-2">Gérez et suivez tous vos contrôles</p>
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
          </div>
        </CardContent>
      </Card>

      {/* Import Excel des notes (Multi-fichiers) */}
      <Card className="mb-6">
        <CardHeader className="cursor-pointer" onClick={() => setShowExcelImportSection(prev => !prev)}>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-5 h-5 text-green-600" />
            Importer les notes via Excel
            {excelFiles.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-normal">{excelFiles.length} fichier(s)</span>
            )}
            <span className="ml-auto text-sm text-gray-400">{showExcelImportSection ? '▲ Masquer' : '▼ Afficher'}</span>
          </CardTitle>
          <CardDescription>Importez les notes depuis un ou plusieurs fichiers Excel (un fichier par classe)</CardDescription>
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
                    <div className="space-y-1 text-sm text-green-700">
                      {Object.entries(excelGlobalResult.details).map(([key, d], i) => (
                        <div key={i} className="flex items-center gap-2">
                          {d.success ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
                          <span><strong>{key}</strong> : {d.success ? `${d.count} note(s)` : d.error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {excelGlobalResult.skippedStudents > 0 && (
                    <p className="text-sm text-yellow-700 mt-2">{excelGlobalResult.skippedStudents} élève(s) non reconnu(s) ignoré(s)</p>
                  )}
                  <button onClick={resetExcelImport} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium">
                    Nouvel import
                  </button>
                </div>
              )}

              {/* Erreur globale */}
              {excelGlobalError && !excelGlobalResult && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-red-800 font-medium">{excelGlobalError}</p>
                    <button onClick={() => setExcelGlobalError(null)} className="text-sm text-red-600 underline mt-1">Fermer</button>
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
                      Glissez-déposez vos fichiers Excel ici
                    </p>
                    <p className="text-sm text-gray-500 mb-3">ou</p>
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer text-sm font-medium">
                      <Upload className="w-4 h-4" />
                      Sélectionner des fichiers
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        multiple
                        onChange={handleExcelFilesSelect}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-400 mt-3">Formats acceptés : .xlsx, .xls, .csv — Un fichier par classe</p>
                  </div>

                  {/* Liste des fichiers ajoutés */}
                  {excelFiles.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-800">{excelFiles.length} fichier(s) ajouté(s)</h4>
                        <button onClick={resetExcelImport} className="text-sm text-red-500 hover:text-red-700 underline">Tout supprimer</button>
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
                                      {fileEntry.parsed.totalMatchedStudents}/{fileEntry.parsed.totalExcelStudents} élèves reconnus
                                      — {fileEntry.parsed.detectedColumns?.length || 0} colonnes
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
                                    <option value="">Classe...</option>
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
                                  <p className="text-xs font-medium text-gray-600 mb-2">Associer les colonnes aux contrôles :</p>
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
                                          <option value="">-- Ne pas importer --</option>
                                          {fileEntry.parsed.dbControls?.map(c => (
                                            <option key={c.id} value={c.id}>
                                              {c.name} ({new Date(c.date).toLocaleDateString('fr-FR')})
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    ))}
                                  </div>
                                  {fileEntry.parsed.dbControls?.length === 0 && (
                                    <p className="text-xs text-yellow-700 mt-1">Aucun contrôle trouvé pour cette classe.</p>
                                  )}
                                </div>

                                {/* Aperçu compact des élèves */}
                                <details className="group">
                                  <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800 font-medium">
                                    Voir l'aperçu des {fileEntry.parsed.students?.length} élèves
                                  </summary>
                                  <div className="mt-2 overflow-x-auto max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                                    <table className="w-full text-xs">
                                      <thead className="bg-gray-100 sticky top-0">
                                        <tr>
                                          <th className="px-2 py-1 text-left">#</th>
                                          <th className="px-2 py-1 text-left">Nom</th>
                                          <th className="px-2 py-1 text-left">Match</th>
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
                          {excelFiles.filter(f => f.parsed && Object.values(f.mappings).some(v => v)).length} / {excelFiles.length} fichier(s) prêt(s)
                        </div>
                        <button
                          onClick={handleExcelImportAll}
                          disabled={excelImporting || excelFiles.filter(f => f.parsed && Object.values(f.mappings).some(v => v)).length === 0}
                          className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {excelImporting ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Importation en cours...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              Importer toutes les notes
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Info format */}
                  {excelFiles.length === 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-800 mb-2">Format Excel marocain supporté :</h4>
                      <ul className="text-sm text-blue-700 space-y-1">
                        <li>- Colonne <strong>رقم التلميذ</strong> : Code Massar</li>
                        <li>- Colonne <strong>إسم التلميذ</strong> : Nom de l'élève</li>
                        <li>- Colonnes <strong>الفرض الأول، الفرض الثاني...</strong> : Notes des contrôles</li>
                        <li>- Colonne <strong>الأنشطة المندمجة</strong> : Note des activités</li>
                      </ul>
                      <p className="text-xs text-blue-600 mt-2">Vous pouvez importer plusieurs fichiers en même temps (un par classe).</p>
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
              Classes Assignées
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
              Total Élèves
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
          <CardTitle>Mes Contrôles</CardTitle>
          <CardDescription>Liste de tous vos contrôles</CardDescription>
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

      {/* Modal de gestion des notes */}
      {showNotesModal && selectedControlForNotes && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-3 md:p-6 border-b">
              <div className="min-w-0 flex-1 pr-2">
                <h2 className="text-base md:text-2xl font-bold flex items-center gap-2 truncate">
                  <BarChart3 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span className="truncate">Notes – {selectedControlForNotes.name}</span>
                </h2>
                <p className="text-gray-600 mt-1 text-xs md:text-sm truncate">
                  {selectedControlForNotes.class_name} · {new Date(selectedControlForNotes.date).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <button
                onClick={() => setShowNotesModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Onglets */}
            <div className="border-b">
              <div className="flex w-full">
                <button
                  onClick={() => setActiveNotesTab('import')}
                  className={`flex-1 px-2 md:px-6 py-2.5 md:py-3 font-medium flex items-center justify-center gap-1 md:gap-2 border-b-2 transition-colors text-xs md:text-sm ${
                    activeNotesTab === 'import'
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  <span>Import Excel</span>
                </button>
                <button
                  onClick={() => setActiveNotesTab('manual')}
                  className={`flex-1 px-2 md:px-6 py-2.5 md:py-3 font-medium flex items-center justify-center gap-1 md:gap-2 border-b-2 transition-colors text-xs md:text-sm ${
                    activeNotesTab === 'manual'
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Edit3 className="w-4 h-4 flex-shrink-0" />
                  <span>Saisie</span>
                </button>
                <button
                  onClick={() => setActiveNotesTab('stats')}
                  className={`flex-1 px-2 md:px-6 py-2.5 md:py-3 font-medium flex items-center justify-center gap-1 md:gap-2 border-b-2 transition-colors text-xs md:text-sm ${
                    activeNotesTab === 'stats'
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 flex-shrink-0" />
                  <span>Stats</span>
                </button>
              </div>
            </div>

            {/* Contenu des onglets */}
            <div className="p-6">
              {activeNotesTab === 'import' && (
                <div className="text-center py-8">
                  <Upload className="w-12 h-12 text-green-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Import Excel disponible en haut de la page</h3>
                  <p className="text-gray-600 mb-4">
                    Utilisez la section <strong>« Importer les notes via Excel »</strong> en haut de la page des contrôles pour importer les notes depuis un fichier Excel marocain.
                  </p>
                  <button
                    onClick={() => {
                      setShowNotesModal(false);
                      setShowExcelImportSection(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium inline-flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Aller à l'import Excel
                  </button>
                </div>
              )}

              {activeNotesTab === 'manual' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Saisie manuelle des notes</h3>
                  
                  {loadingStudents ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Chargement des élèves...</p>
                    </div>
                  ) : classStudents.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">Aucun élève trouvé dans cette classe</p>
                    </div>
                  ) : (
                    <>
                      {/* Vue carte mobile */}
                      <div className="md:hidden space-y-2">
                        {classStudents.map((student) => (
                          <div key={student.id} className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg bg-white">
                            <span className="flex-1 text-sm font-medium text-gray-900 truncate">{student.first_name} {student.last_name}</span>
                            <input
                              type="number"
                              min="0" max="20" step="0.25"
                              value={studentsNotes[student.id]?.note ?? ''}
                              onChange={(e) => setStudentsNotes(prev => ({ ...prev, [student.id]: { ...prev[student.id], note: e.target.value } }))}
                              placeholder="/20"
                              className="w-16 text-center border border-gray-300 rounded px-1 py-1 text-sm"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Vue tableau desktop */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full border border-gray-200 rounded-lg">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Élève</th>
                              <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Note /20</th>
                              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Appréciation</th>
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
                                    placeholder="Appréciation..."
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
                      <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setShowPasteModal(true)}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                          >
                            <Upload className="w-4 h-4" />
                            Coller les notes
                          </button>
                          <div className="text-sm text-gray-600 flex items-center">
                            {classStudents.length} élève(s) dans la classe
                          </div>
                        </div>
                        <button 
                          onClick={handleSaveNotes}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Enregistrer les notes
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeNotesTab === 'stats' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Statistiques des notes</h3>
                  
                  {/* Statistiques calculées dynamiquement */}
                  {(() => {
                    const stats = calculateControlStats(selectedControlForNotes.id);
                    return (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <BarChart3 className="w-5 h-5 text-blue-600" />
                              <h4 className="font-medium text-blue-800">Moyenne</h4>
                            </div>
                            <p className="text-2xl font-bold text-blue-600">{stats.average.toFixed(2)}/20</p>
                            <p className="text-sm text-blue-600">Classe : {getClassName(selectedControlForNotes)}</p>
                          </div>
                          
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Users className="w-5 h-5 text-green-600" />
                              <h4 className="font-medium text-green-800">Élèves notés</h4>
                            </div>
                            <p className="text-2xl font-bold text-green-600">{stats.notedStudents}/{stats.totalStudents}</p>
                            <p className="text-sm text-green-600">{stats.notedPercentage}% des élèves</p>
                          </div>
                          
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp className="w-5 h-5 text-purple-600" />
                              <h4 className="font-medium text-purple-800">Taux de réussite</h4>
                            </div>
                            <button
                              onClick={() => showFailingStudents(stats)}
                              className="text-2xl font-bold text-purple-600 hover:text-purple-700 transition-colors cursor-pointer"
                              title="Cliquez pour voir les élèves en échec"
                            >
                              {stats.successRate}%
                            </button>
                            <p className="text-sm text-purple-600">≥ 10/20 (cliquable)</p>
                          </div>

                          <div className={`border rounded-lg p-4 ${
                            stats.dispersion === 'Faible' ? 'bg-green-50 border-green-200' :
                            stats.dispersion === 'Moyen' ? 'bg-yellow-50 border-yellow-200' :
                            'bg-red-50 border-red-200'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              <Activity className="w-5 h-5 text-gray-600" />
                              <h4 className="font-medium text-gray-800">Dispersion</h4>
                            </div>
                            <button
                              onClick={() => showDispersionInterpretation(stats.dispersion)}
                              className={`text-2xl font-bold hover:opacity-80 transition-opacity cursor-pointer ${
                                stats.dispersion === 'Faible' ? 'text-green-600' :
                                stats.dispersion === 'Moyen' ? 'text-yellow-600' :
                                'text-red-600'
                              }`}
                              title="Cliquez pour voir l'interprétation détaillée"
                            >
                              {stats.dispersion}
                            </button>
                            <p className="text-sm text-gray-600">
                              {stats.dispersion === 'Faible' ? 'Classe homogène' :
                               stats.dispersion === 'Moyen' ? 'Écarts moyens' :
                               'Gros écarts'} (cliquable)
                            </p>
                          </div>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <h4 className="font-medium text-gray-800 mb-4">Répartition des notes</h4>
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="w-20 text-sm">15-20</div>
                              <div className="flex-1 bg-gray-200 rounded-full h-6">
                                <div className="bg-green-500 h-6 rounded-full" style={{width: `${stats.distribution.high}%`}}></div>
                              </div>
                              <div className="w-12 text-sm text-right">{stats.distribution.high}%</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-20 text-sm">10-14</div>
                              <div className="flex-1 bg-gray-200 rounded-full h-6">
                                <div className="bg-blue-500 h-6 rounded-full" style={{width: `${stats.distribution.medium}%`}}></div>
                              </div>
                              <div className="w-12 text-sm text-right">{stats.distribution.medium}%</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-20 text-sm">0-9</div>
                              <div className="flex-1 bg-gray-200 rounded-full h-6">
                                <div className="bg-red-500 h-6 rounded-full" style={{width: `${stats.distribution.low}%`}}></div>
                              </div>
                              <div className="w-12 text-sm text-right">{stats.distribution.low}%</div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingDown className="w-5 h-5 text-orange-600" />
                              <h4 className="font-medium text-orange-800">Note minimale</h4>
                            </div>
                            <p className="text-2xl font-bold text-orange-600">{stats.minNote}/20</p>
                            <p className="text-sm text-orange-600">Qui a chuté ?</p>
                          </div>
                          
                          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp className="w-5 h-5 text-teal-600" />
                              <h4 className="font-medium text-teal-800">Note maximale</h4>
                            </div>
                            <p className="text-2xl font-bold text-teal-600">{stats.maxNote}/20</p>
                            <p className="text-sm text-teal-600">Sujet trop dur ?</p>
                          </div>
                        </div>

                        <div className="flex justify-end gap-3">
                          <button 
                            onClick={() => exportControlToPDF(selectedControlForNotes)}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Exporter en PDF
                          </button>
                          <button 
                            onClick={() => viewControlDetails(selectedControlForNotes)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Voir le détail
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
                Coller les notes
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
                  Collez toutes les notes ici (une par ligne) :
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
                  <h4 className="font-medium text-purple-800 mb-2">📋 Instructions :</h4>
                  <ul className="text-sm text-purple-700 space-y-1">
                    <li>• <strong>Collez toutes vos notes d'un coup</strong></li>
                    <li>• <strong>Une note par ligne</strong></li>
                    <li>• <strong>Virgule ou point</strong> comme séparateur</li>
                    <li>• <strong>Ligne 1 → Élève 1</strong></li>
                  </ul>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="text-sm text-green-800">
                    <strong>🎯 Résultat automatique :</strong><br/>
                    Toutes les notes seront <strong>remplies automatiquement</strong> 
                    dans le tableau sans saisie manuelle.
                  </div>
                </div>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-yellow-800">
                  <div>
                    <strong>👥 Élèves concernés :</strong> {classStudents.length} élève(s)
                  </div>
                  <div>
                    <strong>📝 Notes détectées :</strong> {pasteNotesText.split('\n').filter(line => line.trim()).length} note(s)
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowPasteModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handlePasteNotes}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold"
                >
                  🚀 Coller et fermer
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
                {editingControl ? 'Modifier le Contrôle' : 'Nouveau Contrôle'}
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
                  Classe *
                </label>
                <select
                  value={formData.class_id}
                  onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Sélectionner une classe</option>
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom du contrôle *
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
                  Date *
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
                    Heure de début
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
                    Heure de fin
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
                  Description
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
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Sauvegarde...' : (editingControl ? 'Modifier' : 'Créer')}
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
                Détails du contrôle
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
                  Informations générales
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-blue-700">📝 Nom :</span>
                    <span className="ml-2 text-blue-900">{detailsData.control.name}</span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700">📅 Date :</span>
                    <span className="ml-2 text-blue-900">
                      {new Date(detailsData.control.date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700">👥 Heures :</span>
                    <span className="ml-2 text-blue-900">
                      {detailsData.control.start_time} - {detailsData.control.end_time}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-blue-700">🏫 Classe :</span>
                    <span className="ml-2 text-blue-900">{getClassName(detailsData.control)}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="font-medium text-blue-700">📋 Description :</span>
                    <span className="ml-2 text-blue-900">
                      {detailsData.control.description || 'Aucune description'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Statistiques principales */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-4 h-4 text-green-600" />
                    <h5 className="font-medium text-green-800">Moyenne</h5>
                  </div>
                  <p className="text-xl font-bold text-green-600">
                    {detailsData.stats.average.toFixed(2)}/20
                  </p>
                </div>
                
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-purple-600" />
                    <h5 className="font-medium text-purple-800">Élèves notés</h5>
                  </div>
                  <p className="text-xl font-bold text-purple-600">
                    {detailsData.stats.notedStudents}/{detailsData.stats.totalStudents}
                  </p>
                  <p className="text-xs text-purple-600">
                    {detailsData.stats.notedPercentage}% des élèves
                  </p>
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-orange-600" />
                    <h5 className="font-medium text-orange-800">Taux de réussite</h5>
                  </div>
                  <p className="text-xl font-bold text-orange-600">
                    {detailsData.stats.successRate}%
                  </p>
                  <p className="text-xs text-orange-600">≥ 10/20</p>
                </div>

                <div className={`border rounded-lg p-4 ${
                  detailsData.stats.dispersion === 'Faible' ? 'bg-green-50 border-green-200' :
                  detailsData.stats.dispersion === 'Moyen' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-gray-600" />
                    <h5 className="font-medium text-gray-800">Dispersion</h5>
                  </div>
                  <p className={`text-xl font-bold ${
                    detailsData.stats.dispersion === 'Faible' ? 'text-green-600' :
                    detailsData.stats.dispersion === 'Moyen' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {detailsData.stats.dispersion}
                  </p>
                </div>
              </div>

              {/* Notes extrêmes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-red-600" />
                    <h5 className="font-medium text-red-800">Note minimale</h5>
                  </div>
                  <p className="text-xl font-bold text-red-600">
                    {detailsData.stats.minNote}/20
                  </p>
                  <p className="text-xs text-red-600">Qui a chuté ?</p>
                </div>
                
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-teal-600" />
                    <h5 className="font-medium text-teal-800">Note maximale</h5>
                  </div>
                  <p className="text-xl font-bold text-teal-600">
                    {detailsData.stats.maxNote}/20
                  </p>
                  <p className="text-xs text-teal-600">Sujet trop dur ?</p>
                </div>
              </div>

              {/* Répartition détaillée */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-800 mb-4">Répartition détaillée des notes</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-20 text-sm font-medium">15-20</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-6">
                      <div className="bg-green-500 h-6 rounded-full flex items-center justify-end pr-2" 
                           style={{width: `${detailsData.stats.distribution.high}%`}}>
                        <span className="text-xs text-white font-medium">
                          {detailsData.stats.distribution.high}%
                        </span>
                      </div>
                    </div>
                    <div className="w-16 text-sm text-right">
                      {Math.round(detailsData.stats.notedStudents * detailsData.stats.distribution.high / 100)} élèves
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 text-sm font-medium">10-14</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-6">
                      <div className="bg-blue-500 h-6 rounded-full flex items-center justify-end pr-2" 
                           style={{width: `${detailsData.stats.distribution.medium}%`}}>
                        <span className="text-xs text-white font-medium">
                          {detailsData.stats.distribution.medium}%
                        </span>
                      </div>
                    </div>
                    <div className="w-16 text-sm text-right">
                      {Math.round(detailsData.stats.notedStudents * detailsData.stats.distribution.medium / 100)} élèves
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 text-sm font-medium">0-9</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-6">
                      <div className="bg-red-500 h-6 rounded-full flex items-center justify-end pr-2" 
                           style={{width: `${detailsData.stats.distribution.low}%`}}>
                        <span className="text-xs text-white font-medium">
                          {detailsData.stats.distribution.low}%
                        </span>
                      </div>
                    </div>
                    <div className="w-16 text-sm text-right">
                      {Math.round(detailsData.stats.notedStudents * detailsData.stats.distribution.low / 100)} élèves
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Fermer
                </button>
                <button
                  onClick={() => exportControlToPDF(detailsData.control)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 md:p-6 border-b">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Élèves en échec (&lt; 10/20)
              </h3>
              <button
                onClick={() => setShowFailingModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 md:p-6">
              {failingStudents.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-600">Aucun élève en échec ! 🎉</p>
                  <p className="text-sm text-gray-500 mt-2">Tous les élèves ont une note supérieure ou égale à 10/20</p>
                </div>
              ) : (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-red-800">
                      <div>
                        <strong>📊 Nombre d'élèves en échec :</strong> {failingStudents.length}
                      </div>
                      <div>
                        <strong>📈 Pourcentage d'échec :</strong> {Math.round((failingStudents.length / classStudents.length) * 100)}%
                      </div>
                      <div>
                        <strong>🎯 Taux de réussite :</strong> {100 - Math.round((failingStudents.length / classStudents.length) * 100)}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Élève</th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Note</th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Écart par rapport à 10</th>
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
                  
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                    <h4 className="font-medium text-yellow-800 mb-2">💡 Recommandations pédagogiques :</h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• Prévoir une séance de soutien pour les élèves ayant un écart de plus de 3 points</li>
                      <li>• Proposer des exercices de renforcement personnalisés</li>
                      <li>• Envisager un contrôle de rattrapage pour les notes très basses (&lt; 5/20)</li>
                      <li>• Analyser les questions qui ont posé le plus de difficultés</li>
                    </ul>
                  </div>
                </>
              )}
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowFailingModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Fermer
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
