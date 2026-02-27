import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  MessageSquare, Send, Paperclip, Image, FileText, Users, CheckSquare,
  ChevronDown, X, Clock, CheckCircle, AlertCircle, RefreshCw, Eye,
  Smartphone, Wifi, WifiOff, QrCode, Info, Plus, Trash2,
  Search, Phone, XCircle, Inbox, ArrowUpRight, ArrowLeft,
  Bot, Settings, Play, History, Sparkles, ToggleLeft, ToggleRight, Globe,
  Download, Calendar, Filter, TrendingUp, BarChart3, BookOpen
} from 'lucide-react';
import QRCode from 'qrcode';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

const WhatsAppPage = () => {
  const { profile } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const [activeTab, setActiveTab] = useState('send');

  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  // ===================== TAB: SEND =====================
  const [classes, setClasses] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [schoolTypeFilter, setSchoolTypeFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [classDropdownOpen, setClassDropdownOpen] = useState(false);
  const classDropdownRef = useRef(null);
  const [recipientCount, setRecipientCount] = useState(0);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
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
  const [sendHistory, setSendHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [detailMessage, setDetailMessage] = useState(null);
  const [availableLevels, setAvailableLevels] = useState([]);

  // ===================== TAB: TEACHERS =====================
  const [teachers, setTeachers] = useState([]);
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [teacherFiliereFilter, setTeacherFiliereFilter] = useState('');
  const [teacherClassFilter, setTeacherClassFilter] = useState('');
  const [teacherCount, setTeacherCount] = useState(0);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [teacherMessageText, setTeacherMessageText] = useState('');
  const [teacherSending, setTeacherSending] = useState(false);
  
  // États pour les médias professeurs
  const [teacherMediaFile, setTeacherMediaFile] = useState(null);
  const [teacherMediaPreview, setTeacherMediaPreview] = useState(null);
  const [teacherMediaUrl, setTeacherMediaUrl] = useState('');
  const [teacherFileName, setTeacherFileName] = useState('');
  const [teacherUploading, setTeacherUploading] = useState(false);
  const [teacherMessageType, setTeacherMessageType] = useState('text');
  const teacherFileInputRef = useRef(null);

  // ===================== TAB: INBOX =====================
  const [conversations, setConversations] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [selectedConv, setSelectedConv] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inboxFilter, setInboxFilter] = useState('all');
  const [inboxView, setInboxView] = useState('conversations');
  const [apiLogs, setApiLogs] = useState([]);
  const [apiLogsLoading, setApiLogsLoading] = useState(false);
  const [apiLogsPage, setApiLogsPage] = useState(1);
  const [apiLogsTotal, setApiLogsTotal] = useState(0);
  const [apiLogsLastPage, setApiLogsLastPage] = useState(1);
  const messagesEndRef = useRef(null);

  // Inline compose in inbox
  const [directMsg, setDirectMsg] = useState('');
  const [directMsgType, setDirectMsgType] = useState('text');
  const [directFile, setDirectFile] = useState(null);
  const [directFilePreview, setDirectFilePreview] = useState(null);
  const [directFileName, setDirectFileName] = useState('');
  const [directMediaUrl, setDirectMediaUrl] = useState('');
  const [directSending, setDirectSending] = useState(false);
  const [directUploading, setDirectUploading] = useState(false);
  const [directError, setDirectError] = useState('');
  const directFileRef = useRef(null);

  // ===================== TAB: CONNECTION =====================
  const [sessionStatus, setSessionStatus] = useState(null);
  const [connLoading, setConnLoading] = useState(true);
  const [qrCode, setQrCode] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionPhone, setNewSessionPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ===================== TAB: REPORTS IA =====================
  const [reportSettings, setReportSettings] = useState(null);
  const [reportSettingsLoading, setReportSettingsLoading] = useState(false);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportStudents, setReportStudents] = useState([]);
  const [reportSelectedStudent, setReportSelectedStudent] = useState('');
  const [reportPreview, setReportPreview] = useState(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('7d');
  const [reportCustomStart, setReportCustomStart] = useState('');
  const [reportCustomEnd, setReportCustomEnd] = useState('');
  const [reportClassFilter, setReportClassFilter] = useState('');
  const [reportStudentSearch, setReportStudentSearch] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [reportPeriodData, setReportPeriodData] = useState(null);
  const [reportTriggering, setReportTriggering] = useState(false);
  const [reportHistory, setReportHistory] = useState([]);
  const [reportHistoryTotal, setReportHistoryTotal] = useState(0);
  const [reportHistoryPage, setReportHistoryPage] = useState(1);
  const [reportHistoryLoading, setReportHistoryLoading] = useState(false);
  const [reportHistoryDate, setReportHistoryDate] = useState('');
  const [reportSubView, setReportSubView] = useState('settings');
  const [reportViewDetail, setReportViewDetail] = useState(null);
  const [reportRetrying, setReportRetrying] = useState(null);
  const [reportRetryingAll, setReportRetryingAll] = useState(false);

  // ===================== SHARED EFFECTS =====================
  useEffect(() => {
    const handleClick = (e) => {
      if (classDropdownRef.current && !classDropdownRef.current.contains(e.target)) {
        setClassDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Load classes and teachers on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getAuthToken();
        const [classesRes, teachersRes] = await Promise.all([
          fetch(`${apiUrl}/api/admin/classes`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiUrl}/api/admin/teachers`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        const classesData = await classesRes.json();
        const teachersData = await teachersRes.json();
        
        const cls = Array.isArray(classesData) ? classesData : [];
        setClasses(cls);
        setSelectedClasses(cls.map(c => c.id));
        const levels = [...new Set(cls.map(c => c.level).filter(Boolean))].sort();
        setAvailableLevels(levels);
        
        const tchs = Array.isArray(teachersData) ? teachersData : [];
        setTeachers(tchs);
        setSelectedTeachers(tchs.map(t => t.id));
      } catch (error) {
        console.error('Erreur chargement données:', error);
      }
    };
    loadData();
  }, [apiUrl]);

  // ===================== SEND LOGIC =====================
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
        headers: { Authorization: `Bearer ${await getAuthToken()}` }
      });
      const data = await res.json();
      setRecipientCount(data.count || 0);
    } catch (error) {
      console.error('Erreur comptage:', error);
    } finally {
      setLoadingRecipients(false);
    }
  }, [apiUrl, selectedClasses, classes.length, schoolTypeFilter, levelFilter]);

  useEffect(() => {
    if (classes.length > 0) fetchRecipientCount();
  }, [fetchRecipientCount, classes.length]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/history?page=${historyPage}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSendHistory(data.messages || []);
      setHistoryTotal(data.total || 0);
    } catch (error) {
      console.error('Erreur historique:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [apiUrl, historyPage]);

  useEffect(() => {
    if (activeTab === 'send') fetchHistory();
  }, [fetchHistory, activeTab]);

  const toggleClass = (classId) => {
    setSelectedClasses(prev => prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]);
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
  const filteredClasses = classes.filter(c => {
    if (schoolTypeFilter && c.school_type !== schoolTypeFilter) return false;
    if (levelFilter && c.level !== levelFilter) return false;
    return true;
  });

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
    setMediaFile(null); setMediaPreview(null); setMediaUrl(''); setFileName(''); setMessageType('text');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadMedia = async () => {
    if (!mediaFile) return null;
    setUploading(true);
    try {
      const token = await getAuthToken();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const res = await fetch(`${apiUrl}/api/admin/whatsapp/upload`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64: ev.target.result, mimetype: mediaFile.type })
            });
            const data = await res.json();
            if (data.success && data.publicUrl) { setMediaUrl(data.publicUrl); resolve(data.publicUrl); }
            else reject(new Error(data.error || 'Erreur upload'));
          } catch (err) { reject(err); } finally { setUploading(false); }
        };
        reader.onerror = () => { setUploading(false); reject(new Error('Erreur lecture')); };
        reader.readAsDataURL(mediaFile);
      });
    } catch (error) { setUploading(false); throw error; }
  };

  const handleSend = async () => {
    if (!messageText && !mediaFile) return;
    if (recipientCount === 0) return;
    setSending(true);
    setSendProgress({ total: recipientCount, sent: 0, failed: 0, status: 'sending' });
    try {
      let uploadedUrl = mediaUrl;
      if (mediaFile && !mediaUrl) uploadedUrl = await uploadMedia();
      const token = await getAuthToken();
      const filter = {};
      if (selectedClasses.length > 0 && selectedClasses.length < classes.length) filter.class_ids = selectedClasses;
      if (schoolTypeFilter) filter.school_type = schoolTypeFilter;
      if (levelFilter) filter.level = levelFilter;
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, type: messageType, mediaUrl: uploadedUrl || null, fileName: fileName || null, filter })
      });
      const data = await res.json();
      if (data.success && data.messageId) {
        const pollProgress = setInterval(async () => {
          try {
            const progRes = await fetch(`${apiUrl}/api/admin/whatsapp/messages/${data.messageId}/progress`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const progData = await progRes.json();
            setSendProgress({ total: progData.total_recipients, sent: progData.sent_count, failed: progData.failed_count, status: progData.status });
            if (progData.status === 'completed' || progData.status === 'failed') {
              clearInterval(pollProgress);
              setSending(false);
              fetchHistory();
              if (progData.status === 'completed') { setMessageText(''); removeMedia(); }
            }
          } catch { clearInterval(pollProgress); setSending(false); }
        }, 2000);
      } else {
        setSending(false); setSendProgress(null);
        alert(data.error || 'Erreur lors de l\'envoi');
      }
    } catch (error) {
      console.error('Erreur envoi:', error);
      setSending(false); setSendProgress(null);
      alert('Erreur lors de l\'envoi du message');
    }
  };

  const viewDetails = async (msgId) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/messages/${msgId}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetailMessage(await res.json());
    } catch (error) { console.error('Erreur détails:', error); }
  };

  // ===================== INBOX LOGIC =====================
  const fetchConversations = useCallback(async () => {
    setInboxLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setConversations(data.conversations || []);
    } catch (error) { console.error('Erreur conversations:', error); }
    finally { setInboxLoading(false); }
  }, [apiUrl]);

  const fetchApiLogs = useCallback(async (page = 1) => {
    setApiLogsLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/message-logs?page=${page}&per_page=30`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setApiLogs(data.messages || []);
        setApiLogsTotal(data.total || 0);
        setApiLogsPage(data.currentPage || 1);
        setApiLogsLastPage(data.lastPage || 1);
      }
    } catch (error) { console.error('Erreur logs:', error); }
    finally { setApiLogsLoading(false); }
  }, [apiUrl]);

  useEffect(() => {
    if (activeTab === 'inbox') {
      if (inboxView === 'conversations') fetchConversations();
      else fetchApiLogs(apiLogsPage);
    }
  }, [activeTab, inboxView, apiLogsPage, fetchConversations, fetchApiLogs]);

  useEffect(() => {
    if (selectedConv && messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv]);

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = !searchQuery ||
      (conv.parentName && conv.parentName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      conv.phone.includes(searchQuery);
    const matchesFilter = inboxFilter === 'all' ||
      (inboxFilter === 'sent' && conv.totalSent > 0) ||
      (inboxFilter === 'failed' && conv.totalFailed > 0);
    return matchesSearch && matchesFilter;
  });

  // Inline compose helpers
  const handleDirectFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDirectFile(file);
    setDirectFileName(file.name);
    setDirectError('');
    if (file.type.startsWith('image/')) {
      setDirectMsgType('image');
      const reader = new FileReader();
      reader.onload = (ev) => setDirectFilePreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setDirectMsgType('document');
      setDirectFilePreview(null);
    }
  };

  const removeDirectFile = () => {
    setDirectFile(null);
    setDirectFilePreview(null);
    setDirectMediaUrl('');
    setDirectFileName('');
    setDirectMsgType('text');
    if (directFileRef.current) directFileRef.current.value = '';
  };

  const uploadDirectFile = async () => {
    if (!directFile) return null;
    setDirectUploading(true);
    try {
      const token = await getAuthToken();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const res = await fetch(`${apiUrl}/api/admin/whatsapp/upload`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64: ev.target.result, mimetype: directFile.type })
            });
            const data = await res.json();
            if (data.success && data.publicUrl) { setDirectMediaUrl(data.publicUrl); resolve(data.publicUrl); }
            else reject(new Error(data.error || 'Erreur upload'));
          } catch (err) { reject(err); }
          finally { setDirectUploading(false); }
        };
        reader.onerror = () => { setDirectUploading(false); reject(new Error('Erreur lecture')); };
        reader.readAsDataURL(directFile);
      });
    } catch (error) { setDirectUploading(false); throw error; }
  };

  const handleDirectSend = async () => {
    if (!selectedConv) return;
    if (!directMsg.trim() && !directFile) return;
    setDirectSending(true);
    setDirectError('');
    try {
      let uploadedUrl = directMediaUrl;
      if (directFile && !directMediaUrl) uploadedUrl = await uploadDirectFile();
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/send-direct`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: selectedConv.phone,
          message: directMsg.trim() || null,
          type: directMsgType,
          mediaUrl: uploadedUrl || null,
          fileName: directFileName || null,
          parentId: selectedConv.parentId || null
        })
      });
      const data = await res.json();
      if (data.success) {
        // Add message to conversation locally for instant feedback
        const newMsg = {
          id: data.messageId + '-new',
          messageId: data.messageId,
          content: directMsg.trim(),
          messageType: directMsgType,
          mediaUrl: uploadedUrl,
          fileName: directFileName,
          status: 'sent',
          errorMessage: null,
          sentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          senderName: profile ? `${profile.first_name} ${profile.last_name}` : null,
          direction: 'outgoing'
        };
        setSelectedConv(prev => ({
          ...prev,
          messages: [...prev.messages, newMsg],
          messageCount: prev.messageCount + 1,
          totalSent: prev.totalSent + 1,
          lastMessageAt: new Date().toISOString()
        }));
        setDirectMsg('');
        removeDirectFile();
        setTimeout(() => {
          if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        setDirectError(data.error || 'Erreur lors de l\'envoi');
      }
    } catch (error) {
      console.error('Erreur envoi direct:', error);
      setDirectError('Erreur de connexion');
    } finally {
      setDirectSending(false);
    }
  };

  // ===================== CONNECTION LOGIC =====================
  const fetchStatus = useCallback(async () => {
    setConnLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/session-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Le serveur backend ne répond pas correctement.');
      }
      setSessionStatus(await res.json());
    } catch (error) {
      console.error('Erreur statut:', error);
      setSessionStatus({ connected: false, error: 'Erreur de connexion au serveur' });
    } finally { setConnLoading(false); }
  }, [apiUrl]);

  useEffect(() => {
    if (activeTab === 'connection') fetchStatus();
  }, [activeTab, fetchStatus]);

  const fetchQR = async () => {
    setQrLoading(true); setQrError(''); setQrCode(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/session-qr`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.qrString) {
        setQrCode(await QRCode.toDataURL(data.qrString, { width: 300, margin: 2 }));
      } else { setQrError(data.error || 'QR code non disponible'); }
    } catch (error) { console.error('Erreur QR:', error); setQrError('Erreur de connexion'); }
    finally { setQrLoading(false); }
  };

  const handleCreateSession = async () => {
    if (!newSessionName || !newSessionPhone) { setCreateError('Nom et numéro requis'); return; }
    setCreating(true); setCreateError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSessionName, phone_number: newSessionPhone })
      });
      const data = await res.json();
      if (data.success) { setShowCreateForm(false); setNewSessionName(''); setNewSessionPhone(''); fetchStatus(); }
      else setCreateError(data.error || 'Erreur création');
    } catch (error) { setCreateError('Erreur de connexion'); }
    finally { setCreating(false); }
  };

  const handleDeleteSession = async () => {
    if (!sessionStatus?.session?.id) return;
    setDeleting(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/sessions/${sessionStatus.session.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) { setConfirmDelete(false); setSessionStatus(null); setQrCode(null); fetchStatus(); }
      else alert(data.error || 'Erreur suppression');
    } catch (error) { alert('Erreur de connexion'); }
    finally { setDeleting(false); }
  };

  // ===================== HELPERS =====================
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return date.toLocaleDateString('fr-FR', { weekday: 'short' });
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };
  const formatFullDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const statusBadge = (status) => {
    const map = {
      pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'En attente' },
      sending: { color: 'bg-blue-100 text-blue-700', icon: RefreshCw, label: 'Envoi...' },
      completed: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Terminé' },
      failed: { color: 'bg-red-100 text-red-700', icon: AlertCircle, label: 'Échoué' },
      sent: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Envoyé' },
      in_progress: { color: 'bg-blue-100 text-blue-700', icon: RefreshCw, label: 'En cours' }
    };
    const s = map[status] || map.pending;
    const Icon = s.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>
        <Icon className="w-3 h-3" /> {s.label}
      </span>
    );
  };
  const typeLabel = (type) => ({ text: 'Texte', image: 'Image', document: 'Document' }[type] || type);
  const msgTypeIcon = (type) => {
    if (type === 'image') return <Image className="w-3.5 h-3.5" />;
    if (type === 'document') return <FileText className="w-3.5 h-3.5" />;
    return null;
  };

  const inboxTotalSent = conversations.reduce((s, c) => s + c.totalSent, 0);
  const inboxTotalFailed = conversations.reduce((s, c) => s + c.totalFailed, 0);
  const inboxTotalMessages = conversations.reduce((s, c) => s + c.messageCount, 0);

  // ===================== REPORTS IA LOGIC =====================
  const fetchReportSettings = useCallback(async () => {
    setReportSettingsLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setReportSettings(data.settings || {
        enabled: false, send_time: '18:00', language: 'both',
        include_recommendations: true, include_chapter_info: true,
        include_homework_status: true, include_behavior: true, include_grades: false
      });
    } catch (error) {
      console.error('Erreur settings:', error);
      setReportSettings({
        enabled: false, send_time: '18:00', language: 'both',
        include_recommendations: true, include_chapter_info: true,
        include_homework_status: true, include_behavior: true, include_grades: false
      });
    }
    finally { setReportSettingsLoading(false); }
  }, [apiUrl]);

  const fetchReportStudents = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/students`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setReportStudents(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Erreur students:', error); setReportStudents([]); }
  }, [apiUrl]);

  const fetchReportHistory = useCallback(async (page = 1) => {
    setReportHistoryLoading(true);
    try {
      const token = await getAuthToken();
      const params = new URLSearchParams({ page, limit: 20 });
      if (reportHistoryDate) params.append('date', reportHistoryDate);
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/history?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setReportHistory(Array.isArray(data.reports) ? data.reports : []);
      setReportHistoryTotal(data.total || 0);
    } catch (error) { console.error('Erreur history:', error); setReportHistory([]); }
    finally { setReportHistoryLoading(false); }
  }, [apiUrl, reportHistoryDate]);

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReportSettings();
      fetchReportStudents();
      if (reportSubView === 'history') fetchReportHistory(reportHistoryPage);
    }
  }, [activeTab, reportSubView, reportHistoryPage, fetchReportSettings, fetchReportStudents, fetchReportHistory]);

  const saveReportSettings = async (newSettings) => {
    setReportSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/settings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.success) setReportSettings(data.settings);
      else alert(data.error || 'Erreur sauvegarde');
    } catch (error) { console.error('Erreur save:', error); alert('Erreur de connexion'); }
    finally { setReportSaving(false); }
  };

  const triggerReports = async () => {
    setReportTriggering(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) alert('Génération des rapports lancée ! Les messages seront envoyés progressivement.');
      else alert(data.error || 'Erreur');
    } catch (error) { console.error('Erreur trigger:', error); alert('Erreur de connexion'); }
    finally { setReportTriggering(false); }
  };

  const getReportDates = () => {
    const today = new Date();
    const fmt = d => d.toISOString().split('T')[0];
    if (reportPeriod === 'today') return { startDate: fmt(today), endDate: fmt(today) };
    if (reportPeriod === '7d') { const s = new Date(today); s.setDate(s.getDate() - 6); return { startDate: fmt(s), endDate: fmt(today) }; }
    if (reportPeriod === '30d') { const s = new Date(today); s.setDate(s.getDate() - 29); return { startDate: fmt(s), endDate: fmt(today) }; }
    if (reportPeriod === 'custom' && reportCustomStart && reportCustomEnd) return { startDate: reportCustomStart, endDate: reportCustomEnd };
    return { startDate: fmt(today), endDate: fmt(today) };
  };

  const generatePreview = async () => {
    if (!reportSelectedStudent) return;
    setReportPreviewLoading(true);
    setReportPreview(null);
    setReportPeriodData(null);
    try {
      const token = await getAuthToken();
      const { startDate, endDate } = getReportDates();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/comprehensive-preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: reportSelectedStudent, startDate, endDate })
      });
      const data = await res.json();
      setReportPreview(data);
      if (data.periodData) setReportPeriodData(data.periodData);
    } catch (error) { console.error('Erreur preview:', error); setReportPreview({ error: 'Erreur de connexion' }); }
    finally { setReportPreviewLoading(false); }
  };

  const sendReportWhatsApp = async () => {
    console.log('[SendWhatsApp] reportPreview:', reportPreview);
    console.log('[SendWhatsApp] reportSelectedStudent:', reportSelectedStudent);
    if (!reportPreview?.report || !reportSelectedStudent) { alert('Aucun rapport à envoyer. Générez d\'abord un aperçu.'); return; }
    setReportSending(true);
    try {
      const token = await getAuthToken();
      const rpt = reportPreview.report;
      let text = '';
      if (typeof rpt === 'string') { text = rpt; }
      else {
        if (rpt.fr) text += rpt.fr;
        if (rpt.fr && rpt.ar) text += '\n\n━━━━━━━━━━━━━━━\n\n';
        if (rpt.ar) text += rpt.ar;
      }
      console.log('[SendWhatsApp] text length:', text.length);
      if (!text.trim()) { alert('Le rapport est vide.'); setReportSending(false); return; }
      console.log('[SendWhatsApp] Sending to:', `${apiUrl}/api/admin/whatsapp/daily-reports/send-report`);
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/send-report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: reportSelectedStudent, reportText: text })
      });
      console.log('[SendWhatsApp] Response status:', res.status);
      const data = await res.json();
      console.log('[SendWhatsApp] Response data:', data);
      if (data.success) alert(`Rapport envoyé ! ${data.sent} message(s) envoyé(s), ${data.failed} échoué(s).`);
      else alert(data.error || 'Erreur envoi');
    } catch (error) { console.error('Erreur send:', error); alert('Erreur de connexion: ' + error.message); }
    finally { setReportSending(false); }
  };

  const downloadReportPDF = async () => {
    if (!reportPreview?.report || !reportPeriodData) { alert('Aucun rapport à télécharger. Générez d\'abord un aperçu.'); return; }
    try {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    const st = reportPeriodData.student;
    const os = reportPeriodData.overallStats;
    const margin = 14;
    let y = 20;

    // Helper: remove Arabic/non-Latin chars that jsPDF can't render
    const sanitize = (str) => str ? str.replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g, '').replace(/\s{2,}/g, ' ').trim() : '';

    // School name header
    const schoolName = sanitize(st.schoolName || '') || 'Établissement Scolaire';
    doc.setFontSize(14);
    doc.setTextColor(34, 139, 34);
    doc.text(schoolName, 105, y, { align: 'center' });
    y += 8;

    doc.setFontSize(16);
    doc.setTextColor(34, 139, 34);
    doc.text('Rapport Scolaire', margin, y);
    y += 10;
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, margin, y);
    y += 10;

    const studentName = sanitize(`${st.firstName} ${st.lastName}`) || 'Eleve';

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Élève: ${studentName}`, margin, y); y += 6;
    doc.text(`Classe: ${st.className} (${st.level})`, margin, y); y += 6;
    doc.text(`Période: ${reportPeriodData.period.startDate} - ${reportPeriodData.period.endDate}`, margin, y); y += 10;

    // Overall stats table
    let tbl = autoTable(doc, {
      startY: y,
      head: [['Indicateur', 'Valeur']],
      body: [
        ['Séances totales', `${os.totalSessions}`],
        ['Jours', `${os.totalDays}`],
        ['Taux de présence', `${os.presenceRate ?? '-'}%`],
        ['Participation moy.', `${os.avgParticipation ?? '-'}/5`],
        ['Discipline moy.', `${os.avgDiscipline ?? '-'}/5`],
        ['Mini-éval moy.', `${os.avgMiniEval ?? '-'}/10`],
        ['Devoirs faits', `${os.homeworkRate ?? '-'}%`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [34, 139, 34] },
      margin: { left: margin },
      styles: { fontSize: 9 }
    });
    y = (tbl?.finalY ?? doc.previousAutoTable?.finalY ?? y) + 10;

    // Subject stats table
    if (Object.keys(reportPeriodData.subjectStats).length > 0) {
      const subjRows = Object.entries(reportPeriodData.subjectStats).map(([name, s]) => [
        name,
        `${s.totalSessions}`,
        `${s.presence.present}/${s.totalTracked}`,
        `${s.avgParticipation ?? '-'}`,
        `${s.avgMiniEval ?? '-'}`,
        s.grades.map(g => `${g.note}/${g.max}`).join(', ') || '-',
        s.topics.join(', ').substring(0, 40) || '-'
      ]);
      tbl = autoTable(doc, {
        startY: y,
        head: [['Matière', 'Séances', 'Présence', 'Particip.', 'Mini-éval', 'Notes', 'Chapitres']],
        body: subjRows,
        theme: 'grid',
        headStyles: { fillColor: [34, 139, 34] },
        margin: { left: margin },
        styles: { fontSize: 7 },
        columnStyles: { 6: { cellWidth: 40 } }
      });
      y = (tbl?.finalY ?? doc.previousAutoTable?.finalY ?? y) + 10;
    }

    // Grades table
    if (os.grades?.length > 0) {
      tbl = autoTable(doc, {
        startY: y,
        head: [['Matière', 'Chapitre', 'Note', 'Date']],
        body: os.grades.map(g => [g.subject, g.topic, `${g.note}/${g.max}`, g.date]),
        theme: 'grid',
        headStyles: { fillColor: [34, 139, 34] },
        margin: { left: margin },
        styles: { fontSize: 8 }
      });
      y = (tbl?.finalY ?? doc.previousAutoTable?.finalY ?? y) + 10;
    }

    // AI Report text (French only — jsPDF cannot render Arabic)
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setTextColor(34, 139, 34);
    doc.text('Rapport (Version française)', margin, y); y += 8;
    doc.setFontSize(9);
    doc.setTextColor(0);
    const rptObj = reportPreview.report;
    let reportText = typeof rptObj === 'string' ? rptObj : (rptObj.fr || '');
    if (!reportText && rptObj.ar) {
      reportText = '(Le rapport est disponible uniquement en arabe. Consultez la version WhatsApp pour le texte complet.)';
    }
    // Sanitize: remove Arabic chars that would render as garbage
    reportText = reportText.replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g, '').replace(/\s{2,}/g, ' ').trim();
    const lines = doc.splitTextToSize(reportText, 180);
    for (const line of lines) {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(line, margin, y);
      y += 5;
    }

    const safeName = sanitize(`${st.lastName}_${st.firstName}`) || 'eleve';
    doc.save(`rapport_${safeName}_${reportPeriodData.period.startDate}.pdf`);
    } catch (error) { console.error('Erreur PDF:', error); alert('Erreur lors de la génération du PDF: ' + error.message); }
  };

  const retryReport = async (reportId) => {
    setReportRetrying(reportId);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId })
      });
      const data = await res.json();
      if (data.success) {
        alert('Message renvoyé avec succès !');
        fetchReportHistory(reportHistoryPage);
      } else alert(data.error || 'Erreur lors du renvoi');
    } catch (error) { console.error('Erreur retry:', error); alert('Erreur de connexion'); }
    finally { setReportRetrying(null); }
  };

  const retryAllFailed = async () => {
    if (!confirm('Renvoyer tous les messages échoués ?')) return;
    setReportRetryingAll(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/retry-all-failed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert(`Renvoi terminé ! ${data.sent} envoyé(s), ${data.failed} échoué(s) sur ${data.total} total.`);
        fetchReportHistory(reportHistoryPage);
      } else alert(data.error || 'Erreur');
    } catch (error) { console.error('Erreur retry-all:', error); alert('Erreur de connexion'); }
    finally { setReportRetryingAll(false); }
  };

  const updateSetting = (key, value) => {
    const updated = { ...reportSettings, [key]: value };
    setReportSettings(updated);
  };

  // ===================== FONCTIONS MÉDIAS PROFESSEURS =====================
  const handleTeacherFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setTeacherMediaFile(file);
    setTeacherFileName(file.name);
    if (file.type.startsWith('image/')) {
      setTeacherMessageType('image');
      const reader = new FileReader();
      reader.onload = (ev) => setTeacherMediaPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setTeacherMessageType('document');
      setTeacherMediaPreview(null);
    }
  };

  const removeTeacherMedia = () => {
    setTeacherMediaFile(null); 
    setTeacherMediaPreview(null); 
    setTeacherMediaUrl(''); 
    setTeacherFileName(''); 
    setTeacherMessageType('text');
    if (teacherFileInputRef.current) teacherFileInputRef.current.value = '';
  };

  const uploadTeacherMedia = async () => {
    if (!teacherMediaFile) return null;
    setTeacherUploading(true);
    try {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async (ev) => {
          try {
            const res = await fetch(`${apiUrl}/api/admin/whatsapp/upload`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${await getAuthToken()}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64: ev.target.result, mimetype: teacherMediaFile.type })
            });
            const data = await res.json();
            if (data.success && data.publicUrl) { 
              setTeacherMediaUrl(data.publicUrl); 
              resolve(data.publicUrl); 
            }
            else reject(new Error(data.error || 'Erreur upload'));
          } catch (err) { reject(err); } finally { setTeacherUploading(false); }
        };
        reader.onerror = () => { setTeacherUploading(false); reject(new Error('Erreur lecture')); };
        reader.readAsDataURL(teacherMediaFile);
      });
    } catch (error) { setTeacherUploading(false); throw error; }
  };

  // ===================== TABS CONFIG =====================
  const tabs = [
    { key: 'send', label: 'Parents', icon: Send },
    { key: 'teachers', label: 'Professeurs', icon: Users },
    { key: 'inbox', label: 'Boîte de messages', icon: Inbox },
    { key: 'reports', label: 'Rapports IA', icon: Bot },
    { key: 'connection', label: 'Connexion', icon: Smartphone }
  ];

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header + Tabs */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 pt-3 pb-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">WhatsApp</h1>
            </div>
          </div>
          {/* Connection status indicator */}
          {sessionStatus && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sessionStatus.connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              <div className={`w-2 h-2 rounded-full ${sessionStatus.connected ? 'bg-green-500' : 'bg-gray-400'}`}></div>
              {sessionStatus.connected ? 'Connecté' : 'Déconnecté'}
            </div>
          )}
        </div>
        {/* Tab bar */}
        <div className="px-4 flex gap-0 mt-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-green-600 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'send' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Recipient Filters */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4" /> Destinataires
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Cycle</label>
                    <select value={schoolTypeFilter} onChange={(e) => setSchoolTypeFilter(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                      <option value="">Tous les cycles</option>
                      <option value="college">Collège</option>
                      <option value="lycee">Lycée</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Niveau</label>
                    <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                      <option value="">Tous les niveaux</option>
                      {availableLevels.map(lvl => <option key={lvl} value={lvl}>{lvl}</option>)}
                    </select>
                  </div>
                  <div className="relative" ref={classDropdownRef}>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Classes</label>
                    <button type="button" onClick={() => setClassDropdownOpen(!classDropdownOpen)}
                      className="w-full flex items-center justify-between rounded border border-gray-300 px-2 py-1.5 text-sm bg-white hover:bg-gray-50">
                      <span className="truncate">{classLabel()}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${classDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {classDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        <label className="flex items-center gap-2 px-3 py-2 hover:bg-green-50 cursor-pointer border-b border-gray-100">
                          <input type="checkbox" checked={selectedClasses.length === filteredClasses.length && filteredClasses.length > 0}
                            onChange={toggleAllClasses} className="w-4 h-4 rounded text-green-600" />
                          <span className="text-sm font-semibold text-green-700">Toutes les classes</span>
                        </label>
                        {filteredClasses.map(cls => (
                          <label key={cls.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selectedClasses.includes(cls.id)}
                              onChange={() => toggleClass(cls.id)} className="w-4 h-4 rounded text-green-600" />
                            <span className="text-sm text-gray-700">{cls.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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
                  <Send className="w-4 h-4" /> Composer le message
                </h2>
                <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Tapez votre message ici..." rows="5"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500" />

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
                    <button onClick={removeMedia} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      onChange={handleFileSelect} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} disabled={sending}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      <Paperclip className="w-4 h-4" /> Joindre
                    </button>
                    <button onClick={() => { if (fileInputRef.current) { fileInputRef.current.accept = 'image/*'; fileInputRef.current.click(); fileInputRef.current.accept = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"; } }}
                      disabled={sending} className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      <Image className="w-4 h-4" /> Image
                    </button>
                  </div>
                  <button onClick={handleSend} disabled={sending || uploading || (!messageText && !mediaFile) || recipientCount === 0}
                    className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                    <Send className="w-4 h-4" />
                    {uploading ? 'Upload...' : sending ? 'Envoi...' : `Envoyer à ${recipientCount}`}
                  </button>
                </div>

                {sendProgress && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-green-800">{sendProgress.status === 'completed' ? 'Envoi terminé' : 'Envoi en cours...'}</span>
                      <span className="text-green-700">{sendProgress.sent + sendProgress.failed} / {sendProgress.total}</span>
                    </div>
                    <div className="w-full bg-green-200 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full transition-all"
                        style={{ width: `${sendProgress.total > 0 ? ((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100 : 0}%` }} />
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-green-700">{sendProgress.sent} envoyé(s)</span>
                      {sendProgress.failed > 0 && <span className="text-red-600">{sendProgress.failed} échoué(s)</span>}
                    </div>
                    {sendProgress.status === 'completed' && (
                      <button onClick={() => setSendProgress(null)} className="text-xs text-green-700 hover:underline">Fermer</button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: History */}
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Clock className="w-4 h-4" /> Historique</h2>
                  <button onClick={fetchHistory} className="p-1 hover:bg-gray-100 rounded">
                    <RefreshCw className={`w-4 h-4 text-gray-500 ${loadingHistory ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                  {sendHistory.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400 text-sm">Aucun message envoyé</div>
                  ) : sendHistory.map(msg => (
                    <div key={msg.id} className="px-4 py-3 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{msg.content || `[${typeLabel(msg.message_type)}]`}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{formatFullDate(msg.created_at)}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {statusBadge(msg.status)}
                            <span className="text-xs text-gray-500">{msg.sent_count}/{msg.total_recipients}</span>
                          </div>
                        </div>
                        <button onClick={() => viewDetails(msg.id)} className="p-1 hover:bg-gray-200 rounded" title="Détails">
                          <Eye className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {historyTotal > 10 && (
                  <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                    <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}
                      className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50">Précédent</button>
                    <span className="text-xs text-gray-500">Page {historyPage}</span>
                    <button onClick={() => setHistoryPage(p => p + 1)} disabled={historyPage * 10 >= historyTotal}
                      className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50">Suivant</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* ===================== TAB: TEACHERS ===================== */}
      {activeTab === 'teachers' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Filters */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4" /> Sélectionner les professeurs
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Filière</label>
                  <select value={teacherFiliereFilter} onChange={(e) => setTeacherFiliereFilter(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                    <option value="">Toutes les filières</option>
                    {[...new Set(classes.map(c => c.filiere).filter(Boolean))].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Classe</label>
                  <select value={teacherClassFilter} onChange={(e) => setTeacherClassFilter(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                    <option value="">Toutes les classes</option>
                    {classes
                      .filter(c => !teacherFiliereFilter || c.filiere === teacherFiliereFilter)
                      .map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setTeacherFiliereFilter('');
                      setTeacherClassFilter('');
                      setSelectedTeachers(teachers.map(t => t.id));
                    }}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
                    Réinitialiser
                  </button>
                </div>
              </div>
            </div>

            {/* Teachers List */}
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  Professeurs ({teachers.filter(t => 
                    (!teacherFiliereFilter || classes.find(c => c.teacher_id === t.id)?.filiere === teacherFiliereFilter) &&
                    (!teacherClassFilter || classes.find(c => c.teacher_id === t.id)?.id === teacherClassFilter)
                  ).length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const filtered = teachers.filter(t => 
                        (!teacherFiliereFilter || classes.find(c => c.teacher_id === t.id)?.filiere === teacherFiliereFilter) &&
                        (!teacherClassFilter || classes.find(c => c.teacher_id === t.id)?.id === teacherClassFilter)
                      );
                      setSelectedTeachers(filtered.map(t => t.id));
                    }}
                    className="text-xs text-green-600 hover:text-green-700 font-medium">
                    Tout sélectionner
                  </button>
                  <button
                    onClick={() => setSelectedTeachers([])}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                    Tout désélectionner
                  </button>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {teachers
                  .filter(t => 
                    (!teacherFiliereFilter || classes.find(c => c.teacher_id === t.id)?.filiere === teacherFiliereFilter) &&
                    (!teacherClassFilter || classes.find(c => c.teacher_id === t.id)?.id === teacherClassFilter)
                  )
                  .map(teacher => (
                    <label key={teacher.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                      <input
                        type="checkbox"
                        checked={selectedTeachers.includes(teacher.id)}
                        onChange={() => {
                          setSelectedTeachers(prev =>
                            prev.includes(teacher.id)
                              ? prev.filter(id => id !== teacher.id)
                              : [...prev, teacher.id]
                          );
                        }}
                        className="w-4 h-4 rounded text-green-600"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">
                          {teacher.first_name} {teacher.last_name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {teacher.phone && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {teacher.phone}
                            </span>
                          )}
                          {!teacher.phone && (
                            <span className="text-xs text-red-500">Pas de téléphone</span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
              </div>
            </div>

            {/* Message Compose */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Send className="w-4 h-4" /> Message
              </h2>
              <textarea
                value={teacherMessageText}
                onChange={(e) => setTeacherMessageText(e.target.value)}
                placeholder="Tapez votre message aux professeurs..."
                rows="6"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
              
              {/* Media Preview */}
              {teacherMediaFile && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {teacherMediaPreview ? (
                    <img src={teacherMediaPreview} alt="preview" className="w-16 h-16 object-cover rounded" />
                  ) : (
                    <FileText className="w-6 h-6 text-blue-600" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{teacherFileName}</p>
                    <p className="text-xs text-gray-500">{teacherMessageType === 'image' ? 'Image' : 'Document'}</p>
                  </div>
                  <button onClick={removeTeacherMedia} className="p-1 hover:bg-gray-200 rounded">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              )}
              
              {/* Media Upload Buttons */}
              <div className="flex items-center gap-2">
                <input 
                  ref={teacherFileInputRef} 
                  type="file" 
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={handleTeacherFileSelect} 
                  className="hidden" 
                />
                <button 
                  onClick={() => teacherFileInputRef.current?.click()} 
                  disabled={teacherSending}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  <Paperclip className="w-4 h-4" />
                  Fichier
                </button>
                <button 
                  onClick={() => { 
                    if (teacherFileInputRef.current) {
                      teacherFileInputRef.current.accept = 'image/*'; 
                      teacherFileInputRef.current.click(); 
                      teacherFileInputRef.current.accept = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"; 
                    } 
                  }} 
                  disabled={teacherSending}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  <Image className="w-4 h-4" /> Image
                </button>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-sm text-gray-600">
                  {selectedTeachers.filter(id => teachers.find(t => t.id === id)?.phone).length} professeur(s) avec téléphone sélectionné(s)
                </span>
                <button
                  onClick={async () => {
                    if (!teacherMessageText.trim() && !teacherMediaFile) {
                      alert('Veuillez saisir un message ou sélectionner un fichier');
                      return;
                    }
                    if (selectedTeachers.length === 0) {
                      alert('Veuillez sélectionner au moins un professeur');
                      return;
                    }
                    
                    const teachersWithPhone = selectedTeachers.filter(id => teachers.find(t => t.id === id)?.phone);
                    if (teachersWithPhone.length === 0) {
                      alert('Aucun professeur sélectionné n\'a de numéro de téléphone');
                      return;
                    }

                    if (!confirm(`Envoyer ce message à ${teachersWithPhone.length} professeur(s) ?`)) {
                      return;
                    }

                    setTeacherSending(true);
                    try {
                      // Upload média si nécessaire
                      let uploadedUrl = teacherMediaUrl;
                      if (teacherMediaFile && !teacherMediaUrl) {
                        uploadedUrl = await uploadTeacherMedia();
                      }
                      
                      const token = await getAuthToken();
                      const res = await fetch(`${apiUrl}/api/admin/teachers/send-credentials-whatsapp`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${token}`,
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          filter: {
                            teacher_ids: teachersWithPhone,
                            filiere: teacherFiliereFilter,
                            classId: teacherClassFilter
                          },
                          message: teacherMessageText,
                          messageType: teacherMessageType,
                          mediaUrl: uploadedUrl || null,
                          fileName: teacherFileName || null
                        })
                      });

                      const data = await res.json();
                      if (res.ok) {
                        alert(`Message envoyé avec succès à ${data.sent || teachersWithPhone.length} professeur(s)`);
                        setTeacherMessageText('');
                        removeTeacherMedia();
                      } else {
                        alert(`Erreur: ${data.error || 'Échec de l\'envoi'}`);
                      }
                    } catch (error) {
                      console.error('Erreur envoi:', error);
                      alert('Erreur lors de l\'envoi du message');
                    } finally {
                      setTeacherSending(false);
                    }
                  }}
                  disabled={teacherSending || teacherUploading || (!teacherMessageText.trim() && !teacherMediaFile) || selectedTeachers.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
                  {teacherSending || teacherUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      {teacherUploading ? 'Upload...' : 'Envoi en cours...'}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Envoyer aux professeurs
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TAB: INBOX ===================== */}
      {activeTab === 'inbox' && (
        <div className="flex flex-1 overflow-hidden min-w-0">
          {/* Sub-tabs */}
          <div className={`w-full lg:w-96 lg:flex-shrink-0 border-r border-gray-200 bg-white flex flex-col ${selectedConv ? 'hidden lg:flex' : 'flex'}`}>
            {/* Stats bar */}
            <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center gap-4 flex-shrink-0">
              <span className="text-[11px] text-gray-600"><strong className="text-gray-900">{conversations.length}</strong> conv.</span>
              <span className="text-[11px] text-green-600"><strong>{inboxTotalSent}</strong> envoyés</span>
              <span className="text-[11px] text-red-500"><strong>{inboxTotalFailed}</strong> échoués</span>
              <div className="ml-auto flex bg-gray-100 rounded p-0.5">
                <button onClick={() => setInboxView('conversations')}
                  className={`px-2 py-1 text-[10px] font-medium rounded ${inboxView === 'conversations' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                  Conv.
                </button>
                <button onClick={() => setInboxView('apiLogs')}
                  className={`px-2 py-1 text-[10px] font-medium rounded ${inboxView === 'apiLogs' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                  Logs
                </button>
              </div>
            </div>

            {inboxView === 'conversations' ? (
              <>
                {/* Search + Filter */}
                <div className="p-3 border-b border-gray-100 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-gray-50" />
                  </div>
                  <div className="flex gap-1">
                    {[{ key: 'all', label: 'Tous' }, { key: 'sent', label: 'Envoyés' }, { key: 'failed', label: 'Échoués' }].map(f => (
                      <button key={f.key} onClick={() => setInboxFilter(f.key)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full ${inboxFilter === f.key ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto">
                  {inboxLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                    </div>
                  ) : filteredConversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <Inbox className="w-12 h-12 text-gray-300 mb-3" />
                      <p className="text-sm text-gray-500 font-medium">Aucune conversation</p>
                      <p className="text-xs text-gray-400 mt-1">Les messages envoyés apparaîtront ici</p>
                    </div>
                  ) : filteredConversations.map(conv => (
                    <button key={conv.phone} onClick={() => setSelectedConv(conv)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selectedConv?.phone === conv.phone ? 'bg-green-50 border-l-2 border-l-green-500' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-semibold text-sm">{conv.parentName ? conv.parentName.charAt(0).toUpperCase() : '#'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-900 truncate">{conv.parentName || conv.phone}</p>
                            <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">{formatDate(conv.lastMessageAt)}</span>
                          </div>
                          {conv.parentName && (
                            <p className="text-[11px] text-gray-400 flex items-center gap-1"><Phone className="w-3 h-3" />{conv.phone}</p>
                          )}
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-gray-500 truncate pr-2 flex items-center gap-1">
                              {conv.messages.length > 0 && conv.messages[conv.messages.length - 1].isAiReport && <Bot className="w-3 h-3 text-purple-500 flex-shrink-0" />}
                              {conv.messages.length > 0 ? (conv.messages[conv.messages.length - 1].isAiReport ? 'Rapport IA quotidien' : (conv.messages[conv.messages.length - 1].content || `[${conv.messages[conv.messages.length - 1].messageType}]`)) : ''}
                            </p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {conv.messages.some(m => m.isAiReport) && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-purple-500"><Bot className="w-3 h-3" /></span>}
                              {conv.totalSent > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-600"><CheckCircle className="w-3 h-3" />{conv.totalSent}</span>}
                              {conv.totalFailed > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-500"><XCircle className="w-3 h-3" />{conv.totalFailed}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              /* API Logs in sidebar */
              <div className="flex-1 overflow-y-auto">
                {apiLogsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  </div>
                ) : apiLogs.length === 0 ? (
                  <div className="text-center py-12"><Inbox className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-xs text-gray-500">Aucun log</p></div>
                ) : (
                  <>
                    {apiLogs.map(log => (
                      <div key={log.id} className="px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-800">{log.to}</p>
                            <p className="text-[11px] text-gray-500 truncate">{log.content || '—'}</p>
                          </div>
                          {statusBadge(log.status)}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 pl-9">{formatFullDate(log.created_at)}</p>
                        {log.failed_reason && <p className="text-[10px] text-red-500 pl-9">{log.failed_reason}</p>}
                      </div>
                    ))}
                    {apiLogsLastPage > 1 && (
                      <div className="px-3 py-2 flex items-center justify-between border-t border-gray-100">
                        <button onClick={() => setApiLogsPage(p => Math.max(1, p - 1))} disabled={apiLogsPage <= 1}
                          className="text-xs text-gray-600 disabled:opacity-50">Préc.</button>
                        <span className="text-[10px] text-gray-500">{apiLogsPage}/{apiLogsLastPage}</span>
                        <button onClick={() => setApiLogsPage(p => Math.min(apiLogsLastPage, p + 1))} disabled={apiLogsPage >= apiLogsLastPage}
                          className="text-xs text-gray-600 disabled:opacity-50">Suiv.</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Message thread */}
          <div className={`flex-1 min-w-0 overflow-hidden flex flex-col bg-[#f0f2f5] ${selectedConv ? 'flex' : 'hidden lg:flex'}`}>
            {selectedConv ? (
              <>
                <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => setSelectedConv(null)} className="lg:hidden p-1 hover:bg-gray-100 rounded">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">{selectedConv.parentName ? selectedConv.parentName.charAt(0).toUpperCase() : '#'}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{selectedConv.parentName || selectedConv.phone}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{selectedConv.phone} · {selectedConv.messageCount} msg</p>
                  </div>
                </div>
                <div className="flex-1 min-w-0 overflow-y-auto px-4 py-4 space-y-3">
                  {selectedConv.messages.map((msg, idx) => {
                    const showDate = idx === 0 || new Date(msg.createdAt).toDateString() !== new Date(selectedConv.messages[idx - 1].createdAt).toDateString();
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="bg-white/80 backdrop-blur-sm text-[11px] text-gray-500 px-3 py-1 rounded-full shadow-sm">
                              {new Date(msg.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-end">
                          <div className={`max-w-[92%] sm:max-w-[80%] lg:max-w-[72%] rounded-lg rounded-tr-none px-3 py-2 shadow-sm ${msg.isComprehensiveReport ? 'bg-[#dbeafe] border border-blue-200' : msg.isAiReport ? 'bg-[#e8e0f3] border border-purple-200' : 'bg-[#d9fdd3]'}`}>
                            {msg.isComprehensiveReport && (
                              <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-blue-200">
                                <FileText className="w-3.5 h-3.5 text-blue-600" />
                                <span className="text-[11px] font-semibold text-blue-700">Rapport complet</span>
                                {msg.studentName && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full ml-auto">{msg.studentName}</span>}
                              </div>
                            )}
                            {msg.isAiReport && (
                              <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-purple-200">
                                <Bot className="w-3.5 h-3.5 text-purple-600" />
                                <span className="text-[11px] font-semibold text-purple-700">Rapport IA quotidien</span>
                                {msg.studentName && <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full ml-auto">{msg.studentName}</span>}
                              </div>
                            )}
                            {msg.messageType !== 'text' && !msg.isAiReport && (
                              <div className="flex items-center gap-1.5 mb-1.5 text-green-700">
                                {msgTypeIcon(msg.messageType)}
                                <span className="text-xs font-medium">{msg.fileName || (msg.messageType === 'image' ? 'Image' : 'Document')}</span>
                              </div>
                            )}
                            {msg.content && <p className="text-[13px] text-gray-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">{msg.content}</p>}
                            {msg.errorMessage && (
                              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{msg.errorMessage}</p>
                            )}
                            <div className="flex items-center justify-end gap-1.5 mt-1">
                              {msg.senderName && <span className={`text-[10px] mr-auto ${msg.isComprehensiveReport ? 'text-blue-500' : msg.isAiReport ? 'text-purple-500' : 'text-gray-500'}`}>{msg.senderName}</span>}
                              <span className="text-[10px] text-gray-500">{new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                              {statusBadge(msg.status)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                {/* Compose bar */}
                <div className="bg-white border-t border-gray-200 flex-shrink-0">
                  {/* File preview */}
                  {directFile && (
                    <div className="px-4 pt-2 pb-0">
                      <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                        {directFilePreview ? (
                          <img src={directFilePreview} alt="preview" className="w-14 h-14 object-cover rounded-md" />
                        ) : (
                          <div className="w-14 h-14 bg-blue-100 rounded-md flex items-center justify-center">
                            <FileText className="w-6 h-6 text-blue-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{directFileName}</p>
                          <p className="text-xs text-gray-500">{directMsgType === 'image' ? 'Image' : 'Document'}</p>
                        </div>
                        <button onClick={removeDirectFile} className="p-1 hover:bg-gray-200 rounded-full">
                          <X className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {directError && (
                    <div className="px-4 pt-2">
                      <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg border border-red-200">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <p className="text-xs text-red-700 flex-1">{directError}</p>
                        <button onClick={() => setDirectError('')} className="p-0.5 hover:bg-red-100 rounded">
                          <X className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Input row */}
                  <div className="px-3 py-2.5 flex items-end gap-2">
                    <input ref={directFileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      onChange={handleDirectFileSelect} className="hidden" />

                    {/* Attach button */}
                    <button
                      onClick={() => directFileRef.current?.click()}
                      disabled={directSending}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full disabled:opacity-50 flex-shrink-0"
                      title="Joindre un fichier"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>

                    {/* Image button */}
                    <button
                      onClick={() => {
                        if (directFileRef.current) {
                          directFileRef.current.accept = 'image/*';
                          directFileRef.current.click();
                          directFileRef.current.accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
                        }
                      }}
                      disabled={directSending}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full disabled:opacity-50 flex-shrink-0"
                      title="Envoyer une image"
                    >
                      <Image className="w-5 h-5" />
                    </button>

                    {/* Text input */}
                    <div className="flex-1 relative">
                      <textarea
                        value={directMsg}
                        onChange={(e) => { setDirectMsg(e.target.value); setDirectError(''); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleDirectSend();
                          }
                        }}
                        placeholder="Tapez un message..."
                        rows={1}
                        className="w-full rounded-2xl border border-gray-300 px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500 max-h-32 overflow-y-auto bg-gray-50"
                        style={{ minHeight: '42px' }}
                      />
                    </div>

                    {/* Send button */}
                    <button
                      onClick={handleDirectSend}
                      disabled={directSending || directUploading || (!directMsg.trim() && !directFile)}
                      className="p-2.5 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-colors"
                      title="Envoyer"
                    >
                      {directSending || directUploading ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                <div className="w-20 h-20 bg-gray-200/50 rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="w-10 h-10 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-600">Sélectionnez une conversation</h3>
                <p className="text-sm text-gray-400 mt-1 max-w-sm">Choisissez un contact pour voir l'historique des messages</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB: REPORTS IA ===================== */}
      {activeTab === 'reports' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Sub-navigation */}
            <div className="flex gap-2">
              {[
                { key: 'settings', label: 'Configuration', icon: Settings },
                { key: 'preview', label: 'Aperçu', icon: Sparkles },
                { key: 'history', label: 'Historique', icon: History }
              ].map(sv => (
                <button key={sv.key} onClick={() => setReportSubView(sv.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    reportSubView === sv.key ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  <sv.icon className="w-4 h-4" />{sv.label}
                </button>
              ))}
            </div>

            {/* Settings sub-view */}
            {reportSubView === 'settings' && (
              <div className="space-y-4">
                {reportSettingsLoading ? (
                  <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>
                ) : reportSettings && (
                  <>
                    {/* Enable/Disable */}
                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                            <Bot className="w-5 h-5 text-green-600" />
                            Rapports quotidiens IA
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">Envoi automatique de rapports journaliers aux parents via WhatsApp, générés par intelligence artificielle.</p>
                        </div>
                        <button onClick={() => updateSetting('enabled', !reportSettings.enabled)}
                          className={`flex-shrink-0 w-12 h-7 rounded-full transition-colors relative ${reportSettings.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                          <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${reportSettings.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                        </button>
                      </div>
                      {reportSettings.enabled && (
                        <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                          <p className="text-sm text-green-800 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Les rapports seront envoyés automatiquement chaque jour à l'heure configurée.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Schedule */}
                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        Heure d'envoi
                      </h3>
                      <div className="flex items-center gap-3">
                        <input type="time" value={reportSettings.send_time || '18:00'}
                          onChange={(e) => updateSetting('send_time', e.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                        <span className="text-sm text-gray-500">(Fuseau horaire: Africa/Casablanca)</span>
                      </div>
                    </div>

                    {/* Language */}
                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-gray-500" />
                        Langue du rapport
                      </h3>
                      <div className="flex gap-2">
                        {[
                          { key: 'fr', label: '🇫🇷 Français' },
                          { key: 'ar', label: '🇲🇦 العربية' },
                          { key: 'both', label: '🇫🇷🇲🇦 Les deux' }
                        ].map(lang => (
                          <button key={lang.key} onClick={() => updateSetting('language', lang.key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                              reportSettings.language === lang.key ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}>
                            {lang.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Content options */}
                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-gray-800 mb-3">Contenu du rapport</h3>
                      <div className="space-y-3">
                        {[
                          { key: 'include_chapter_info', label: 'Chapitres et sujets étudiés', desc: 'Inclure les matières et thèmes abordés dans la journée' },
                          { key: 'include_behavior', label: 'Comportement et discipline', desc: 'Participation, attitude, utilisation du téléphone, etc.' },
                          { key: 'include_homework_status', label: 'Statut des devoirs', desc: 'Devoirs faits ou non, cahier présent, etc.' },
                          { key: 'include_recommendations', label: 'Recommandations pédagogiques', desc: 'Conseils IA personnalisés pour aider l\'élève' },
                          { key: 'include_grades', label: 'Notes et évaluations', desc: 'Inclure les notes des contrôles et mini-évaluations' }
                        ].map(opt => (
                          <div key={opt.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="text-sm font-medium text-gray-700">{opt.label}</p>
                              <p className="text-xs text-gray-500">{opt.desc}</p>
                            </div>
                            <button onClick={() => updateSetting(opt.key, !reportSettings[opt.key])}
                              className={`flex-shrink-0 w-10 h-6 rounded-full transition-colors relative ${reportSettings[opt.key] ? 'bg-green-500' : 'bg-gray-300'}`}>
                              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${reportSettings[opt.key] ? 'translate-x-4' : 'translate-x-0.5'}`}></div>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Save + Trigger */}
                    <div className="flex items-center gap-3">
                      <button onClick={() => saveReportSettings(reportSettings)} disabled={reportSaving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                        {reportSaving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sauvegarde...</> : <><CheckCircle className="w-4 h-4" /> Sauvegarder</>}
                      </button>
                      <button onClick={triggerReports} disabled={reportTriggering}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                        {reportTriggering ? <><RefreshCw className="w-4 h-4 animate-spin" /> Envoi...</> : <><Play className="w-4 h-4" /> Envoyer maintenant</>}
                      </button>
                    </div>

                    {/* Info box */}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
                      <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-2"><Info className="w-4 h-4" /> Comment ça marche ?</h4>
                      <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                        <li>Les professeurs saisissent le suivi quotidien des élèves (présence, participation, discipline, etc.)</li>
                        <li>À l'heure configurée, le système collecte toutes les données de la journée pour chaque élève</li>
                        <li>L'intelligence artificielle analyse les données et génère un rapport bienveillant et structuré</li>
                        <li>Le rapport est envoyé automatiquement aux parents via WhatsApp en français et/ou arabe</li>
                        <li>Le ton est toujours neutre, encourageant et professionnel — jamais accusateur</li>
                      </ol>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Preview sub-view */}
            {reportSubView === 'preview' && (
              <div className="space-y-4">
                {/* Filters card */}
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
                  <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-500" />
                    Rapport complet d'un élève
                  </h3>
                  <p className="text-sm text-gray-500">Sélectionnez un élève et une période pour générer un rapport IA complet avec statistiques, graphiques d'évolution et recommandations.</p>

                  {/* Period filter */}
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-2 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Période</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'today', label: "Aujourd'hui" },
                        { key: '7d', label: '7 derniers jours' },
                        { key: '30d', label: '30 derniers jours' },
                        { key: 'custom', label: 'Personnalisée' }
                      ].map(p => (
                        <button key={p.key} onClick={() => setReportPeriod(p.key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            reportPeriod === p.key ? 'bg-green-100 border-green-300 text-green-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {reportPeriod === 'custom' && (
                      <div className="flex items-center gap-2 mt-2">
                        <input type="date" value={reportCustomStart} onChange={(e) => setReportCustomStart(e.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                        <span className="text-xs text-gray-400">→</span>
                        <input type="date" value={reportCustomEnd} onChange={(e) => setReportCustomEnd(e.target.value)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                      </div>
                    )}
                  </div>

                  {/* Class filter + Student search */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> Classe</label>
                      <select value={reportClassFilter} onChange={(e) => { setReportClassFilter(e.target.value); setReportSelectedStudent(''); }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                        <option value="">Toutes les classes</option>
                        {[...new Set(reportStudents.map(s => s.classes?.name).filter(Boolean))].sort().map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center gap-1"><Search className="w-3.5 h-3.5" /> Rechercher</label>
                      <input type="text" value={reportStudentSearch} onChange={(e) => setReportStudentSearch(e.target.value)}
                        placeholder="Nom ou prénom..."
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Élève</label>
                      <select value={reportSelectedStudent} onChange={(e) => setReportSelectedStudent(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                        <option value="">-- Sélectionner --</option>
                        {reportStudents
                          .filter(s => !reportClassFilter || s.classes?.name === reportClassFilter)
                          .filter(s => !reportStudentSearch || `${s.last_name} ${s.first_name}`.toLowerCase().includes(reportStudentSearch.toLowerCase()))
                          .map(s => (
                            <option key={s.id} value={s.id}>{s.last_name} {s.first_name} {s.classes?.name ? `(${s.classes.name})` : ''}</option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Generate button */}
                  <button onClick={generatePreview} disabled={!reportSelectedStudent || reportPreviewLoading || (reportPeriod === 'custom' && (!reportCustomStart || !reportCustomEnd))}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 text-sm font-medium shadow-sm">
                    {reportPreviewLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Génération en cours (peut prendre 30s)...</> : <><Sparkles className="w-4 h-4" /> Générer le rapport complet</>}
                  </button>
                </div>

                {/* Preview result */}
                {reportPreview && (
                  <>
                    {reportPreview.error ? (
                      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-5 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                        <p className="text-sm text-yellow-800">{reportPreview.error}</p>
                      </div>
                    ) : (
                      <>
                        {/* Action buttons */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <button onClick={sendReportWhatsApp} disabled={reportSending}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium shadow-sm">
                            {reportSending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Envoi...</> : <><Send className="w-4 h-4" /> Envoyer via WhatsApp</>}
                          </button>
                          <button onClick={downloadReportPDF}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm">
                            <Download className="w-4 h-4" /> Télécharger PDF
                          </button>
                          <span className="text-xs text-gray-400 ml-auto">
                            {reportPeriodData?.student && `${reportPeriodData.student.firstName} ${reportPeriodData.student.lastName} — ${reportPeriodData.student.className}`}
                          </span>
                        </div>

                        {/* Stats overview cards */}
                        {reportPeriodData?.overallStats && (
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                            {[
                              { label: 'Séances', value: reportPeriodData.overallStats.totalSessions, icon: BookOpen, color: 'blue' },
                              { label: 'Jours', value: reportPeriodData.overallStats.totalDays, icon: Calendar, color: 'gray' },
                              { label: 'Présence', value: `${reportPeriodData.overallStats.presenceRate ?? '-'}%`, icon: CheckCircle, color: 'green' },
                              { label: 'Participation', value: `${reportPeriodData.overallStats.avgParticipation ?? '-'}/5`, icon: TrendingUp, color: 'purple' },
                              { label: 'Discipline', value: `${reportPeriodData.overallStats.avgDiscipline ?? '-'}/5`, icon: Users, color: 'indigo' },
                              { label: 'Mini-éval', value: `${reportPeriodData.overallStats.avgMiniEval ?? '-'}/10`, icon: BarChart3, color: 'orange' },
                              { label: 'Devoirs', value: `${reportPeriodData.overallStats.homeworkRate ?? '-'}%`, icon: CheckSquare, color: 'teal' },
                            ].map((stat, i) => (
                              <div key={i} className={`rounded-lg border bg-white p-3 shadow-sm`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <stat.icon className={`w-3.5 h-3.5 text-${stat.color}-500`} />
                                  <span className="text-[10px] font-medium text-gray-500 uppercase">{stat.label}</span>
                                </div>
                                <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Difficulty subjects alert */}
                        {reportPeriodData?.overallStats?.difficultySubjects?.length > 0 && (
                          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-orange-800">Matières en difficulté</p>
                              <p className="text-sm text-orange-700 mt-1">{reportPeriodData.overallStats.difficultySubjects.join(', ')}</p>
                            </div>
                          </div>
                        )}

                        {/* Charts */}
                        {reportPeriodData?.dailyEvolution?.length > 1 && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Evolution line chart */}
                            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" /> Évolution quotidienne</h4>
                              <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={reportPeriodData.dailyEvolution.map(d => ({ ...d, date: d.date.substring(5) }))}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} />
                                  <Tooltip contentStyle={{ fontSize: 12 }} />
                                  <Legend wrapperStyle={{ fontSize: 11 }} />
                                  <Line type="monotone" dataKey="presenceRate" name="Présence %" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                                  <Line type="monotone" dataKey="homeworkRate" name="Devoirs %" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Participation & Discipline chart */}
                            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-500" /> Participation & Discipline</h4>
                              <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={reportPeriodData.dailyEvolution.map(d => ({ ...d, date: d.date.substring(5) }))}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} domain={[0, 5]} />
                                  <Tooltip contentStyle={{ fontSize: 12 }} />
                                  <Legend wrapperStyle={{ fontSize: 11 }} />
                                  <Bar dataKey="avgParticipation" name="Participation" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="avgDiscipline" name="Discipline" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {/* Subject radar chart + subject stats table */}
                        {reportPeriodData?.subjectStats && Object.keys(reportPeriodData.subjectStats).length > 0 && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Radar chart */}
                            {Object.keys(reportPeriodData.subjectStats).length >= 3 && (
                              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-500" /> Profil par matière</h4>
                                <ResponsiveContainer width="100%" height={280}>
                                  <RadarChart data={Object.entries(reportPeriodData.subjectStats).map(([name, s]) => ({
                                    subject: name.length > 10 ? name.substring(0, 10) + '...' : name,
                                    participation: s.avgParticipation || 0,
                                    discipline: s.avgDiscipline || 0,
                                    miniEval: s.avgMiniEval ? s.avgMiniEval / 2 : 0,
                                    presence: s.totalTracked > 0 ? (s.presence.present / s.totalTracked) * 5 : 0
                                  }))}>
                                    <PolarGrid />
                                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fontSize: 9 }} />
                                    <Radar name="Participation" dataKey="participation" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} />
                                    <Radar name="Discipline" dataKey="discipline" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
                                    <Radar name="Présence" dataKey="presence" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                  </RadarChart>
                                </ResponsiveContainer>
                              </div>
                            )}

                            {/* Subject stats table */}
                            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm overflow-x-auto">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-blue-500" /> Détails par matière</h4>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-1 font-semibold text-gray-600">Matière</th>
                                    <th className="text-center py-2 px-1 font-semibold text-gray-600">Séances</th>
                                    <th className="text-center py-2 px-1 font-semibold text-gray-600">Présence</th>
                                    <th className="text-center py-2 px-1 font-semibold text-gray-600">Particip.</th>
                                    <th className="text-center py-2 px-1 font-semibold text-gray-600">Discipline</th>
                                    <th className="text-center py-2 px-1 font-semibold text-gray-600">Mini-éval</th>
                                    <th className="text-center py-2 px-1 font-semibold text-gray-600">Devoirs</th>
                                    <th className="text-left py-2 px-1 font-semibold text-gray-600">Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.entries(reportPeriodData.subjectStats).map(([name, s]) => (
                                    <tr key={name} className="border-b border-gray-50 hover:bg-gray-50">
                                      <td className="py-2 px-1 font-medium text-gray-800">{name}</td>
                                      <td className="py-2 px-1 text-center text-gray-600">{s.totalSessions}</td>
                                      <td className="py-2 px-1 text-center">
                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                          s.totalTracked > 0 && (s.presence.present / s.totalTracked) >= 0.8 ? 'bg-green-100 text-green-700' :
                                          s.totalTracked > 0 && (s.presence.present / s.totalTracked) >= 0.5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                        }`}>{s.presence.present}/{s.totalTracked}</span>
                                      </td>
                                      <td className="py-2 px-1 text-center text-gray-600">{s.avgParticipation ?? '-'}</td>
                                      <td className="py-2 px-1 text-center text-gray-600">{s.avgDiscipline ?? '-'}</td>
                                      <td className="py-2 px-1 text-center text-gray-600">{s.avgMiniEval ?? '-'}</td>
                                      <td className="py-2 px-1 text-center text-gray-600">{s.homeworkRate !== null ? `${s.homeworkRate}%` : '-'}</td>
                                      <td className="py-2 px-1 text-gray-600">{s.grades.map(g => `${g.note}/${g.max}`).join(', ') || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {/* Chapters per subject */}
                              <div className="mt-3 space-y-1">
                                {Object.entries(reportPeriodData.subjectStats).filter(([, s]) => s.topics.length > 0).map(([name, s]) => (
                                  <div key={name} className="text-[11px] text-gray-500">
                                    <span className="font-medium text-gray-700">{name}:</span> {s.topics.join(', ')}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Grades detail */}
                        {reportPeriodData?.overallStats?.grades?.length > 0 && (
                          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-orange-500" /> Notes et évaluations</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                              {reportPeriodData.overallStats.grades.map((g, i) => (
                                <div key={i} className={`rounded-lg border p-3 ${g.max > 0 && (g.note / g.max) >= 0.7 ? 'border-green-200 bg-green-50' : g.max > 0 && (g.note / g.max) >= 0.5 ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}`}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-gray-700">{g.subject}</span>
                                    <span className="text-sm font-bold">{g.note}/{g.max}</span>
                                  </div>
                                  <p className="text-[10px] text-gray-500 mt-0.5">{g.topic} — {g.date}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* AI Report text */}
                        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                          <div className="px-5 py-3 bg-green-50 border-b border-green-200 flex items-center gap-2">
                            <Bot className="w-5 h-5 text-green-600" />
                            <span className="text-sm font-semibold text-green-800">Rapport généré par IA</span>
                            <span className="text-xs text-green-600 ml-auto">{reportPeriodData?.period?.startDate} → {reportPeriodData?.period?.endDate}</span>
                          </div>
                          <div className="p-5 space-y-4">
                            {reportPreview.report?.fr && (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">🇫🇷 Version française</h4>
                                <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{reportPreview.report.fr}</div>
                              </div>
                            )}
                            {reportPreview.report?.ar && (
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">🇲🇦 النسخة العربية</h4>
                                <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-800 whitespace-pre-wrap leading-relaxed" dir="rtl">{reportPreview.report.ar}</div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bottom action buttons */}
                        <div className="flex items-center gap-3 pt-2 flex-wrap">
                          <button onClick={sendReportWhatsApp} disabled={reportSending}
                            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium shadow-sm">
                            {reportSending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Envoi...</> : <><Send className="w-4 h-4" /> Envoyer aux parents via WhatsApp</>}
                          </button>
                          <button onClick={downloadReportPDF}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm">
                            <Download className="w-4 h-4" /> Télécharger en PDF
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {/* History sub-view */}
            {reportSubView === 'history' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                    <History className="w-5 h-5 text-gray-500" />
                    Historique des rapports
                  </h3>
                  <div className="flex items-center gap-2">
                    {reportHistory.some(r => r.status === 'failed') && (
                      <button onClick={retryAllFailed} disabled={reportRetryingAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 text-xs font-medium">
                        {reportRetryingAll ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Renvoi en cours...</> : <><Send className="w-3.5 h-3.5" /> Renvoyer tous les échoués</>}
                      </button>
                    )}
                    <input type="date" value={reportHistoryDate} onChange={(e) => { setReportHistoryDate(e.target.value); setReportHistoryPage(1); }}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-green-500" />
                    <button onClick={() => fetchReportHistory(reportHistoryPage)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {reportHistoryLoading ? (
                  <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>
                ) : reportHistory.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Aucun rapport trouvé</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Élève</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Téléphone</th>
                            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Statut</th>
                            <th className="text-right px-4 py-2.5 font-medium text-gray-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {reportHistory.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-medium text-gray-800">{r.studentName}</td>
                              <td className="px-4 py-2.5 text-gray-600">{new Date(r.report_date).toLocaleDateString('fr-FR')}</td>
                              <td className="px-4 py-2.5 text-gray-600">{r.phone_e164 || '—'}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                  r.status === 'sent' ? 'bg-green-100 text-green-700' :
                                  r.status === 'failed' ? 'bg-red-100 text-red-700' :
                                  r.status === 'generated' ? 'bg-blue-100 text-blue-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {r.status === 'sent' ? <><CheckCircle className="w-3 h-3" /> Envoyé</> :
                                   r.status === 'failed' ? <><XCircle className="w-3 h-3" /> Échoué</> :
                                   r.status === 'generated' ? 'Généré' : 'En attente'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {r.status === 'failed' && (
                                    <button onClick={() => retryReport(r.id)} disabled={reportRetrying === r.id}
                                      className="flex items-center gap-1 text-orange-600 hover:text-orange-700 text-xs font-medium disabled:opacity-50">
                                      {reportRetrying === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Renvoyer
                                    </button>
                                  )}
                                  <button onClick={() => setReportViewDetail(r)} className="text-green-600 hover:text-green-700 text-xs font-medium">
                                    <Eye className="w-4 h-4 inline" /> Voir
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {reportHistoryTotal > 20 && (
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <span>{reportHistoryTotal} rapport(s) au total</span>
                        <div className="flex gap-2">
                          <button onClick={() => setReportHistoryPage(p => Math.max(1, p - 1))} disabled={reportHistoryPage <= 1}
                            className="px-3 py-1 border rounded-lg hover:bg-gray-50 disabled:opacity-50">Précédent</button>
                          <span className="px-3 py-1">Page {reportHistoryPage}</span>
                          <button onClick={() => setReportHistoryPage(p => p + 1)} disabled={reportHistory.length < 20}
                            className="px-3 py-1 border rounded-lg hover:bg-gray-50 disabled:opacity-50">Suivant</button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Detail modal */}
                {reportViewDetail && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReportViewDetail(null)}>
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-green-50">
                        <div className="flex items-center gap-2">
                          <Bot className="w-5 h-5 text-green-600" />
                          <span className="font-semibold text-green-800">Rapport — {reportViewDetail.studentName}</span>
                        </div>
                        <button onClick={() => setReportViewDetail(null)} className="p-1 hover:bg-green-100 rounded-full">
                          <X className="w-5 h-5 text-gray-500" />
                        </button>
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Date: {new Date(reportViewDetail.report_date).toLocaleDateString('fr-FR')}</span>
                          <span>Tél: {reportViewDetail.phone_e164 || '—'}</span>
                          <span className={`font-medium ${reportViewDetail.status === 'sent' ? 'text-green-600' : 'text-red-600'}`}>
                            {reportViewDetail.status === 'sent' ? '✓ Envoyé' : '✗ ' + (reportViewDetail.error_message || 'Échoué')}
                          </span>
                        </div>
                        {reportViewDetail.report_content_fr && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">🇫🇷 Français</h4>
                            <div className="p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap leading-relaxed">{reportViewDetail.report_content_fr}</div>
                          </div>
                        )}
                        {reportViewDetail.report_content_ar && (
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">🇲🇦 العربية</h4>
                            <div className="p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap leading-relaxed" dir="rtl">{reportViewDetail.report_content_ar}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB: CONNECTION ===================== */}
      {activeTab === 'connection' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Status Card */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-800">Statut de la session</h2>
                <button onClick={fetchStatus} disabled={connLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                  <RefreshCw className={`w-4 h-4 ${connLoading ? 'animate-spin' : ''}`} /> Actualiser
                </button>
              </div>

              {connLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
              ) : sessionStatus?.status === 'no_session' ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-gray-500 text-sm">Aucune session WhatsApp trouvée.</p>
                  <button onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                    <Plus className="w-4 h-4" /> Créer une session
                  </button>
                </div>
              ) : sessionStatus ? (
                <div className="space-y-4">
                  <div className={`flex items-center gap-3 p-4 rounded-lg ${sessionStatus.connected ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    {sessionStatus.connected ? (
                      <><Wifi className="w-8 h-8 text-green-600" /><div><p className="font-semibold text-green-800">Connecté</p><p className="text-sm text-green-700">Session active et prête.</p></div></>
                    ) : (
                      <><WifiOff className="w-8 h-8 text-red-600" /><div><p className="font-semibold text-red-800">Déconnecté</p><p className="text-sm text-red-700">{sessionStatus.error || 'Scannez le QR code ci-dessous.'}</p></div></>
                    )}
                  </div>
                  {sessionStatus.session && (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500 font-medium">Nom</p><p className="text-gray-800 font-medium">{sessionStatus.session.name || '—'}</p></div>
                        <div className="p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500 font-medium">Numéro</p><p className="text-gray-800 font-medium">{sessionStatus.session.phone || '—'}</p></div>
                        <div className="p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500 font-medium">ID</p><p className="text-gray-800 font-medium text-xs">{sessionStatus.session.id || '—'}</p></div>
                        <div className="p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500 font-medium">Statut</p><p className="text-gray-800 font-medium">{sessionStatus.session.status || '—'}</p></div>
                      </div>
                      <div className="pt-2 border-t border-gray-100">
                        {confirmDelete ? (
                          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                            <p className="text-sm text-red-800 flex-1">Supprimer cette session ?</p>
                            <button onClick={handleDeleteSession} disabled={deleting}
                              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                              {deleting ? 'Suppression...' : 'Confirmer'}
                            </button>
                            <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDelete(true)}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                            <Trash2 className="w-4 h-4" /> Supprimer la session
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Impossible de récupérer le statut.</p>
              )}
            </div>

            {/* Create Session Form */}
            {showCreateForm && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-6 shadow-sm space-y-4">
                <h2 className="text-base font-semibold text-green-900 flex items-center gap-2"><Plus className="w-5 h-5" /> Nouvelle session</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Nom *</label>
                    <input type="text" value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)}
                      placeholder="Ex: Suivi étudiants" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Téléphone * (international)</label>
                    <input type="text" value={newSessionPhone} onChange={(e) => setNewSessionPhone(e.target.value)}
                      placeholder="Ex: +212600000000" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
                {createError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-600" /><p className="text-sm text-red-800">{createError}</p>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button onClick={handleCreateSession} disabled={creating}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                    {creating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Création...</> : <><Plus className="w-4 h-4" /> Créer</>}
                  </button>
                  <button onClick={() => { setShowCreateForm(false); setCreateError(''); }}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
                </div>
              </div>
            )}

            {/* QR Code */}
            {sessionStatus && !sessionStatus.connected && sessionStatus.session && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2"><QrCode className="w-5 h-5" /> Scanner le QR Code</h2>
                  <button onClick={fetchQR} disabled={qrLoading}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${qrLoading ? 'animate-spin' : ''}`} /> {qrCode ? 'Rafraîchir' : 'Obtenir le QR'}
                  </button>
                </div>
                {qrLoading ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>
                ) : qrCode ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-white border-2 border-gray-200 rounded-xl"><img src={qrCode} alt="QR Code" className="w-64 h-64" /></div>
                    <div className="text-center">
                      <p className="text-sm text-gray-700 font-medium">Scannez avec WhatsApp</p>
                      <p className="text-xs text-gray-500 mt-1">Menu (⋮) → Appareils connectés → Connecter</p>
                    </div>
                  </div>
                ) : qrError ? (
                  <div className="flex items-center gap-2 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <AlertCircle className="w-5 h-5 text-yellow-600" /><p className="text-sm text-yellow-800">{qrError}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">Cliquez sur "Obtenir le QR" pour afficher le code.</p>
                )}
              </div>
            )}

            {/* Instructions */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2"><Info className="w-4 h-4" /> Comment connecter WhatsApp</h3>
              <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
                <li>Cliquez sur <strong>"Créer une session"</strong> ci-dessus et renseignez le nom et le numéro WhatsApp de votre école</li>
                <li>Cliquez sur <strong>"Obtenir le QR"</strong> pour afficher le code QR de connexion</li>
                <li>Ouvrez <strong>WhatsApp</strong> sur votre téléphone → Menu (⋮) → <strong>Appareils connectés</strong> → Connecter un appareil</li>
                <li>Scannez le <strong>QR code</strong> affiché sur cette page avec votre téléphone</li>
                <li>Une fois connecté, les messages seront envoyés automatiquement aux parents</li>
              </ol>
            </div>

            {sessionStatus?.connected && (
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">Tout est prêt !</p>
                  <p className="text-sm text-green-700">Allez dans l'onglet "Envoyer" pour envoyer des messages.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailMessage(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-semibold">Détails du message</h3>
              <button onClick={() => setDetailMessage(null)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {detailMessage.message && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1">Message</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded">{detailMessage.message.content}</p>
                  {detailMessage.message.media_url && (
                    <p className="text-xs text-blue-600 mt-1">Média : {detailMessage.message.file_name || detailMessage.message.message_type}</p>
                  )}
                  <div className="flex gap-3 mt-2 text-xs text-gray-500">
                    <span>{formatFullDate(detailMessage.message.created_at)}</span>
                    {statusBadge(detailMessage.message.status)}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Destinataires ({detailMessage.recipients?.length || 0})</p>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {(detailMessage.recipients || []).map(r => (
                    <div key={r.id} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-sm">
                      <div>
                        <span className="text-gray-700">{r.phone_e164}</span>
                        {r.parent && <span className="text-gray-500 ml-2 text-xs">({r.parent.first_name} {r.parent.last_name})</span>}
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

export default WhatsAppPage;
