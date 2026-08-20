import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { sameYear } from '../../lib/schoolYear';
import { saveBlob } from '../../lib/download';
import EngagementDashboard from './communication/EngagementDashboard';
import ChatbotDocsPage from './communication/ChatbotDocsPage';
import ChatbotAccessPage from './ChatbotAccessPage';
import SchoolShowcasePage from './communication/SchoolShowcasePage';
import {
  MessageSquare, Send, Paperclip, Image, FileText, Users, CheckSquare,
  ChevronDown, X, Clock, CheckCircle, AlertCircle, RefreshCw, Eye,
  Smartphone, Wifi, WifiOff, QrCode, Info, Plus, Trash2,
  Search, Phone, XCircle, Inbox, ArrowUpRight, ArrowDownLeft, ArrowLeft,
  Bot, Sparkles,
  Download, Calendar, Filter, TrendingUp, BarChart3, BookOpen, Building2, Shield
} from 'lucide-react';
import QRCode from 'qrcode';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

// Rôles qui utilisent le hub /communication (onglets pilotés par l'URL +
// DomainTabs). Les autres rôles (finance, transport) restent sur /whatsapp
// avec la barre d'onglets interne.
const ADMIN_HUB_ROLES = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'];

const WhatsAppPage = () => {
  const { profile } = useAuth();
  const { year } = useYear(); // année active : scope les classes/destinataires
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const location = useLocation();
  const navigate = useNavigate();
  const { tab: routeTab } = useParams();
  const isHub = location.pathname.startsWith('/communication');
  const [localTab, setLocalTab] = useState('send');
  const activeTab = isHub ? (routeTab || 'send') : localTab;
  const setActiveTab = (key) => { if (isHub) navigate(`/communication/${key}`); else setLocalTab(key); };

  // Ancienne URL /whatsapp → hub pour les rôles admin (liens/favoris existants)
  useEffect(() => {
    if (!isHub && ADMIN_HUB_ROLES.includes(profile?.role)) {
      navigate('/communication/send', { replace: true });
    }
  }, [isHub, profile?.role, navigate]);

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
  // Canal d'envoi : 'push' (app), 'whatsapp', 'both' (portée maximale)
  const [sendChannels, setSendChannels] = useState('both');
  const [parentCount, setParentCount] = useState(0); // parents ciblés (canal app, même sans n° WhatsApp)
  // Catégorie du message (boîte cible)
  const [messageCategory, setMessageCategory] = useState(() => {
    const r = profile?.role;
    if (r === 'finance_manager') return 'financial';
    if (r === 'transport_manager') return 'transport';
    if (r === 'pedagogical_manager' || r === 'pedagogical_director') return 'pedagogical';
    return 'general';
  });
  // Filtre catégorie pour la lecture (admin uniquement)
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('all');
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
  const [showResend, setShowResend] = useState(false); // panneau « Renvoyer »
  const [resendCriteria, setResendCriteria] = useState({ unread: true, unresponded: false, undelivered: false });
  const [resendChannel, setResendChannel] = useState('app'); // app | whatsapp | both
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [resendSelected, setResendSelected] = useState(new Set()); // ids destinataires cochés
  const [resendSearch, setResendSearch] = useState('');
  const [availableLevels, setAvailableLevels] = useState([]);

  // Parent selection
  const [parentSelectionMode, setParentSelectionMode] = useState('all'); // 'all' | 'select'
  const [parentsList, setParentsList] = useState([]);
  const [selectedParents, setSelectedParents] = useState([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const parentDropdownRef = useRef(null);

  // ===================== TAB: TEACHERS =====================
  const [teachers, setTeachers] = useState([]);
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [teacherSubjectFilter, setTeacherSubjectFilter] = useState('');
  const [teacherClassFilter, setTeacherClassFilter] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [teacherSubjects, setTeacherSubjects] = useState({});
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
  // Contact à ouvrir dans la boîte de réception depuis un autre onglet
  // (clic sur une ligne du dashboard d'engagement) : { phone, parentId, name }
  const [pendingConv, setPendingConv] = useState(null);
  const [convFetchedAt, setConvFetchedAt] = useState(0);
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
  // true quand des credentials existent mais sont refusés par WhatsApp :
  // aucun QR ne sortira tant qu'ils ne sont pas purgés (réappairage).
  const [qrNeedsRepair, setQrNeedsRepair] = useState(false);
  // Une seule demande automatique de QR par épisode de déconnexion.
  const qrAutoRequestedRef = useRef(false);
  // Chargement du RÉAPPAIRAGE seul : « Régénérer le QR » ne doit pas être
  // désactivé par une requête de QR ordinaire, c'est la porte de sortie.
  const [qrRepairing, setQrRepairing] = useState(false);
  const lastQrSrcRef = useRef(null); // dernière source QR affichée (anti-clignotement)
  // Connexion par code (alternative au QR, utile sur iPhone)
  const [showPairing, setShowPairing] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionPhone, setNewSessionPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  // Onboarding Cloud API (numéro officiel Meta)
  const [cloudCC, setCloudCC] = useState('212');
  const [cloudPhone, setCloudPhone] = useState('');
  const [cloudName, setCloudName] = useState('');
  const [cloudMethod, setCloudMethod] = useState('SMS');
  const [cloudStep, setCloudStep] = useState('form'); // form | code | done
  const [cloudCode, setCloudCode] = useState('');
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [cloudPin, setCloudPin] = useState(null);
  // Ancien flux Baileys (QR) masqué par défaut au profit du Cloud
  const [showLegacy, setShowLegacy] = useState(false);

  // ===================== TAB: PLANNING (communications) =====================
  const [comms, setComms] = useState([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [showCommForm, setShowCommForm] = useState(false); // ouvre la fenêtre de planification
  const [commForm, setCommForm] = useState({
    title: '', body: '', type: 'normal', deadline_date: '',
    attachment_url: '', attachment_name: '', scheduled_at: '', send_now: false,
    personalize: false,
  });
  const [commClassIds, setCommClassIds] = useState([]); // [] = toute l'école
  const [commSaving, setCommSaving] = useState(false);
  const [commError, setCommError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Canal + pièce jointe importée + ciblage parents du planificateur
  const [commChannels, setCommChannels] = useState('both');
  const [commMediaFile, setCommMediaFile] = useState(null);
  const [commMediaPreview, setCommMediaPreview] = useState(null);
  const [commUploading, setCommUploading] = useState(false);
  const commFileInputRef = useRef(null);
  const [commClassDropdownOpen, setCommClassDropdownOpen] = useState(false);
  const commClassDropdownRef = useRef(null);
  const [commParentMode, setCommParentMode] = useState('all'); // 'all' | 'select'
  const [commParentsList, setCommParentsList] = useState([]);
  const [commSelectedParents, setCommSelectedParents] = useState([]);
  const [commLoadingParents, setCommLoadingParents] = useState(false);
  const [commParentSearch, setCommParentSearch] = useState('');
  const [commRecipientCount, setCommRecipientCount] = useState(null);

  // ===================== TAB: REPORTS IA =====================
  const [reportStudents, setReportStudents] = useState([]);
  const [reportSelectedStudent, setReportSelectedStudent] = useState('');
  const [reportPreview, setReportPreview] = useState(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('7d');
  const [reportCustomStart, setReportCustomStart] = useState('');
  const [reportCustomEnd, setReportCustomEnd] = useState('');
  const [reportClassFilter, setReportClassFilter] = useState('');
  const [reportStudentSearch, setReportStudentSearch] = useState('');

  // Recherche élève robuste :
  //  - insensible aux accents (NFD)
  //  - insensible à la casse
  //  - multi-tokens (chaque mot doit matcher quelque part dans prénom/nom/classe)
  //  - ordre des mots libre ("reda benjelloun" matche "Benjelloun Reda")
  const normalizeSearch = (s) => (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const filteredReportStudents = useMemo(() => {
    const tokens = normalizeSearch(reportStudentSearch).split(' ').filter(Boolean);
    return reportStudents
      .filter(s => !reportClassFilter || s.classes?.name === reportClassFilter)
      .filter(s => {
        if (tokens.length === 0) return true;
        const hay = normalizeSearch(`${s.first_name} ${s.last_name} ${s.classes?.name || ''}`);
        return tokens.every(t => hay.includes(t));
      });
  }, [reportStudents, reportClassFilter, reportStudentSearch]);
  const [reportSending, setReportSending] = useState(false);
  const [reportPeriodData, setReportPeriodData] = useState(null);

  // ===================== SHARED EFFECTS =====================
  useEffect(() => {
    const handleClick = (e) => {
      if (classDropdownRef.current && !classDropdownRef.current.contains(e.target)) {
        setClassDropdownOpen(false);
      }
      if (parentDropdownRef.current && !parentDropdownRef.current.contains(e.target)) {
        setParentDropdownOpen(false);
      }
      if (commClassDropdownRef.current && !commClassDropdownRef.current.contains(e.target)) {
        setCommClassDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch parents list when classes change and mode is 'select'
  const fetchParentsList = useCallback(async () => {
    if (parentSelectionMode !== 'select') {
      setParentsList([]);
      return;
    }
    setLoadingParents(true);
    try {
      const token = await getAuthToken();
      const params = new URLSearchParams();
      // On ne transmet class_ids que si c'est un sous-ensemble : quand toutes
      // les classes sont sélectionnées, on laisse le backend se baser sur les
      // inscriptions actives (profiles.class_id peut être périmé après promotion).
      if (selectedClasses.length > 0 && selectedClasses.length < classes.length) {
        params.append('class_ids', selectedClasses.join(','));
      }
      if (year) params.append('academic_year', year);
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/recipients-list?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setParentsList(data.parents || []);
      // By default select all parents (sélection par parent_id : inclut les
      // parents sans WhatsApp, joignables par le canal app)
      setSelectedParents((data.parents || []).map(p => p.parent_id));
    } catch (error) {
      console.error('Erreur chargement parents:', error);
    } finally {
      setLoadingParents(false);
    }
  }, [apiUrl, selectedClasses, classes.length, parentSelectionMode, year]);

  useEffect(() => {
    fetchParentsList();
  }, [fetchParentsList]);

  // Load classes and teachers on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getAuthToken();
        // Les non-admins n'ont pas accès à /api/admin/* — on utilise les endpoints proxy du router whatsapp
        const isAdminUser = profile?.role === 'admin' || profile?.role === 'school_admin';
        const baseRead = isAdminUser ? `${apiUrl}/api/admin` : `${apiUrl}/api/admin/whatsapp`;
        const [classesRes, teachersRes, subjectsRes] = await Promise.all([
          fetch(`${baseRead}/classes`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${baseRead}/teachers`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${baseRead}/subjects`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        const classesData = await classesRes.json();
        const teachersData = await teachersRes.json();
        const subjectsData = await subjectsRes.json();
        
        // Seules les classes de l'année active (les classes des années passées
        // ne doivent plus servir de cible d'envoi).
        const allCls = Array.isArray(classesData) ? classesData : [];
        // Comparaison tolérante slash/tiret : les classes sont stockées en
        // "YYYY-YYYY" tandis que le sélecteur d'année est en "YYYY/YYYY" — un ===
        // strict masquait toutes les classes et vidait la liste des destinataires
        // (aucun parent récupéré, notamment ceux des élèves réinscrits).
        const cls = year ? allCls.filter(c => !c.academic_year || sameYear(c.academic_year, year)) : allCls;
        setClasses(cls);
        setSelectedClasses(cls.map(c => c.id));
        const levels = [...new Set(cls.map(c => c.level).filter(Boolean))].sort();
        setAvailableLevels(levels);
        
        const tchs = Array.isArray(teachersData) ? teachersData : [];
        setTeachers(tchs);
        setSelectedTeachers(tchs.map(t => t.id));
        
        const subs = Array.isArray(subjectsData) ? subjectsData : [];
        setSubjects(subs);
        
        // Charger les matières pour chaque professeur
        for (const teacher of tchs) {
          try {
            const res = await fetch(`${baseRead}/teachers/${teacher.id}/subjects`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setTeacherSubjects(prev => ({
              ...prev,
              [teacher.id]: Array.isArray(data) ? data : []
            }));
          } catch (err) {
            console.error(`Erreur chargement matières prof ${teacher.id}:`, err);
          }
        }
      } catch (error) {
        console.error('Erreur chargement données:', error);
      }
    };
    loadData();
  }, [apiUrl, year]);

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
      if (year) params.append('academic_year', year);
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/recipients?${params}`, {
        headers: { Authorization: `Bearer ${await getAuthToken()}` }
      });
      const data = await res.json();
      setRecipientCount(data.count || 0);
      setParentCount(data.parentCount ?? data.count ?? 0);
    } catch (error) {
      console.error('Erreur comptage:', error);
    } finally {
      setLoadingRecipients(false);
    }
  }, [apiUrl, selectedClasses, classes.length, schoolTypeFilter, levelFilter, year]);

  useEffect(() => {
    fetchRecipientCount();
  }, [fetchRecipientCount]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const token = await getAuthToken();
      const catQ = historyCategoryFilter !== 'all' ? `&category=${historyCategoryFilter}` : '';
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/history?page=${historyPage}&limit=10${catQ}`, {
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
  }, [apiUrl, historyPage, historyCategoryFilter]);

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

  // Nombre affiché : en mode sélection = parents cochés ; sinon selon canal
  // (WhatsApp seul → numéros uniques ; app/both → tous les parents ciblés).
  const effectiveRecipientCount = parentSelectionMode === 'select'
    ? selectedParents.length
    : (sendChannels === 'whatsapp' ? recipientCount : Math.max(parentCount, recipientCount));

  const handleSend = async () => {
    if (!messageText && !mediaFile) return;
    if (effectiveRecipientCount === 0) return;
    setSending(true);
    setSendProgress({ total: effectiveRecipientCount, sent: 0, failed: 0, status: 'sending' });
    try {
      let uploadedUrl = mediaUrl;
      if (mediaFile && !mediaUrl) uploadedUrl = await uploadMedia();
      const token = await getAuthToken();
      const filter = {};
      if (selectedClasses.length > 0 && selectedClasses.length < classes.length) filter.class_ids = selectedClasses;
      if (schoolTypeFilter) filter.school_type = schoolTypeFilter;
      if (levelFilter) filter.level = levelFilter;
      if (year) filter.academic_year = year; // seuls les élèves inscrits dans l'année active
      // Sélection explicite de parents (par id : inclut ceux sans WhatsApp)
      if (parentSelectionMode === 'select' && selectedParents.length > 0) {
        filter.parent_ids = selectedParents;
      }
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, type: messageType, mediaUrl: uploadedUrl || null, fileName: fileName || null, filter, category: messageCategory, channels: sendChannels })
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
      // Réinitialise le panneau « Renvoyer » à l'ouverture d'un détail
      setShowResend(false); setResendMsg('');
      setResendCriteria({ unread: true, unresponded: false, undelivered: false });
      setResendChannel('app');
    } catch (error) { console.error('Erreur détails:', error); }
  };

  // Destinataires correspondant aux critères de renvoi + canal (liste cochable).
  const resendMatchList = (recs) => {
    const crit = resendCriteria;
    if (!crit.unread && !crit.unresponded && !crit.undelivered) return [];
    let matched = (recs || []).filter(r =>
      (crit.unread && !r.read_at) ||
      (crit.unresponded && !r.responded_at) ||
      (crit.undelivered && r.status !== 'sent'));
    if (resendChannel === 'app') matched = matched.filter(r => r.parent_id);
    if (resendChannel === 'whatsapp') {
      const seen = new Set();
      matched = matched.filter(r => r.phone_e164 && !seen.has(r.phone_e164) && seen.add(r.phone_e164));
    }
    return matched;
  };

  // À chaque changement de critères / canal / message : coche tous les correspondants.
  useEffect(() => {
    if (!detailMessage) return;
    setResendSelected(new Set(resendMatchList(detailMessage.recipients).map(r => r.id)));
    setResendSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resendCriteria, resendChannel, detailMessage]);

  const toggleResendPick = (id) => setResendSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submitResend = async () => {
    if (!detailMessage?.message?.id) return;
    const criteria = Object.entries(resendCriteria).filter(([, v]) => v).map(([k]) => k);
    if (!criteria.length) { setResendMsg('Choisissez au moins un critère.'); return; }
    const recipient_ids = [...resendSelected];
    if (!recipient_ids.length) { setResendMsg('Sélectionnez au moins un destinataire.'); return; }
    setResendBusy(true); setResendMsg('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/messages/${detailMessage.message.id}/resend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria, channel: resendChannel, recipient_ids }),
      });
      const data = await res.json();
      if (data.success) {
        setResendMsg(`✓ Renvoi lancé à ${data.totalRecipients} destinataire(s).`);
        setShowResend(false);
        if (activeTab === 'planning') fetchComms();
      } else setResendMsg(data.error || 'Erreur lors du renvoi.');
    } catch (e) {
      setResendMsg('Erreur de connexion au serveur.');
    } finally { setResendBusy(false); }
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
    finally { setInboxLoading(false); setConvFetchedAt(Date.now()); }
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

  // Rafraîchissement automatique : les réponses des parents/professeurs
  // arrivent en continu, l'onglet ne doit pas rester figé.
  useEffect(() => {
    if (activeTab !== 'inbox' || inboxView !== 'conversations') return;
    const id = setInterval(fetchConversations, 30000);
    return () => clearInterval(id);
  }, [activeTab, inboxView, fetchConversations]);

  // Après un rechargement, la conversation ouverte doit refléter les nouveaux
  // messages (sinon on garde le fil figé au moment du clic).
  useEffect(() => {
    if (!selectedConv || conversations.length === 0) return;
    const fresh = conversations.find(c => c.phone === selectedConv.phone);
    if (fresh && fresh.messageCount !== selectedConv.messageCount) setSelectedConv(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  // ── Ouverture d'une conversation depuis un autre onglet (dashboard) ────────
  // On compare sur les 9 derniers chiffres : les numéros sont stockés tantôt
  // en +212…, tantôt en 06…
  const phoneTail = (p) => (p || '').replace(/\D/g, '').slice(-9);

  const openConversation = useCallback((contact) => {
    // `requestedAt` : la sélection n'est résolue qu'une fois qu'un chargement
    // POSTÉRIEUR au clic est terminé, sinon on ouvrirait un fil vide alors que
    // l'historique n'est pas encore arrivé.
    setPendingConv({ ...contact, requestedAt: Date.now() });
    setSelectedConv(null);
    setActiveTab('inbox');
    setInboxView('conversations');
    setInboxFilter('all');
    setSearchQuery('');
    fetchConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHub, fetchConversations]);

  useEffect(() => {
    if (!pendingConv || activeTab !== 'inbox') return;
    if (inboxLoading || convFetchedAt < pendingConv.requestedAt) return;
    const tail = phoneTail(pendingConv.phone);
    const match = conversations.find(c =>
      (pendingConv.parentId && c.parentId === pendingConv.parentId) ||
      (tail.length === 9 && phoneTail(c.phone) === tail)
    );
    if (match) {
      setSelectedConv(match);
    } else if (pendingConv.phone) {
      // Aucun historique : on ouvre un fil vide pour pouvoir écrire quand même.
      setSelectedConv({
        phone: pendingConv.phone,
        parentName: pendingConv.name || null,
        parentId: pendingConv.parentId || null,
        contactRole: 'parent',
        messages: [], messageCount: 0,
        totalSent: 0, totalFailed: 0, totalReceived: 0,
      });
    } else {
      setSearchQuery(pendingConv.name || '');
    }
    setPendingConv(null);
  }, [pendingConv, activeTab, inboxLoading, convFetchedAt, conversations]);

  useEffect(() => {
    if (selectedConv && messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv]);

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = !searchQuery ||
      (conv.parentName && conv.parentName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      conv.phone.includes(searchQuery);
    const matchesFilter = inboxFilter === 'all' ||
      (inboxFilter === 'awaiting' && conv.awaitingReply) ||
      (inboxFilter === 'received' && conv.totalReceived > 0) ||
      (inboxFilter === 'sent' && conv.totalSent > 0) ||
      (inboxFilter === 'failed' && conv.totalFailed > 0);
    return matchesSearch && matchesFilter;
  });

  const awaitingCount = conversations.filter(c => c.awaitingReply).length;

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
  // QR du mode démo commercial (wa.me + mot-clé). null = école sans config
  // démo (cas normal : la carte ne s'affiche pas).
  const [demoQr, setDemoQr] = useState(null);
  const fetchDemoQr = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/demo-parent-qr`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 404) { setDemoQr(null); return; }
      const data = await res.json();
      setDemoQr(data);
    } catch { setDemoQr(null); }
  }, [apiUrl]);

  // silent=true (polling auto) → ne déclenche PAS le spinner plein écran de la
  // section (sinon la partie connexion « se recharge » toutes les 2s et masque le QR).
  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setConnLoading(true);
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
    } finally { if (!silent) setConnLoading(false); }
  }, [apiUrl]);

  useEffect(() => {
    if (activeTab === 'connection') { fetchStatus(); fetchDemoQr(); }
  }, [activeTab, fetchStatus, fetchDemoQr]);

  // Statut de session dès l'arrivée (pill d'en-tête + avertissement du
  // sélecteur de canal), sans spinner.
  useEffect(() => { fetchStatus(true); }, [fetchStatus]);

  // Onboarding Cloud API : ajoute le numéro + envoie le code de vérification
  const handleCloudAddNumber = async () => {
    if (!cloudPhone || !cloudName) { setCloudError('Numéro et nom affiché requis'); return; }
    setCloudLoading(true); setCloudError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/cloud/add-number`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cc: cloudCC, phone: cloudPhone, verified_name: cloudName, code_method: cloudMethod }),
      });
      const data = await res.json();
      if (data.success) setCloudStep('code');
      else setCloudError(data.error || 'Erreur lors de l\'ajout du numéro');
    } catch (e) {
      console.error('Erreur cloud add:', e);
      setCloudError('Erreur de connexion au serveur');
    } finally { setCloudLoading(false); }
  };

  // Onboarding Cloud API : vérifie le code reçu et active le numéro
  const handleCloudVerify = async () => {
    if (!cloudCode) { setCloudError('Code requis'); return; }
    setCloudLoading(true); setCloudError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/cloud/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: cloudCode }),
      });
      const data = await res.json();
      if (data.success) { setCloudPin(data.pin || null); setCloudStep('done'); fetchStatus(); }
      else setCloudError(data.error || 'Vérification échouée');
    } catch (e) {
      console.error('Erreur cloud verify:', e);
      setCloudError('Erreur de connexion au serveur');
    } finally { setCloudLoading(false); }
  };

  const isCloudConnected = sessionStatus?.provider === 'cloud' && sessionStatus?.connected;

  // ===================== PLANNING LOGIC =====================
  const fetchComms = useCallback(async () => {
    setCommsLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/communications`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setComms(data.communications || []);
    } catch (e) {
      console.error('Erreur fetch communications:', e);
    } finally { setCommsLoading(false); }
  }, [apiUrl]);

  useEffect(() => { if (activeTab === 'planning') fetchComms(); }, [activeTab, fetchComms]);

  // Agrégats « vue d'ensemble » des communications (bandeau KPI du planificateur).
  const commStats = useMemo(() => {
    const now = Date.now();
    const d = new Date();
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    let targeted = 0, delivered = 0, read = 0, readApp = 0, readWa = 0, responded = 0, failed = 0;
    let upcoming = 0, sending = 0, sentThisMonth = 0, sentTotal = 0;
    comms.forEach((c) => {
      const at = new Date(c.scheduled_at).getTime();
      if (c.status === 'scheduled' && at > now) upcoming++;
      if (c.status === 'sending') sending++;
      if (c.status === 'sent') { sentTotal++; if (at >= monthStart) sentThisMonth++; }
      failed += c.failed_count || 0;
      if (c.metrics) {
        targeted += c.metrics.targeted || 0;
        delivered += c.metrics.sent || 0;
        read += c.metrics.read || 0;
        readApp += c.metrics.readApp || 0;
        readWa += c.metrics.readWa || 0;
        responded += c.metrics.responded || 0;
      } else if (c.status === 'sent') {
        // Repli sur les compteurs bruts si le tracking détaillé est absent
        targeted += c.total_recipients || c.sent_count || 0;
        delivered += c.sent_count || 0;
      }
    });
    const pct = (n, den) => (den > 0 ? Math.round((n / den) * 100) : 0);
    return {
      targeted, delivered, read, readApp, readWa, responded, failed,
      upcoming, sending, sentThisMonth, sentTotal,
      deliveryRate: pct(delivered, targeted),
      readRate: pct(read, delivered),
      responseRate: pct(responded, delivered),
    };
  }, [comms]);

  // Sélection d'un fichier à joindre (image ou document) pour le planificateur
  const handleCommFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCommMediaFile(file);
    setCommForm((f) => ({ ...f, attachment_name: file.name }));
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setCommMediaPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setCommMediaPreview(null);
    }
  };
  const removeCommMedia = () => {
    setCommMediaFile(null); setCommMediaPreview(null);
    setCommForm((f) => ({ ...f, attachment_url: '', attachment_name: '' }));
    if (commFileInputRef.current) commFileInputRef.current.value = '';
  };
  // Upload du fichier joint → renvoie { url, type }
  const uploadCommMedia = async () => {
    if (!commMediaFile) return { url: commForm.attachment_url || null, type: null };
    const token = await getAuthToken();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const res = await fetch(`${apiUrl}/api/admin/whatsapp/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64: ev.target.result, mimetype: commMediaFile.type }),
          });
          const data = await res.json();
          if (data.success && data.publicUrl) {
            resolve({ url: data.publicUrl, type: commMediaFile.type.startsWith('image/') ? 'image' : 'document' });
          } else reject(new Error(data.error || 'Erreur upload'));
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Erreur lecture'));
      reader.readAsDataURL(commMediaFile);
    });
  };

  // Liste des parents pour le ciblage (mode « sélectionner »)
  const fetchCommParents = useCallback(async () => {
    if (commParentMode !== 'select') { setCommParentsList([]); return; }
    setCommLoadingParents(true);
    try {
      const token = await getAuthToken();
      const params = new URLSearchParams();
      if (commClassIds.length > 0 && commClassIds.length < classes.length) {
        params.append('class_ids', commClassIds.join(','));
      }
      if (year) params.append('academic_year', year);
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/recipients-list?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCommParentsList(data.parents || []);
      setCommSelectedParents((data.parents || []).map((p) => p.parent_id));
    } catch (e) { console.error('Erreur parents comm:', e); }
    finally { setCommLoadingParents(false); }
  }, [apiUrl, commParentMode, commClassIds, classes.length, year]);

  useEffect(() => { fetchCommParents(); }, [fetchCommParents]);

  // Compteur de destinataires (mode « tous ») selon les classes choisies
  const fetchCommCount = useCallback(async () => {
    if (commParentMode === 'select') { setCommRecipientCount(commSelectedParents.length); return; }
    try {
      const token = await getAuthToken();
      const params = new URLSearchParams();
      if (commClassIds.length > 0 && commClassIds.length < classes.length) {
        params.append('class_ids', commClassIds.join(','));
      }
      if (year) params.append('academic_year', year);
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/recipients?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCommRecipientCount(Math.max(data.parentCount ?? 0, data.count ?? 0));
    } catch { setCommRecipientCount(null); }
  }, [apiUrl, commParentMode, commSelectedParents.length, commClassIds, classes.length, year]);

  useEffect(() => { if (activeTab === 'planning') fetchCommCount(); }, [activeTab, fetchCommCount]);

  // Langue de la salutation nominative : arabe si le message est en arabe.
  // Doit rester aligne sur greetingFor() dans backend communicationScheduler.js.
  const commGreetingIsArabic = /[؀-ۿ]/.test(`${commForm.title || ''} ${commForm.body || ''}`);

  const submitComm = async () => {
    if (!commForm.title) { setCommError('Titre requis'); return; }
    if (!commForm.send_now && commForm.type !== 'urgent' && !commForm.scheduled_at) {
      setCommError('Choisissez une date d\'envoi ou cochez « Envoyer maintenant »'); return;
    }
    if (commParentMode === 'select' && commSelectedParents.length === 0) {
      setCommError('Sélectionnez au moins un parent'); return;
    }
    setCommSaving(true); setCommError('');
    try {
      // Upload de la pièce jointe importée (le cas échéant)
      let attachment_url = commForm.attachment_url || null;
      let attachment_type = null;
      if (commMediaFile) {
        setCommUploading(true);
        const up = await uploadCommMedia();
        attachment_url = up.url; attachment_type = up.type;
        setCommUploading(false);
      }
      // Cible : parents sélectionnés > classes > toute l'école
      const target = commParentMode === 'select'
        ? { parent_ids: commSelectedParents }
        : (commClassIds.length ? { class_ids: commClassIds } : { all: true });

      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/communications`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...commForm,
          attachment_url,
          attachment_type,
          channels: commChannels,
          scheduled_at: commForm.scheduled_at ? new Date(commForm.scheduled_at).toISOString() : null,
          target,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCommForm({ title: '', body: '', type: 'normal', deadline_date: '', attachment_url: '', attachment_name: '', scheduled_at: '', send_now: false, personalize: false });
        setCommClassIds([]); removeCommMedia();
        setCommParentMode('all'); setCommSelectedParents([]); setCommParentsList([]);
        setShowCommForm(false);
        fetchComms();
      } else setCommError(data.error || 'Erreur lors de la création');
    } catch (e) {
      console.error('Erreur création comm:', e);
      setCommError('Erreur de connexion au serveur');
    } finally { setCommSaving(false); setCommUploading(false); }
  };

  const deleteComm = async (id) => {
    try {
      const token = await getAuthToken();
      await fetch(`${apiUrl}/api/admin/communications/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      fetchComms();
    } catch (e) { console.error('Erreur suppression comm:', e); }
  };

  const sendCommNow = async (id) => {
    try {
      const token = await getAuthToken();
      await fetch(`${apiUrl}/api/admin/communications/${id}/send-now`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setTimeout(fetchComms, 1500);
    } catch (e) { console.error('Erreur send-now comm:', e); }
  };

  // fetchQR : récupère un QR. silent=true → pas de spinner ni reset du QR affiché
  // (utilisé pour le polling auto en arrière-plan). On ne remplace l'image QR que
  // si la SOURCE a réellement changé (rotation Baileys ~20s), sinon l'image
  // clignote/rechargerait toutes les 3s et serait illisible au scan.
  const fetchQR = useCallback(async (silent = false, force = false) => {
    if (!silent) { setQrLoading(true); setQrError(''); setQrCode(null); lastQrSrcRef.current = null; }
    if (force) { setQrNeedsRepair(false); setQrRepairing(true); qrAutoRequestedRef.current = true; }
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/session-qr${force ? '?force=1' : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setQrNeedsRepair(Boolean(data.needsRepair));
      // Nouveau backend Baileys : retourne qrDataUrl (image PNG déjà encodée)
      // Ancien backend Wasender : retournait qrString (texte brut à transformer)
      if (data.success && data.qrDataUrl) {
        if (data.qrDataUrl !== lastQrSrcRef.current) {
          lastQrSrcRef.current = data.qrDataUrl;
          setQrCode(data.qrDataUrl);
        }
        setQrError('');
      } else if (data.success && data.qrString) {
        if (data.qrString !== lastQrSrcRef.current) {
          lastQrSrcRef.current = data.qrString;
          setQrCode(await QRCode.toDataURL(data.qrString, { width: 300, margin: 2 }));
        }
        setQrError('');
      } else if (!silent) {
        setQrError(data.error || 'QR code non disponible');
      }
    } catch (error) {
      console.error('Erreur QR:', error);
      if (!silent) setQrError('Erreur de connexion');
    } finally { if (!silent) setQrLoading(false); if (force) setQrRepairing(false); }
  }, [apiUrl]);

  // Connexion par code (alternative au QR) — saisie du numéro → code à 8 car.
  const requestPairing = useCallback(async () => {
    const phone = (pairingPhone || sessionStatus?.session?.phone || '').trim();
    if (!phone) { setPairingError('Entrez le numéro WhatsApp (format international, ex : +212600000000)'); return; }
    setPairingLoading(true); setPairingError(''); setPairingCode('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/session-pairing-code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.success && data.code) setPairingCode(data.code);
      else setPairingError(data.error || 'Impossible de générer le code');
    } catch (e) {
      setPairingError('Erreur de connexion au serveur');
    } finally { setPairingLoading(false); }
  }, [apiUrl, pairingPhone, sessionStatus]);

  // L'école tourne DÉJÀ sur Baileys et sa session est tombée : le QR doit
  // s'afficher tout seul. Il était auparavant caché derrière « Méthode
  // alternative » — l'écran annonçait « Scannez le QR code ci-dessous » sans
  // rien afficher dessous, et l'admin n'avait aucun moyen de rétablir l'envoi.
  // Le repli derrière showLegacy ne concerne plus que les écoles SANS session,
  // pour continuer à mettre en avant l'API officielle.
  const needsQrScan = Boolean(sessionStatus?.session)
    && sessionStatus?.provider !== 'cloud'
    && sessionStatus?.status !== 'no_session'
    && !sessionStatus?.connected;

  // Booléen stable : true si on doit poller la connexion (évite que les timers
  // se réinitialisent à chaque rafraîchissement de sessionStatus).
  const needsPolling = activeTab === 'connection'
    && (needsQrScan || (showLegacy && Boolean(sessionStatus?.session) && !sessionStatus?.connected))
    && sessionStatus?.provider !== 'cloud'; // pas de QR Baileys pour les écoles Cloud

  // Polling automatique tant que la session n'est pas connectée :
  //  - /session-status toutes les 2s pour détecter la connexion réussie
  //  - /session-qr toutes les 3s pour suivre les rotations Baileys (~20s) ET
  //    surtout pour récupérer immédiatement le nouveau QR après le restart
  //    post-scan (WhatsApp demande "Scannez à nouveau" pendant le restart
  //    Baileys et envoie un nouveau QR ~1s après).
  useEffect(() => {
    if (!needsPolling) return;

    const statusTimer = setInterval(() => { fetchStatus(true); }, 2000);
    // Tant que l'appairage est refusé, aucun QR ne PEUT sortir : continuer à
    // interroger relancerait une tentative de connexion côté serveur toutes
    // les 3 s, pour rien. On garde uniquement le suivi du statut, qui détectera
    // la reconnexion après le réappairage.
    const qrTimer = qrNeedsRepair ? null : setInterval(() => { fetchQR(true); }, 3000);
    return () => { clearInterval(statusTimer); if (qrTimer) clearInterval(qrTimer); };
  }, [needsPolling, qrNeedsRepair, fetchStatus, fetchQR]);

  // Auto-affichage du QR dès qu'une session existe mais n'est pas connectée.
  //
  // UNE SEULE fois par épisode de déconnexion (qrAutoRequestedRef). Sans ce
  // garde, l'effet se relançait à chaque bascule de qrLoading — la requête
  // repartait aussitôt terminée, qrLoading restait vrai en permanence, et TOUS
  // les boutons de la carte (dont « Régénérer le QR », le seul qui débloque la
  // situation) restaient désactivés indéfiniment.
  useEffect(() => {
    if (!needsPolling) { qrAutoRequestedRef.current = false; return; }
    if (qrCode || qrLoading || qrNeedsRepair || qrAutoRequestedRef.current) return;
    qrAutoRequestedRef.current = true;
    fetchQR(false);
  }, [needsPolling, qrCode, qrLoading, qrNeedsRepair, fetchQR]);

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
    setDeleting(true);
    try {
      const token = await getAuthToken();
      // Le backend Baileys identifie la session par school_id (via le JWT),
      // l'ID dans l'URL est ignoré — on envoie 'current' comme placeholder.
      const sessionRef = sessionStatus?.session?.id || 'current';
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/sessions/${sessionRef}`, {
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
  // Retire les lignes contenant un lien brut (ex. « 📎 doc.pdf : https://…supabase.co/… »)
  // du corps affiché : la pièce jointe est déjà présentée à part (media_url / file_name).
  const stripMediaLinks = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text
      .split('\n')
      .filter((line) => !/https?:\/\/\S+/i.test(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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

  // Qui est au bout du fil : parent, professeur, membre du personnel ou numéro
  // non rattaché (visiteur, futur parent qui écrit au chatbot public).
  const contactRoleBadge = (role) => {
    const map = {
      parent: { label: 'Parent', cls: 'bg-green-100 text-green-700', avatar: 'from-green-400 to-green-600' },
      teacher: { label: 'Professeur', cls: 'bg-indigo-100 text-indigo-700', avatar: 'from-indigo-400 to-indigo-600' },
      driver: { label: 'Chauffeur', cls: 'bg-amber-100 text-amber-700', avatar: 'from-amber-400 to-amber-600' },
      inconnu: { label: 'Numéro inconnu', cls: 'bg-gray-100 text-gray-500', avatar: 'from-gray-400 to-gray-500' },
    };
    if (map[role]) return map[role];
    if (role) return { label: 'Personnel', cls: 'bg-violet-100 text-violet-700', avatar: 'from-violet-400 to-violet-600' };
    return { label: '', cls: '', avatar: 'from-green-400 to-green-600' };
  };
  const msgTypeIcon = (type) => {
    if (type === 'image') return <Image className="w-3.5 h-3.5" />;
    if (type === 'document') return <FileText className="w-3.5 h-3.5" />;
    return null;
  };

  const inboxTotalSent = conversations.reduce((s, c) => s + c.totalSent, 0);
  const inboxTotalFailed = conversations.reduce((s, c) => s + c.totalFailed, 0);
  const inboxTotalReceived = conversations.reduce((s, c) => s + (c.totalReceived || 0), 0);
  const inboxTotalMessages = conversations.reduce((s, c) => s + c.messageCount, 0);

  // ===================== REPORTS IA LOGIC =====================
  const fetchReportStudents = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const params = new URLSearchParams();
      if (year) params.set('academic_year', year);
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/students?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setReportStudents(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Erreur students:', error); setReportStudents([]); }
  }, [apiUrl, year]);

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReportStudents();
    }
  }, [activeTab, fetchReportStudents]);

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

  // Envoie le rapport sous forme de PDF moderne aux parents via WhatsApp.
  // Le backend regénère les données + le PDF avec graphes/charts/IA et l'envoie
  // en pièce jointe (sendMediaBuffer Baileys), pas en texte tronqué.
  const sendReportWhatsApp = async () => {
    if (!reportSelectedStudent) { alert('Sélectionnez un élève d\'abord.'); return; }
    if (!reportPeriodData) { alert('Générez d\'abord un aperçu pour fixer la période.'); return; }
    setReportSending(true);
    try {
      const token = await getAuthToken();
      const { startDate, endDate } = reportPeriodData.period;
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/send-pdf-report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: reportSelectedStudent, startDate, endDate }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`📎 PDF envoyé ! ${data.sent} parent(s) destinataire(s)${data.failed ? `, ${data.failed} échec(s)` : ''}.`);
      } else {
        alert(data.error || 'Échec de l\'envoi WhatsApp');
      }
    } catch (error) {
      console.error('Erreur send PDF:', error);
      alert('Erreur de connexion: ' + error.message);
    } finally {
      setReportSending(false);
    }
  };

  // Télécharge le PDF moderne généré côté serveur (PDFKit + charts natifs).
  // L'ancienne génération jsPDF cliente a été supprimée :
  //   - police Helvetica Latin1 incapable de rendre emojis/arabe → garbage "Ø=ÜË"
  //   - pas de charts natifs
  //   - layout fragile (autoTable y-pos, multi-page)
  // Le backend renvoie le PDF en blob, on déclenche le download via Object URL.
  const downloadReportPDF = async () => {
    if (!reportSelectedStudent) { alert('Sélectionnez un élève d\'abord.'); return; }
    if (!reportPeriodData) { alert('Générez d\'abord un aperçu pour fixer la période.'); return; }
    try {
      const token = await getAuthToken();
      const { startDate, endDate } = reportPeriodData.period;
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/daily-reports/pdf`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: reportSelectedStudent, startDate, endDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Erreur ${res.status}`);
        return;
      }
      // Récupère le filename depuis le header (RFC 5987 ou ASCII fallback)
      const cd = res.headers.get('content-disposition') || '';
      const matchUtf = cd.match(/filename\*=UTF-8''([^;]+)/i);
      const matchAscii = cd.match(/filename="?([^";]+)"?/i);
      const fileName = matchUtf ? decodeURIComponent(matchUtf[1])
        : matchAscii ? matchAscii[1]
        : `rapport_${startDate}_${endDate}.pdf`;

      const blob = await res.blob();
      await saveBlob(blob, fileName);
    } catch (error) {
      console.error('Erreur PDF:', error);
      alert('Erreur lors du téléchargement: ' + error.message);
    }
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
    { key: 'send', label: 'Parents', icon: Send, desc: 'Envoyer aux parents' },
    { key: 'teachers', label: 'Professeurs', icon: Users, desc: 'Envoyer aux profs' },
    { key: 'inbox', label: 'Messages', icon: Inbox, desc: 'Boîte de réception' },
    { key: 'dashboard', label: 'Dashboard parents', icon: BarChart3, desc: 'Qui lit, qui répond' },
    { key: 'reports', label: 'Rapports IA', icon: Bot, desc: 'Rapport complet à la demande' },
    { key: 'documents', label: 'Documents chatbot', icon: BookOpen, desc: 'Fournitures & docs généraux' },
    { key: 'access', label: 'Accès chatbot', icon: Shield, desc: 'Ce que le chatbot communique aux parents' },
    { key: 'ecole', label: 'Vitrine école', icon: Building2, desc: 'Infos générales & photos' },
    { key: 'planning', label: 'Planifier', icon: Calendar, desc: 'Communications planifiées' },
    { key: 'connection', label: 'Connexion', icon: Smartphone, desc: 'Session WhatsApp' }
  ];

  return (
    <div className={`${isHub ? 'h-[calc(100vh-8rem)]' : 'h-[calc(100vh-4rem)]'} flex flex-col overflow-hidden bg-gray-50`}>
      {/* ===== HEADER WITH TABS ===== */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        {/* Top bar */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 bg-gradient-to-br ${isHub ? 'from-indigo-500 to-violet-600' : 'from-green-500 to-green-600'} rounded-xl flex items-center justify-center shadow-sm`}>
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{isHub ? 'Communication' : 'WhatsApp'}</h1>
              <p className="text-xs text-gray-500">{isHub ? 'App (push) + WhatsApp — envoi, suivi de lecture et réponses' : 'Messagerie instantanée'}</p>
            </div>
          </div>
          {sessionStatus && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm ${
              sessionStatus.connected
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-600 border-red-200'
            }`}>
              <div className={`w-2 h-2 rounded-full ${sessionStatus.connected ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}></div>
              {sessionStatus.connected ? 'WhatsApp connecté' : 'WhatsApp déconnecté'}
            </div>
          )}
        </div>

        {/* Horizontal tabs — sur le hub /communication, la navigation passe par
            les onglets du domaine (DomainTabs) ; la barre interne reste pour
            les rôles finance/transport sur /whatsapp. */}
        {!isHub && (
        <div className="px-4 flex gap-1 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  active
                    ? 'border-green-600 text-green-700 bg-green-50/50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

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
                {/* Mode de sélection parents */}
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-semibold text-gray-600">Envoyer à :</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="parentMode" value="all" checked={parentSelectionMode === 'all'}
                        onChange={() => { setParentSelectionMode('all'); setSelectedParents([]); setParentsList([]); }}
                        className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-sm text-gray-700">Tous les parents</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="parentMode" value="select" checked={parentSelectionMode === 'select'}
                        onChange={() => setParentSelectionMode('select')}
                        className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-sm text-gray-700">Sélectionner des parents</span>
                    </label>
                  </div>

                  {parentSelectionMode === 'all' ? (
                    <div className="flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-gray-700">
                        {loadingRecipients
                          ? 'Calcul...'
                          : sendChannels === 'whatsapp'
                            ? `${recipientCount} parent(s) avec numéro WhatsApp`
                            : `${Math.max(parentCount, recipientCount)} parent(s) ciblé(s) — dont ${recipientCount} avec WhatsApp`}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {loadingParents ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <RefreshCw className="w-4 h-4 animate-spin" /> Chargement des parents...
                        </div>
                      ) : parentsList.length === 0 ? (
                        <p className="text-sm text-gray-500">Aucun parent trouvé pour les classes sélectionnées.</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <input type="text" placeholder="Rechercher un parent..."
                              value={parentSearch} onChange={(e) => setParentSearch(e.target.value)}
                              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                            <button onClick={() => setSelectedParents(parentsList.map(p => p.parent_id))}
                              className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100">
                              Tout
                            </button>
                            <button onClick={() => setSelectedParents([])}
                              className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100">
                              Aucun
                            </button>
                          </div>
                          <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                            {parentsList
                              .filter(p => {
                                if (!parentSearch) return true;
                                const q = parentSearch.toLowerCase();
                                return p.name.toLowerCase().includes(q)
                                  || p.phone_whatsapp?.includes(q)
                                  || p.children?.some(c => c.name.toLowerCase().includes(q) || c.class_name?.toLowerCase().includes(q));
                              })
                              .map(parent => (
                                <label key={parent.parent_id}
                                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-green-50/50 transition-colors ${
                                    selectedParents.includes(parent.parent_id) ? 'bg-green-50/30' : ''
                                  }`}>
                                  <input type="checkbox"
                                    checked={selectedParents.includes(parent.parent_id)}
                                    onChange={() => {
                                      setSelectedParents(prev =>
                                        prev.includes(parent.parent_id)
                                          ? prev.filter(p => p !== parent.parent_id)
                                          : [...prev, parent.parent_id]
                                      );
                                    }}
                                    className="w-4 h-4 rounded text-green-600 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5">
                                      {parent.name}
                                      {parent.has_app && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium" title="A installé l'application">📲 App</span>
                                      )}
                                      {!parent.phone_whatsapp && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium" title="Pas de numéro WhatsApp — joignable via l'app uniquement">Sans WhatsApp</span>
                                      )}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {parent.phone_whatsapp || 'App uniquement'}
                                      {parent.children?.length > 0 && (
                                        <span className="ml-2 text-gray-400">
                                          — {parent.children.map(c => `${c.name} (${c.class_name})`).join(', ')}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </label>
                              ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckSquare className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-gray-700">
                              {selectedParents.length} / {parentsList.length} parent(s) sélectionné(s)
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Message Compose */}
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Send className="w-4 h-4" /> Composer le message
                </h2>

                {/* Choix du canal d'envoi */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Canal d'envoi</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { k: 'push', icon: Smartphone, title: 'Application', desc: 'Notification push + boîte in-app — gratuit', ring: 'border-indigo-500 bg-indigo-50', dot: 'text-indigo-600' },
                      { k: 'whatsapp', icon: MessageSquare, title: 'WhatsApp', desc: 'Message WhatsApp (session requise)', ring: 'border-green-500 bg-green-50', dot: 'text-green-600' },
                      { k: 'both', icon: Sparkles, title: 'Les deux', desc: 'App + WhatsApp — portée maximale', ring: 'border-violet-500 bg-violet-50', dot: 'text-violet-600' },
                    ].map(c => {
                      const CIcon = c.icon;
                      const active = sendChannels === c.k;
                      return (
                        <button key={c.k} type="button" onClick={() => setSendChannels(c.k)}
                          className={`text-left rounded-lg border-2 p-2.5 transition-all ${active ? c.ring : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                          <div className={`flex items-center gap-1.5 text-sm font-semibold ${active ? c.dot : 'text-gray-700'}`}>
                            <CIcon className="w-4 h-4" /> {c.title}
                            {active && <CheckCircle className="w-3.5 h-3.5 ml-auto" />}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{c.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                  {sendChannels !== 'push' && sessionStatus && !sessionStatus.connected && (
                    <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Session WhatsApp non connectée — connectez-la dans l'onglet Connexion, ou choisissez le canal Application.
                    </p>
                  )}
                </div>

                <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Tapez votre message ici..." rows="5"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500" />

                {/* Sélecteur de catégorie — visible uniquement aux admins ; les responsables ont leur catégorie imposée */}
                {(profile?.role === 'admin' || profile?.role === 'school_admin') ? (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                      <Filter className="w-3 h-3" /> Boîte cible :
                    </label>
                    <select
                      value={messageCategory}
                      onChange={(e) => setMessageCategory(e.target.value)}
                      className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-green-500"
                    >
                      <option value="general">📨 Général (admin)</option>
                      <option value="pedagogical">📚 Pédagogique</option>
                      <option value="financial">💰 Financier</option>
                      <option value="transport">🚌 Transport</option>
                    </select>
                    <span className="text-[10px] text-gray-400 ml-auto">Visible uniquement par le resp. correspondant</span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-md">
                    <Info className="w-3 h-3" />
                    Ce message sera classé dans votre boîte :
                    <strong>
                      {messageCategory === 'pedagogical' && '📚 Pédagogique'}
                      {messageCategory === 'financial' && '💰 Financier'}
                      {messageCategory === 'transport' && '🚌 Transport'}
                    </strong>
                  </div>
                )}

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
                  <button onClick={handleSend} disabled={sending || uploading || (!messageText && !mediaFile) || effectiveRecipientCount === 0}
                    className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                    <Send className="w-4 h-4" />
                    {uploading ? 'Upload...' : sending ? 'Envoi...' : `Envoyer à ${effectiveRecipientCount} parent(s)`}
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
                {/* Filtre catégorie (admins seulement) */}
                {(profile?.role === 'admin' || profile?.role === 'school_admin') && (
                  <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1 overflow-x-auto">
                    {[
                      { k: 'all', label: 'Tous', emoji: '📋' },
                      { k: 'general', label: 'Général', emoji: '📨' },
                      { k: 'pedagogical', label: 'Péda.', emoji: '📚' },
                      { k: 'financial', label: 'Finance', emoji: '💰' },
                      { k: 'transport', label: 'Transport', emoji: '🚌' }
                    ].map(f => (
                      <button key={f.k}
                        onClick={() => { setHistoryCategoryFilter(f.k); setHistoryPage(1); }}
                        className={`px-2 py-1 text-xs rounded-md whitespace-nowrap transition ${
                          historyCategoryFilter === f.k
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}>
                        {f.emoji} {f.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                  {sendHistory.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400 text-sm">Aucun message envoyé</div>
                  ) : sendHistory.map(msg => (
                    <div key={msg.id} onClick={() => viewDetails(msg.id)}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer" title="Voir qui a vu / répondu">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{msg.content || `[${typeLabel(msg.message_type)}]`}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{formatFullDate(msg.created_at)}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {statusBadge(msg.status)}
                            {msg.channels && msg.channels !== 'whatsapp' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                msg.channels === 'push' ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'
                              }`}>
                                {msg.channels === 'push' ? '📲 App' : '📲💬 App + WhatsApp'}
                              </span>
                            )}
                            {msg.category && msg.category !== 'general' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                msg.category === 'pedagogical' ? 'bg-blue-100 text-blue-700' :
                                msg.category === 'financial' ? 'bg-emerald-100 text-emerald-700' :
                                msg.category === 'transport' ? 'bg-orange-100 text-orange-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {msg.category === 'pedagogical' && '📚 Péda.'}
                                {msg.category === 'financial' && '💰 Finance'}
                                {msg.category === 'transport' && '🚌 Transport'}
                              </span>
                            )}
                            <span className="text-xs text-gray-500" title="Envoyés / ciblés">{msg.sent_count}/{msg.total_recipients}</span>
                            {msg.metrics && (
                              <>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${msg.metrics.read > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}
                                  title={`Vus : ${msg.metrics.readApp} via l'app, ${msg.metrics.readWa} via WhatsApp`}>
                                  👁 {msg.metrics.read} vu(s)
                                  {msg.metrics.read > 0 && ` · 📲${msg.metrics.readApp} 💬${msg.metrics.readWa}`}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${msg.metrics.responded > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                  💬 {msg.metrics.responded} rép.
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); viewDetails(msg.id); }} className="p-1 hover:bg-gray-200 rounded" title="Détails">
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
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Matière</label>
                  <select value={teacherSubjectFilter} onChange={(e) => setTeacherSubjectFilter(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                    <option value="">Toutes les matières</option>
                    {subjects.map(subject => (
                      <option key={subject.id} value={subject.id}>{subject.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Classe</label>
                  <select value={teacherClassFilter} onChange={(e) => setTeacherClassFilter(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                    <option value="">Toutes les classes</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setTeacherSubjectFilter('');
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
                  Professeurs ({teachers.filter(t => {
                    if (teacherSubjectFilter) {
                      const tSubjects = teacherSubjects[t.id] || [];
                      const hasSubject = tSubjects.some(s => 
                        (s.subject_id && String(s.subject_id) === String(teacherSubjectFilter)) ||
                        (s.subjects?.id && String(s.subjects.id) === String(teacherSubjectFilter))
                      );
                      if (!hasSubject) return false;
                    }
                    if (teacherClassFilter) {
                      // Filtrer par classe si nécessaire
                      return true; // À implémenter si besoin
                    }
                    return true;
                  }).length})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const filtered = teachers.filter(t => {
                        if (teacherSubjectFilter) {
                          const tSubjects = teacherSubjects[t.id] || [];
                          const hasSubject = tSubjects.some(s => 
                            (s.subject_id && String(s.subject_id) === String(teacherSubjectFilter)) ||
                            (s.subjects?.id && String(s.subjects.id) === String(teacherSubjectFilter))
                          );
                          if (!hasSubject) return false;
                        }
                        if (teacherClassFilter) {
                          return true; // À implémenter si besoin
                        }
                        return true;
                      });
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
                  .filter(t => {
                    if (teacherSubjectFilter) {
                      const tSubjects = teacherSubjects[t.id] || [];
                      const hasSubject = tSubjects.some(s => 
                        (s.subject_id && String(s.subject_id) === String(teacherSubjectFilter)) ||
                        (s.subjects?.id && String(s.subjects.id) === String(teacherSubjectFilter))
                      );
                      if (!hasSubject) return false;
                    }
                    if (teacherClassFilter) {
                      return true; // À implémenter si besoin
                    }
                    return true;
                  })
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
                            subjectId: teacherSubjectFilter,
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

      {/* ===================== TAB: DASHBOARD PARENTS ===================== */}
      {activeTab === 'dashboard' && (
        <EngagementDashboard apiUrl={apiUrl} getAuthToken={getAuthToken} onOpenConversation={openConversation} />
      )}

      {/* ===================== TAB: VITRINE ÉCOLE ===================== */}
      {activeTab === 'ecole' && (
        <SchoolShowcasePage apiUrl={apiUrl} getAuthToken={getAuthToken} />
      )}

      {/* ===================== TAB: DOCUMENTS CHATBOT ===================== */}
      {activeTab === 'documents' && (
        <ChatbotDocsPage apiUrl={apiUrl} getAuthToken={getAuthToken} academicYear={year} />
      )}

      {/* ============ TAB: ACCÈS CHATBOT (données communiquées) ============ */}
      {activeTab === 'access' && (
        <div className="flex-1 overflow-y-auto p-5">
          <ChatbotAccessPage />
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
              <span className="text-[11px] text-blue-600"><strong>{inboxTotalReceived}</strong> reçus</span>
              {inboxTotalFailed > 0 && <span className="text-[11px] text-red-500"><strong>{inboxTotalFailed}</strong> échoués</span>}
              {awaitingCount > 0 && <span className="text-[11px] text-amber-600"><strong>{awaitingCount}</strong> à répondre</span>}
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
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { key: 'all', label: 'Tous' },
                      { key: 'awaiting', label: `À répondre${awaitingCount ? ` (${awaitingCount})` : ''}` },
                      { key: 'received', label: 'Réponses reçues' },
                      { key: 'sent', label: 'Envoyés' },
                      { key: 'failed', label: 'Échoués' },
                    ].map(f => (
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
                  ) : filteredConversations.map(conv => {
                    const last = conv.messages[conv.messages.length - 1];
                    const role = contactRoleBadge(conv.contactRole);
                    return (
                    <button key={conv.phone} onClick={() => setSelectedConv(conv)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selectedConv?.phone === conv.phone ? 'bg-green-50 border-l-2 border-l-green-500' : conv.awaitingReply ? 'bg-amber-50/40' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${role.avatar} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-white font-semibold text-sm">{conv.parentName ? conv.parentName.charAt(0).toUpperCase() : '#'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                              {conv.parentName || conv.phone}
                              {conv.awaitingReply && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" title="En attente de réponse" />}
                            </p>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{formatDate(conv.lastMessageAt)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {role.label && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${role.cls}`}>{role.label}</span>}
                            {conv.parentName && (
                              <p className="text-[11px] text-gray-400 flex items-center gap-1"><Phone className="w-3 h-3" />{conv.phone}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className={`text-xs truncate pr-2 flex items-center gap-1 ${last?.direction === 'incoming' ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                              {last?.direction === 'incoming' && <ArrowDownLeft className="w-3 h-3 text-blue-500 flex-shrink-0" />}
                              {last?.isBot && <Bot className="w-3 h-3 text-purple-500 flex-shrink-0" />}
                              {last?.isAiReport && <Bot className="w-3 h-3 text-purple-500 flex-shrink-0" />}
                              {last ? (last.isAiReport ? 'Rapport IA quotidien' : (last.content || `[${last.messageType}]`)) : ''}
                            </p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {conv.totalReceived > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600"><MessageSquare className="w-3 h-3" />{conv.totalReceived}</span>}
                              {conv.totalSent > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-600"><CheckCircle className="w-3 h-3" />{conv.totalSent}</span>}
                              {conv.totalFailed > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-500"><XCircle className="w-3 h-3" />{conv.totalFailed}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                    );
                  })}
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
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${contactRoleBadge(selectedConv.contactRole).avatar} flex items-center justify-center`}>
                    <span className="text-white font-semibold text-sm">{selectedConv.parentName ? selectedConv.parentName.charAt(0).toUpperCase() : '#'}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      {selectedConv.parentName || selectedConv.phone}
                      {contactRoleBadge(selectedConv.contactRole).label && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${contactRoleBadge(selectedConv.contactRole).cls}`}>
                          {contactRoleBadge(selectedConv.contactRole).label}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" />{selectedConv.phone} · {selectedConv.messageCount} msg
                      {selectedConv.totalReceived > 0 && <span className="text-blue-600">· {selectedConv.totalReceived} reçu(s)</span>}
                    </p>
                  </div>
                  {selectedConv.awaitingReply && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium whitespace-nowrap">En attente de réponse</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 overflow-y-auto px-4 py-4 space-y-3">
                  {selectedConv.messages.map((msg, idx) => {
                    const showDate = idx === 0 || new Date(msg.createdAt).toDateString() !== new Date(selectedConv.messages[idx - 1].createdAt).toDateString();
                    const incoming = msg.direction === 'incoming';
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="bg-white/80 backdrop-blur-sm text-[11px] text-gray-500 px-3 py-1 rounded-full shadow-sm">
                              {new Date(msg.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                        <div className={incoming ? 'flex justify-start' : 'flex justify-end'}>
                          <div className={`max-w-[92%] sm:max-w-[80%] lg:max-w-[72%] rounded-lg px-3 py-2 shadow-sm ${incoming ? 'rounded-tl-none bg-white border border-gray-200' : 'rounded-tr-none'} ${incoming ? '' : msg.isComprehensiveReport ? 'bg-[#dbeafe] border border-blue-200' : (msg.isAiReport || msg.isBot) ? 'bg-[#e8e0f3] border border-purple-200' : 'bg-[#d9fdd3]'}`}>
                            {msg.isBot && (
                              <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-purple-200">
                                <Bot className="w-3.5 h-3.5 text-purple-600" />
                                <span className="text-[11px] font-semibold text-purple-700">Réponse automatique du chatbot</span>
                              </div>
                            )}
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
                              {msg.senderName && <span className={`text-[10px] mr-auto ${msg.isComprehensiveReport ? 'text-blue-500' : (msg.isAiReport || msg.isBot) ? 'text-purple-500' : 'text-gray-500'}`}>{msg.senderName}</span>}
                              <span className="text-[10px] text-gray-500">{new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                              {!incoming && statusBadge(msg.status)}
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
            {/* Rapport complet à la demande */}
            {(
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
                      <div className="relative">
                        <input type="text" value={reportStudentSearch} onChange={(e) => setReportStudentSearch(e.target.value)}
                          placeholder="Nom, prénom, classe…"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500" />
                        {reportStudentSearch && (
                          <button type="button" onClick={() => setReportStudentSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {filteredReportStudents.length} / {reportStudents.length} élève(s)
                        {reportStudentSearch && ' — accents et ordre des mots ignorés'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Élève</label>
                      <select value={reportSelectedStudent} onChange={(e) => setReportSelectedStudent(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                        <option value="">
                          {filteredReportStudents.length === 0
                            ? '-- Aucun élève trouvé --'
                            : `-- Sélectionner (${filteredReportStudents.length}) --`}
                        </option>
                        {filteredReportStudents.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.last_name} {s.first_name}{s.classes?.name ? ` (${s.classes.name})` : ''}
                          </option>
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
                        {(() => {
                          // Sanitize chart data : recharts crash ("reading 'x'") quand
                          // les dataKey sont undefined/null ou la date est manquante.
                          const safeDaily = (reportPeriodData?.dailyEvolution || [])
                            .filter(d => d && typeof d.date === 'string' && d.date.length >= 5)
                            .map(d => ({
                              date: d.date.substring(5),
                              presenceRate: Number.isFinite(+d.presenceRate) ? +d.presenceRate : 0,
                              homeworkRate: Number.isFinite(+d.homeworkRate) ? +d.homeworkRate : 0,
                              avgParticipation: Number.isFinite(+d.avgParticipation) ? +d.avgParticipation : 0,
                              avgDiscipline: Number.isFinite(+d.avgDiscipline) ? +d.avgDiscipline : 0,
                            }));
                          if (safeDaily.length <= 1) return null;
                          return (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Evolution line chart */}
                            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" /> Évolution quotidienne</h4>
                              <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={safeDaily}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} />
                                  <Tooltip contentStyle={{ fontSize: 12 }} />
                                  <Legend wrapperStyle={{ fontSize: 11 }} />
                                  <Line type="monotone" dataKey="presenceRate" name="Présence %" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
                                  <Line type="monotone" dataKey="homeworkRate" name="Devoirs %" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Participation & Discipline chart */}
                            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-500" /> Participation & Discipline</h4>
                              <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={safeDaily}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} domain={[0, 5]} />
                                  <Tooltip contentStyle={{ fontSize: 12 }} />
                                  <Legend wrapperStyle={{ fontSize: 11 }} />
                                  <Bar dataKey="avgParticipation" name="Participation" fill="#8b5cf6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                  <Bar dataKey="avgDiscipline" name="Discipline" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          );
                        })()}

                        {/* Subject radar chart + subject stats table */}
                        {reportPeriodData?.subjectStats && Object.keys(reportPeriodData.subjectStats).length > 0 && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Radar chart */}
                            {Object.keys(reportPeriodData.subjectStats).length >= 3 && (
                              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-500" /> Profil par matière</h4>
                                <ResponsiveContainer width="100%" height={280}>
                                  <RadarChart data={Object.entries(reportPeriodData.subjectStats)
                                    .filter(([name, s]) => name && s)
                                    .map(([name, s]) => {
                                      const tot = Number(s?.totalTracked) || 0;
                                      const pres = Number(s?.presence?.present) || 0;
                                      return {
                                        subject: name.length > 10 ? name.substring(0, 10) + '...' : name,
                                        participation: Number.isFinite(+s?.avgParticipation) ? +s.avgParticipation : 0,
                                        discipline: Number.isFinite(+s?.avgDiscipline) ? +s.avgDiscipline : 0,
                                        miniEval: Number.isFinite(+s?.avgMiniEval) ? (+s.avgMiniEval) / 2 : 0,
                                        presence: tot > 0 ? (pres / tot) * 5 : 0,
                                      };
                                    })}>
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

          </div>
        </div>
      )}

      {/* ===================== TAB: CONNECTION ===================== */}
      {activeTab === 'planning' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* En-tête tableau de bord + bouton d'ouverture de la fenêtre de planification */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" /> Communications
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Suivi des messages planifiés et envoyés — vu / répondu par parent.</p>
              </div>
              <button onClick={() => { setCommError(''); setShowCommForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex-shrink-0">
                <Plus className="w-4 h-4" /> Planifier une communication
              </button>
            </div>

            {/* Formulaire de création — fenêtre modale */}
            {showCommForm && (
              <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => setShowCommForm(false)}>
                <div className="w-full max-w-2xl my-6" onClick={(e) => e.stopPropagation()}>
                  <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-600" /> Planifier une communication
                      </h2>
                      <button onClick={() => setShowCommForm(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Préparez un message à envoyer plus tard (ou tout de suite). Choisissez le canal,
                      importez une image ou un document, ciblez des classes ou des parents précis.
                      Le suivi <strong>vu / répondu</strong> apparaît ensuite comme pour les envois directs.
                    </p>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Titre *</label>
                <input type="text" value={commForm.title}
                  onChange={(e) => setCommForm({ ...commForm, title: e.target.value })}
                  placeholder="Ex: Réunion parents-profs"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Message</label>
                <textarea value={commForm.body} rows={4}
                  onChange={(e) => setCommForm({ ...commForm, body: e.target.value })}
                  placeholder="Contenu de la communication…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Type</label>
                  <select value={commForm.type}
                    onChange={(e) => setCommForm({ ...commForm, type: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="normal">🟢 Normal</option>
                    <option value="deadline">🟠 Avec date limite</option>
                    <option value="urgent">🔴 Urgent (envoi immédiat)</option>
                  </select>
                </div>
                {commForm.type === 'deadline' && (
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Date limite</label>
                    <input type="date" value={commForm.deadline_date}
                      onChange={(e) => setCommForm({ ...commForm, deadline_date: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                  </div>
                )}
              </div>

              {/* Canal d'envoi */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Canal d'envoi</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { k: 'push', icon: Smartphone, title: 'Application', desc: 'Push + boîte in-app — gratuit', ring: 'border-indigo-500 bg-indigo-50', dot: 'text-indigo-600' },
                    { k: 'whatsapp', icon: MessageSquare, title: 'WhatsApp', desc: 'Message WhatsApp', ring: 'border-green-500 bg-green-50', dot: 'text-green-600' },
                    { k: 'both', icon: Sparkles, title: 'Les deux', desc: 'Portée maximale', ring: 'border-violet-500 bg-violet-50', dot: 'text-violet-600' },
                  ].map((c) => {
                    const CIcon = c.icon; const active = commChannels === c.k;
                    return (
                      <button key={c.k} type="button" onClick={() => setCommChannels(c.k)}
                        className={`text-left rounded-lg border-2 p-2.5 transition-all ${active ? c.ring : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                        <div className={`flex items-center gap-1.5 text-sm font-semibold ${active ? c.dot : 'text-gray-700'}`}>
                          <CIcon className="w-4 h-4" /> {c.title}
                          {active && <CheckCircle className="w-3.5 h-3.5 ml-auto" />}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{c.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Pièce jointe importée (image ou document → vraie PJ WhatsApp) */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Pièce jointe (image ou document)</label>
                {commMediaFile ? (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    {commMediaPreview ? (
                      <img src={commMediaPreview} alt="preview" className="w-14 h-14 object-cover rounded" />
                    ) : (
                      <div className="w-14 h-14 bg-indigo-100 rounded flex items-center justify-center">
                        <FileText className="w-6 h-6 text-indigo-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{commForm.attachment_name}</p>
                      <p className="text-xs text-gray-500">{commMediaFile.type.startsWith('image/') ? 'Image' : 'Document'} — envoyé en pièce jointe</p>
                    </div>
                    <button onClick={removeCommMedia} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4 text-gray-500" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input ref={commFileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                      onChange={handleCommFileSelect} className="hidden" />
                    <button type="button" onClick={() => commFileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                      <Paperclip className="w-4 h-4" /> Importer un fichier
                    </button>
                    <span className="text-[11px] text-gray-400">Image, PDF, Word, Excel… (pas un lien)</span>
                  </div>
                )}
              </div>

              {/* Destinataires : classes (cases) + option parents précis + compteur */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Destinataires</label>
                <div className="relative" ref={commClassDropdownRef}>
                  <button type="button" onClick={() => setCommClassDropdownOpen(!commClassDropdownOpen)}
                    className="w-full flex items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white hover:bg-gray-50">
                    <span className="truncate">
                      {commClassIds.length === 0 ? 'Toute l\'école'
                        : commClassIds.length === 1 ? (classes.find((c) => c.id === commClassIds[0])?.name || '1 classe')
                        : `${commClassIds.length} classes`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${commClassDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {commClassDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      <label className="flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100">
                        <input type="checkbox" checked={commClassIds.length === 0}
                          onChange={() => setCommClassIds([])} className="w-4 h-4 rounded text-indigo-600" />
                        <span className="text-sm font-semibold text-indigo-700">Toute l'école</span>
                      </label>
                      {(classes || []).map((c) => (
                        <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={commClassIds.includes(c.id)}
                            onChange={() => setCommClassIds((prev) => prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id])}
                            className="w-4 h-4 rounded text-indigo-600" />
                          <span className="text-sm text-gray-700">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Mode de ciblage : tous les parents des classes, ou une sélection */}
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="commParentMode" checked={commParentMode === 'all'}
                      onChange={() => { setCommParentMode('all'); setCommParentsList([]); }} className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-sm text-gray-700">Tous les parents</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="commParentMode" checked={commParentMode === 'select'}
                      onChange={() => setCommParentMode('select')} className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-sm text-gray-700">Sélectionner des parents</span>
                  </label>
                  {commRecipientCount != null && (
                    <span className="ml-auto text-xs font-medium text-gray-600 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-indigo-600" /> {commRecipientCount} destinataire(s)
                    </span>
                  )}
                </div>

                {commParentMode === 'select' && (
                  <div className="mt-2 space-y-2">
                    {commLoadingParents ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500"><RefreshCw className="w-4 h-4 animate-spin" /> Chargement…</div>
                    ) : commParentsList.length === 0 ? (
                      <p className="text-sm text-gray-500">Aucun parent pour cette sélection.</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <input type="text" placeholder="Rechercher un parent…" value={commParentSearch}
                            onChange={(e) => setCommParentSearch(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                          <button type="button" onClick={() => setCommSelectedParents(commParentsList.map((p) => p.parent_id))}
                            className="px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100">Tout</button>
                          <button type="button" onClick={() => setCommSelectedParents([])}
                            className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100">Aucun</button>
                        </div>
                        <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                          {commParentsList
                            .filter((p) => {
                              if (!commParentSearch) return true;
                              const q = commParentSearch.toLowerCase();
                              return p.name.toLowerCase().includes(q) || p.phone_whatsapp?.includes(q)
                                || p.children?.some((c) => c.name.toLowerCase().includes(q) || c.class_name?.toLowerCase().includes(q));
                            })
                            .map((parent) => (
                              <label key={parent.parent_id}
                                className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-indigo-50/50 ${commSelectedParents.includes(parent.parent_id) ? 'bg-indigo-50/30' : ''}`}>
                                <input type="checkbox" checked={commSelectedParents.includes(parent.parent_id)}
                                  onChange={() => setCommSelectedParents((prev) => prev.includes(parent.parent_id) ? prev.filter((x) => x !== parent.parent_id) : [...prev, parent.parent_id])}
                                  className="w-4 h-4 rounded text-indigo-600 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5">
                                    {parent.name}
                                    {parent.has_app && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">📲 App</span>}
                                    {!parent.phone_whatsapp && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Sans WhatsApp</span>}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {parent.phone_whatsapp || 'App uniquement'}
                                    {parent.children?.length > 0 && (
                                      <span className="ml-2 text-gray-400">— {parent.children.map((c) => `${c.name} (${c.class_name})`).join(', ')}</span>
                                    )}
                                  </p>
                                </div>
                              </label>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500">{commSelectedParents.length} / {commParentsList.length} sélectionné(s)</p>
                      </>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-1">Le canal est choisi automatiquement par parent : push si l'app est installée, sinon WhatsApp (selon le canal ci-dessus).</p>
              </div>

              {/* Personnalisation : un texte distinct par parent → moins de risque de ban */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 w-4 h-4 rounded text-indigo-600"
                    checked={commForm.personalize}
                    onChange={(e) => setCommForm({ ...commForm, personalize: e.target.checked })} />
                  <span>
                    <span className="text-sm font-medium text-gray-800">Ajouter le nom du parent</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Chaque parent reçoit un message distinct au lieu de N copies identiques :
                      c'est ce que WhatsApp regarde pour repérer les envois de masse.
                    </span>
                  </span>
                </label>
                {commForm.personalize && (
                  <div className="mt-2.5 ml-6 rounded-md border border-indigo-100 bg-white px-3 py-2">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Aperçu de la 1re ligne</p>
                    <p className="text-sm text-gray-700" dir={commGreetingIsArabic ? 'rtl' : 'ltr'}>
                      {commGreetingIsArabic
                        ? 'تحية طيبة السيد(ة) [اسم ولي الأمر]،'
                        : 'Bonjour [Nom du parent],'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      Les parents sans nom enregistré reçoivent le message sans salutation.
                      La notification dans l'app n'est pas modifiée.
                    </p>
                  </div>
                )}
              </div>

              {commForm.type !== 'urgent' && (
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={commForm.send_now}
                      onChange={(e) => setCommForm({ ...commForm, send_now: e.target.checked })} />
                    Envoyer maintenant
                  </label>
                  {!commForm.send_now && (
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Date et heure d'envoi</label>
                      <input type="datetime-local" value={commForm.scheduled_at}
                        onChange={(e) => setCommForm({ ...commForm, scheduled_at: e.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  )}
                </div>
              )}

              {commError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-600" /><p className="text-sm text-red-800">{commError}</p>
                </div>
              )}

                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={submitComm} disabled={commSaving || commUploading}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium">
                        {commSaving || commUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {commUploading ? 'Upload…' : commForm.type === 'urgent' || commForm.send_now ? 'Envoyer' : 'Planifier'}
                      </button>
                      <button onClick={() => setShowCommForm(false)} disabled={commSaving || commUploading}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50">
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bandeau KPI — vue d'ensemble des communications */}
            {comms.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-semibold text-gray-800">Vue d'ensemble</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {/* Portée & remise */}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500"><Users className="w-3.5 h-3.5" /> Portée</div>
                    <p className="text-xl font-bold text-gray-800 mt-1">{commStats.targeted}</p>
                    <p className="text-[11px] text-gray-500">{commStats.delivered} atteint(s)</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700"><Send className="w-3.5 h-3.5" /> Remise</div>
                    <p className="text-xl font-bold text-emerald-700 mt-1">{commStats.deliveryRate}%</p>
                    <p className="text-[11px] text-emerald-600/80">{commStats.delivered}/{commStats.targeted}</p>
                  </div>
                  {/* Lecture & réponse */}
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-700"><Eye className="w-3.5 h-3.5" /> Lecture</div>
                    <p className="text-xl font-bold text-blue-700 mt-1">{commStats.readRate}%</p>
                    <p className="text-[11px] text-blue-600/80">{commStats.read} vu(s)</p>
                  </div>
                  <div className="rounded-lg border border-violet-100 bg-violet-50 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700"><MessageSquare className="w-3.5 h-3.5" /> Réponse</div>
                    <p className="text-xl font-bold text-violet-700 mt-1">{commStats.responseRate}%</p>
                    <p className="text-[11px] text-violet-600/80">{commStats.responded} réponse(s)</p>
                  </div>
                  {/* Canal & échecs */}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500"><Smartphone className="w-3.5 h-3.5" /> Canal (vus)</div>
                    <p className="text-base font-bold text-gray-800 mt-1">📲 {commStats.readApp} · 💬 {commStats.readWa}</p>
                    <p className="text-[11px] text-gray-500">{commStats.failed > 0 ? `${commStats.failed} échec(s)` : 'aucun échec'}</p>
                  </div>
                  {/* Planning */}
                  <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700"><Calendar className="w-3.5 h-3.5" /> Planning</div>
                    <p className="text-xl font-bold text-amber-700 mt-1">{commStats.upcoming}</p>
                    <p className="text-[11px] text-amber-600/80">à venir · {commStats.sentThisMonth} ce mois{commStats.sending ? ` · ${commStats.sending} en cours` : ''}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Liste des communications */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Communications</h3>
                <button onClick={fetchComms} className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                  <RefreshCw className={`w-4 h-4 ${commsLoading ? 'animate-spin' : ''}`} /> Actualiser
                </button>
              </div>
              {comms.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">Aucune communication.</p>
              ) : (
                <div className="space-y-2">
                  {comms.map((c) => {
                    const badge = c.type === 'urgent' ? '🔴' : c.type === 'deadline' ? '🟠' : '🟢';
                    const statusColor = c.status === 'sent' ? 'text-green-600' : c.status === 'failed' ? 'text-red-600' : c.status === 'sending' ? 'text-amber-600' : 'text-gray-500';
                    const clickable = !!c.message_id; // envoi tracké → détail « qui a vu / répondu »
                    return (
                      <div key={c.id}
                        onClick={clickable ? () => viewDetails(c.message_id) : undefined}
                        title={clickable ? 'Voir qui a vu / répondu' : undefined}
                        className={`flex items-center justify-between gap-3 p-3 border border-gray-100 rounded-lg ${clickable ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{badge} {c.title}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(c.scheduled_at).toLocaleString('fr-FR')} ·
                            <span className={`ml-1 font-medium ${statusColor}`}>{c.status}</span>
                            {c.status === 'sent' && !c.metrics && ` · ${c.sent_count} envoyé(s)${c.failed_count ? `, ${c.failed_count} échec(s)` : ''}`}
                          </p>
                          {c.metrics && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium" title="Parents ciblés / atteints">
                                🎯 {c.metrics.targeted} ciblé(s) · ✓ {c.metrics.sent} atteint(s)
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.metrics.read > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}
                                title={`${c.metrics.readApp} via l'app · ${c.metrics.readWa} via WhatsApp`}>
                                👁 {c.metrics.read} vu(s){c.metrics.read > 0 && ` — 📲${c.metrics.readApp} 💬${c.metrics.readWa}`}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.metrics.responded > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                💬 {c.metrics.responded} réponse(s)
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {clickable && (
                            <button onClick={(e) => { e.stopPropagation(); viewDetails(c.message_id); }}
                              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded" title="Détails par parent">
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {c.status === 'scheduled' && (
                            <button onClick={(e) => { e.stopPropagation(); sendCommNow(c.id); }} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">Envoyer</button>
                          )}
                          {c.status !== 'sending' && (
                            <button onClick={(e) => { e.stopPropagation(); deleteComm(c.id); }} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                <div className="text-center py-6 space-y-2">
                  <p className="text-gray-500 text-sm">Aucun numéro connecté.</p>
                  <p className="text-gray-500 text-sm">Utilisez la <strong>connexion via API officielle</strong> ci-dessous. 👇</p>
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

            {/* QR démo commercial : visible UNIQUEMENT si l'école a une config
                demo_parent_configs (école principale). Un prospect scanne →
                envoie « DEMO PARENT » → devient parent d'un élève démo. */}
            {demoQr && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-violet-900 flex items-center gap-2">
                  <QrCode className="w-5 h-5" /> QR Démo — « Devenez parent d'essai »
                </h2>
                <p className="text-xs text-violet-700 mt-1 mb-4">
                  Faites scanner ce QR à un directeur invité : WhatsApp s'ouvre avec le message
                  « <strong>{demoQr.keyword}</strong> » pré-rempli vers <strong>{demoQr.phone || 'le numéro de l\'école'}</strong>.
                  Dès l'envoi, il est associé automatiquement à un élève de la classe démo et reçoit
                  ses identifiants parent par WhatsApp.
                </p>
                {demoQr.success ? (
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    <img src={demoQr.qrDataUrl} alt="QR démo parent" className="w-48 h-48 rounded-lg border border-violet-200 bg-white p-2" />
                    <div className="space-y-2 text-sm">
                      <p className="text-violet-900">
                        👥 Élèves démo disponibles : <strong>{demoQr.remaining}</strong> / {demoQr.total}
                      </p>
                      <a href={demoQr.waLink} target="_blank" rel="noreferrer"
                        className="inline-block px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700">
                        Ouvrir le lien wa.me
                      </a>
                      <button onClick={() => { navigator.clipboard?.writeText(demoQr.waLink); }}
                        className="ml-2 inline-block px-3 py-1.5 text-xs border border-violet-300 text-violet-700 rounded-lg hover:bg-violet-100">
                        Copier le lien
                      </button>
                      <p className="text-xs text-violet-600">
                        Chaque nouveau numéro qui scanne = un nouvel élève associé.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    ⚠️ {demoQr.error || 'Connectez d\'abord la session WhatsApp de l\'école pour générer le QR.'}
                  </p>
                )}
              </div>
            )}

            {/* Cloud API onboarding (numéro officiel Meta) */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-semibold text-emerald-900 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" /> Connexion via API officielle WhatsApp (recommandé)
                </h2>
                <p className="text-xs text-emerald-700 mt-1">
                  Boutons cliquables, pas de QR, pas de risque de blocage. Le numéro doit être
                  <strong> dédié</strong> et ne plus être utilisé dans l'application WhatsApp.
                </p>
              </div>

              {isCloudConnected ? (
                <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-emerald-200">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                  <div>
                    <p className="font-medium text-emerald-800">Numéro officiel connecté</p>
                    <p className="text-sm text-emerald-700">{sessionStatus?.session?.phone || '—'}</p>
                  </div>
                </div>
              ) : cloudStep === 'done' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-emerald-200">
                    <CheckCircle className="w-6 h-6 text-emerald-600" />
                    <p className="font-medium text-emerald-800">Numéro vérifié et activé ✅</p>
                  </div>
                  {cloudPin && (
                    <p className="text-xs text-gray-600">Code PIN 2FA généré (à conserver) : <strong>{cloudPin}</strong></p>
                  )}
                </div>
              ) : cloudStep === 'code' ? (
                <div className="space-y-3">
                  <p className="text-sm text-emerald-800">
                    Un code a été envoyé par {cloudMethod === 'SMS' ? 'SMS' : 'appel'} au
                    {' '}<strong>+{cloudCC} {cloudPhone}</strong>. Saisissez-le ci-dessous.
                  </p>
                  <input type="text" value={cloudCode} onChange={(e) => setCloudCode(e.target.value)}
                    placeholder="Code à 6 chiffres"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                  {cloudError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" /><p className="text-sm text-red-800">{cloudError}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <button onClick={handleCloudVerify} disabled={cloudLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium">
                      {cloudLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Vérifier et connecter
                    </button>
                    <button onClick={() => { setCloudStep('form'); setCloudError(''); setCloudCode(''); }}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Recommencer</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Indicatif</label>
                      <input type="text" value={cloudCC} onChange={(e) => setCloudCC(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="212" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs font-semibold text-gray-700 block mb-1">Numéro (sans indicatif) *</label>
                      <input type="text" value={cloudPhone} onChange={(e) => setCloudPhone(e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="600000000" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Nom affiché de l'établissement *</label>
                    <input type="text" value={cloudName} onChange={(e) => setCloudName(e.target.value)}
                      placeholder="Ex: Groupe Scolaire Al Amal"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Recevoir le code par</label>
                    <select value={cloudMethod} onChange={(e) => setCloudMethod(e.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500">
                      <option value="SMS">SMS</option>
                      <option value="VOICE">Appel vocal</option>
                    </select>
                  </div>
                  {cloudError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" /><p className="text-sm text-red-800">{cloudError}</p>
                    </div>
                  )}
                  <button onClick={handleCloudAddNumber} disabled={cloudLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium">
                    {cloudLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Envoyer le code de vérification
                  </button>
                </div>
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

            {/* QR Code — affiché d'office dès qu'une session Baileys existante
                est tombée (voir needsQrScan), sinon derrière « Méthode
                alternative » pour les écoles qui n'en ont pas encore. */}
            {(needsQrScan || (showLegacy && sessionStatus && !sessionStatus.connected && sessionStatus.provider !== 'cloud' && sessionStatus.session)) && (
              <div className={`rounded-lg border p-6 shadow-sm ${needsQrScan ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-white'}`}>
                {needsQrScan && (
                  <div className="mb-4 flex items-start gap-2 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>
                      La session de l'école n'est plus valide : WhatsApp a invalidé l'appareil lié.
                      Scannez ce QR code pour rétablir l'envoi — les campagnes interrompues repartent
                      automatiquement là où elles s'étaient arrêtées.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2"><QrCode className="w-5 h-5" /> Scanner le QR Code</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={() => fetchQR(false, false)} disabled={qrLoading}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                      <RefreshCw className={`w-4 h-4 ${qrLoading ? 'animate-spin' : ''}`} /> {qrCode ? 'Rafraîchir' : 'Obtenir le QR'}
                    </button>
                    {(qrNeedsRepair || needsQrScan) && (
                      <button
                        onClick={() => {
                          if (!confirm("Régénérer le QR ? L'appairage actuel sera supprimé et remplacé par le nouveau scan. À faire uniquement si aucun QR n'apparaît.")) return;
                          fetchQR(false, true);
                        }}
                        disabled={qrRepairing}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm border border-amber-400 text-amber-800 bg-white rounded-lg hover:bg-amber-50 disabled:opacity-50">
                        <QrCode className={`w-4 h-4 ${qrRepairing ? 'animate-spin' : ''}`} /> {qrRepairing ? 'Régénération…' : 'Régénérer le QR'}
                      </button>
                    )}
                  </div>
                </div>
                {qrNeedsRepair && !qrCode && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-100/60 p-3 text-sm text-amber-900">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p>
                      WhatsApp refuse l'appairage enregistré : aucun QR ne peut être produit tant
                      qu'il n'est pas remplacé. Cliquez sur <strong>Régénérer le QR</strong>.
                    </p>
                  </div>
                )}
                {qrLoading ? (
                  <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div></div>
                ) : qrCode ? (
                  <div className="flex flex-col items-center gap-4">
                    {/* Pas de imageRendering:pixelated : le downscale 512→320 en
                        nearest-neighbor déforme les modules et empêche le scan
                        sur iPhone (scanner iOS plus exigeant). Rendu lisse = net. */}
                    <div className="p-4 bg-white border-2 border-gray-200 rounded-xl"><img src={qrCode} alt="QR Code" className="w-80 h-80" /></div>
                    <div className="text-center">
                      <p className="text-sm text-gray-700 font-medium">Scannez avec l'application WhatsApp</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Android : Menu (⋮) · iPhone : Réglages ⚙️ → <strong>Appareils connectés</strong> → <strong>Connecter un appareil</strong>
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">Scannez depuis WhatsApp (pas l'app Appareil photo). Augmentez la luminosité de l'écran.</p>
                    </div>

                    {/* Alternative : connexion par code (iPhone qui ne scanne pas) */}
                    <div className="w-full max-w-sm border-t border-gray-200 pt-3">
                      {!showPairing ? (
                        <button onClick={() => { setShowPairing(true); setPairingPhone(sessionStatus?.session?.phone || ''); }}
                          className="text-sm text-green-700 hover:underline">
                          📱 Le QR ne se scanne pas ? Se connecter avec un code
                        </button>
                      ) : (
                        <div className="space-y-2 text-left">
                          <label className="block text-xs font-semibold text-gray-700">Numéro WhatsApp (format international)</label>
                          <div className="flex gap-2">
                            <input type="text" value={pairingPhone} onChange={e => setPairingPhone(e.target.value)}
                              placeholder="+212600000000"
                              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                            <button onClick={requestPairing} disabled={pairingLoading}
                              className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                              {pairingLoading ? '…' : 'Obtenir le code'}
                            </button>
                          </div>
                          {pairingError && <p className="text-xs text-red-600">{pairingError}</p>}
                          {pairingCode && (
                            <div className="text-center bg-green-50 border border-green-200 rounded-lg p-3">
                              <p className="text-xs text-gray-600 mb-1">Saisissez ce code dans WhatsApp :</p>
                              <p className="text-2xl font-bold tracking-widest text-green-800 select-all">{pairingCode}</p>
                              <p className="text-[11px] text-gray-500 mt-2">
                                WhatsApp → <strong>Appareils connectés</strong> → <strong>Connecter un appareil</strong> →
                                <strong> Lier avec numéro de téléphone</strong> → entrez ce code.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
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

            {/* Méthode alternative : ancien flux Baileys (QR), masqué par défaut */}
            {sessionStatus?.provider !== 'cloud' && (
              <div className="text-center">
                {!showLegacy ? (
                  <button onClick={() => setShowLegacy(true)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline">
                    Méthode alternative : connexion par QR code (Baileys, non-officielle)
                  </button>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 space-y-3 text-left">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><QrCode className="w-4 h-4" /> Connexion par QR code (ancienne méthode)</h3>
                      <button onClick={() => setShowLegacy(false)} className="text-xs text-gray-400 hover:text-gray-600 underline">Masquer</button>
                    </div>
                    <p className="text-xs text-gray-500">Méthode non-officielle (Baileys), sans boutons et avec risque de blocage. Préférez l'API officielle ci-dessus.</p>
                    {sessionStatus?.status === 'no_session' && (
                      <button onClick={() => setShowCreateForm(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium">
                        <Plus className="w-4 h-4" /> Créer une session QR
                      </button>
                    )}
                    <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                      <li>Créez une session avec le numéro WhatsApp de l'école</li>
                      <li>Cliquez sur « Obtenir le QR »</li>
                      <li>WhatsApp → Appareils connectés → Connecter un appareil → scannez</li>
                    </ol>
                  </div>
                )}
              </div>
            )}

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
                  <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded">{stripMediaLinks(detailMessage.message.content)}</p>
                  {detailMessage.message.media_url && (
                    <a href={detailMessage.message.media_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100 max-w-full">
                      <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{detailMessage.message.file_name || 'Pièce jointe'}</span>
                    </a>
                  )}
                  <div className="flex gap-3 mt-2 text-xs text-gray-500">
                    <span>{formatFullDate(detailMessage.message.created_at)}</span>
                    {statusBadge(detailMessage.message.status)}
                  </div>
                </div>
              )}

              {/* Renvoyer à un sous-ensemble (non vus / non répondus / non distribués) */}
              <div className="rounded-lg border border-gray-200 bg-gray-50">
                <button
                  onClick={() => { setShowResend(v => !v); setResendMsg(''); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">
                  <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 text-indigo-600" /> Renvoyer ce message</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showResend ? 'rotate-180' : ''}`} />
                </button>
                {showResend && (
                  <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-200">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Renvoyer aux parents…</p>
                      <div className="flex flex-col gap-1.5">
                        {[
                          { k: 'unread', label: 'Non vus' },
                          { k: 'unresponded', label: 'Non répondus' },
                          { k: 'undelivered', label: 'Non distribués (échec)' },
                        ].map(o => (
                          <label key={o.k} className="flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={resendCriteria[o.k]}
                              onChange={(e) => setResendCriteria(c => ({ ...c, [o.k]: e.target.checked }))} />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Canal</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { k: 'app', icon: Smartphone, label: 'Application' },
                          { k: 'whatsapp', icon: MessageSquare, label: 'WhatsApp' },
                          { k: 'both', icon: Sparkles, label: 'Les deux' },
                        ].map(c => {
                          const CIcon = c.icon; const active = resendChannel === c.k;
                          return (
                            <button key={c.k} type="button" onClick={() => setResendChannel(c.k)}
                              className={`flex items-center gap-1.5 justify-center rounded-lg border-2 px-2 py-1.5 text-xs font-medium transition ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                              <CIcon className="w-3.5 h-3.5" /> {c.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {(() => {
                      const matches = resendMatchList(detailMessage.recipients);
                      const q = resendSearch.trim().toLowerCase();
                      const visible = q
                        ? matches.filter(r => {
                            const name = `${r.parent?.first_name || ''} ${r.parent?.last_name || ''}`.toLowerCase();
                            return name.includes(q) || (r.phone_e164 || '').toLowerCase().includes(q);
                          })
                        : matches;
                      const allVisibleChecked = visible.length > 0 && visible.every(r => resendSelected.has(r.id));
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[11px] font-semibold text-gray-500">Destinataires ({resendSelected.size}/{matches.length})</p>
                            {visible.length > 0 && (
                              <button type="button"
                                onClick={() => setResendSelected(prev => {
                                  const next = new Set(prev);
                                  if (allVisibleChecked) visible.forEach(r => next.delete(r.id));
                                  else visible.forEach(r => next.add(r.id));
                                  return next;
                                })}
                                className="text-[11px] text-indigo-600 hover:underline">
                                {allVisibleChecked ? 'Tout décocher' : 'Tout cocher'}
                              </button>
                            )}
                          </div>
                          <div className="relative mb-1.5">
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                            <input value={resendSearch} onChange={(e) => setResendSearch(e.target.value)}
                              placeholder="Rechercher un parent ou un numéro…"
                              className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-gray-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          </div>
                          <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                            {visible.length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-4">Aucun destinataire.</p>
                            ) : visible.map(r => (
                              <label key={r.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked={resendSelected.has(r.id)} onChange={() => toggleResendPick(r.id)} />
                                <span className="flex-1 min-w-0 truncate text-gray-700">
                                  {r.parent ? `${r.parent.first_name || ''} ${r.parent.last_name || ''}`.trim() : (r.phone_e164 || '📲 App')}
                                  {r.parent && r.phone_e164 && <span className="text-gray-400 text-xs ml-1">· {r.phone_e164}</span>}
                                </span>
                                <span className="flex-shrink-0 flex gap-1">
                                  {!r.read_at && <span className="text-[9px] px-1 rounded bg-amber-50 text-amber-600">non vu</span>}
                                  {r.status !== 'sent' && <span className="text-[9px] px-1 rounded bg-red-50 text-red-600">échec</span>}
                                </span>
                              </label>
                            ))}
                          </div>
                          <div className="flex items-center justify-end gap-2 mt-2">
                            <button onClick={submitResend} disabled={resendBusy || resendSelected.size === 0}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium">
                              {resendBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Renvoyer ({resendSelected.size})
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {resendMsg && <p className="px-3 pb-2 text-xs text-gray-600">{resendMsg}</p>}
              </div>

              <div>
                {/* Compteurs de suivi (vu / répondu) */}
                {(() => {
                  const recs = detailMessage.recipients || [];
                  const sentCount = recs.filter(r => r.status === 'sent').length;
                  const readApp = recs.filter(r => r.read_at && r.read_channel === 'app').length;
                  const readWa = recs.filter(r => r.read_at && r.read_channel !== 'app').length;
                  const readCount = readApp + readWa;
                  const respCount = recs.filter(r => r.responded_at).length;
                  const pct = (n) => sentCount ? ` (${Math.round((n / sentCount) * 100)}%)` : '';
                  return (
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <p className="text-xs font-semibold text-gray-500">Destinataires ({recs.length} ciblés · {sentCount} atteints)</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium"
                        title={`${readApp} via l'app · ${readWa} via WhatsApp`}>
                        👁 {readCount} vu(s){pct(readCount)}{readCount > 0 && ` — 📲 ${readApp} · 💬 ${readWa}`}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                        💬 {respCount} réponse(s){pct(respCount)}
                      </span>
                    </div>
                  );
                })()}
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {(detailMessage.recipients || []).map(r => (
                    <div key={r.id} className="py-1.5 px-2 bg-gray-50 rounded text-sm">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <span className="text-gray-700">{r.phone_e164 || '📲 App uniquement'}</span>
                          {r.parent && <span className="text-gray-500 ml-2 text-xs">({r.parent.first_name} {r.parent.last_name})</span>}
                        </div>
                        <span className={`text-xs font-medium flex-shrink-0 ${r.status === 'sent' ? 'text-green-600' : r.status === 'failed' ? 'text-red-600' : 'text-yellow-600'}`}>
                          {r.status === 'sent' ? '✓ Envoyé' : r.status === 'failed' ? '✗ Échec' : '...'}
                        </span>
                      </div>
                      {(r.read_at || r.responded_at || r.delivered_at || r.push_status || r.reaction) && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {r.push_status === 'sent' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">📲 Push envoyé</span>}
                          {r.push_status === 'no_subscription' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500" title="Notification visible à l'ouverture de l'app">📥 Boîte in-app</span>}
                          {r.delivered_at && !r.read_at && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">✓✓ Remis</span>}
                          {r.read_at && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                              👁 Vu {r.read_channel === 'app' ? '(app)' : '(WhatsApp)'} · {formatFullDate(r.read_at)}
                            </span>
                          )}
                          {r.reaction && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium" title="A aimé le message">
                              👍 Aimé
                            </span>
                          )}
                          {r.responded_at && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                              💬 A répondu {r.response_channel === 'app' ? '(app)' : '(WhatsApp)'} · {formatFullDate(r.responded_at)}
                            </span>
                          )}
                        </div>
                      )}
                      {r.response_text && (
                        <div className="mt-1 rounded bg-emerald-50 border border-emerald-100 px-2 py-1 text-xs text-gray-700 whitespace-pre-line">
                          {r.response_text}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default WhatsAppPage;
