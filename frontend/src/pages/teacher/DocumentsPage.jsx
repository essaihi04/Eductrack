import React, { useState, useEffect } from 'react';
import { Upload, FileText, BookOpen, Edit3, Home, RotateCcw, Star, Trash2, Download, Eye, Users, Calendar, Clock } from 'lucide-react';
import { saveBlob } from '../../lib/download';
import { useI18n } from '../../i18n';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Le libelle est traduit a l'affichage (voir typeLabel) : seuls la valeur
// stockee en base, l'emoji et l'icone sont figes ici.
const DOCUMENT_TYPES = [
  { value: 'cours', emoji: '📘', icon: BookOpen },
  { value: 'exercice', emoji: '✏️', icon: Edit3 },
  { value: 'devoir', emoji: '📝', icon: Home },
  { value: 'rattrapage', emoji: '🔁', icon: RotateCcw },
  { value: 'approfondissement', emoji: '⭐', icon: Star }
];

const DocumentsPage = () => {
  const { t, lang } = useI18n();
  const dateLocale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const typeLabel = (type) => {
    const dt = DOCUMENT_TYPES.find((d) => d.value === type);
    return dt ? `${dt.emoji} ${t(`doc.type.${dt.value}`)}` : type;
  };
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [controls, setControls] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documentStats, setDocumentStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedType, setSelectedType] = useState('');
  
  // Fonction pour obtenir le token d'authentification
  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();
    return authSession?.access_token;
  };
  
  // Formulaire
  const [formData, setFormData] = useState({
    classIds: [],
    subjectId: '',
    controlId: '',
    title: '',
    documentType: '',
    description: '',
    file: null
  });

  const toggleClassSelection = (classId) => {
    setFormData((prev) => {
      const alreadySelected = prev.classIds.includes(classId);
      const nextClassIds = alreadySelected
        ? prev.classIds.filter((id) => id !== classId)
        : [...prev.classIds, classId];

      if (nextClassIds.length === 1) {
        loadControls(nextClassIds[0]);
      } else {
        setControls([]);
      }

      return {
        ...prev,
        classIds: nextClassIds,
        controlId: nextClassIds.length === 1 ? prev.controlId : ''
      };
    });
  };

  // Charger les classes du professeur
  useEffect(() => {
    loadClasses();
    loadSubjects();
  }, []);

  // Charger les documents quand la classe ou le type change
  useEffect(() => {
    loadDocuments();
  }, [selectedClass, selectedType]);

  const loadClasses = async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/my-classes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClasses(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const loadSubjects = async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/my-subjects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSubjects(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const loadControls = async (classId) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/controls-plan/class/${classId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setControls(data);
      } else {
        console.warn('[DocumentsPage] Impossible de charger les contrôles', {
          status: res.status,
          classId
        });
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      let url = `${apiUrl}/api/teacher/documents`;
      const params = new URLSearchParams();
      
      if (selectedClass) params.append('classId', selectedClass);
      if (selectedType) params.append('documentType', selectedType);
      
      if (params.toString()) url += `?${params.toString()}`;
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validation du fichier
      const maxSize = 20 * 1024 * 1024; // 20 Mo
      if (file.size > maxSize) {
        alert(t('doc.err.tooBig'));
        return;
      }
      
      const allowedTypes = [
        'application/pdf',
        'image/jpeg', 'image/png', 'image/gif',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ];
      
      // Accepter fichiers sans MIME type détecté (validation par extension backend)
      const ext = file.name.split('.').pop()?.toLowerCase();
      const validExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'ppt', 'pptx'];
      
      if (file.type && !allowedTypes.includes(file.type) && !validExtensions.includes(ext)) {
        console.warn('[DocumentsPage] Fichier rejeté', { 
          fileName: file.name, 
          fileType: file.type, 
          ext 
        });
        alert(t('doc.err.badType'));
        return;
      }
      
      console.log('[DocumentsPage] Fichier accepté', { 
        fileName: file.name, 
        fileType: file.type, 
        ext,
        size: file.size 
      });
      
      setFormData({ ...formData, file });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation des champs obligatoires
    if (!formData.classIds?.length || !formData.title || !formData.documentType || !formData.file) {
      alert(t('doc.err.required'));
      return;
    }
    
    if (formData.title.length > 60) {
      alert(t('doc.err.titleTooLong'));
      return;
    }
    
    try {
      setUploading(true);
      const token = await getAuthToken();
      const uploadUrl = `${apiUrl}/api/teacher/documents`;
      const requestId = `front-doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      if (window?.location?.protocol === 'https:' && String(apiUrl).startsWith('http://')) {
        console.warn('[DocumentsPage] Mixed-content risk: frontend HTTPS vers API HTTP', {
          frontend: window.location.origin,
          apiUrl
        });
      }
      
      const formDataToSend = new FormData();
      formDataToSend.append('classIds', JSON.stringify(formData.classIds));
      if (formData.classIds.length === 1) {
        formDataToSend.append('classId', formData.classIds[0]);
      }
      formDataToSend.append('subjectId', formData.subjectId || '');
      formDataToSend.append('controlId', formData.controlId || '');
      formDataToSend.append('title', formData.title);
      formDataToSend.append('documentType', formData.documentType);
      formDataToSend.append('description', formData.description || '');
      formDataToSend.append('file', formData.file);

      console.log('[DocumentsPage] Upload request start', {
        requestId,
        uploadUrl,
        hasToken: Boolean(token),
        classIds: formData.classIds,
        subjectId: formData.subjectId,
        controlId: formData.controlId,
        titleLength: formData.title?.length || 0,
        documentType: formData.documentType,
        fileName: formData.file?.name,
        fileSize: formData.file?.size,
        fileType: formData.file?.type,
        online: navigator.onLine
      });
      
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formDataToSend
      });

      console.log('[DocumentsPage] Upload response', {
        requestId,
        status: res.status,
        ok: res.ok
      });
      
      if (res.ok) {
        alert(t('doc.ok.sent'));
        setShowForm(false);
        setFormData({
          classIds: [],
          subjectId: '',
          controlId: '',
          title: '',
          documentType: '',
          description: '',
          file: null
        });
        loadDocuments();
      } else {
        const error = await res.json().catch(() => ({ error: `Erreur HTTP ${res.status}` }));
        console.error('[DocumentsPage] Upload backend error', { requestId, error, status: res.status });
        alert(t('doc.err.upload', { detail: error.error || t('doc.err.uploadFallback') }));
      }
    } catch (error) {
      console.error('[DocumentsPage] Upload fetch failed', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        apiUrl,
        online: navigator.onLine
      });
      alert(t('doc.err.uploadNetwork'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm(t('doc.confirmDelete'))) return;
    
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/documents/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        alert(t('doc.ok.deleted'));
        loadDocuments();
      } else {
        alert(t('doc.err.delete'));
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert(t('doc.err.delete'));
    }
  };

  const handleDownload = async (id) => {
    try {
      const token = await getAuthToken();
      const doc = documents.find(d => d.id === id);
      const res = await fetch(`${apiUrl}/api/teacher/documents/${id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur téléchargement (${res.status})`);
      }

      const blob = await res.blob();
      await saveBlob(blob, doc?.file_name || `document-${id}`);
    } catch (error) {
      console.error('Erreur:', error);
      alert(t('doc.err.download'));
    }
  };

  const openStatsModal = async (doc) => {
    try {
      setSelectedDocument(doc);
      setShowStatsModal(true);
      setStatsLoading(true);
      setDocumentStats(null);

      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/documents/${doc.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Erreur (${res.status})`);
      }

      const data = await res.json();
      setDocumentStats(data);
    } catch (error) {
      console.error('Erreur:', error);
      alert(t('doc.err.stats'));
      setShowStatsModal(false);
    } finally {
      setStatsLoading(false);
    }
  };

  const formatDateTime = (date) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString(dateLocale);
    } catch {
      return date;
    }
  };

  const getDocumentTypeIcon = (type) => {
    // `dt` et non `t` : `t` est la fonction de traduction du composant.
    const docType = DOCUMENT_TYPES.find(dt => dt.value === type);
    const Icon = docType ? docType.icon : FileText;
    return <Icon className="w-5 h-5" />;
  };

  const getDocumentTypeLabel = (type) => typeLabel(type);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString(dateLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'pdf') return <FileText className="w-8 h-8 text-red-500" />;
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return <FileText className="w-8 h-8 text-blue-500" />;
    if (['doc', 'docx'].includes(ext)) return <FileText className="w-8 h-8 text-blue-600" />;
    if (['ppt', 'pptx'].includes(ext)) return <FileText className="w-8 h-8 text-orange-500" />;
    return <FileText className="w-8 h-8 text-gray-500" />;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">{t('doc.title')}</h1>
        <p className="text-gray-600">{t('doc.subtitle')}</p>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.class')}</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">{t('doc.allClasses')}</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('doc.documentType')}</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">{t('doc.allTypes')}</option>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{typeLabel(type.value)}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Upload className="w-5 h-5" />
              {t('doc.send')}
            </button>
          </div>
        </div>
      </div>

      {/* Formulaire d'upload */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-2 border-blue-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">{t('doc.formTitle')}</h2>
            <button
              onClick={() => setShowForm(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Classe (obligatoire) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('doc.targetClasses')} <span className="text-red-500">*</span>
              </label>
              <div className="border border-gray-300 rounded-lg p-3 max-h-52 overflow-y-auto space-y-2">
                {classes.map((cls) => (
                  <label key={cls.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.classIds.includes(cls.id)}
                      onChange={() => toggleClassSelection(cls.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{cls.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('doc.selectedClasses', { n: formData.classIds.length })}
              </p>
            </div>

            {/* Type de contenu (obligatoire) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('doc.contentType')} <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.documentType}
                onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">{t('doc.pickType')}</option>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{typeLabel(type.value)}</option>
                ))}
              </select>
            </div>

            {/* Titre (obligatoire) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('doc.fieldTitle')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('doc.titlePlaceholder')}
                maxLength={60}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">{t('doc.titleCount', { n: formData.title.length })}</p>
            </div>

            {/* Fichier (obligatoire) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('doc.file')} <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.ppt,.pptx"
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <Upload className="w-12 h-12 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    {formData.file ? formData.file.name : t('doc.pickFile')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('doc.fileHint')}
                  </p>
                </label>
              </div>
            </div>

            {/* Description (optionnel) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('doc.description')}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('doc.descriptionPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Lier à un contrôle (optionnel) */}
            {formData.classIds.length === 1 && controls.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('doc.linkControl')}
                </label>
                <select
                  value={formData.controlId}
                  onChange={(e) => setFormData({ ...formData, controlId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{t('doc.noControl')}</option>
                  {controls.map((ctrl) => (
                    <option key={ctrl.id} value={ctrl.id}>
                      {ctrl.name} - {new Date(ctrl.date).toLocaleDateString(dateLocale)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Boutons */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={uploading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    {t('doc.sending')}
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    {t('doc.sendFile')}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des documents */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('doc.loadingDocs')}</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-700 mb-2">{t('doc.empty')}</h3>
          <p className="text-gray-500 mb-4">
            {selectedClass || selectedType
              ? t('doc.emptyFilters')
              : t('doc.emptyFirst')}
          </p>
          {!selectedClass && !selectedType && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 mx-auto transition-colors"
            >
              <Upload className="w-5 h-5" />
              {t('doc.send')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                {/* Icône du fichier */}
                <div className="flex-shrink-0">
                  {getFileIcon(doc.file_name)}
                </div>
                
                {/* Contenu principal */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-blue-600">
                          {getDocumentTypeIcon(doc.document_type)}
                        </span>
                        <span className="text-sm text-gray-600">
                          {getDocumentTypeLabel(doc.document_type)}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-800 truncate">{doc.title}</h3>
                      <p className="text-sm text-gray-600 truncate">{doc.file_name}</p>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => openStatsModal(doc)}
                        className="p-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                        title={t('doc.statsTitle')}
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDownload(doc.id)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title={t('doc.download')}
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title={t('doc.delete')}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Métadonnées */}
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>{doc.classes?.name || t('doc.unknownClass')}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(doc.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      <span>{t('doc.views', { viewed: doc.viewed_count || 0, total: doc.total_students || 0 })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Download className="w-4 h-4" />
                      <span>{t('doc.downloads', { n: doc.downloaded_count || 0 })}</span>
                    </div>
                  </div>
                  
                  {/* Description */}
                  {doc.description && (
                    <p className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      {doc.description}
                    </p>
                  )}
                  
                  {/* Lien vers un contrôle */}
                  {doc.controls && (
                    <div className="mt-2 text-sm text-blue-600">
                      {t('doc.linkedControl', { name: doc.controls.name })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showStatsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowStatsModal(false)}
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{t('doc.statsModalTitle')}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedDocument?.title}
                </p>
              </div>
              <button
                onClick={() => setShowStatsModal(false)}
                className="px-3 py-1 rounded-lg border hover:bg-gray-50"
              >
                {t('common.close')}
              </button>
            </div>

            <div className="p-6">
              {statsLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-3 text-gray-600">{t('doc.loadingStats')}</p>
                </div>
              ) : !documentStats ? (
                <p className="text-sm text-gray-600">{t('doc.noStats')}</p>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">{t('doc.students')}</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {documentStats.total_students || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600">{t('doc.viewsShort')}</p>
                      <p className="text-lg font-semibold text-blue-900">
                        {documentStats.viewed_count || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600">{t('doc.downloadsShort')}</p>
                      <p className="text-lg font-semibold text-green-900">
                        {documentStats.downloaded_count || 0}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-3">{t('doc.whoViewed')}</h3>
                      {(documentStats.viewed_by || []).length === 0 ? (
                        <p className="text-sm text-gray-500">{t('doc.noView')}</p>
                      ) : (
                        <div className="space-y-2">
                          {documentStats.viewed_by.map((s) => (
                            <div key={`${s.student_id}-view`} className="p-3 border rounded-lg">
                              <p className="text-sm font-medium text-gray-900">
                                {(s.first_name || '') + ' ' + (s.last_name || '')}
                              </p>
                              <p className="text-xs text-gray-500">{formatDateTime(s.viewed_at)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold text-gray-800 mb-3">{t('doc.whoDownloaded')}</h3>
                      {(documentStats.downloaded_by || []).length === 0 ? (
                        <p className="text-sm text-gray-500">{t('doc.noDownload')}</p>
                      ) : (
                        <div className="space-y-2">
                          {documentStats.downloaded_by.map((s) => (
                            <div key={`${s.student_id}-download`} className="p-3 border rounded-lg">
                              <p className="text-sm font-medium text-gray-900">
                                {(s.first_name || '') + ' ' + (s.last_name || '')}
                              </p>
                              <p className="text-xs text-gray-500">{formatDateTime(s.downloaded_at)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
