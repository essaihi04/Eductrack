import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { useI18n } from '../../i18n';
import { saveBlob } from '../../lib/download';
import { FileText, Download, Calendar, BookOpen, Pencil, Check, ChevronDown } from 'lucide-react';
import { loadLogoForPdf, addLogoToPdf } from '../../lib/schoolLogo';
import { sameYear } from '../../lib/schoolYear';
import { dedupeSubjects } from '../../lib/subjectAliases';

const CahierDeTexte = () => {
  const { profile } = useAuth();
  const { year } = useYear();
  const { t, lang } = useI18n();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const isAdmin = profile?.role === 'admin' || profile?.role === 'school_admin' || profile?.role === 'pedagogical_director' || profile?.role === 'pedagogical_manager';
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [filtersReady, setFiltersReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cahierData, setCahierData] = useState(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTopic, setEditTopic] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const classDropdownRef = useRef(null);

  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (classDropdownRef.current && !classDropdownRef.current.contains(e.target)) {
        setClassDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Load classes and subjects
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const token = await getAuthToken();
        const headers = { Authorization: `Bearer ${token}` };

        if (isAdmin) {
          const [classesRes, subjectsRes, teachersRes] = await Promise.all([
            fetch(`${apiUrl}/api/admin/classes`, { headers }),
            fetch(`${apiUrl}/api/admin/subjects`, { headers }),
            fetch(`${apiUrl}/api/admin/teachers`, { headers })
          ]);
          const classesData = await classesRes.json();
          const subjectsData = await subjectsRes.json();
          const teachersData = await teachersRes.json();
          const cls = (Array.isArray(classesData) ? classesData : [])
            .filter((item) => !item.academic_year || sameYear(item.academic_year, year));
          setClasses(cls);
          setSelectedClasses(cls.map(c => c.id));
          setSubjects(dedupeSubjects(Array.isArray(subjectsData) ? subjectsData : []));
          setTeachers(Array.isArray(teachersData) ? teachersData : []);
        } else {
          const [classesRes, subjectsRes] = await Promise.all([
            fetch(`${apiUrl}/api/teacher/my-classes`, { headers }),
            fetch(`${apiUrl}/api/teacher/my-subjects`, { headers })
          ]);
          const classesData = await classesRes.json();
          const subjectsData = await subjectsRes.json();
          const allAssignedClasses = Array.isArray(classesData) ? classesData : [];
          const classesForYear = allAssignedClasses
            .filter((item) => !item.academic_year || sameYear(item.academic_year, year));
          // Un professeur ne peut pas changer l'année globale. Si ses classes
          // assignées appartiennent encore à l'année précédente, elles doivent
          // rester accessibles au lieu de rendre l'écran inutilisable.
          const cls = classesForYear.length > 0 ? classesForYear : allAssignedClasses;
          const subs = dedupeSubjects(Array.isArray(subjectsData) ? subjectsData : []);
          setClasses(cls);
          setSelectedClasses(cls.map(c => c.id));
          setSubjects(subs);
          if (subs.length > 0 && !selectedSubject) setSelectedSubject(subs[0].id);
        }
      } catch (error) {
        console.error('Erreur chargement filtres:', error);
      } finally {
        setFiltersReady(true);
      }
    };
    loadFilters();
  }, [apiUrl, isAdmin, year]);

  const toggleClass = (classId) => {
    setSelectedClasses(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
  };

  const toggleAllClasses = () => {
    if (selectedClasses.length === classes.length) {
      setSelectedClasses([]);
    } else {
      setSelectedClasses(classes.map(c => c.id));
    }
  };

  const classLabel = () => {
    if (selectedClasses.length === 0) return t('cdt.noClass');
    if (selectedClasses.length === classes.length) return t('cdt.allClasses');
    if (selectedClasses.length === 1) {
      const cls = classes.find(c => c.id === selectedClasses[0]);
      return cls?.name || t('cdt.oneClass');
    }
    return t('cdt.nClasses', { n: selectedClasses.length });
  };

  const fetchCahier = useCallback(async () => {
    if (selectedClasses.length === 0) return;
    setLoading(true);
    try {
      const token = await getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };

      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (selectedClasses.length > 0 && selectedClasses.length < classes.length) {
        params.append('class_id', selectedClasses.join(','));
      }
      if (selectedSubject) params.append('subject_id', selectedSubject);
      if (selectedTeacher) params.append('teacher_id', selectedTeacher);

      const endpoint = isAdmin ? 'admin' : 'teacher';
      const res = await fetch(`${apiUrl}/api/${endpoint}/cahier-de-texte?${params}`, { headers });
      const data = await res.json();
      setCahierData(data);

    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, isAdmin, selectedClasses, classes.length, selectedSubject, selectedTeacher, startDate, endDate]);

  // Auto-fetch when any filter changes
  useEffect(() => {
    if (filtersReady && selectedClasses.length > 0) {
      fetchCahier();
    }
  }, [filtersReady, fetchCahier]);

  const startEditing = (session) => {
    setEditingId(session.id);
    setEditTopic(session.topic || '');
    setEditNotes(session.notes || '');
  };

  const saveEdit = async (sessionId) => {
    setSavingEdit(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: editTopic || null, notes: editNotes || null }),
      });
      if (res.ok) {
        if (cahierData?.classes) {
          setCahierData({
            ...cahierData,
            classes: cahierData.classes.map(c => ({
              ...c,
              sessions: c.sessions.map(s => s.id === sessionId ? { ...s, topic: editTopic || null, notes: editNotes || null } : s)
            }))
          });
        }
        setEditingId(null);
      }
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  const formatDateFr = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Le PDF reste en francais : jsPDF (police helvetica) ne sait pas rendre
  // l'arabe cote navigateur — un export arabe produirait des carres vides.
  const formatDatePdf = (dateStr) => new Date(dateStr)
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const formatTime = (t) => t ? t.slice(0, 5) : '—';

  const calcDuration = (start, end) => {
    if (!start || !end) return '';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? (m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`) : `${m}min`;
  };

  const getAllSessions = () => {
    if (!cahierData?.classes) return [];
    return cahierData.classes.flatMap(c => c.sessions || []);
  };

  const getClassGroups = () => {
    if (!cahierData?.classes) return [];
    return cahierData.classes;
  };

  // PDF Generation
  const generatePDF = async () => {
    setPdfGenerating(true);
    try {
      let jsPDF, autoTable;
      try {
        const jsPDFModule = await import('jspdf');
        const autoTableModule = await import('jspdf-autotable');
        jsPDF = jsPDFModule.default;
        autoTable = autoTableModule.default;
      } catch (error) {
        console.error('Erreur lors du chargement de jsPDF:', error);
        alert(t('cdt.pdfLoadError'));
        return;
      }

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;

      const classGroups = getClassGroups();
      if (classGroups.length === 0) {
        alert(t('cdt.pdfNoData'));
        setPdfGenerating(false);
        return;
      }

      // Logo de l'école (uploadé par le super admin) pour l'en-tête.
      const logo = await loadLogoForPdf(profile?.school);

      // Current school year
      const now = new Date();
      const yearStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const schoolYear = `${yearStart} / ${yearStart + 1}`;

      classGroups.forEach((group, groupIdx) => {
        if (groupIdx > 0) doc.addPage();

        const className = group.classInfo?.name || 'Classe inconnue';
        const classLevel = group.classInfo?.level || '';
        const sessions = group.sessions || [];

        // Determine subject name from sessions
        const subjectNames = [...new Set(sessions.map(s => s.subject?.name).filter(Boolean))];
        const subjectLabel = subjectNames.length === 1 ? subjectNames[0] : (subjectNames.length > 1 ? subjectNames.join(', ') : 'Toutes matières');

        // Determine teacher name
        let teacherLabel = '';
        if (isAdmin) {
          const teacherNames = [...new Set(sessions.map(s => s.teacher ? `${s.teacher.first_name} ${s.teacher.last_name}` : '').filter(Boolean))];
          teacherLabel = teacherNames.length === 1 ? teacherNames[0] : (teacherNames.length > 1 ? teacherNames.join(', ') : '');
        } else {
          teacherLabel = cahierData?.teacherName || `${profile?.first_name || ''} ${profile?.last_name || ''}`;
        }

        // === HEADER ===
        let y = margin;

        // Logo de l'école en haut à gauche (si disponible).
        if (logo) addLogoToPdf(doc, logo, margin, y - 4, 18, 18);

        // Nom de l'école (centré)
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(profile?.school?.name || 'Établissement Scolaire', pageWidth / 2, y, { align: 'center' });
        y += 8;

        // Class + Subject line
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Classe : ${className}${classLevel ? ' — ' + classLevel : ''}`, margin, y);
        doc.text(`Matière : ${subjectLabel}`, pageWidth - margin, y, { align: 'right' });
        y += 6;

        // Teacher + School year
        doc.text(`Professeur : ${teacherLabel}`, margin, y);
        doc.text(`Année scolaire : ${schoolYear}`, pageWidth - margin, y, { align: 'right' });
        y += 8;

        // Title
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Cahier de Texte', pageWidth / 2, y, { align: 'center' });
        y += 3;

        // Underline
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(margin + 40, y, pageWidth - margin - 40, y);
        y += 8;

        // === TABLE ===
        const tableData = sessions.map(s => {
          const dateFr = formatDatePdf(s.date);
          const timeRange = `${formatTime(s.start_time)} – ${formatTime(s.end_time)}`;
          const duration = calcDuration(s.start_time, s.end_time);
          const timeCell = `${timeRange}${duration ? '\n' + duration : ''}`;

          let lessonCell = '';
          if (s.topic) {
            lessonCell = s.topic;
            if (s.notes) {
              lessonCell += '\nOBJECTIF : ' + s.notes;
            }
          } else {
            lessonCell = s.type === 'control' ? 'Contrôle' : '—';
          }

          const observation = s.type === 'control' ? 'Contrôle' : '';

          return [dateFr, timeCell, lessonCell, observation];
        });

        const tableResult = autoTable(doc, {
          startY: y,
          head: [['Date', 'Heure', 'Leçon — Objectif', 'Observation']],
          body: tableData,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 9,
            cellPadding: 3,
            lineColor: [0, 0, 0],
            lineWidth: 0.3,
            textColor: [0, 0, 0],
            font: 'helvetica'
          },
          headStyles: {
            fillColor: [240, 240, 240],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            0: { cellWidth: 38 },
            1: { cellWidth: 25, halign: 'center' },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 28 }
          },
          didParseCell: (data) => {
            // Bold the topic line (first line of lesson cell)
            if (data.column.index === 2 && data.section === 'body') {
              data.cell.styles.fontStyle = 'normal';
            }
          }
        });

        // === SIGNATURE BOXES at bottom ===
        const finalY = tableResult?.finalY || doc.lastAutoTable?.finalY || y + 50;
        const sigY = Math.max(finalY + 20, pageHeight - 50);
        const boxWidth = (pageWidth - margin * 2 - 10) / 2;
        const boxHeight = 25;

        doc.setDrawColor(0);
        doc.setLineWidth(0.3);

        // Left box — Direction
        doc.rect(margin, sigY, boxWidth, boxHeight);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Signature de la Direction', margin + boxWidth / 2, sigY + 5, { align: 'center' });

        // Right box — Inspecteur
        doc.rect(margin + boxWidth + 10, sigY, boxWidth, boxHeight);
        doc.text("Signature de l'Inspecteur", margin + boxWidth + 10 + boxWidth / 2, sigY + 5, { align: 'center' });
      });

      // Save
      const fileName = classGroups.length === 1
        ? `Cahier_de_Texte_${classGroups[0].classInfo?.name || 'classe'}.pdf`
        : `Cahier_de_Texte_${startDate}_${endDate}.pdf`;
      await saveBlob(doc.output('blob'), fileName.replace(/\s+/g, '_'));
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      alert(t('cdt.pdfError'));
    } finally {
      setPdfGenerating(false);
    }
  };

  const sessions = getAllSessions();

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600 flex-shrink-0" />
            {t('cdt.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? t('cdt.subtitleAdmin') : t('cdt.subtitleTeacher')}
          </p>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={generatePDF}
            disabled={pdfGenerating}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium w-full sm:w-auto"
          >
            <Download className="w-4 h-4" />
            {pdfGenerating ? t('cdt.generating') : t('cdt.downloadPdf')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Multi-select classes */}
          <div className="relative" ref={classDropdownRef}>
            <label className="text-xs font-semibold text-gray-600 block mb-1">{t('cdt.classes')}</label>
            <button
              type="button"
              onClick={() => setClassDropdownOpen(!classDropdownOpen)}
              className="w-full flex items-center justify-between rounded border border-gray-300 px-2 py-1.5 text-sm bg-white hover:bg-gray-50"
            >
              <span className="truncate">{classLabel()}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${classDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {classDropdownOpen && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100">
                  <input
                    type="checkbox"
                    checked={selectedClasses.length === classes.length}
                    onChange={toggleAllClasses}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                  <span className="text-sm font-semibold text-indigo-700">{t('cdt.allClasses')}</span>
                </label>
                {classes.map(cls => (
                  <label key={cls.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedClasses.includes(cls.id)}
                      onChange={() => toggleClass(cls.id)}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{cls.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">{t('common.subject')}</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {isAdmin && <option value="">{t('cdt.allSubjects')}</option>}
              {subjects.map(sub => (
                <option key={sub.id} value={sub.id}>{sub.display_name || sub.name}</option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">{t('cdt.teacher')}</label>
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">{t('cdt.allTeachers')}</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">{t('cdt.from')}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">{t('cdt.to')}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : cahierData ? (
        <>
          {/* Stats */}
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span className="font-medium">{t('cdt.sessionsCount', { n: sessions.length })}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <Calendar className="w-4 h-4 text-gray-600" />
              <span className="text-gray-700">
                {new Date(startDate).toLocaleDateString(dateLocale)} — {new Date(endDate).toLocaleDateString(dateLocale)}
              </span>
            </div>
          </div>

          {/* Table */}
          {getClassGroups().map((group, gIdx) => (
            <div key={gIdx} className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              {getClassGroups().length > 1 && (
                <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-200">
                  <p className="text-sm font-semibold text-indigo-900">{group.classInfo?.name || t('cdt.class')}</p>
                </div>
              )}
              {/* Vue cartes mobile */}
              <div className="md:hidden divide-y divide-gray-100">
                {(group.sessions || []).length === 0 ? (
                  <p className="px-4 py-8 text-center text-gray-400 text-sm">{t('cdt.noSessionPeriod')}</p>
                ) : (
                  (group.sessions || []).map((s, idx) => (
                    <div key={s.id || idx} className="p-3 space-y-2 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-indigo-700">{formatDateFr(s.date)}</p>
                          <p className="text-xs text-gray-500">{formatTime(s.start_time)} – {formatTime(s.end_time)}{calcDuration(s.start_time, s.end_time) ? ` · ${calcDuration(s.start_time, s.end_time)}` : ''}</p>
                        </div>
                        {s.type === 'control' && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium flex-shrink-0">{t('cdt.control')}</span>}
                      </div>
                      {editingId === s.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTopic}
                            onChange={(e) => setEditTopic(e.target.value)}
                            placeholder={t('cdt.topicPlaceholder')}
                            className="w-full rounded border border-indigo-300 px-2 py-1.5 text-sm focus:ring-1 focus:ring-indigo-500"
                            autoFocus
                          />
                          <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder={t('cdt.notesPlaceholder')}
                            rows="2"
                            className="w-full rounded border border-indigo-300 px-2 py-1 text-sm resize-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveEdit(s.id)} disabled={savingEdit} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50">
                              <Check className="w-3 h-3" />{savingEdit ? t('cdt.savingEdit') : t('cdt.saveEdit')}
                            </button>
                            <button onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50">{t('common.cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {s.topic ? (
                            <>
                              <p className="text-sm font-semibold text-gray-900">{s.topic}</p>
                              {s.notes && <p className="text-xs text-gray-600 mt-0.5"><span className="font-medium">{t('cdt.objective')}</span> {s.notes}</p>}
                            </>
                          ) : (
                            <p className="text-sm text-gray-400 italic">{s.type === 'control' ? t('cdt.control') : t('cdt.notFilled')}</p>
                          )}
                          {isAdmin && s.teacher && <p className="text-xs text-indigo-500 mt-1">{t('cdt.teacherPrefix')} {s.teacher.first_name} {s.teacher.last_name}</p>}
                          {s.subject?.name && <p className="text-xs text-gray-400">{s.subject.name}</p>}
                          {!isAdmin && s.type !== 'control' && editingId !== s.id && (
                            <button onClick={() => startEditing(s)} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs mt-1">
                              <Pencil className="w-3 h-3" />{t('cdt.edit')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Vue tableau desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-2 text-start font-semibold text-gray-700 w-40">{t('cdt.col.date')}</th>
                      <th className="px-4 py-2 text-center font-semibold text-gray-700 w-28">{t('cdt.col.time')}</th>
                      <th className="px-4 py-2 text-start font-semibold text-gray-700">{t('cdt.col.lesson')}</th>
                      <th className="px-4 py-2 text-start font-semibold text-gray-700 w-32">{t('cdt.col.observation')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(group.sessions || []).length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-4 py-8 text-center text-gray-400">{t('cdt.noSessionPeriod')}</td>
                      </tr>
                    ) : (
                      (group.sessions || []).map((s, idx) => (
                        <tr key={s.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3 text-gray-800">
                            <p className="font-medium">{formatDateFr(s.date)}</p>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">
                            <p>{formatTime(s.start_time)} – {formatTime(s.end_time)}</p>
                            {calcDuration(s.start_time, s.end_time) && (
                              <p className="text-xs text-gray-500">{calcDuration(s.start_time, s.end_time)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {editingId === s.id ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={editTopic}
                                  onChange={(e) => setEditTopic(e.target.value)}
                                  placeholder={t('cdt.topicPlaceholder')}
                                  className="w-full rounded border border-indigo-300 px-2 py-1 text-sm focus:ring-1 focus:ring-indigo-500"
                                  autoFocus
                                />
                                <textarea
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  placeholder={t('cdt.notesPlaceholder')}
                                  rows="2"
                                  className="w-full rounded border border-indigo-300 px-2 py-1 text-sm resize-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveEdit(s.id)}
                                    disabled={savingEdit}
                                    className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                  >
                                    <Check className="w-3 h-3" />
                                    {savingEdit ? t('cdt.savingEdit') : t('cdt.saveEdit')}
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="px-2 py-1 border border-gray-300 rounded text-xs hover:bg-gray-50"
                                  >
                                    {t('common.cancel')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {s.topic ? (
                                  <>
                                    <p className="font-semibold text-gray-900">{s.topic}</p>
                                    {s.notes && (
                                      <p className="text-xs text-gray-600 mt-1">
                                        <span className="font-medium">{t('cdt.objective')}</span> {s.notes}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-gray-400 italic">{s.type === 'control' ? t('cdt.control') : t('cdt.notFilled')}</p>
                                )}
                                {isAdmin && s.teacher && (
                                  <p className="text-xs text-indigo-500 mt-1">{t('cdt.teacherPrefix')} {s.teacher.first_name} {s.teacher.last_name}</p>
                                )}
                                {s.subject?.name && (
                                  <p className="text-xs text-gray-400 mt-0.5">{s.subject.name}</p>
                                )}
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            <div className="flex flex-col items-start gap-1">
                              {s.type === 'control' && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">{t('cdt.control')}</span>}
                              {!isAdmin && s.type !== 'control' && editingId !== s.id && (
                                <button
                                  onClick={() => startEditing(s)}
                                  className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs"
                                  title={t('cdt.editTitle')}
                                >
                                  <Pencil className="w-3 h-3" />
                                  {t('cdt.edit')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <BookOpen className="w-12 h-12 mb-3" />
          <p className="text-sm">{selectedClasses.length === 0 ? t('cdt.pickClassFirst') : t('cdt.noSessionFilters')}</p>
        </div>
      )}
    </div>
  );
};

export default CahierDeTexte;
