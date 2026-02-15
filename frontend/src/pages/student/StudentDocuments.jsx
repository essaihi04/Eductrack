import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Download, Eye, Search, Filter, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import DocumentViewerModal from '../../components/DocumentViewerModal';

const StudentDocuments = () => {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [filteredDocuments, setFilteredDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    filterDocuments();
  }, [documents, searchTerm, filterType]);

  const fetchDocuments = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/students/me/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterDocuments = () => {
    let filtered = documents;

    if (searchTerm) {
      filtered = filtered.filter(doc =>
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.subjects?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(doc => doc.document_type === filterType);
    }

    setFilteredDocuments(filtered);
  };

  const markDocumentAsViewed = async (documentId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      await fetch(`${apiUrl}/api/students/me/documents/${documentId}/view`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setDocuments(documents.map(doc =>
        doc.id === documentId ? { ...doc, viewed: true } : doc
      ));
    } catch (error) {
      console.error('Error marking document as viewed:', error);
    }
  };

  const markDocumentAsDownloaded = async (documentId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      await fetch(`${apiUrl}/api/students/me/documents/${documentId}/download`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setDocuments(documents.map(doc =>
        doc.id === documentId ? { ...doc, downloaded: true } : doc
      ));
    } catch (error) {
      console.error('Error marking document as downloaded:', error);
    }
  };

  const downloadDocumentFile = async (doc) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${apiUrl}/api/documents/${doc.id}/download`, {
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
    a.download = doc.file_name || `document-${doc.id}`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  };

  const handleDocumentClick = (doc) => {
    setSelectedDocument(doc);
    setIsDocumentModalOpen(true);
  };

  const handleDownload = (e, doc) => {
    e.stopPropagation();
    markDocumentAsDownloaded(doc.id);
    downloadDocumentFile(doc).catch((error) => {
      console.error('Error downloading document:', error);
    });
  };

  const typeIcons = {
    cours: '📖',
    exercice: '✏️',
    devoir: '📝',
    rattrapage: '🔄',
    approfondissement: '📚'
  };

  const typeLabels = {
    cours: 'Cours',
    exercice: 'Exercice',
    devoir: 'Devoir',
    rattrapage: 'Rattrapage',
    approfondissement: 'Approfondissement'
  };

  const getSubjectStyle = (subjectName) => {
    const palettes = [
      {
        headerBg: 'bg-indigo-50',
        headerBorder: 'border-indigo-200',
        headerText: 'text-indigo-800',
        chipBg: 'bg-indigo-100',
        chipText: 'text-indigo-800',
        accentBorder: 'border-indigo-400',
      },
      {
        headerBg: 'bg-emerald-50',
        headerBorder: 'border-emerald-200',
        headerText: 'text-emerald-800',
        chipBg: 'bg-emerald-100',
        chipText: 'text-emerald-800',
        accentBorder: 'border-emerald-400',
      },
      {
        headerBg: 'bg-sky-50',
        headerBorder: 'border-sky-200',
        headerText: 'text-sky-800',
        chipBg: 'bg-sky-100',
        chipText: 'text-sky-800',
        accentBorder: 'border-sky-400',
      },
      {
        headerBg: 'bg-fuchsia-50',
        headerBorder: 'border-fuchsia-200',
        headerText: 'text-fuchsia-800',
        chipBg: 'bg-fuchsia-100',
        chipText: 'text-fuchsia-800',
        accentBorder: 'border-fuchsia-400',
      },
      {
        headerBg: 'bg-amber-50',
        headerBorder: 'border-amber-200',
        headerText: 'text-amber-900',
        chipBg: 'bg-amber-100',
        chipText: 'text-amber-900',
        accentBorder: 'border-amber-400',
      },
      {
        headerBg: 'bg-rose-50',
        headerBorder: 'border-rose-200',
        headerText: 'text-rose-800',
        chipBg: 'bg-rose-100',
        chipText: 'text-rose-800',
        accentBorder: 'border-rose-400',
      },
    ];

    const s = String(subjectName || 'Matière non spécifiée');
    let hash = 0;
    for (let i = 0; i < s.length; i += 1) {
      hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    }
    return palettes[hash % palettes.length];
  };

  const documentsBySubject = useMemo(() => {
    const grouped = {};
    (filteredDocuments || []).forEach((doc) => {
      const subject = doc?.subjects?.name || 'Matière non spécifiée';
      if (!grouped[subject]) grouped[subject] = [];
      grouped[subject].push(doc);
    });
    return Object.entries(grouped)
      .map(([subject, items]) => ({ subject, items }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [filteredDocuments]);

  const unreadCount = documents.filter(d => !d.viewed).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Chargement des documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">📂 Documents</h1>
          <p className="text-muted-foreground mt-2">
            {unreadCount > 0 ? (
              <span className="text-orange-600 font-medium">
                {unreadCount} nouveau(x) document(s) à consulter
              </span>
            ) : (
              "Tous vos documents sont à jour"
            )}
          </p>
        </div>
        {unreadCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-full font-medium">
            <AlertCircle className="w-5 h-5" />
            {unreadCount} nouveau(x)
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un document..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">Tous les types</option>
                <option value="cours">Cours</option>
                <option value="exercice">Exercices</option>
                <option value="devoir">Devoirs</option>
                <option value="rattrapage">Rattrapages</option>
                <option value="approfondissement">Approfondissements</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {documents.length === 0 ? 'Aucun document disponible' : 'Aucun document trouvé'}
            </h3>
            <p className="text-sm text-gray-600">
              {documents.length === 0
                ? 'Vos professeurs n\'ont pas encore ajouté de documents.'
                : 'Essayez de modifier votre recherche ou vos filtres.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {documentsBySubject.map(({ subject, items }) => {
            const style = getSubjectStyle(subject);
            const unread = items.filter(d => !d.viewed).length;
            return (
              <div key={subject} className="space-y-4">
                <div className={`p-4 rounded-xl border ${style.headerBg} ${style.headerBorder} flex items-center justify-between gap-3`}>
                  <div className="min-w-0">
                    <h2 className={`text-lg font-bold truncate ${style.headerText}`}>{subject}</h2>
                    <p className="text-xs text-muted-foreground mt-1">{items.length} document(s)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {unread > 0 && (
                      <span className="text-xs px-3 py-1 rounded-full font-semibold bg-orange-100 text-orange-700">
                        {unread} nouveau(x)
                      </span>
                    )}
                    <span className={`text-xs px-3 py-1 rounded-full font-semibold ${style.chipBg} ${style.chipText}`}>
                      {filterType === 'all' ? 'Tous types' : (typeLabels[filterType] || filterType)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map((doc, index) => (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <Card
                        onClick={() => handleDocumentClick(doc)}
                        className={`cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 border ${style.accentBorder} ${
                          !doc.viewed
                            ? 'bg-orange-50/30'
                            : 'bg-white'
                        }`}
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-3xl">{typeIcons[doc.document_type] || '📄'}</span>
                                {!doc.viewed && (
                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                                    Nouveau
                                  </span>
                                )}
                              </div>
                              <CardTitle className="text-lg line-clamp-2">{doc.title}</CardTitle>
                              <CardDescription className="mt-1">
                                {doc.subjects?.name || 'Matière non spécifiée'}
                              </CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {doc.description && (
                            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{doc.description}</p>
                          )}
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                            <span>📅 {new Date(doc.created_at).toLocaleDateString('fr-FR')}</span>
                            <span className={`px-2 py-1 rounded ${style.chipBg} ${style.chipText} font-semibold`}>
                              {typeLabels[doc.document_type] || doc.document_type}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            {doc.viewed && (
                              <span className="flex items-center gap-1 text-green-600">
                                <Eye className="w-3 h-3" /> Vu
                              </span>
                            )}
                            {doc.downloaded && (
                              <span className="flex items-center gap-1 text-blue-600">
                                <Download className="w-3 h-3" /> Téléchargé
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => handleDownload(e, doc)}
                            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                          >
                            <Download className="w-4 h-4" />
                            Télécharger
                          </button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DocumentViewerModal
        document={selectedDocument}
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        onView={markDocumentAsViewed}
        onDownload={(doc) => {
          if (!doc) return;
          markDocumentAsDownloaded(doc.id);
          downloadDocumentFile(doc).catch((error) => {
            console.error('Error downloading document:', error);
          });
        }}
      />
    </div>
  );
};

export default StudentDocuments;
