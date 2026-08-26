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
  Bot, Sparkles, Mic,
  Download, Calendar, Filter, TrendingUp, BarChart3, BookOpen, Building2, Shield
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

// Rôles qui utilisent le hub /communication (onglets pilotés par l'URL +
// DomainTabs). Les autres rôles (finance, transport) restent sur /whatsapp
// avec la barre d'onglets interne.
const ADMIN_HUB_ROLES = ['admin', 'school_admin', 'pedagogical_director', 'pedagogical_manager'];

// Catégories d'activité proposées pour la fiche WhatsApp de l'établissement
// (sous-ensemble de l'énumération Meta, celles qui ont un sens pour une école).
// État d'examen du nom affiché par Meta. Tant qu'il n'est pas approuvé, les
// parents qui n'ont pas enregistré le contact voient le numéro brut.
const WA_NAME_STATUS = {
  APPROVED: { label: 'Approuvé — les parents voient le nom de l\'école', tone: 'emerald' },
  AVAILABLE_WITHOUT_REVIEW: { label: 'Actif (sans examen requis)', tone: 'emerald' },
  PENDING_REVIEW: { label: 'En cours d\'examen par Meta', tone: 'amber' },
  DECLINED: { label: 'Refusé par Meta — choisissez un autre nom', tone: 'red' },
  EXPIRED: { label: 'Expiré — à soumettre de nouveau', tone: 'red' },
  NONE: { label: 'Aucun nom soumis', tone: 'gray' },
};

const WA_TIERS = {
  TIER_250: '250 conversations / jour',
  TIER_1K: '1 000 conversations / jour',
  TIER_10K: '10 000 conversations / jour',
  TIER_100K: '100 000 conversations / jour',
  TIER_UNLIMITED: 'Illimité',
};

const WA_VERTICALS = [
  { value: 'EDU', label: 'Éducation' },
  { value: 'NONPROFIT', label: 'Association / à but non lucratif' },
  { value: 'PROF_SERVICES', label: 'Services professionnels' },
  { value: 'OTHER', label: 'Autre' },
];

