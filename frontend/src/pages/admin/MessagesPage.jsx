import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  MessageSquare, Send, Paperclip, Image, FileText, Users, CheckSquare,
  ChevronDown, X, Clock, CheckCircle, AlertCircle, RefreshCw, Eye
} from 'lucide-react';

const MessagesPage = () => {
  const { profile } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Filter state
  const [classes, setClasses] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [schoolTypeFilter, setSchoolTypeFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const classDropdownRef = useRef(null);

  // Recipients
  const [recipientCount, setRecipientCount] = useState(0);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // Message compose
  const [messageText, setMessageText] = useState('');
  const [messageType, setMessageType] = useState('text');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const fileInputRef = useRef(null);

  // History
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [detailMessage, setDetailMessage] = useState(null);

  // Levels derived from classes
  const [availableLevels, setAvailableLevels] = useState([]);

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

  // Load classes
  useEffect(() => {
    const loadClasses = async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${apiUrl}/api/admin/classes`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const cls = Array.isArray(data) ? data : [];
        setClasses(cls);
        setSelectedClasses(cls.map(c => c.id));

        const levels = [...new Set(cls.map(c => c.level).filter(Boolean))].sort();
        setAvailableLevels(levels);
      } catch (error) {
        console.error('Erreur chargement classes:', error);
      }
    };
    loadClasses();
  }, [apiUrl]);

  // Fetch recipient count when filters change
  const fetchRecipientCount = useCallback(async () => {
    setLoadingRecipients(true);
    try {
      const token = await getAuthToken();
      const params = new URLSearchParams();
      if (selectedClasses.length > 0 && selectedClasses.length < classes.length) {
        params.append('class_ids', selectedClasses.join(','));
      }
      if (schoolTypeFilter) params.append('school_type', schoolTypeFilter);
      if (levelFilter) params.append('level', levelFilter);

      const res = await fetch(`${apiUrl}/api/admin/whatsapp/recipients?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setRecipientCount(data.count || 0);
    } catch (error) {
      console.error('Erreur comptage destinataires:', error);
    } finally {
      setLoadingRecipients(false);
    }
  }, [apiUrl, selectedClasses, classes.length, schoolTypeFilter, levelFilter]);

  useEffect(() => {
    if (classes.length > 0) {
      fetchRecipientCount();
    }
  }, [fetchRecipientCount, classes.length]);

  // Load history
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/history?page=${historyPage}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setHistory(data.messages || []);
      setHistoryTotal(data.total || 0);
    } catch (error) {
      console.error('Erreur historique:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [apiUrl, historyPage]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Class filter helpers
  const toggleClass = (classId) => {
    setSelectedClasses(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
  };

  const toggleAllClasses = () => {
    setSelectedClasses(prev => prev.length === classes.length ? [] : classes.map(c => c.id));
  };

  const classLabel = () => {
    if (selectedClasses.length === 0) return 'Aucune classe';
    if (selectedClasses.length === classes.length) return 'Toutes les classes';
    if (selectedClasses.length === 1) {
      const cls = classes.find(c => c.id === selectedClasses[0]);
      return cls?.name || '1 classe';
    }
    return `${selectedClasses.length} classes`;
  };

  // Filter classes displayed in dropdown based on school_type and level
  const filteredClasses = classes.filter(c => {
    if (schoolTypeFilter && c.school_type !== schoolTypeFilter) return false;
    if (levelFilter && c.level !== levelFilter) return false;
    return true;
  });

  // When school_type or level filter changes, update selected classes
  useEffect(() => {
    if (schoolTypeFilter || levelFilter) {
      const filtered = classes.filter(c => {
        if (schoolTypeFilter && c.school_type !== schoolTypeFilter) return false;
        if (levelFilter && c.level !== levelFilter) return false;
        return true;
      });
      setSelectedClasses(filtered.map(c => c.id));
    } else {
      setSelectedClasses(classes.map(c => c.id));
    }
  }, [schoolTypeFilter, levelFilter, classes]);

  // File handling
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setMediaFile(file);
    setFileName(file.name);

    if (file.type.startsWith('image/')) {
      setMessageType('image');
      const reader = new FileReader();
      reader.onload = (ev) => setMediaPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setMessageType('document');
      setMediaPreview(null);
    }
  };

  const removeMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaUrl('');
    setFileName('');
    setMessageType('text');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Upload media to WasenderAPI via backend proxy
  const uploadMedia = async () => {
    if (!mediaFile) return null;
    setUploading(true);
    try {
      const token = await getAuthToken();
      const reader = new FileReader();

      return new Promise((resolve, reject) => {
        reader.onload = async (ev) => {
          try {
            const base64 = ev.target.result;
            const res = await fetch(`${apiUrl}/api/admin/whatsapp/upload`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ base64, mimetype: mediaFile.type })
            });
            const data = await res.json();
            if (data.success && data.publicUrl) {
              setMediaUrl(data.publicUrl);
              resolve(data.publicUrl);
            } else {
              reject(new Error(data.error || 'Erreur upload'));
            }
          } catch (err) {
            reject(err);
          } finally {
            setUploading(false);
          }
        };
        reader.onerror = () => {
          setUploading(false);
          reject(new Error('Erreur lecture fichier'));
        };
        reader.readAsDataURL(mediaFile);
      });
    } catch (error) {
      setUploading(false);
      throw error;
    }
  };

  // Send message
  const handleSend = async () => {
    if (!messageText && !mediaFile) return;
    if (recipientCount === 0) return;

    setSending(true);
    setSendProgress({ total: recipientCount, sent: 0, failed: 0, status: 'sending' });

    try {
      let uploadedUrl = mediaUrl;

      // Upload media first if needed
      if (mediaFile && !mediaUrl) {
        uploadedUrl = await uploadMedia();
      }

      const token = await getAuthToken();
      const filter = {};
      if (selectedClasses.length > 0 && selectedClasses.length < classes.length) {
        filter.class_ids = selectedClasses;
      }
      if (schoolTypeFilter) filter.school_type = schoolTypeFilter;
      if (levelFilter) filter.level = levelFilter;

      const res = await fetch(`${apiUrl}/api/admin/whatsapp/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: messageText,
          type: messageType,
          mediaUrl: uploadedUrl || null,
          fileName: fileName || null,
          filter
        })
      });

      const data = await res.json();

      if (data.success && data.messageId) {
        // Poll for progress
        const pollProgress = setInterval(async () => {
          try {
            const progRes = await fetch(`${apiUrl}/api/admin/whatsapp/messages/${data.messageId}/progress`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const progData = await progRes.json();

            setSendProgress({
              total: progData.total_recipients,
              sent: progData.sent_count,
              failed: progData.failed_count,
              status: progData.status
            });

            if (progData.status === 'completed' || progData.status === 'failed') {
              clearInterval(pollProgress);
              setSending(false);
              fetchHistory();
              // Reset form after success
              if (progData.status === 'completed') {
                setMessageText('');
                removeMedia();
              }
            }
          } catch {
            clearInterval(pollProgress);
            setSending(false);
          }
        }, 2000);
      } else {
        setSending(false);
        setSendProgress(null);
        alert(data.error || 'Erreur lors de l\'envoi');
      }
    } catch (error) {
      console.error('Erreur envoi:', error);
      setSending(false);
      setSendProgress(null);
      alert('Erreur lors de l\'envoi du message');
    }
  };

  // View message details
  const viewDetails = async (msgId) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/messages/${msgId}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDetailMessage(data);
    } catch (error) {
      console.error('Erreur détails:', error);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const statusBadge = (status) => {
    const map = {
      pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'En attente' },
      sending: { color: 'bg-blue-100 text-blue-700', icon: RefreshCw, label: 'Envoi en cours' },
      completed: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Terminé' },
      failed: { color: 'bg-red-100 text-red-700', icon: AlertCircle, label: 'Échoué' }
    };
    const s = map[status] || map.pending;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>
        <Icon className="w-3 h-3" />
        {s.label}
      </span>
    );
  };

  const typeLabel = (type) => {
    const map = { text: 'Texte', image: 'Image', document: 'Document' };
    return map[type] || type;
  };

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-green-600" />
          Envoyer un message WhatsApp
        </h1>
        <p className="text-sm text-gray-500 mt-1">Envoyez des messages aux parents via WhatsApp</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Filters + Compose */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recipient Filters */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Destinataires
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* School type */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Cycle</label>
                <select
                  value={schoolTypeFilter}
                  onChange={(e) => setSchoolTypeFilter(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Tous les cycles</option>
                  <option value="college">Collège</option>
                  <option value="lycee">Lycée</option>
                </select>
              </div>

              {/* Level */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Niveau</label>
                <select
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Tous les niveaux</option>
                  {availableLevels.map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>

              {/* Classes multi-select */}
              <div className="relative" ref={classDropdownRef}>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Classes</label>
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
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-green-50 cursor-pointer border-b border-gray-100">
                      <input
                        type="checkbox"
                        checked={selectedClasses.length === filteredClasses.length && filteredClasses.length > 0}
                        onChange={toggleAllClasses}
                        className="w-4 h-4 rounded text-green-600"
                      />
                      <span className="text-sm font-semibold text-green-700">Toutes les classes</span>
                    </label>
                    {filteredClasses.map(cls => (
                      <label key={cls.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedClasses.includes(cls.id)}
                          onChange={() => toggleClass(cls.id)}
                          className="w-4 h-4 rounded text-green-600"
                        />
                        <span className="text-sm text-gray-700">{cls.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Recipient count */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <CheckSquare className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">
                {loadingRecipients ? 'Calcul...' : `${recipientCount} parent(s) avec numéro WhatsApp`}
              </span>
            </div>
          </div>

          {/* Message Compose */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Send className="w-4 h-4" />
              Composer le message
            </h2>

            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Tapez votre message ici..."
              rows="5"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />

            {/* Media attachment */}
            {mediaFile && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                {mediaPreview ? (
                  <img src={mediaPreview} alt="preview" className="w-16 h-16 object-cover rounded" />
                ) : (
                  <div className="w-16 h-16 bg-blue-100 rounded flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{fileName}</p>
                  <p className="text-xs text-gray-500">{typeLabel(messageType)}</p>
                </div>
                <button onClick={removeMedia} className="p-1 hover:bg-gray-200 rounded">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title="Joindre un fichier"
                >
                  <Paperclip className="w-4 h-4" />
                  Joindre
                </button>
                <button
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = 'image/*';
                      fileInputRef.current.click();
                      fileInputRef.current.accept = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
                    }
                  }}
                  disabled={sending}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  title="Joindre une image"
                >
                  <Image className="w-4 h-4" />
                  Image
                </button>
              </div>

              <button
                onClick={handleSend}
                disabled={sending || uploading || (!messageText && !mediaFile) || recipientCount === 0}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                <Send className="w-4 h-4" />
                {uploading ? 'Upload...' : sending ? 'Envoi en cours...' : `Envoyer à ${recipientCount} parent(s)`}
              </button>
            </div>

            {/* Send progress */}
            {sendProgress && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-green-800">
                    {sendProgress.status === 'completed' ? 'Envoi terminé' : 'Envoi en cours...'}
                  </span>
                  <span className="text-green-700">
                    {sendProgress.sent + sendProgress.failed} / {sendProgress.total}
                  </span>
                </div>
                <div className="w-full bg-green-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${sendProgress.total > 0 ? ((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex gap-4 text-xs">
                  <span className="text-green-700">{sendProgress.sent} envoyé(s)</span>
                  {sendProgress.failed > 0 && (
                    <span className="text-red-600">{sendProgress.failed} échoué(s)</span>
                  )}
                </div>
                {sendProgress.status === 'completed' && (
                  <button
                    onClick={() => setSendProgress(null)}
                    className="text-xs text-green-700 hover:underline"
                  >
                    Fermer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: History */}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Historique
              </h2>
              <button onClick={fetchHistory} className="p-1 hover:bg-gray-100 rounded">
                <RefreshCw className={`w-4 h-4 text-gray-500 ${loadingHistory ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {history.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  Aucun message envoyé
                </div>
              ) : (
                history.map(msg => (
                  <div key={msg.id} className="px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{msg.content || `[${typeLabel(msg.message_type)}]`}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatDate(msg.created_at)}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {statusBadge(msg.status)}
                          <span className="text-xs text-gray-500">
                            {msg.sent_count}/{msg.total_recipients}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => viewDetails(msg.id)}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Voir les détails"
                      >
                        <Eye className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {historyTotal > 10 && (
              <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                  disabled={historyPage === 1}
                  className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
                >
                  Précédent
                </button>
                <span className="text-xs text-gray-500">Page {historyPage}</span>
                <button
                  onClick={() => setHistoryPage(p => p + 1)}
                  disabled={historyPage * 10 >= historyTotal}
                  className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
                >
                  Suivant
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {detailMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailMessage(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-semibold">Détails du message</h3>
              <button onClick={() => setDetailMessage(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {detailMessage.message && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Message</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded">{detailMessage.message.content}</p>
                  {detailMessage.message.media_url && (
                    <p className="text-xs text-blue-600 mt-1">
                      Média : {detailMessage.message.file_name || detailMessage.message.message_type}
                    </p>
                  )}
                  <div className="flex gap-3 mt-2 text-xs text-gray-500">
                    <span>{formatDate(detailMessage.message.created_at)}</span>
                    {statusBadge(detailMessage.message.status)}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  Destinataires ({detailMessage.recipients?.length || 0})
                </p>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {(detailMessage.recipients || []).map(r => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-sm">
                      <div>
                        <span className="text-gray-700">{r.phone_e164}</span>
                        {r.parent && (
                          <span className="text-gray-500 ml-2 text-xs">
                            ({r.parent.first_name} {r.parent.last_name})
                          </span>
                        )}
                      </div>
                      <span className={`text-xs font-medium ${r.status === 'sent' ? 'text-green-600' : r.status === 'failed' ? 'text-red-600' : 'text-yellow-600'}`}>
                        {r.status === 'sent' ? '✓' : r.status === 'failed' ? '✗' : '...'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagesPage;
