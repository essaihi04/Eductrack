import React, { useState, useEffect } from 'react';
import { Upload, FileText, BookOpen, Edit3, Home, RotateCcw, Star, Trash2, Download, Eye, Users, Calendar, Clock } from 'lucide-react';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const DOCUMENT_TYPES = [
  { value: 'cours', label: '📘 Cours', icon: BookOpen },
  { value: 'exercice', label: '✏️ Exercice', icon: Edit3 },
  { value: 'devoir', label: '📝 Devoir maison', icon: Home },
  { value: 'rattrapage', label: '🔁 Rattrapage', icon: RotateCcw },
  { value: 'approfondissement', label: '⭐ Approfondissement', icon: Star }
];

const DocumentsPage = () => {
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
    classId: '',
    subjectId: '',
    controlId: '',
    title: '',
    documentType: '',
    description: '',
    file: null
  });

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
      const res = await fetch(`${apiUrl}/api/teacher/classes/${classId}/controls`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setControls(data);
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
        alert('❌ Le fichier est trop volumineux (max 20 Mo)');
        return;
      }
      
      const allowedTypes = [
        'application/pdf',
        'image/jpeg', 'image/png', 'image/gif',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        alert('❌ Type de fichier non autorisé. Types acceptés: PDF, images, documents Word/PowerPoint');
        return;
      }
      
      setFormData({ ...formData, file });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation des champs obligatoires
    if (!formData.classId || !formData.title || !formData.documentType || !formData.file) {
      alert('❌ Veuillez remplir tous les champs obligatoires');
      return;
    }
    
    if (formData.title.length > 60) {
      alert('❌ Le titre ne doit pas dépasser 60 caractères');
      return;
    }
    
    try {
      setUploading(true);
      const token = await getAuthToken();
      
      const formDataToSend = new FormData();
      formDataToSend.append('classId', formData.classId);
      formDataToSend.append('subjectId', formData.subjectId || '');
      formDataToSend.append('controlId', formData.controlId || '');
      formDataToSend.append('title', formData.title);
      formDataToSend.append('documentType', formData.documentType);
      formDataToSend.append('description', formData.description || '');
      formDataToSend.append('file', formData.file);
      
      const res = await fetch(`${apiUrl}/api/teacher/documents`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formDataToSend
      });
      
      if (res.ok) {
        alert('✅ Document envoyé avec succès !');
        setShowForm(false);
        setFormData({
          classId: '',
          subjectId: '',
          controlId: '',
          title: '',
          documentType: '',
          description: '',
          file: null
        });
        loadDocuments();
      } else {
        const error = await res.json();
        alert(`❌ Erreur: ${error.error}`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de l\'envoi du document');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) return;
    
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/documents/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        alert('✅ Document supprimé avec succès');
        loadDocuments();
      } else {
        alert('❌ Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la suppression');
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
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = doc?.file_name || `document-${id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors du téléchargement');
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
      alert('❌ Erreur lors du chargement des statistiques');
      setShowStatsModal(false);
    } finally {
      setStatsLoading(false);
    }
  };

  const formatDateTime = (date) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleString('fr-FR');
    } catch {
      return date;
    }
  };

  const getDocumentTypeIcon = (type) => {
    const docType = DOCUMENT_TYPES.find(t => t.value === type);
    const Icon = docType ? docType.icon : FileText;
    return <Icon className="w-5 h-5" />;
  };

  const getDocumentTypeLabel = (type) => {
    const docType = DOCUMENT_TYPES.find(t => t.value === type);
    return docType ? docType.label : type;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
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
        <h1 className="text-3xl font-bold text-gray-800 mb-2">📚 Documents pédagogiques</h1>
        <p className="text-gray-600">Envoyez des cours, exercices et devoirs à vos élèves</p>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Classe</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Toutes les classes</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de document</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Tous les types</option>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Upload className="w-5 h-5" />
              Envoyer un document
            </button>
          </div>
        </div>
      </div>

      {/* Formulaire d'upload */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-2 border-blue-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">➕ Envoyer un document</h2>
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
                Classe <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.classId}
                onChange={(e) => {
                  setFormData({ ...formData, classId: e.target.value });
                  loadControls(e.target.value);
                }}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Sélectionner une classe</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>

            {/* Type de contenu (obligatoire) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type de contenu <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.documentType}
                onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Sélectionner le type</option>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            {/* Titre (obligatoire) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Titre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex: Chapitre 1 - Les fractions"
                maxLength={60}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">{formData.title.length}/60 caractères</p>
            </div>

            {/* Fichier (obligatoire) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fichier <span className="text-red-500">*</span>
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
                    {formData.file ? formData.file.name : 'Cliquez pour sélectionner un fichier'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PDF, image, Word ou PowerPoint (max 20 Mo)
                  </p>
                </label>
              </div>
            </div>

            {/* Description (optionnel) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optionnel)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Contexte pédagogique, instructions..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Lier à un contrôle (optionnel) */}
            {formData.classId && controls.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lier à un contrôle (optionnel)
                </label>
                <select
                  value={formData.controlId}
                  onChange={(e) => setFormData({ ...formData, controlId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Aucun contrôle</option>
                  {controls.map((ctrl) => (
                    <option key={ctrl.id} value={ctrl.id}>
                      {ctrl.name} - {new Date(ctrl.date).toLocaleDateString('fr-FR')}
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
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Envoyer le document
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des documents */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des documents...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-700 mb-2">Aucun document</h3>
          <p className="text-gray-500 mb-4">
            {selectedClass || selectedType 
              ? 'Aucun document ne correspond à vos filtres' 
              : 'Commencez par envoyer votre premier document'}
          </p>
          {!selectedClass && !selectedType && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 mx-auto transition-colors"
            >
              <Upload className="w-5 h-5" />
              Envoyer un document
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
                        title="Statistiques (vues / téléchargements)"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDownload(doc.id)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Télécharger"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Métadonnées */}
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>{doc.classes?.name || 'Classe inconnue'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(doc.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      <span>{doc.viewed_count || 0}/{doc.total_students || 0} vues</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Download className="w-4 h-4" />
                      <span>{doc.downloaded_count || 0} téléchargements</span>
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
                      🔗 Lié au contrôle: {doc.controls.name}
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
                <h2 className="text-xl font-bold text-gray-800">📊 Statistiques du document</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedDocument?.title}
                </p>
              </div>
              <button
                onClick={() => setShowStatsModal(false)}
                className="px-3 py-1 rounded-lg border hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>

            <div className="p-6">
              {statsLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-3 text-gray-600">Chargement des statistiques...</p>
                </div>
              ) : !documentStats ? (
                <p className="text-sm text-gray-600">Aucune donnée.</p>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">Élèves</p>
                      <p className="text-lg font-semibold text-gray-900">
                        {documentStats.total_students || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600">Vues</p>
                      <p className="text-lg font-semibold text-blue-900">
                        {documentStats.viewed_count || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600">Téléchargements</p>
                      <p className="text-lg font-semibold text-green-900">
                        {documentStats.downloaded_count || 0}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-3">👁️ Élèves qui ont vu</h3>
                      {(documentStats.viewed_by || []).length === 0 ? (
                        <p className="text-sm text-gray-500">Aucune vue pour le moment.</p>
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
                      <h3 className="font-semibold text-gray-800 mb-3">⬇️ Élèves qui ont téléchargé</h3>
                      {(documentStats.downloaded_by || []).length === 0 ? (
                        <p className="text-sm text-gray-500">Aucun téléchargement pour le moment.</p>
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