const WhatsAppPage = ({ pageTab = null, pageTitle = null, pageSubtitle = null }) => {
  const { profile } = useAuth();
  const { year } = useYear(); // année active : scope les classes/destinataires
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const location = useLocation();
  const navigate = useNavigate();
  const { tab: routeTab } = useParams();
  const isHub = location.pathname.startsWith('/communication');
  const isManagedPage = isHub || Boolean(pageTab);
  const [localTab, setLocalTab] = useState('send');
  const activeTab = pageTab || (isHub ? (routeTab || 'inbox') : localTab);
  const setActiveTab = (key) => { if (isHub) navigate(`/communication/${key}`); else setLocalTab(key); };

  // Ancienne URL /whatsapp → hub pour les rôles admin (liens/favoris existants)
  useEffect(() => {
    if (!isManagedPage && ADMIN_HUB_ROLES.includes(profile?.role)) {
      navigate('/communication/inbox', { replace: true });
    }
  }, [isManagedPage, profile?.role, navigate]);

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
  // Modèles Meta approuvés : un message dont le corps est déjà validé part EN
  // ENTIER même hors fenêtre de 24 h, là où un texte libre serait seulement
  // annoncé au parent (qui doit répondre pour le recevoir).
  const [templates, setTemplates] = useState([]);
  const [templateKey, setTemplateKey] = useState('');
  const [templateParams, setTemplateParams] = useState([]);
  // Langue imposée à la campagne. Vide = chaque parent reçoit la sienne.
  const [templateLang, setTemplateLang] = useState('');
  // Segment de relance : uniquement les numéros dont un message reste au statut
  // « annoncé », c'est-à-dire ceux qui n'ont jamais reçu le contenu.
  const [pendingOnly, setPendingOnly] = useState(false);
  // Période du segment : 'all' | 'today' | 'week' | 'month' | 'custom'.
  const [pendingPeriod, setPendingPeriod] = useState('all');
  const [pendingFrom, setPendingFrom] = useState('');
  const [pendingTo, setPendingTo] = useState('');
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
  const [resendCriteria, setResendCriteria] = useState({ unread: true, unresponded: false, undelivered: false, wa_not_sent: false });
  const [resendChannel, setResendChannel] = useState('app'); // app | whatsapp | both
  // Personnalisation de la relance : salutation nominative.
  const [resendPersonalize, setResendPersonalize] = useState(true);
  const [resendScheduledAt, setResendScheduledAt] = useState(''); // '' = immédiat
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
  // URL signées des pièces jointes REÇUES : les binaires vivent dans le bucket
  // privé, on ne demande des liens qu'à l'ouverture d'une conversation.
  const [inboxMediaUrls, setInboxMediaUrls] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightMsgId, setHighlightMsgId] = useState(null); // message atteint par la recherche
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
  // Fil de discussion : on ne recolle en bas que si l'utilisateur y est deja
  // (comportement WhatsApp). Sinon on affiche une pastille « nouveaux messages »
  // et on laisse sa position de lecture intacte.
  const threadScrollRef = useRef(null);
  const threadAtBottomRef = useRef(true);
  const threadKeyRef = useRef(null);
  const threadCountRef = useRef(0);
  const [newBelowCount, setNewBelowCount] = useState(0);

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
  // Note vocale enregistrée au micro (PC ou téléphone)
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [voiceNote, setVoiceNote] = useState(null); // { blob, url, mimetype, secs }
  const [voiceSending, setVoiceSending] = useState(false);
  const recorderRef = useRef(null);
  const recordTimerRef = useRef(null);
  const recordSecsRef = useRef(0);

  // ===================== TAB: CONNECTION =====================
  const [sessionStatus, setSessionStatus] = useState(null);
  const [connLoading, setConnLoading] = useState(true);
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
  // Profil du numéro : photo + fiche entreprise. Un numéro Cloud API ne
  // s'ouvre plus dans l'application WhatsApp, tout se règle ici.
  const [waProfile, setWaProfile] = useState(null);
  const [waProfileForm, setWaProfileForm] = useState({ about: '', description: '', email: '', address: '', website: '', vertical: 'EDU' });
  const [waProfileBusy, setWaProfileBusy] = useState(false);
  const [waProfileMsg, setWaProfileMsg] = useState('');
  const [waProfileError, setWaProfileError] = useState('');
  const waPhotoInputRef = useRef(null);
  // Fiche technique du numéro chez Meta (nom affiché et son examen, qualité…)
  const [waNumber, setWaNumber] = useState(null);
  const [waNameInput, setWaNameInput] = useState('');
  const [waNameBusy, setWaNameBusy] = useState(false);
  const [waNameMsg, setWaNameMsg] = useState('');
  const [waNameError, setWaNameError] = useState('');
  const [waConsent, setWaConsent] = useState(null); // taux de consentement des parents

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
      if (pendingOnly) {
        params.append('pending_delivery', '1');
        params.append('pending_period', pendingPeriod);
        if (pendingPeriod === 'custom') {
          if (pendingFrom) params.append('pending_from', pendingFrom);
          if (pendingTo) params.append('pending_to', pendingTo);
        }
      }
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
  }, [apiUrl, selectedClasses, classes.length, schoolTypeFilter, levelFilter, year, pendingOnly, pendingPeriod, pendingFrom, pendingTo]);

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

  // Modèles approuvés, chargés une fois : la liste ne change qu'au rythme des
  // validations de Meta, pas à chaque ouverture de l'onglet.
  useEffect(() => {
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${apiUrl}/api/admin/whatsapp/templates`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setTemplates(await res.json());
      } catch (error) {
        console.error('Erreur modèles:', error);
      }
    })();
  }, [apiUrl]);

  const selectedTemplate = templates.find((t) => t.key === templateKey) || null;

  /** Corps du modèle, variables remplacées par les valeurs saisies. */
  const renderTemplate = useCallback((tpl, valeurs, langue) => {
    const corps = tpl.bodies?.[langue] || tpl.bodies?.fr || tpl.bodies?.[tpl.languages?.[0]] || '';
    return (tpl.params || []).reduce(
      (texte, _, i) => texte.replaceAll(`{{${i + 1}}}`, valeurs[i] || `{{${i + 1}}}`),
      corps,
    );
  }, []);

  /** Choix d'un modèle : le message devient son corps, non modifiable. */
  const chooseTemplate = (key) => {
    setTemplateKey(key);
    setTemplateLang('');
    if (!key) { setTemplateParams([]); return; }
    const tpl = templates.find((t) => t.key === key);
    if (!tpl) return;
    const valeurs = (tpl.params || []).map((_, i) => tpl.example?.[i] || '');
    setTemplateParams(valeurs);
    setMessageType('text');
    setMessageText(renderTemplate(tpl, valeurs, ''));
  };

  const setTemplateParam = (index, valeur) => {
    const valeurs = [...templateParams];
    valeurs[index] = valeur;
    setTemplateParams(valeurs);
    if (selectedTemplate) setMessageText(renderTemplate(selectedTemplate, valeurs, templateLang));
  };

  /** Langue imposée, ou '' pour suivre celle de chaque parent. */
  const chooseTemplateLang = (langue) => {
    setTemplateLang(langue);
    if (selectedTemplate) setMessageText(renderTemplate(selectedTemplate, templateParams, langue));
  };

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
  // Le segment « en attente de livraison » est résolu par le serveur : son
  // décompte fait autorité, y compris en mode sélection où les parents cochés
  // sont ensuite restreints à ceux qui attendent vraiment leur contenu.
  const effectiveRecipientCount = pendingOnly
    ? recipientCount
    : parentSelectionMode === 'select'
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
      if (pendingOnly) {
        filter.pending_delivery = true;
        filter.pending_period = pendingPeriod;
        if (pendingPeriod === 'custom') {
          if (pendingFrom) filter.pending_from = pendingFrom;
          if (pendingTo) filter.pending_to = pendingTo;
        }
      }
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, type: messageType, mediaUrl: uploadedUrl || null, fileName: fileName || null, filter, category: messageCategory, channels: sendChannels, templateKey: templateKey || null, templateParams, templateLang: templateLang || null })
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
      setResendCriteria({ unread: true, unresponded: false, undelivered: false, wa_not_sent: false });
      setResendChannel('app');
    } catch (error) { console.error('Erreur détails:', error); }
  };

  // Destinataires correspondant aux critères de renvoi + canal (liste cochable).
  const resendMatchList = (recs) => {
    const crit = resendCriteria;
    if (!crit.unread && !crit.unresponded && !crit.undelivered && !crit.wa_not_sent) return [];
    let matched = (recs || []).filter(r =>
      (crit.unread && !r.read_at) ||
      (crit.unresponded && !r.responded_at) ||
      (crit.undelivered && r.status !== 'sent') ||
      // WhatsApp jamais parti : `status` ne le dit pas, il passe à 'sent' dès
      // que la notification in-app est créée. Seul wa_status suit ce canal.
      (crit.wa_not_sent && !!r.phone_e164 && r.wa_status !== 'sent'));
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
        body: JSON.stringify({
          criteria,
          channel: resendChannel,
          recipient_ids,
          personalize: resendPersonalize,
          // datetime-local est une heure LOCALE sans fuseau : on la convertit
          // en ISO absolu, sinon le serveur l'interpréterait en UTC et la
          // relance partirait avec une heure de décalage.
          scheduled_at: resendScheduledAt ? new Date(resendScheduledAt).toISOString() : null,
        }),
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
  // `silent` : rafraichissement de fond (minuterie). On ne bascule pas la liste
  // sur le spinner, sinon les lignes sont demontees et le defilement en cours
  // repart du haut.
  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setInboxLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setConversations(data.conversations || []);
    } catch (error) { console.error('Erreur conversations:', error); }
    finally { if (!silent) setInboxLoading(false); setConvFetchedAt(Date.now()); }
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
    const id = setInterval(() => fetchConversations(true), 30000);
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

  const scrollThreadToBottom = useCallback((behavior = 'smooth') => {
    const el = threadScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    threadAtBottomRef.current = true;
    setNewBelowCount(0);
  }, []);

  const handleThreadScroll = useCallback(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    threadAtBottomRef.current = atBottom;
    if (atBottom) setNewBelowCount(0);
  }, []);

  // Ouverture d'un fil -> on colle en bas. Nouveaux messages sur un fil deja
  // ouvert -> on ne bouge que si l'utilisateur lisait deja le bas.
  useEffect(() => {
    if (!selectedConv) { threadKeyRef.current = null; threadCountRef.current = 0; setNewBelowCount(0); return; }
    const count = selectedConv.messages?.length || 0;
    if (threadKeyRef.current !== selectedConv.phone) {
      threadKeyRef.current = selectedConv.phone;
      threadCountRef.current = count;
      threadAtBottomRef.current = true;
      setNewBelowCount(0);
      requestAnimationFrame(() => scrollThreadToBottom('auto'));
      return;
    }
    const added = count - threadCountRef.current;
    threadCountRef.current = count;
    if (added <= 0) return;
    if (threadAtBottomRef.current) scrollThreadToBottom('smooth');
    else setNewBelowCount(n => n + added);
  }, [selectedConv, scrollThreadToBottom]);

  // Pièces jointes du fil ouvert → URL signées (1 h). On ne redemande que les
  // manquantes : rouvrir la même conversation ne relance pas d'appel.
  useEffect(() => {
    if (!selectedConv) return;
    const ids = selectedConv.messages
      .map((m) => m.mediaMessageId)
      .filter((id) => id && !inboxMediaUrls[id]);
    if (!ids.length) return;
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch(`${apiUrl}/api/admin/whatsapp/inbox/media-urls`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [...new Set(ids)] }),
        });
        const data = await res.json();
        if (data.urls) setInboxMediaUrls((prev) => ({ ...prev, ...data.urls }));
      } catch (e) {
        console.error('Erreur URL pièces jointes:', e);
      }
    })();
  }, [selectedConv, apiUrl, inboxMediaUrls]);

  // Recherche : contact OU contenu des messages. Elle porte sur l'historique
  // déjà chargé — c'est ce que la boîte affiche, donc ce que l'utilisateur
  // s'attend à pouvoir retrouver.
  const searchTerm = searchQuery.trim().toLowerCase();

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = !searchTerm ||
      (conv.parentName && conv.parentName.toLowerCase().includes(searchTerm)) ||
      conv.phone.includes(searchQuery.trim()) ||
      conv.messages.some(m => (m.content || '').toLowerCase().includes(searchTerm));
    const matchesFilter = inboxFilter === 'all' ||
      (inboxFilter === 'awaiting' && conv.awaitingReply) ||
      (inboxFilter === 'received' && conv.totalReceived > 0) ||
      (inboxFilter === 'sent' && conv.totalSent > 0) ||
      (inboxFilter === 'announced' && (conv.totalAnnounced || 0) > 0) ||
      (inboxFilter === 'silent' && conv.totalReceived === 0 && (conv.totalSent > 0 || (conv.totalAnnounced || 0) > 0)) ||
      // Un échec déjà rattrapé par un renvoi réussi vers le même numéro n'a
      // plus à figurer ici (cas des échecs hérités de l'ancien fournisseur).
      (inboxFilter === 'failed' && (conv.hasUnresolvedFailure ?? conv.totalFailed > 0));
    return matchesSearch && matchesFilter;
  });

  // Messages contenant le terme cherché, du plus récent au plus ancien.
  // Deux caractères minimum : en dessous, tout ressort et le résultat est inutile.
  const messageHits = useMemo(() => {
    if (searchTerm.length < 2) return [];
    const hits = [];
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        const content = msg.content || '';
        const at = content.toLowerCase().indexOf(searchTerm);
        if (at === -1) continue;
        // Extrait centré sur le terme trouvé, plutôt que le début du message.
        const from = Math.max(0, at - 40);
        hits.push({
          conv,
          msg,
          snippet: (from > 0 ? '…' : '') + content.slice(from, at + searchTerm.length + 60).trim()
            + (at + searchTerm.length + 60 < content.length ? '…' : ''),
        });
        if (hits.length >= 200) break;
      }
      if (hits.length >= 200) break;
    }
    return hits.sort((a, b) => new Date(b.msg.createdAt) - new Date(a.msg.createdAt)).slice(0, 50);
  }, [conversations, searchTerm]);

  // Ouvre la conversation et amène le message trouvé à l'écran.
  const jumpToMessage = (conv, msgId) => {
    setSelectedConv(conv);
    setHighlightMsgId(msgId);
  };

  useEffect(() => {
    if (!highlightMsgId) return;
    // Laisse le fil se peindre (et le scroll automatique vers le bas se faire)
    // avant de remonter jusqu'au message cherché.
    const t = setTimeout(() => {
      document.getElementById(`msg-${highlightMsgId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    const clear = setTimeout(() => setHighlightMsgId(null), 4000);
    return () => { clearTimeout(t); clearTimeout(clear); };
  }, [highlightMsgId, selectedConv]);

  const awaitingCount = conversations.filter(c => c.awaitingReply).length;
  // Numéros que l'école a sollicités et qui n'ont JAMAIS écrit en retour.
  // Ce sont eux, et eux seuls, dont la fenêtre de 24 h ne s'ouvre jamais :
  // tout ce qui leur a été annoncé attend encore sa livraison.
  const silencieuxCount = conversations.filter(
    c => c.totalReceived === 0 && (c.totalSent > 0 || (c.totalAnnounced || 0) > 0)
  ).length;
  const annoncesCount = conversations.filter(c => (c.totalAnnounced || 0) > 0).length;

  // Inline compose helpers
  // Format d'enregistrement : on demande d'abord ceux que WhatsApp accepte tels
  // quels (ogg/opus sur Firefox, mp4 sur Safari). Chrome ne sait produire que du
  // WebM — le serveur le reconvertit alors avec ffmpeg.
  const pickAudioMime = () => {
    if (typeof MediaRecorder === 'undefined') return null;
    const candidates = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    return candidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  };

  const stopRecordTimer = () => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  };

  const startRecording = async () => {
    setDirectError('');
    const mimeType = pickAudioMime();
    if (mimeType === null) {
      setDirectError("Ce navigateur ne sait pas enregistrer de son. Utilisez Chrome, Firefox ou Safari.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      rec.onstop = () => {
        stopRecordTimer();
        stream.getTracks().forEach((t) => t.stop());   // libère le micro (voyant éteint)
        const type = rec.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type });
        setVoiceNote(blob.size
          ? { blob, url: URL.createObjectURL(blob), mimetype: type, secs: recordSecsRef.current }
          : null);
        setRecording(false);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecordSecs(0);
      recordSecsRef.current = 0;
      recordTimerRef.current = setInterval(() => {
        recordSecsRef.current += 1;
        setRecordSecs(recordSecsRef.current);
        // Garde-fou : au-delà de 3 minutes, on arrête seul (limite de taille
        // côté Meta, et personne n'écoute un vocal de 10 minutes).
        if (recordSecsRef.current >= 180) rec.state === 'recording' && rec.stop();
      }, 1000);
    } catch (e) {
      setDirectError(e?.name === 'NotAllowedError'
        ? "Accès au micro refusé. Autorisez le microphone dans les réglages du navigateur."
        : "Micro indisponible : " + (e?.message || 'erreur inconnue'));
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state === 'recording') rec.stop();
  };

  const discardVoiceNote = () => {
    if (voiceNote?.url) URL.revokeObjectURL(voiceNote.url);
    setVoiceNote(null);
  };

  const sendVoiceNote = async () => {
    if (!voiceNote || !selectedConv) return;
    setVoiceSending(true); setDirectError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(voiceNote.blob);
      });
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/inbox/voice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: selectedConv.phone,
          parentId: selectedConv.parentId || null,
          base64,
          mimetype: voiceNote.mimetype,
        }),
      });
      const data = await res.json();
      if (data.success) { discardVoiceNote(); fetchConversations(); }
      else setDirectError(data.error || "La note vocale n'a pas pu être envoyée.");
    } catch (e) {
      setDirectError('Erreur de connexion au serveur.');
    } finally { setVoiceSending(false); }
  };

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
        setTimeout(() => scrollThreadToBottom('smooth'), 100);
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
  // section (sinon la partie connexion « se recharge » en boucle sous les yeux).
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

  const isCloudConnected = Boolean(sessionStatus?.connected);

  // ── Profil du numéro WhatsApp (photo + fiche entreprise) ────────────────
  const fetchWaProfile = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/cloud/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) return;                       // numéro pas encore rattaché
      setWaProfile(data.profile || {});
      setWaProfileForm({
        about: data.profile?.about || '',
        description: data.profile?.description || '',
        email: data.profile?.email || '',
        address: data.profile?.address || '',
        website: data.profile?.websites?.[0] || '',
        // Meta renvoie la chaîne « UNDEFINED » quand aucune catégorie n'est
        // définie — la relui renvoyer telle quelle fait échouer la mise à jour
        // (erreur #100). Toute valeur hors de nos options retombe sur EDU.
        vertical: WA_VERTICALS.some((v) => v.value === data.profile?.vertical)
          ? data.profile.vertical
          : 'EDU',
      });
    } catch (e) {
      console.error('Erreur fetch profil WhatsApp:', e);
    }
  }, [apiUrl]);

  const fetchWaNumber = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/cloud/number-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) return;
      setWaNumber(data.number || null);
      setWaNameInput(data.number?.verified_name || '');
    } catch (e) {
      console.error('Erreur fetch numéro WhatsApp:', e);
    }
  }, [apiUrl]);

  const fetchWaConsent = useCallback(async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/consent-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setWaConsent(data.stats);
    } catch (e) {
      console.error('Erreur fetch consentement:', e);
    }
  }, [apiUrl]);

  useEffect(() => {
    if (isCloudConnected) { fetchWaProfile(); fetchWaNumber(); fetchWaConsent(); }
  }, [isCloudConnected, fetchWaProfile, fetchWaNumber, fetchWaConsent]);

  // Nouveau nom affiché : Meta ouvre un examen, l'ancien nom reste actif d'ici là.
  const requestWaDisplayName = async () => {
    const name = waNameInput.trim();
    if (name.length < 3) { setWaNameError('Nom trop court.'); return; }
    setWaNameBusy(true); setWaNameMsg(''); setWaNameError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/cloud/display-name`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.number) setWaNumber(data.number);
        setWaNameMsg('Demande envoyée. Meta examine le nom (quelques minutes à 48 h) ; l\'ancien nom reste actif d\'ici là.');
        fetchStatus();
      } else {
        setWaNameError(data.error || 'Demande impossible.');
      }
    } catch (e) {
      console.error('Erreur demande nom affiché:', e);
      setWaNameError('Erreur de connexion au serveur.');
    } finally { setWaNameBusy(false); }
  };

  // payload : { photo_base64 } ou { use_school_logo } ou les champs texte.
  const saveWaProfile = async (payload) => {
    setWaProfileBusy(true); setWaProfileMsg(''); setWaProfileError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/cloud/profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        if (data.profile) setWaProfile(data.profile);
        setWaProfileMsg(data.photo_updated
          ? 'Photo de profil mise à jour. Elle peut mettre quelques minutes à apparaître chez les parents.'
          : 'Profil mis à jour.');
      } else {
        setWaProfileError(data.error || 'Mise à jour impossible.');
      }
    } catch (e) {
      console.error('Erreur maj profil WhatsApp:', e);
      setWaProfileError('Erreur de connexion au serveur.');
    } finally { setWaProfileBusy(false); }
  };

  const handleWaPhotoPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';                               // re-sélection du même fichier possible
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setWaProfileError('Formats acceptés : JPEG, PNG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setWaProfileError('Image trop lourde (5 Mo maximum).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => saveWaProfile({ photo_base64: String(reader.result), mimetype: file.type });
    reader.onerror = () => setWaProfileError('Lecture du fichier impossible.');
    reader.readAsDataURL(file);
  };

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

  // Tant que le numéro n'est pas « connected », on suit le statut : la
  // vérification Cloud API bascule l'état côté serveur sans action de l'admin.
  const needsPolling = activeTab === 'connection'
    && Boolean(sessionStatus?.session)
    && !sessionStatus?.connected;

  useEffect(() => {
    if (!needsPolling) return;
    const statusTimer = setInterval(() => { fetchStatus(true); }, 3000);
    return () => clearInterval(statusTimer);
  }, [needsPolling, fetchStatus]);

  const handleDeleteSession = async () => {
    setDeleting(true);
    try {
      const token = await getAuthToken();
      // Le backend identifie l'école par school_id (via le JWT), l'ID dans
      // l'URL est ignoré — on envoie 'current' comme placeholder.
      const sessionRef = sessionStatus?.session?.id || 'current';
      const res = await fetch(`${apiUrl}/api/admin/whatsapp/sessions/${sessionRef}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) { setConfirmDelete(false); setSessionStatus(null); fetchStatus(); }
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

  // Date à afficher pour un envoi. created_at est l'instant du CLIC, pas celui
  // du départ : un envoi programmé la nuit pour le lendemain matin s'affichait
  // à 1 h du matin. On montre donc la date qui a du sens selon l'état :
  //   programmé et pas encore parti → la date prévue
  //   terminé ou échoué             → la date de fin d'envoi (updated_at)
  //   en cours                      → la date de création
  const sendDate = (msg) => {
    if (!msg) return { text: '', title: '' };
    const created = formatFullDate(msg.created_at);
    const scheduled = msg.scheduled_at ? new Date(msg.scheduled_at) : null;
    const notSentYet = ['pending', 'scheduled'].includes(msg.status);

    if (scheduled && notSentYet && scheduled.getTime() > Date.now()) {
      return { text: `⏳ Prévu le ${formatFullDate(msg.scheduled_at)}`, title: `Créé le ${created}` };
    }
    const done = ['completed', 'failed', 'sent'].includes(msg.status);
    const when = done && msg.updated_at ? msg.updated_at : msg.created_at;
    return {
      text: formatFullDate(when),
      title: when === msg.created_at ? '' : `Créé le ${created} · envoyé le ${formatFullDate(when)}`,
    };
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
      // Hors fenêtre de 24 h, WhatsApp n'accepte qu'une annonce : le contenu
      // part automatiquement dès que le destinataire répond.
      announced: { color: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Annoncé' },
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
    if (type === 'image' || type === 'sticker') return <Image className="w-3.5 h-3.5" />;
    if (type === 'audio') return <Mic className="w-3.5 h-3.5" />;
    if (type === 'video') return <Paperclip className="w-3.5 h-3.5" />;
    if (type === 'document') return <FileText className="w-3.5 h-3.5" />;
    return null;
  };

  // Fenêtre de service Meta : tant qu'un message du parent date de moins de
  // 24 h, l'école peut répondre librement (et gratuitement). Passé ce délai,
  // seul un template approuvé part — d'où l'avertissement dans l'en-tête.
  const serviceWindow = (conv) => {
    if (!conv?.lastIncomingAt) return { open: false, hoursLeft: 0 };
    const elapsed = (Date.now() - new Date(conv.lastIncomingAt).getTime()) / 3600000;
    return { open: elapsed < 24, hoursLeft: Math.max(0, Math.floor(24 - elapsed)) };
  };

  const inboxTotalSent = conversations.reduce((s, c) => s + c.totalSent, 0);
  const inboxTotalFailed = conversations.filter(c => c.hasUnresolvedFailure ?? c.totalFailed > 0).length;
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
  // en pièce jointe (sendMediaBuffer), pas en texte tronqué.
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
    <div className={`${isManagedPage ? 'h-[calc(100vh-8rem)]' : 'h-[calc(100vh-4rem)]'} flex flex-col overflow-hidden bg-gray-50`}>
      {/* ===== HEADER WITH TABS ===== */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        {/* Top bar */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 bg-gradient-to-br ${isManagedPage ? 'from-indigo-500 to-violet-600' : 'from-green-500 to-green-600'} rounded-xl flex items-center justify-center shadow-sm`}>
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{pageTitle || (isHub ? 'Communication' : 'WhatsApp')}</h1>
              <p className="text-xs text-gray-500">{pageSubtitle || (isHub ? 'App (push) + WhatsApp — envoi, suivi de lecture et réponses' : 'Messagerie instantanée')}</p>
            </div>
          </div>
          {sessionStatus && !pageTab && (
            <button
              type="button"
              onClick={() => isHub && navigate('/communication/connection')}
              aria-label={`${sessionStatus.connected ? 'WhatsApp connecté' : 'WhatsApp déconnecté'}${isHub ? ' — ouvrir les paramètres' : ''}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm ${isHub ? 'cursor-pointer hover:shadow' : 'cursor-default'} ${
              sessionStatus.connected
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-600 border-red-200'
            }`}>
              <div className={`w-2 h-2 rounded-full ${sessionStatus.connected ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`}></div>
              {sessionStatus.connected ? 'WhatsApp connecté' : 'WhatsApp déconnecté'}
            </button>
          )}
        </div>

        {/* Horizontal tabs — sur le hub /communication, la navigation passe par
            les onglets du domaine (DomainTabs) ; la barre interne reste pour
            les rôles finance/transport sur /whatsapp. */}
        {!isManagedPage && (
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
                {/* Relance ciblée : les numéros dont un message n'est jamais
                    arrivé. Hors fenêtre de 24 h seule l'annonce part, et ces
                    parents restent sans le contenu tant qu'ils n'écrivent pas. */}
                <div className="pt-3 border-t border-gray-100">
                  <label className={`flex items-start gap-2 cursor-pointer rounded-lg border-2 p-2.5 transition-all ${pendingOnly ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <input type="checkbox" checked={pendingOnly}
                      onChange={(e) => setPendingOnly(e.target.checked)}
                      className="w-3.5 h-3.5 mt-0.5 text-amber-600" />
                    <span>
                      <span className={`text-sm font-semibold ${pendingOnly ? 'text-amber-700' : 'text-gray-700'}`}>
                        Relancer uniquement les messages en attente de livraison
                      </span>
                      <span className="block text-[11px] text-gray-500 leading-snug mt-0.5">
                        Ces parents n'ont reçu qu'une annonce, jamais le contenu. La sélection se combine avec les classes choisies ci-dessus.
                      </span>
                    </span>
                  </label>

                  {/* Période : une relance porte rarement sur tout l'historique.
                      On vise l'envoi de ce matin, ou celui de la semaine. */}
                  {pendingOnly && (
                    <div className="mt-2 pl-6 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-[11px] text-gray-500">Période :</label>
                        {[
                          { key: 'today', label: "Aujourd'hui" },
                          { key: 'week', label: '7 jours' },
                          { key: 'month', label: '30 jours' },
                          { key: 'all', label: 'Tout' },
                          { key: 'custom', label: 'Personnalisée' },
                        ].map((p) => (
                          <button key={p.key} type="button"
                            onClick={() => setPendingPeriod(p.key)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${pendingPeriod === p.key ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                      {pendingPeriod === 'custom' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-[11px] text-gray-500">Du</label>
                          <input type="date" value={pendingFrom} onChange={(e) => setPendingFrom(e.target.value)}
                            className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-amber-500" />
                          <label className="text-[11px] text-gray-500">au</label>
                          <input type="date" value={pendingTo} onChange={(e) => setPendingTo(e.target.value)}
                            className="text-xs border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-amber-500" />
                        </div>
                      )}
                    </div>
                  )}
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

                {/* Modèle approuvé — la seule façon de joindre un parent hors
                    fenêtre de 24 h avec le message ENTIER. Un texte libre, lui,
                    n'est alors qu'annoncé, et attend la réponse du parent. */}
                {templates.length > 0 && sendChannels !== 'push' && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Modèle approuvé :
                      </label>
                      <select
                        value={templateKey}
                        onChange={(e) => chooseTemplate(e.target.value)}
                        className="text-xs border border-gray-300 rounded-md px-2 py-1 flex-1 focus:ring-2 focus:ring-green-500">
                        <option value="">Message libre (annoncé hors 24 h)</option>
                        {templates.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.name}{t.category === 'MARKETING' ? ' — marketing' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedTemplate && (
                      <>
                        {(selectedTemplate.params || []).map((nom, i) => (
                          <div key={nom} className="flex items-center gap-2">
                            <label className="text-[11px] text-gray-500 w-40 flex-shrink-0">
                              {`{{${i + 1}}}`} {nom}
                            </label>
                            <input
                              type="text"
                              value={templateParams[i] || ''}
                              onChange={(e) => setTemplateParam(i, e.target.value)}
                              placeholder={selectedTemplate.example?.[i] || ''}
                              className="text-xs border border-gray-300 rounded-md px-2 py-1 flex-1 focus:ring-2 focus:ring-green-500" />
                          </div>
                        ))}
                        {(selectedTemplate.languages || []).length > 1 && (
                          <div className="flex items-center gap-2">
                            <label className="text-[11px] text-gray-500 w-40 flex-shrink-0">
                              Langue d'envoi
                            </label>
                            <select
                              value={templateLang}
                              onChange={(e) => chooseTemplateLang(e.target.value)}
                              className="text-xs border border-gray-300 rounded-md px-2 py-1 flex-1 focus:ring-2 focus:ring-green-500">
                              <option value="">Automatique — la langue de chaque parent</option>
                              {selectedTemplate.languages.map((l) => (
                                <option key={l} value={l}>
                                  {l === 'ar' ? 'Arabe pour tous — العربية' : l === 'fr' ? 'Français pour tous' : l}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <p className="text-[11px] text-gray-500 leading-snug">
                          Le corps du message est fixé par Meta : seules les valeurs ci-dessus changent.
                          {templateLang
                            ? ` Tous les parents le recevront en ${templateLang === 'ar' ? 'arabe' : 'français'}.`
                            : ` Chaque parent le recevra dans sa langue (${selectedTemplate.languages?.join(' ou ')}) : celle qu'il a choisie dans l'application, sinon celle de son dernier message.`}
                        </p>
                        {selectedTemplate.category === 'MARKETING' && (
                          <p className="text-[11px] text-amber-600 flex items-start gap-1">
                            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            Modèle marketing : jamais envoyé aux parents désabonnés, plafonné par Meta et facturé plus cher que l'utilitaire.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)}
                  readOnly={!!selectedTemplate}
                  placeholder="Tapez votre message ici..." rows="5"
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${selectedTemplate ? 'bg-gray-50 text-gray-600' : ''}`} />

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
                          <p className="text-xs text-gray-500 mt-0.5" title={sendDate(msg).title}>{sendDate(msg).text}</p>
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
              {inboxTotalFailed > 0 && <span className="text-[11px] text-red-500" title="Conversations dont le dernier envoi a échoué (les échecs déjà rattrapés par un renvoi ne comptent pas)"><strong>{inboxTotalFailed}</strong> à renvoyer</span>}
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
                      placeholder="Rechercher un contact ou un message…"
                      className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-gray-50" />
                    {searchQuery && (
                      <button type="button" onClick={() => setSearchQuery('')} title="Effacer"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-200">
                        <X className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { key: 'all', label: 'Tous' },
                      { key: 'awaiting', label: `À répondre${awaitingCount ? ` (${awaitingCount})` : ''}` },
                      { key: 'received', label: 'Réponses reçues' },
                      { key: 'sent', label: 'Envoyés' },
                      { key: 'announced', label: `En attente de livraison${annoncesCount ? ` (${annoncesCount})` : ''}` },
                      { key: 'silent', label: `Jamais répondu${silencieuxCount ? ` (${silencieuxCount})` : ''}` },
                      { key: 'failed', label: 'Échoués' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setInboxFilter(f.key)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full ${inboxFilter === f.key ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Résultats dans le contenu des messages : la liste des
                    conversations ne dit pas OÙ le terme apparaît, ce bloc si. */}
                {searchTerm.length >= 2 && (
                  <div className="border-b border-gray-100 bg-amber-50/40 max-h-64 overflow-y-auto flex-shrink-0">
                    <p className="px-3 py-1.5 text-[11px] font-semibold text-amber-800 sticky top-0 bg-amber-50">
                      {messageHits.length === 0
                        ? 'Aucun message ne contient ce terme'
                        : `${messageHits.length} message(s) trouvé(s)${messageHits.length === 50 ? ' (50 premiers)' : ''}`}
                    </p>
                    {messageHits.map(({ conv, msg, snippet }) => (
                      <button key={`hit-${msg.id}`} type="button"
                        onClick={() => jumpToMessage(conv, msg.id)}
                        className="w-full text-left px-3 py-2 border-t border-amber-100/70 hover:bg-amber-100/50">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {msg.direction === 'incoming'
                            ? <ArrowDownLeft className="w-3 h-3 text-blue-500 flex-shrink-0" />
                            : <ArrowUpRight className="w-3 h-3 text-green-600 flex-shrink-0" />}
                          <span className="text-[11px] font-semibold text-gray-700 truncate">
                            {conv.parentName || conv.phone}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                            {new Date(msg.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                            {' '}
                            {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-600 line-clamp-2 break-words">{snippet}</p>
                      </button>
                    ))}
                  </div>
                )}

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
                    <p className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
                      <Phone className="w-3 h-3" />{selectedConv.phone} · {selectedConv.messageCount} msg
                      {selectedConv.totalReceived > 0 && <span className="text-blue-600">· {selectedConv.totalReceived} reçu(s)</span>}
                      {(() => {
                        const w = serviceWindow(selectedConv);
                        return w.open ? (
                          <span className="text-emerald-600 font-medium">· 💬 Réponse libre encore {w.hoursLeft} h</span>
                        ) : (
                          <span className="text-amber-600 font-medium" title="Passé 24 h sans message du parent, Meta n'accepte plus que les modèles approuvés.">
                            · ⏳ Hors fenêtre 24 h
                          </span>
                        );
                      })()}
                    </p>
                  </div>
                  {selectedConv.awaitingReply && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium whitespace-nowrap">En attente de réponse</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 relative flex flex-col overflow-hidden">
                <div ref={threadScrollRef} onScroll={handleThreadScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {selectedConv.messages.map((msg, idx) => {
                    const showDate = idx === 0 || new Date(msg.createdAt).toDateString() !== new Date(selectedConv.messages[idx - 1].createdAt).toDateString();
                    const incoming = msg.direction === 'incoming';
                    return (
                      <div key={msg.id} id={`msg-${msg.id}`}
                        className={highlightMsgId === msg.id ? 'rounded-lg ring-2 ring-amber-400 ring-offset-2 ring-offset-[#f0f2f5] transition-shadow' : ''}>
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
                            {/* Pièce jointe REÇUE : note vocale, photo, PDF, vidéo.
                                L'URL signée arrive à l'ouverture du fil ; tant qu'elle
                                n'est pas là, on annonce le type plutôt qu'un vide. */}
                            {msg.mediaMessageId ? (() => {
                              const url = inboxMediaUrls[msg.mediaMessageId];
                              if (!url) {
                                return (
                                  <div className="flex items-center gap-1.5 mb-1.5 text-gray-500">
                                    {msgTypeIcon(msg.mediaType)}
                                    <span className="text-xs italic">Chargement de la pièce jointe…</span>
                                  </div>
                                );
                              }
                              if (msg.mediaType === 'audio') {
                                return (
                                  <div className="mb-1.5">
                                    <div className="flex items-center gap-1.5 text-gray-600 mb-1">
                                      <Mic className="w-3.5 h-3.5" />
                                      <span className="text-[11px] font-medium">Message vocal</span>
                                    </div>
                                    <audio controls preload="none" src={url} className="w-full max-w-[260px] h-9" />
                                  </div>
                                );
                              }
                              if (msg.mediaType === 'image' || msg.mediaType === 'sticker') {
                                return (
                                  <a href={url} target="_blank" rel="noreferrer" className="block mb-1.5">
                                    <img src={url} alt={msg.fileName || 'Photo reçue'}
                                      className="rounded-md max-h-64 w-auto object-cover border border-gray-200" />
                                  </a>
                                );
                              }
                              if (msg.mediaType === 'video') {
                                return <video controls preload="none" src={url} className="rounded-md max-h-64 mb-1.5 w-full" />;
                              }
                              return (
                                <a href={url} target="_blank" rel="noreferrer"
                                  className="flex items-center gap-2 mb-1.5 p-2 rounded-md bg-gray-50 border border-gray-200 hover:bg-gray-100">
                                  <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                  <span className="text-xs font-medium text-gray-700 truncate">{msg.fileName || 'Pièce jointe'}</span>
                                  <Download className="w-3.5 h-3.5 text-gray-400 ml-auto flex-shrink-0" />
                                </a>
                              );
                            })() : msg.messageType !== 'text' && !msg.isAiReport && (
                              <div className="flex items-center gap-1.5 mb-1.5 text-green-700">
                                {msgTypeIcon(msg.messageType)}
                                <span className="text-xs font-medium">{msg.fileName || (msg.messageType === 'image' ? 'Image' : 'Document')}</span>
                              </div>
                            )}
                            {/* Pièce jointe ENVOYÉE : l'URL est publique, l'image
                                s'affiche directement dans la bulle. */}
                            {!incoming && msg.mediaUrl && msg.messageType === 'image' && (
                              <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="block mb-1.5">
                                <img src={msg.mediaUrl} alt={msg.fileName || 'Image envoyée'}
                                  className="rounded-md max-h-64 w-auto object-cover border border-gray-200" />
                              </a>
                            )}
                            {!incoming && msg.mediaUrl && msg.messageType !== 'image' && (
                              <a href={msg.mediaUrl} target="_blank" rel="noreferrer"
                                className="flex items-center gap-2 mb-1.5 p-2 rounded-md bg-white/60 border border-gray-200 hover:bg-white">
                                <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <span className="text-xs font-medium text-gray-700 truncate">{msg.fileName || 'Pièce jointe'}</span>
                                <Download className="w-3.5 h-3.5 text-gray-400 ml-auto flex-shrink-0" />
                              </a>
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
                  {newBelowCount > 0 && (
                    <button
                      onClick={() => scrollThreadToBottom('smooth')}
                      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-green-700"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5 -rotate-45" />
                      {newBelowCount} nouveau{newBelowCount > 1 ? 'x' : ''} message{newBelowCount > 1 ? 's' : ''}
                    </button>
                  )}
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

                  {/* Note vocale : en cours d'enregistrement, ou prête à partir */}
                  {(recording || voiceNote) && (
                    <div className="px-3 pt-2">
                      <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${recording ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                        {recording ? (
                          <>
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                            <span className="text-sm font-medium text-red-700 tabular-nums">
                              {String(Math.floor(recordSecs / 60)).padStart(2, '0')}:{String(recordSecs % 60).padStart(2, '0')}
                            </span>
                            <span className="text-xs text-red-600">Enregistrement…</span>
                            <button type="button" onClick={stopRecording}
                              className="ml-auto px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700">
                              Arrêter
                            </button>
                          </>
                        ) : (
                          <>
                            <audio controls src={voiceNote.url} className="h-9 flex-1 min-w-0" />
                            <button type="button" onClick={discardVoiceNote} disabled={voiceSending}
                              title="Supprimer l'enregistrement"
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-white rounded-full disabled:opacity-50 flex-shrink-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={sendVoiceNote} disabled={voiceSending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex-shrink-0">
                              {voiceSending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                              Envoyer
                            </button>
                          </>
                        )}
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

                    {/* Micro : enregistre une note vocale (PC ou téléphone) */}
                    <button
                      onClick={recording ? stopRecording : startRecording}
                      disabled={directSending || voiceSending || !!voiceNote}
                      className={`p-2 rounded-full flex-shrink-0 disabled:opacity-50 ${recording ? 'bg-red-100 text-red-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                      title={recording ? "Arrêter l'enregistrement" : 'Enregistrer une note vocale'}
                    >
                      <Mic className="w-5 h-5" />
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
                    onChange={(e) => setCommForm({
                      ...commForm,
                      type: e.target.value,
                      // Un urgent part tout de suite : garder une date saisie
                      // avant le changement de type la rendrait invisible ET
                      // sans effet — l'envoi partirait « maintenant » sans
                      // que personne ne comprenne pourquoi.
                      ...(e.target.value === 'urgent' ? { scheduled_at: '', send_now: false } : {}),
                    })}
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

              {/* Personnalisation : le message s'adresse au parent par son nom */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 w-4 h-4 rounded text-indigo-600"
                    checked={commForm.personalize}
                    onChange={(e) => setCommForm({ ...commForm, personalize: e.target.checked })} />
                  <span>
                    <span className="text-sm font-medium text-gray-800">Ajouter le nom du parent</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      Le message commence par « Bonjour [nom du parent], » : il est mieux reçu
                      qu'un texte impersonnel.
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

              {commForm.type === 'urgent' && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  🔴 Un message <strong>urgent part immédiatement</strong> : la planification ne s'applique pas.
                  Choisissez « Normal » pour programmer une date d'envoi.
                </p>
              )}
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
                  <p className="text-gray-500 text-sm">
                    Rattachez le numéro de l'école via l'<strong>API officielle WhatsApp</strong> ci-dessous.
                  </p>
                </div>
              ) : sessionStatus ? (
                <div className="space-y-4">
                  <div className={`flex items-center gap-3 p-4 rounded-lg ${sessionStatus.connected ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    {sessionStatus.connected ? (
                      <><Wifi className="w-8 h-8 text-green-600" /><div><p className="font-semibold text-green-800">Connecté</p><p className="text-sm text-green-700">Session active et prête.</p></div></>
                    ) : (
                      <><WifiOff className="w-8 h-8 text-red-600" /><div><p className="font-semibold text-red-800">Déconnecté</p><p className="text-sm text-red-700">{sessionStatus.error || "Le numéro n'est pas encore activé — terminez la vérification ci-dessous."}</p></div></>
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
                  <CheckCircle className="w-5 h-5" /> Connexion via l'API officielle WhatsApp
                </h2>
                <p className="text-xs text-emerald-700 mt-1">
                  Boutons cliquables et aucun risque de blocage du numéro. Le numéro doit être
                  <strong> dédié</strong> et ne plus être utilisé dans l'application WhatsApp.
                </p>
              </div>

              {isCloudConnected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-white rounded-lg border border-emerald-200">
                    <CheckCircle className="w-6 h-6 text-emerald-600" />
                    <div>
                      <p className="font-medium text-emerald-800">Numéro officiel connecté</p>
                      <p className="text-sm text-emerald-700">{sessionStatus?.session?.phone || '—'}</p>
                    </div>
                  </div>

                  {/* Nom affiché : c'est lui que voient les parents qui n'ont
                      pas enregistré le contact, une fois approuvé par Meta. */}
                  <div className="p-4 bg-white rounded-lg border border-gray-200 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Nom affiché chez les parents</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Sans lui, un parent qui n'a pas enregistré le numéro voit les chiffres bruts.
                        </p>
                      </div>
                      {waNumber?.name_status && (() => {
                        const st = WA_NAME_STATUS[waNumber.name_status] || WA_NAME_STATUS.NONE;
                        const tones = {
                          emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          amber: 'bg-amber-50 text-amber-700 border-amber-200',
                          red: 'bg-red-50 text-red-700 border-red-200',
                          gray: 'bg-gray-50 text-gray-600 border-gray-200',
                        };
                        return (
                          <span className={`text-[11px] font-medium px-2 py-1 rounded-full border ${tones[st.tone]}`}>
                            {st.label}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="text" value={waNameInput} maxLength={75}
                        onChange={(e) => setWaNameInput(e.target.value)}
                        placeholder="Ex : Groupe Scolaire Al Amal"
                        className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500" />
                      <button type="button" disabled={waNameBusy || waNameInput.trim() === (waNumber?.verified_name || '')}
                        onClick={requestWaDisplayName}
                        className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium">
                        {waNameBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Demander l'approbation
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Le nom doit correspondre à l'établissement réel (registre de commerce, site).
                      Un nom générique, un slogan ou une adresse web se font refuser.
                    </p>

                    {(waNumber?.quality_rating || waNumber?.messaging_limit_tier || waConsent) && (
                      <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500 pt-1 border-t border-gray-100">
                        {waNumber?.quality_rating && <span>Qualité du numéro : <strong>{waNumber.quality_rating}</strong></span>}
                        {waNumber?.messaging_limit_tier && (
                          <span>Volume autorisé : <strong>{WA_TIERS[waNumber.messaging_limit_tier] || waNumber.messaging_limit_tier}</strong></span>
                        )}
                        {waConsent?.total > 0 && (
                          <span title={`${waConsent.opted_in} accord(s) · ${waConsent.pending} en attente · ${waConsent.opted_out} désabonné(s)`}>
                            Consentement : <strong>{waConsent.rate} %</strong>
                            <span className="text-gray-400"> ({waConsent.opted_in}/{waConsent.total} parents)</span>
                            {waConsent.opted_out > 0 && (
                              <span className="text-amber-600"> · {waConsent.opted_out} désabonné(s)</span>
                            )}
                          </span>
                        )}
                      </div>
                    )}

                    {waNameError && (
                      <div className="flex items-center gap-2 p-2.5 bg-red-50 rounded-lg border border-red-200">
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        <p className="text-sm text-red-800">{waNameError}</p>
                      </div>
                    )}
                    {waNameMsg && (
                      <div className="flex items-center gap-2 p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                        <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <p className="text-sm text-emerald-800">{waNameMsg}</p>
                      </div>
                    )}
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

            {/* Profil du numéro : photo + fiche entreprise. Avec l'API Cloud,
                le numéro ne s'ouvre plus dans l'application WhatsApp — c'est
                le seul endroit où l'école peut changer sa photo. */}
            {isCloudConnected && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-600" /> Profil du numéro WhatsApp
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Ce que les parents voient quand ils ouvrent la conversation. Le numéro étant
                    rattaché à l'API officielle, il ne s'ouvre plus dans l'application WhatsApp :
                    la photo et la fiche se modifient ici.
                  </p>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  {waProfile?.profile_picture_url ? (
                    <img src={waProfile.profile_picture_url} alt="Photo de profil WhatsApp"
                      className="w-20 h-20 rounded-full object-cover border border-gray-200" />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
                      <Image className="w-7 h-7 text-gray-400" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input ref={waPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                        className="hidden" onChange={handleWaPhotoPick} />
                      <button type="button" disabled={waProfileBusy}
                        onClick={() => waPhotoInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium">
                        <Image className="w-4 h-4" /> Changer la photo
                      </button>
                      <button type="button" disabled={waProfileBusy}
                        onClick={() => saveWaProfile({ use_school_logo: true })}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                        Utiliser le logo de l'école
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      L'image est recadrée en carré (640 × 640). JPEG, PNG ou WebP, 5 Mo maximum.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-gray-700 block mb-1">
                      À propos <span className="font-normal text-gray-400">(139 caractères max)</span>
                    </label>
                    <input type="text" maxLength={139} value={waProfileForm.about}
                      onChange={(e) => setWaProfileForm({ ...waProfileForm, about: e.target.value })}
                      placeholder="Ex : Groupe Scolaire Al Amal — service aux familles"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Description</label>
                    <textarea rows={2} maxLength={512} value={waProfileForm.description}
                      onChange={(e) => setWaProfileForm({ ...waProfileForm, description: e.target.value })}
                      placeholder="Présentation de l'établissement affichée dans la fiche."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-gray-700 block mb-1">
                      Catégorie <span className="font-normal text-gray-400">(affichée sous le nom de l'établissement)</span>
                    </label>
                    <select value={waProfileForm.vertical}
                      onChange={(e) => setWaProfileForm({ ...waProfileForm, vertical: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
                      {WA_VERTICALS.map((v) => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">E-mail</label>
                    <input type="email" value={waProfileForm.email}
                      onChange={(e) => setWaProfileForm({ ...waProfileForm, email: e.target.value })}
                      placeholder="contact@ecole.ma"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Site web</label>
                    <input type="url" value={waProfileForm.website}
                      onChange={(e) => setWaProfileForm({ ...waProfileForm, website: e.target.value })}
                      placeholder="https://ecole.ma"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Adresse</label>
                    <input type="text" value={waProfileForm.address}
                      onChange={(e) => setWaProfileForm({ ...waProfileForm, address: e.target.value })}
                      placeholder="Adresse de l'établissement"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>

                {waProfileError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <p className="text-sm text-red-800">{waProfileError}</p>
                  </div>
                )}
                {waProfileMsg && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm text-emerald-800">{waProfileMsg}</p>
                  </div>
                )}

                <button type="button" disabled={waProfileBusy}
                  onClick={() => saveWaProfile({
                    about: waProfileForm.about,
                    description: waProfileForm.description,
                    email: waProfileForm.email,
                    address: waProfileForm.address,
                    websites: waProfileForm.website ? [waProfileForm.website] : [],
                    vertical: waProfileForm.vertical,
                  })}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium">
                  {waProfileBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Enregistrer la fiche
                </button>
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
                    <span title={sendDate(detailMessage.message).title}>{sendDate(detailMessage.message).text}</span>
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
                          { k: 'wa_not_sent', label: 'WhatsApp jamais parti (reprise après coupure)' },
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

                    {resendChannel !== 'app' && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                        <p className="text-[11px] font-semibold text-gray-500">Personnalisation du texte WhatsApp</p>
                        <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                          <input type="checkbox" className="mt-0.5" checked={resendPersonalize}
                            onChange={(e) => setResendPersonalize(e.target.checked)} />
                          <span>
                            Saluer chaque parent par son nom
                            <span className="block text-[11px] text-gray-400">« Bonjour {'{nom}'}, » en tête du message.</span>
                          </span>
                        </label>
                      </div>
                    )}

                    {/* Planification : la relance passe par la file de travaux,
                        elle survit donc à un redémarrage et peut attendre. */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-[11px] font-semibold text-gray-500 mb-1.5">Quand envoyer</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="datetime-local"
                          value={resendScheduledAt}
                          onChange={(e) => setResendScheduledAt(e.target.value)}
                          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                        />
                        {resendScheduledAt ? (
                          <button type="button" onClick={() => setResendScheduledAt('')}
                            className="text-xs text-gray-500 hover:text-gray-700 underline">
                            Envoyer maintenant
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">Vide = envoi immédiat</span>
                        )}
                      </div>
                      {resendScheduledAt && (
                        <p className="text-[11px] text-gray-400 mt-1.5">
                          La session WhatsApp n'a pas besoin d'être connectée maintenant : l'envoi
                          attendra qu'elle le soit.
                        </p>
                      )}
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
                                  {r.classNames?.length > 0 && (
                                    <span className="text-indigo-600 text-[11px] ml-1">· 🎓 {r.classNames.join(' · ')}</span>
                                  )}
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

                {/* Récapitulatif des classes et niveaux touchés. Sur 300
                    destinataires, parcourir la liste ligne à ligne ne dit pas
                    QUI a été visé : ce bandeau répond à la question d'un coup
                    d'œil, et permet de vérifier le ciblage d'une campagne. */}
                {(() => {
                  const recs = detailMessage.recipients || [];
                  const byClass = new Map();
                  const levels = new Set();
                  recs.forEach(r => {
                    (r.classNames || []).forEach(c => byClass.set(c, (byClass.get(c) || 0) + 1));
                    (r.classLevels || []).forEach(l => levels.add(l));
                  });
                  if (byClass.size === 0) return null;
                  const classes = [...byClass.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
                  const shown = classes.slice(0, 12);
                  const rest = classes.length - shown.length;
                  const withoutClass = recs.filter(r => !(r.classNames?.length)).length;
                  return (
                    <div className="mb-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-2.5 py-2">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[11px] font-semibold text-indigo-900">
                          🎓 {classes.length} classe(s){levels.size > 0 ? ` · ${levels.size} niveau(x)` : ''}
                        </span>
                        {levels.size > 0 && (
                          <span className="text-[10px] text-indigo-700">{[...levels].sort().join(' · ')}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {shown.map(([name, count]) => (
                          <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-indigo-200 text-indigo-800 font-medium">
                            {name} <span className="text-indigo-400">({count})</span>
                          </span>
                        ))}
                        {rest > 0 && (
                          <span className="text-[10px] text-indigo-600" title={classes.slice(12).map(([n, c]) => `${n} (${c})`).join(' | ')}>
                            +{rest} autre(s)
                          </span>
                        )}
                        {withoutClass > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-500"
                            title="Destinataires sans enfant rattaché à une classe (personnel, numéro inconnu…)">
                            sans classe ({withoutClass})
                          </span>
                        )}
                      </div>
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
                          {r.classNames?.length > 0 && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium"
                              title={(r.children || []).map(c => `${c.name}${c.className ? ` — ${c.className}` : ''}`).join(' | ')}>
                              🎓 {r.classNames.join(' · ')}
                            </span>
                          )}
                        </div>
                        <span className={`text-xs font-medium flex-shrink-0 ${r.status === 'sent' ? 'text-green-600' : r.status === 'failed' ? 'text-red-600' : r.status === 'announced' ? 'text-amber-600' : 'text-yellow-600'}`}>
                          {r.status === 'sent' ? '✓ Envoyé'
                            : r.status === 'announced' ? '⏳ Annoncé — livré à la réponse'
                            : r.status === 'failed' ? '✗ Échec' : '...'}
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
