import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { printHtmlDocument } from '../../lib/download';
import { Plus, Trash2, Edit2, Eye, EyeOff, Copy, CheckSquare, Square, RefreshCw, MessageCircle, Send, UserPlus, X, AlertTriangle, Users, FileText, Download, Camera, Printer, MapPin, MapPinOff, ArrowRightLeft, Search, Check, RotateCcw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import {
  CardGrid, StudentCard, StudentRow, StatusPill, GridListToggle,
  DetailDrawer, FieldRow, Avatar,
} from '../../components/directory/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { generateStudentEmail, generatePassword } from '../../utils/studentUtils';
import { DOSSIER_DOC_KEYS } from '../../utils/dossierDocuments';
import { enrollmentsApi } from '../../lib/enrollmentsApi';
import { LEVEL_ORDER, nextLevel, distinctLevels } from '../../lib/levelProgression';
import { prevYearStr, toSlashYear, sameYear } from '../../lib/schoolYear';

const StudentsPage = () => {
  const { profile, availableSchools } = useAuth();
  const { year } = useYear();
  const isMultiSchool = (availableSchools?.length || 0) > 1;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'school_admin' || profile?.role === 'pedagogical_director' || profile?.role === 'pedagogical_manager';
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  // Niveaux proposés dans la fiche d'inscription : ceux des classes de
  // l'année précédente + de l'année active (repli : toutes les années si
  // aucune classe sur ces deux années).
  const levelOptions = useMemo(() => {
    const activeSlash = toSlashYear(year);
    const prevSlash = prevYearStr(activeSlash);
    const recent = classes.filter((c) => {
      const y = toSlashYear(c.academic_year);
      return y === activeSlash || y === prevSlash;
    });
    const lvls = distinctLevels(recent);
    return lvls.length ? lvls : distinctLevels(classes);
  }, [classes, year]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  // Modale « Déplacer vers une autre classe » (recherche + sélection)
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveSearch, setMoveSearch] = useState('');
  const [moveTargetId, setMoveTargetId] = useState('');
  const [moving, setMoving] = useState(false);
  // Modale de recherche « Récupérer un élève d'un autre établissement »
  const [crossOpen, setCrossOpen] = useState(false);
  const [crossSearch, setCrossSearch] = useState('');
  const [crossLevelFilter, setCrossLevelFilter] = useState('');
  const [crossLevels, setCrossLevels] = useState([]); // vrais niveaux des écoles associées
  const [crossTargetLevel, setCrossTargetLevel] = useState(''); // niveau cible pour la réinscription en masse
  const [crossResults, setCrossResults] = useState([]);
  const [crossSearching, setCrossSearching] = useState(false);
  // Modale unifiée de réinscription (propre école OU école associée)
  const [reinscribeTarget, setReinscribeTarget] = useState(null); // { id, name, school_name, current_level, suggested_level, isCross }
  const [reinscribeLevel, setReinscribeLevel] = useState('');
  const [reinscribeClassId, setReinscribeClassId] = useState('');
  const [reinscribeBusy, setReinscribeBusy] = useState(false);
  const [reinscribeMsg, setReinscribeMsg] = useState(null); // { type, text }
  const [undoingReinscribe, setUndoingReinscribe] = useState(false); // annulation de réinscription
  // Identifiants des élèves réinscrits (statut RI/NI) pour l'année active.
  const [activeIds, setActiveIds] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [activeStudent, setActiveStudent] = useState(null); // fiche ouverte dans le drawer
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    className: '',
    level: '',
    searchName: '',
    searchEmail: '',
    parentStatus: '', // '', 'with', 'without'
    locationStatus: '' // '', 'with', 'without'
  });
  // Modale d'ajout de parents (file d'attente pour traiter plusieurs élèves)
  const [parentModalQueue, setParentModalQueue] = useState([]);
  const [parentModalIndex, setParentModalIndex] = useState(0);
  const [parentForm, setParentForm] = useState({ pereName: '', perePhone: '', mereName: '', merePhone: '', tuteurName: '', tuteurPhone: '' });
  const [parentSaving, setParentSaving] = useState(false);
  // Édition inline des parents DÉJÀ associés dans la modale (nom/prénom/téléphone).
  const [existingEdits, setExistingEdits] = useState({}); // { [parentId]: { last_name, first_name, phone } }
  const [savingExistingId, setSavingExistingId] = useState(null);
  const DOC_KEYS = DOSSIER_DOC_KEYS;
  const emptyForm = {
    // Identifiants (accès élève)
    email: '', password: '',
    // Informations élève
    firstName: '', lastName: '', firstNameAr: '', lastNameAr: '',
    gender: 'M', phone: '', cin: '',
    dateOfBirth: '', birthPlace: '', level: '', classId: '',
    registrationNumber: '', entryDate: '', massarCode: '',
    dossierStatus: 'complet',
    // Scolarité antérieure
    previousSchool: '', previousClass: '',
    // Médical
    hasHealthIssue: false, healthNotes: '',
    // Autorisations
    photoAuthorized: true,
    // Domicile + localisation (transport / chatbot WhatsApp)
    homeAddress: '', quartier: '', homePhone: '', homeLat: '', homeLng: '',
    // v2 — Informations supplémentaires
    nationality: '', country: '', reinscriptionDate: '', originSchool: '',
    isStaffChild: false, isPartnerGroup: false, isExpat: false,
    hadAccompaniment: false, hasTransport: false,
    // v2 — Documents du dossier + signature
    inscriptionDocuments: {}, inscriptionSignature: '',
    // Parents (saisie inline en création)
    parent1: { lastName: '', firstName: '', email: '', phone: '', cin: '', profession: '', relationship: 'pere', maritalStatus: '' },
    parent2: { lastName: '', firstName: '', email: '', phone: '', cin: '', profession: '', relationship: 'mere', maritalStatus: '' },
  };
  const [formData, setFormData] = useState(emptyForm);
  const [editingStudent, setEditingStudent] = useState(null); // élève en cours d'édition (null = création)
  const [attachParent, setAttachParent] = useState({ open: false, lastName: '', firstName: '', phone: '', email: '', cin: '', profession: '', relationship: 'pere', maritalStatus: '' });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef(null);
  const [showSendCredentialsModal, setShowSendCredentialsModal] = useState(false);
  const [sendCredentialsFilter, setSendCredentialsFilter] = useState('all');
  const [sendCredentialsFiliere, setSendCredentialsFiliere] = useState('');
  const [sendCredentialsClass, setSendCredentialsClass] = useState('');
  const [sendingCredentials, setSendingCredentials] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // L'élève a-t-il une localisation domicile (captée via le chatbot WhatsApp
  // ou saisie à la main) ? Utilisée par le transport.
  const hasLocation = (s) => s?.home_lat != null && s?.home_lng != null;

  const togglePasswordVisibility = (studentId) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  // Gestion de la sélection multiple
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(studentId)) {
        newSelection.delete(studentId);
      } else {
        newSelection.add(studentId);
      }
      return newSelection;
    });
  };

  const toggleSelectAll = () => {
    const filteredStudents = getFilteredStudents();
    if (selectedStudents.size === filteredStudents.length && filteredStudents.length > 0) {
      // Désélectionner tous
      setSelectedStudents(new Set());
    } else {
      // Sélectionner tous les élèves filtrés
      setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
    }
  };

  const isAllSelected = () => {
    const filteredStudents = getFilteredStudents();
    return filteredStudents.length > 0 && selectedStudents.size === filteredStudents.length;
  };

  const isSomeSelected = () => {
    const filteredStudents = getFilteredStudents();
    return filteredStudents.length > 0 && selectedStudents.size > 0 && selectedStudents.size < filteredStudents.length;
  };

  // Suppression en masse
  const deleteSelectedStudents = async () => {
    if (selectedStudents.size === 0) {
      alert('Aucun élève sélectionné');
      return;
    }

    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${selectedStudents.size} élève(s) ?`)) {
      return;
    }

    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      let successCount = 0;
      let errorCount = 0;

      for (const studentId of selectedStudents) {
        try {
          const res = await fetch(`${apiUrl}/api/admin/students/${studentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (res.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`Erreur suppression élève ${studentId}:`, error);
          errorCount++;
        }
      }

      // Rafraîchir la liste
      await fetchData();
      setSelectedStudents(new Set());

      alert(`${successCount} élève(s) supprimé(s) avec succès${errorCount > 0 ? `. ${errorCount} erreur(s)` : ''}`);
    } catch (error) {
      console.error('Erreur suppression en masse:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // Fonction pour filtrer les élèves
  const getFilteredStudents = () => {
    return students.filter(student => {
      // Année scolaire : la liste n'affiche que les élèves inscrits/réinscrits
      // pour l'année active (vide pour une année neuve). Les élèves d'une autre
      // année (« candidats ») ne s'affichent plus en ligne : ils se réinscrivent
      // depuis la fenêtre « Réinscription ».
      if (studentYearStatus(student) === 'candidate') return false;

      // Filtre par classe (ID exact ou "unassigned" pour les élèves sans classe)
      if (filters.className) {
        if (filters.className === 'unassigned') {
          // Filtre pour les élèves sans classe
          if (student.class_id) {
            return false;
          }
        } else {
          // Filtre pour une classe spécifique
          if (student.class_id !== filters.className) {
            return false;
          }
        }
      }

      // Filtre par niveau
      if (filters.level && student.class_id) {
        const studentClass = classes.find(c => c.id === student.class_id);
        if (!studentClass || studentClass.level !== filters.level) {
          return false;
        }
      }

      // Filtre par nom — recherche BILINGUE : on teste le nom principal
      // (arabe), le nom français (latin, aligné par code Massar) et le nom
      // arabe de la fiche d'inscription. La recherche marche donc que l'admin
      // tape en arabe ou en français.
      if (filters.searchName) {
        const needle = filters.searchName.toLowerCase();
        const haystack = [
          student.first_name, student.last_name,
          student.first_name_fr, student.last_name_fr,
          student.first_name_ar, student.last_name_ar,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }

      // Filtre par email
      if (filters.searchEmail) {
        if (!student.email.toLowerCase().includes(filters.searchEmail.toLowerCase())) {
          return false;
        }
      }

      // Filtre par statut parent
      if (filters.parentStatus === 'without' && (student.parents?.length > 0)) return false;
      if (filters.parentStatus === 'with' && !(student.parents?.length > 0)) return false;

      // Filtre par localisation (transport)
      const located = student.home_lat != null && student.home_lng != null;
      if (filters.locationStatus === 'with' && !located) return false;
      if (filters.locationStatus === 'without' && located) return false;

      return true;
    });
  };

  // Ouvre la modale d'ajout de parents pour une liste d'élèves (file d'attente).
  const openParentModal = (studentList) => {
    const list = studentList.filter(Boolean);
    if (list.length === 0) return;
    setParentModalQueue(list);
    setParentModalIndex(0);
    setParentForm({ pereName: '', perePhone: '', mereName: '', merePhone: '', tuteurName: '', tuteurPhone: '' });
  };

  const closeParentModal = () => {
    setParentModalQueue([]);
    setParentModalIndex(0);
    setParentForm({ pereName: '', perePhone: '', mereName: '', merePhone: '', tuteurName: '', tuteurPhone: '' });
  };

  // Enregistre les modifications d'un parent DÉJÀ associé (depuis la modale).
  const saveExistingParent = async (parent) => {
    if (String(parent.id).startsWith('tmp_')) return; // pas encore synchronisé côté serveur
    const edit = existingEdits[parent.id] || {};
    const first_name = edit.first_name ?? parent.first_name ?? '';
    const last_name = edit.last_name ?? parent.last_name ?? '';
    const phone = edit.phone ?? parent.phone ?? '';
    if (!last_name.trim() && !first_name.trim()) { alert('Nom requis.'); return; }
    setSavingExistingId(parent.id);
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/admin/parents/${parent.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name, last_name, phone }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Échec de la modification'); }
      setExistingEdits(s => { const n = { ...s }; delete n[parent.id]; return n; });
      await fetchData();
      alert('Parent mis à jour.');
    } catch (e) {
      alert('Erreur : ' + e.message);
    } finally {
      setSavingExistingId(null);
    }
  };

  const saveParentsForCurrent = async () => {
    const student = parentModalQueue[parentModalIndex];
    if (!student) return;
    const contacts = [];
    if (parentForm.pereName.trim() && parentForm.perePhone.trim()) contacts.push({ name: parentForm.pereName.trim(), phone: parentForm.perePhone.trim(), relationship: 'père' });
    if (parentForm.mereName.trim() && parentForm.merePhone.trim()) contacts.push({ name: parentForm.mereName.trim(), phone: parentForm.merePhone.trim(), relationship: 'mère' });
    if (parentForm.tuteurName.trim() && parentForm.tuteurPhone.trim()) contacts.push({ name: parentForm.tuteurName.trim(), phone: parentForm.tuteurPhone.trim(), relationship: 'tuteur' });
    if (contacts.length === 0) {
      alert('Renseignez au moins un parent (nom + téléphone)');
      return;
    }
    setParentSaving(true);
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${apiUrl}/api/admin/students/${student.id}/add-parents`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts, academic_year: toSlashYear(year) }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Erreur lors de l\'enregistrement'); return; }

      await fetchData();

      // Passer à l'élève suivant de la file, ou fermer si terminé.
      if (parentModalIndex < parentModalQueue.length - 1) {
        setParentModalIndex(i => i + 1);
        setParentForm({ pereName: '', perePhone: '', mereName: '', merePhone: '', tuteurName: '', tuteurPhone: '' });
      } else {
        closeParentModal();
        alert('Parents enregistrés et associés. Ils apparaissent désormais sur la page Parents.');
      }
    } catch (err) {
      console.error(err);
      alert('Erreur réseau');
    } finally {
      setParentSaving(false);
    }
  };

  const skipCurrentInQueue = () => {
    if (parentModalIndex < parentModalQueue.length - 1) {
      setParentModalIndex(i => i + 1);
      setParentForm({ pereName: '', perePhone: '', mereName: '', merePhone: '', tuteurName: '', tuteurPhone: '' });
    } else {
      closeParentModal();
    }
  };

  // Récupérer les niveaux uniques disponibles
  const getAvailableLevels = () => {
    const levels = new Set();
    classes.forEach(cls => {
      if (cls.level) {
        levels.add(cls.level);
      }
    });
    return Array.from(levels).sort();
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Réinscriptions de l'année active (source de vérité pour le statut « actif »).
  const refreshActiveIds = async () => {
    try {
      const rows = await enrollmentsApi.list(year);
      const ids = (rows || [])
        .filter((r) => r.status !== 'NR')
        .map((r) => r.student_id || r.student?.id)
        .filter(Boolean);
      setActiveIds(new Set(ids));
    } catch {
      setActiveIds(new Set());
    }
  };

  useEffect(() => {
    if (isAdmin) refreshActiveIds();
  }, [year, isAdmin]);

  // Interconnexion avec la page Classes : ?student=<id> ouvre directement la fiche
  // de l'élève (et nettoie l'URL ensuite pour ne pas la rouvrir au prochain rendu).
  useEffect(() => {
    const targetId = searchParams.get('student');
    if (!targetId || students.length === 0) return;
    const found = students.find(s => s.id === targetId);
    if (found) {
      setActiveStudent(found);
      searchParams.delete('student');
      setSearchParams(searchParams, { replace: true });
    }
  }, [students, searchParams]);

  const fetchData = async () => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      // Récupérer les mots de passe stockés dans localStorage
      const storedPasswords = JSON.parse(localStorage.getItem('studentPasswords') || '{}');

      if (isAdmin) {
        // Admin / directeur / responsable pédagogique : routes admin (filtrées par scope côté backend)
        const [studentsRes, classesRes] = await Promise.all([
          fetch(`${apiUrl}/api/admin/students`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${apiUrl}/api/admin/classes`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        const studentsData = await studentsRes.json();
        const classesData = await classesRes.json();

        // Ajouter les mots de passe stockés aux élèves
        const studentsWithPasswords = (Array.isArray(studentsData) ? studentsData : []).map(student => ({
          ...student,
          password: storedPasswords[student.id] || ''
        }));

        setStudents(studentsWithPasswords);
        setClasses(Array.isArray(classesData) ? classesData : []);
      } else if (profile.role === 'teacher') {
        // Professeur: récupère ses classes et les élèves de chaque classe
        const classesRes = await fetch(`${apiUrl}/api/teacher/my-classes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const classesData = await classesRes.json();
        setClasses(Array.isArray(classesData) ? classesData : []);

        // Récupérer les élèves de chaque classe
        let allStudents = [];
        for (const cls of classesData) {
          const studentsRes = await fetch(`${apiUrl}/api/teacher/classes/${cls.id}/students`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const studentsData = await studentsRes.json();
          if (Array.isArray(studentsData)) {
            // Ajouter les mots de passe stockés aux élèves
            const studentsWithPasswords = studentsData.map(student => ({
              ...student,
              password: storedPasswords[student.id] || ''
            }));
            allStudents = [...allStudents, ...studentsWithPasswords];
          }
        }
        setStudents(allStudents);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sélection / aperçu de la photo de l'élève (upload réel après création)
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingStudent(null);
    setAttachParent({ open: false, lastName: '', firstName: '', phone: '', email: '', cin: '', profession: '', relationship: 'pere', maritalStatus: '' });
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  // Pré-remplit le formulaire à partir d'un élève existant (mode édition).
  const studentToForm = (s) => ({
    ...emptyForm,
    email: s.email || '', password: '',
    firstName: s.first_name || '', lastName: s.last_name || '',
    firstNameAr: s.first_name_ar || '', lastNameAr: s.last_name_ar || '',
    gender: s.gender || 'M', phone: s.phone || '', cin: s.cin || '',
    dateOfBirth: s.date_of_birth ? String(s.date_of_birth).slice(0, 10) : '',
    birthPlace: s.birth_place || '', level: s.level || '', classId: s.class_id || '',
    registrationNumber: s.registration_number || '', massarCode: s.massar_code || '',
    entryDate: s.entry_date ? String(s.entry_date).slice(0, 10) : '',
    dossierStatus: s.dossier_status || 'complet',
    previousSchool: s.previous_school || '', previousClass: s.previous_class || '',
    hasHealthIssue: !!s.has_health_issue, healthNotes: s.health_notes || '',
    photoAuthorized: s.photo_authorized !== false,
    homeAddress: s.home_address || '', quartier: s.quartier || '', homePhone: s.home_phone || '',
    homeLat: s.home_lat ?? '', homeLng: s.home_lng ?? '',
    nationality: s.nationality || '', country: s.country || '',
    reinscriptionDate: s.reinscription_date ? String(s.reinscription_date).slice(0, 10) : '',
    originSchool: s.origin_school || '',
    isStaffChild: !!s.is_staff_child, isPartnerGroup: !!s.is_partner_group,
    isExpat: !!s.is_expat, hadAccompaniment: !!s.had_accompaniment, hasTransport: !!s.has_transport,
    inscriptionDocuments: s.inscription_documents || {},
    inscriptionSignature: s.inscription_signature || '',
  });

  const openEdit = (student) => {
    setEditingStudent(student);
    setFormData(studentToForm(student));
    setPhotoFile(null);
    setPhotoPreview(student.avatar_url ? resolveAvatar(student.avatar_url) : null);
    setActiveStudent(null);
    setShowForm(true);
  };

  const resolveAvatar = (u) => !u ? null : (u.startsWith('http') ? u : `${apiUrl}${u.startsWith('/') ? '' : '/'}${u}`);

  // Détacher un parent d'un élève (supprime le lien, garde le profil parent).
  const detachParent = async (studentId, parentId) => {
    if (!confirm('Détacher ce parent de l\'élève ?')) return;
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/admin/students/${studentId}/parents/${parentId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error('Échec du détachement');
      // Mise à jour locale
      const upd = (s) => s.id === studentId ? { ...s, parents: (s.parents || []).filter(p => p.id !== parentId) } : s;
      setStudents(prev => prev.map(upd));
      setEditingStudent(prev => prev ? upd(prev) : prev);
    } catch (err) { alert('Erreur : ' + err.message); }
  };

  // Rattacher un parent à l'élève en cours d'édition (réutilise add-parents).
  const attachParentToStudent = async () => {
    const p = attachParent;
    const fullName = `${(p.lastName || '').trim()} ${(p.firstName || '').trim()}`.trim();
    if (!fullName || !(p.phone || '').trim()) { alert('Nom + téléphone requis.'); return; }
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const res = await fetch(`${apiUrl}/api/admin/students/${editingStudent.id}/add-parents`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: [{ name: fullName, phone: p.phone.trim(), relationship: p.relationship, cin: p.cin, profession: p.profession, maritalStatus: p.maritalStatus, email: p.email }], academic_year: toSlashYear(year) }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Échec du rattachement'); }
      const newParent = { id: `tmp_${Date.now()}`, first_name: p.firstName, last_name: p.lastName, relationship: p.relationship, phone: p.phone, email: p.email, cin: p.cin, profession: p.profession };
      const upd = (s) => s.id === editingStudent.id ? { ...s, parents: [...(s.parents || []), newParent] } : s;
      setStudents(prev => prev.map(upd));
      setEditingStudent(prev => prev ? upd(prev) : prev);
      setAttachParent({ open: false, lastName: '', firstName: '', phone: '', email: '', cin: '', profession: '', relationship: 'pere', maritalStatus: '' });
      fetchData();
    } catch (err) { alert('Erreur : ' + err.message); }
  };

  // Construit la liste des parents (Parent 1, Parent 2) valides pour /add-parents.
  // Un parent n'est enregistré que s'il a un nom + un téléphone (contrainte backend).
  const buildParentContacts = (p) => {
    const fullName = `${(p.lastName || '').trim()} ${(p.firstName || '').trim()}`.trim();
    if (!fullName || !(p.phone || '').trim()) return null;
    return {
      name: fullName,
      phone: p.phone.trim(),
      relationship: p.relationship || null,
      cin: p.cin || null,
      profession: p.profession || null,
      maritalStatus: p.maritalStatus || null,
      email: p.email || null,
    };
  };

  const handleSubmit = async (e, { thenPrint = false } = {}) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;
      const authHeaders = { 'Authorization': `Bearer ${token}` };

      const { parent1, parent2, ...studentFields } = formData;
      let savedStudent;

      if (editingStudent) {
        // ── MODE ÉDITION : PUT (pas d'auth/mot de passe) ──
        const res = await fetch(`${apiUrl}/api/admin/students/${editingStudent.id}`, {
          method: 'PUT',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          // academicYear : si la classe change, l'inscription de l'année active
          // (student_enrollments) est synchronisée → le roster finance suit.
          body: JSON.stringify({ ...studentFields, academicYear: year }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Modification impossible');
        }
        savedStudent = await res.json();
        savedStudent = { ...savedStudent, parents: editingStudent.parents || [], password: editingStudent.password };

        // Photo : upload seulement si une nouvelle a été choisie
        if (photoFile) {
          try {
            const fd = new FormData();
            fd.append('photo', photoFile);
            const pr = await fetch(`${apiUrl}/api/admin/students/${editingStudent.id}/photo`, { method: 'POST', headers: authHeaders, body: fd });
            if (pr.ok) { const { avatar_url } = await pr.json(); savedStudent = { ...savedStudent, avatar_url }; }
          } catch (err) { console.error('Upload photo échoué:', err); }
        }
        setStudents(prev => prev.map(s => s.id === savedStudent.id ? { ...s, ...savedStudent } : s));
      } else {
        // ── MODE CRÉATION : POST + photo + parents ──
        // Même convention que les élèves importés : codemassar@nomecole.ma,
        // ou nom.prenom@nomecole.ma tant que l'élève n'a pas de code Massar.
        const email = (formData.email || '').trim() || generateStudentEmail({
          massarCode: formData.massarCode,
          firstName: formData.firstName,
          lastName: formData.lastName,
          schoolName: profile?.school?.name,
        });
        const password = (formData.password || '').trim() || generatePassword(formData.firstName);

        const res = await fetch(`${apiUrl}/api/admin/students`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          // academicYear : l'élève est inscrit (student_enrollments) pour l'année
          // active → il apparaît aussitôt côté finance (roster = student_enrollments).
          body: JSON.stringify({ ...studentFields, email, password, academicYear: year }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Création de l\'élève impossible');
        }
        savedStudent = await res.json();

        if (savedStudent.password) {
          const storedPasswords = JSON.parse(localStorage.getItem('studentPasswords') || '{}');
          storedPasswords[savedStudent.id] = savedStudent.password;
          localStorage.setItem('studentPasswords', JSON.stringify(storedPasswords));
        }

        if (photoFile) {
          try {
            const fd = new FormData();
            fd.append('photo', photoFile);
            const pr = await fetch(`${apiUrl}/api/admin/students/${savedStudent.id}/photo`, { method: 'POST', headers: authHeaders, body: fd });
            if (pr.ok) { const { avatar_url } = await pr.json(); savedStudent = { ...savedStudent, avatar_url }; }
          } catch (err) { console.error('Upload photo échoué:', err); }
        }

        const parentContacts = [buildParentContacts(parent1), buildParentContacts(parent2)].filter(Boolean);
        const savedParents = [];
        for (const c of parentContacts) {
          try {
            const ar = await fetch(`${apiUrl}/api/admin/students/${savedStudent.id}/add-parents`, {
              method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ contacts: [c], academic_year: toSlashYear(year) }),
            });
            if (ar.ok) {
              savedParents.push({
                first_name: c.name.split(' ').slice(1).join(' '),
                last_name: c.name.split(' ')[0],
                relationship: c.relationship, email: c.email, phone: c.phone,
                cin: c.cin, profession: c.profession, marital_status: c.maritalStatus,
              });
            }
          } catch (err) { console.error('Ajout parent échoué:', err); }
        }
        savedStudent = { ...savedStudent, parents: savedParents };
        setStudents([...students, savedStudent]);
      }

      resetForm();
      setShowForm(false);

      if (thenPrint) printInscriptionFiche(savedStudent);
      // Rafraîchir pour récupérer parents/champs normalisés côté serveur.
      // refreshActiveIds : la création a inscrit l'élève (student_enrollments) pour
      // l'année active → il doit s'afficher aussitôt dans la liste (statut « actif »).
      fetchData();
      if (isAdmin) refreshActiveIds();
    } catch (error) {
      console.error('Error saving student:', error);
      alert('Erreur : ' + (error.message || 'enregistrement impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Fiche d'inscription récapitulative (impression → « Enregistrer en PDF ») ──
  const academicYear = () => {
    const d = new Date();
    const y = d.getFullYear();
    return d.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
  };

  const printInscriptionFiche = (student) => {
    const apiBase = apiUrl;
    const school = profile?.school || {};
    const resolveAsset = (u) => !u ? null : (u.startsWith('http') ? u : `${apiBase}${u.startsWith('/') ? '' : '/'}${u}`);
    const logoSrc = resolveAsset(school.logo_url);
    const photoSrc = resolveAsset(student.avatar_url);
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const val = (v) => (v === null || v === undefined || v === '') ? '—' : esc(v);
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
    const genderLabel = student.gender === 'M' ? 'Garçon' : student.gender === 'F' ? 'Fille' : '—';
    const classLabel = classes.find((c) => c.id === student.class_id)?.name || '';
    const level = student.level || classes.find((c) => c.id === student.class_id)?.level || '';
    const parents = student.parents || [];
    const yesNo = (b) => `<span class="opt ${b === true ? 'on' : ''}">Oui</span> <span class="opt ${b === false ? 'on' : ''}">Non</span>`;
    const checkbox = (on) => `<span class="cb">${on ? '☑' : '☐'}</span>`;

    const parentBlock = (p, idx) => `
      <div class="party">
        <div class="row"><div class="lbl">Nom : <b>${val(p?.last_name)}</b></div><div class="lbl ar" dir="rtl">الاسم العائلي</div></div>
        <div class="row"><div class="lbl">Prénom : <b>${val(p?.first_name)}</b></div><div class="lbl ar" dir="rtl">الاسم الشخصي</div></div>
        <div class="grid2">
          <div>Relation : ${val(p?.relationship)}</div>
          <div>Situation familiale : ${val(p?.marital_status)}</div>
          <div>CIN : ${val(p?.cin)}</div>
          <div>Profession : ${val(p?.profession)}</div>
          <div>Téléphone : ${val(p?.phone)}</div>
          <div>Email : ${val(p?.email)}</div>
        </div>
      </div>`;

    const html = `
    <html lang="fr"><head><meta charset="utf-8"><title>Fiche d'inscription ${esc(student.first_name)} ${esc(student.last_name)}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:Arial,'Noto Sans Arabic',sans-serif;color:#1f2937;margin:0;padding:24px 34px}
      .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1e40af;padding-bottom:12px;margin-bottom:14px}
      .header .logo{width:74px;height:74px;object-fit:contain}
      .header .title{text-align:center;flex:1}
      .header .title h1{margin:0;font-size:1.15em;color:#1e40af}
      .header .title h2{margin:2px 0 0;font-size:1.4em;color:#111827}
      .header .photo{width:84px;height:104px;object-fit:cover;border:1px solid #cbd5e1;border-radius:4px;background:#f1f5f9}
      .sec{margin:12px 0;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden}
      .sec > .h{background:#eff6ff;color:#1e40af;font-weight:bold;padding:6px 10px;font-size:.9em;border-bottom:1px solid #e5e7eb}
      .sec > .b{padding:8px 10px;font-size:.86em}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}
      .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 18px}
      .row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:2px 0}
      .ar{color:#374151;font-size:.95em}
      .party{padding:6px 0;border-bottom:1px dashed #e5e7eb}
      .party:last-child{border-bottom:none}
      .lbl b{font-weight:700}
      .opt{display:inline-block;border:1px solid #9ca3af;border-radius:10px;padding:1px 10px;margin-left:4px;font-size:.9em}
      .opt.on{background:#1e40af;color:#fff;border-color:#1e40af;font-weight:bold}
      .cb{font-size:1.1em;margin-right:4px}
      .foot{margin-top:16px;border-top:1px solid #d1d5db;padding-top:6px;font-size:.72em;color:#6b7280;display:flex;justify-content:space-between}
      .page2{page-break-before:always;padding-top:10px}
      .page2 h2{color:#1e40af;text-align:center;letter-spacing:1px}
      .engage p{font-size:.9em;line-height:1.5}
      .sign{margin-top:50px;text-align:right;font-size:.9em}
      .dots{border-bottom:1px dotted #555;display:inline-block;min-width:280px}
      @media print{body{padding:14px 22px}}
    </style></head><body>

      <div class="header">
        ${logoSrc ? `<img src="${logoSrc}" class="logo" alt="logo"/>` : '<div style="width:74px"></div>'}
        <div class="title">
          <h1>${val(school.name) === '—' ? 'Établissement' : esc(school.name)}</h1>
          <h2>Fiche d'inscription</h2>
          <div style="color:#6b7280">${academicYear()}</div>
        </div>
        ${photoSrc ? `<img src="${photoSrc}" class="photo" alt="photo"/>` : '<div class="photo"></div>'}
      </div>

      <div class="sec">
        <div class="h">1 — Cadre réservé à l'administration</div>
        <div class="b">
          <div class="grid3">
            <div>N° matricule : <b>${val(student.registration_number)}</b></div>
            <div>Date d'entrée : ${fmtDate(student.entry_date)}</div>
            <div>Niveau : <b>${val(level)}</b>${classLabel ? ` (${esc(classLabel)})` : ''}</div>
          </div>
          <div style="margin-top:6px">${checkbox(student.dossier_status === 'complet')} Dossier complet
            &nbsp;&nbsp; ${checkbox(student.dossier_status === 'incomplet')} Dossier incomplet</div>
          <hr style="border:none;border-top:1px solid #eee;margin:8px 0"/>
          <div class="row"><div>Nom de l'enfant : <b>${val(student.last_name)}</b></div><div class="ar" dir="rtl">الاسم العائلي : <b>${val(student.last_name_ar)}</b></div></div>
          <div class="row"><div>Prénom de l'enfant : <b>${val(student.first_name)}</b></div><div class="ar" dir="rtl">الاسم الشخصي : <b>${val(student.first_name_ar)}</b></div></div>
          <div class="grid3" style="margin-top:4px">
            <div>Né(e) le : ${fmtDate(student.date_of_birth)}</div>
            <div>à : ${val(student.birth_place)}</div>
            <div>Sexe : ${genderLabel}</div>
          </div>
          ${student.massar_code ? `<div style="margin-top:4px">Code Massar : <b>${val(student.massar_code)}</b></div>` : ''}
        </div>
      </div>

      <div class="sec">
        <div class="h">2 — Renseignements familiaux</div>
        <div class="b">
          ${parents.length ? parents.slice(0, 2).map(parentBlock).join('') : '<div style="color:#9ca3af">Aucun parent renseigné</div>'}
          <div class="grid3" style="margin-top:6px">
            <div>Tél. domicile : ${val(student.home_phone)}</div>
            <div>Quartier : ${val(student.quartier)}</div>
            <div>Adresse : ${val(student.home_address)}</div>
          </div>
        </div>
      </div>

      <div class="sec">
        <div class="h">3 — Scolarité antérieure</div>
        <div class="b grid2">
          <div>Établissement fréquenté l'année précédente : ${val(student.previous_school)}</div>
          <div>Classe : ${val(student.previous_class)}</div>
        </div>
      </div>

      <div class="sec">
        <div class="h">4 — Renseignements médicaux</div>
        <div class="b">
          <div>Votre enfant a-t-il un problème de santé ? ${yesNo(student.has_health_issue === true ? true : student.has_health_issue === false ? false : null)}</div>
          ${student.health_notes ? `<div style="margin-top:4px">Précisions : ${val(student.health_notes)}</div>` : ''}
        </div>
      </div>

      <div class="sec">
        <div class="h">5 — Autorisations école</div>
        <div class="b">
          <div>L'école est autorisée à utiliser la photo de l'enfant ? ${yesNo(student.photo_authorized === true ? true : student.photo_authorized === false ? false : null)}</div>
        </div>
      </div>

      <div class="sec">
        <div class="h">6 — Documents du dossier</div>
        <div class="b grid2">
          ${DOC_KEYS.map(([k, lbl]) => `<div>${checkbox(!!(student.inscription_documents || {})[k])} ${lbl}</div>`).join('')}
        </div>
      </div>

      <div class="sec">
        <div class="h">7 — Informations supplémentaires</div>
        <div class="b">
          <div class="grid3">
            <div>Nationalité : ${val(student.nationality)}</div>
            <div>Pays : ${val(student.country)}</div>
            <div>Date de réinscription : ${fmtDate(student.reinscription_date)}</div>
            <div>Établissement d'origine : ${val(student.origin_school)}</div>
            <div>Transport scolaire : ${student.has_transport ? 'Oui' : 'Non'}</div>
            <div>Enfant du personnel : ${student.is_staff_child ? 'Oui' : 'Non'}</div>
          </div>
          ${student.inscription_signature ? `<div style="margin-top:6px">Signature électronique : <b>${val(student.inscription_signature)}</b></div>` : ''}
        </div>
      </div>

      <div class="foot"><span>${val(school.name) === '—' ? '' : esc(school.name)}</span><span>1/2 · ${new Date().toLocaleString('fr-FR')}</span></div>

      <div class="page2 engage">
        <h2>ENGAGEMENT</h2>
        <p>Je soussigné(e), M. ou Mme <span class="dots"></span></p>
        <p>Parent(s) de l'élève <b>${esc(student.last_name)} ${esc(student.first_name)}</b> en classe de <b>${val(level)}</b>.</p>
        <p>— Certifie avoir pris connaissance du règlement de l'Établissement et l'accepter dans sa totalité.<br/>
           — L'établissement décline sa responsabilité avant et après les horaires d'ouverture et de fermeture des portes.<br/>
           — Les frais réglés à l'inscription ne sont remboursés en aucun cas.</p>
        <h3 style="color:#1e40af">Autorisation parentale</h3>
        <p>Enfant inscrit : Crèche – Maternelle – Primaire<br/>
           Entre 12h00 et 13h15 mon enfant restera à l'école : ${yesNo(null)}</p>
        <p>Enfant inscrit : Collège – Lycée : ${yesNo(null)}</p>
        <div class="sign">
          Signature du parent précédée de la mention « Lu et Approuvé »<br/><br/>
          <span class="dots"></span>
        </div>
        <div class="foot"><span>${val(school.name) === '—' ? '' : esc(school.name)}</span><span>2/2 · ${new Date().toLocaleString('fr-FR')}</span></div>
      </div>

    </body></html>`;
    printHtmlDocument(html, { title: `Fiche inscription ${student?.first_name || ''} ${student?.last_name || ''}`.trim() });
  };

  const deleteStudent = async (id) => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/students/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setStudents(students.filter(s => s.id !== id));
      }
    } catch (error) {
      console.error('Error deleting student:', error);
    }
  };

  // Envoyer les identifiants au parent via WhatsApp
  const sendCredentialsToParent = async (student) => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      // Récupérer les informations du parent
      const parentRes = await fetch(`${apiUrl}/api/admin/students/${student.id}/parent`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!parentRes.ok) {
        alert('Aucun parent associé à cet élève');
        return;
      }

      const parent = await parentRes.json();

      if (!parent.phone) {
        alert('Le parent n\'a pas de numéro de téléphone enregistré');
        return;
      }

      // Construire le message WhatsApp
      const schoolName = profile?.school?.name || 'Notre école';
      const message = `Bonjour,

Voici les identifiants de connexion pour votre enfant *${student.first_name} ${student.last_name}* sur la plateforme ${schoolName} :

📧 *Email :* ${student.email}
🔑 *Mot de passe :* ${student.password || '(Non disponible)'}

⚠️ Veuillez conserver ces informations en sécurité et ne pas les partager.

Cordialement,
L'administration de ${schoolName}`;

      // Envoyer via l'API WaSender
      const sendRes = await fetch(`${apiUrl}/api/admin/whatsapp/send-direct`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: parent.phone,
          message: message,
          type: 'text',
          parentId: parent.id
        })
      });

      if (sendRes.ok) {
        alert('Message envoyé avec succès au parent !');
      } else {
        const errorData = await sendRes.json();
        alert(`Erreur lors de l'envoi: ${errorData.error || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('Erreur envoi WhatsApp:', error);
      alert('Erreur lors de l\'envoi via WhatsApp');
    }
  };

  // Envoyer les identifiants à plusieurs parents via WhatsApp
  // Ouvre la modale de déplacement pour les élèves sélectionnés.
  const openMoveModal = () => {
    if (selectedStudents.size === 0) { alert('Aucun élève sélectionné'); return; }
    setMoveSearch('');
    setMoveTargetId('');
    setMoveModalOpen(true);
  };

  // Déplace tous les élèves sélectionnés vers la classe cible (1 seule requête).
  const moveSelectedStudents = async () => {
    if (!moveTargetId) { alert('Choisissez une classe de destination'); return; }
    if (selectedStudents.size === 0) return;
    setMoving(true);
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${apiUrl}/api/admin/students/bulk-move`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        // academicYear : le déplacement met aussi à jour student_enrollments (roster finance).
        body: JSON.stringify({ studentIds: Array.from(selectedStudents), classId: moveTargetId, academicYear: year }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || 'Erreur lors du déplacement'); return; }
      const target = classes.find(c => c.id === moveTargetId);
      await fetchData();
      setSelectedStudents(new Set());
      setMoveModalOpen(false);
      alert(`${data.moved} élève(s) déplacé(s) vers « ${target?.name || 'la classe'} »${data.skipped ? `. ${data.skipped} ignoré(s)` : ''}`);
    } catch (error) {
      console.error('Erreur déplacement en masse:', error);
      alert('Erreur lors du déplacement');
    } finally {
      setMoving(false);
    }
  };

  // --- Réinscription (propre école + écoles associées) ----------------------

  // Statut d'un élève vis-à-vis de l'année active — MÊME source de vérité que
  // la page finance (roster = student_enrollments) : un élève ne s'affiche que
  // s'il a une inscription active (RI/NI) pour l'année. Tous les autres (année
  // précédente, sans classe, jamais inscrits) sont des candidats proposés dans
  // la fenêtre « Réinscription ». Les professeurs (pas de roster chargé) voient
  // leurs élèves normalement.
  const studentYearStatus = (student) => {
    if (!isAdmin) return 'active';
    return activeIds.has(student.id) ? 'active' : 'candidate';
  };

  // Élèves de la propre école inscrits une autre année, pas encore réinscrits
  // dans l'année active → proposés dans la fenêtre « Réinscription ».
  const reinscriptionCandidates = students.filter((s) => studentYearStatus(s) === 'candidate');
  // Élèves actifs de l'année (même total que la finance et l'entonnoir) — sert
  // de dénominateur aux compteurs de l'en-tête (X/Y élèves, « sans parent »).
  const activeStudentsList = students.filter((s) => studentYearStatus(s) === 'active');

  // Ouvre la modale et liste d'emblée les élèves des établissements associés.
  const openCrossModal = async () => {
    setCrossSearch(''); setCrossLevelFilter(''); setCrossTargetLevel(''); setCrossResults([]);
    setCrossOpen(true);
    if (!isMultiSchool) return; // seule la section « année précédente » est utile
    runCrossSearch('', '');
    try { const { levels } = await enrollmentsApi.crossSchoolLevels(); setCrossLevels(levels || []); }
    catch { setCrossLevels([]); }
  };

  // Recherche par nom ET/OU par niveau (ex : lister tous les 6AP du primaire associé).
  // Sans critère → liste tous les élèves des établissements associés.
  const runCrossSearch = async (q, level) => {
    const name = (q ?? crossSearch).trim();
    const lvl = level ?? crossLevelFilter;
    setCrossSearching(true);
    try {
      setCrossResults(await enrollmentsApi.crossSchoolSearch(name, lvl));
    } catch (e) {
      console.error('Recherche inter-écoles:', e);
      setCrossResults([]);
    } finally {
      setCrossSearching(false);
    }
  };

  // Réinscrit en masse tout un niveau d'un établissement associé (ex : tous les 6AP).
  const reinscribeWholeLevel = async () => {
    if (!crossLevelFilter) return;
    const next = crossTargetLevel || nextLevel(crossLevelFilter) || crossLevelFilter;
    if (!window.confirm(`Réinscrire TOUS les élèves de niveau ${crossLevelFilter} des établissements associés vers ${next} (année ${year}) ? Ils seront déplacés vers cet établissement.`)) return;
    setCrossSearching(true);
    try {
      const r = await enrollmentsApi.reinscribeLevel({ source_level: crossLevelFilter, target_level: next, academic_year: year });
      await fetchData();
      await refreshActiveIds();
      setCrossOpen(false);
      alert(`${r.count} élève(s) de ${r.source_level} réinscrit(s) en ${r.target_level} pour ${r.academic_year}.`);
    } catch (e) {
      alert(e.message || 'Erreur lors de la réinscription en masse');
    } finally {
      setCrossSearching(false);
    }
  };

  // Prépare la modale de réinscription pour un élève de la PROPRE école (candidat).
  const openReinscribe = (s) => {
    const cls = classes.find((c) => c.id === s.class_id);
    const curLevel = s.level || cls?.level || '';
    setReinscribeTarget({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      school_name: null,
      current_level: curLevel,
      suggested_level: nextLevel(curLevel),
      isCross: false,
    });
    setReinscribeLevel(nextLevel(curLevel) || curLevel || '');
    setReinscribeClassId('');
    setReinscribeMsg(null);
    setCrossOpen(false);
  };

  // Idem depuis un résultat de recherche d'une école associée.
  const openReinscribeFromCross = (s) => {
    setReinscribeTarget({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      school_name: s.school?.name || null,
      current_level: s.current_level,
      suggested_level: s.suggested_level,
      isCross: true,
    });
    setReinscribeLevel(s.suggested_level || s.current_level || '');
    setReinscribeClassId('');
    setReinscribeMsg(null);
    setCrossOpen(false);
  };

  const submitReinscribe = async () => {
    if (!reinscribeTarget) return;
    setReinscribeBusy(true); setReinscribeMsg(null);
    try {
      const payload = { student_id: reinscribeTarget.id, academic_year: year };
      if (reinscribeClassId) payload.target_class_id = reinscribeClassId;
      else if (reinscribeLevel) payload.target_level = reinscribeLevel;
      const r = await enrollmentsApi.reinscribe(payload);
      await fetchData();
      await refreshActiveIds();
      const name = reinscribeTarget.name;
      setReinscribeTarget(null);
      alert(`${name} réinscrit(e) en ${r.level} pour ${r.academic_year}.`);
    } catch (e) {
      setReinscribeMsg({ type: 'err', text: e.message || 'Erreur lors de la réinscription' });
    } finally {
      setReinscribeBusy(false);
    }
  };

  // Annule la réinscription d'un élève pour l'année active : supprime son
  // inscription de l'année et le remet dans sa classe/niveau précédents.
  const undoReinscription = async (student) => {
    const name = `${student.first_name} ${student.last_name}`;
    if (!window.confirm(`Annuler la réinscription de ${name} pour ${year} ? L'élève sera remis dans son état précédent (classe et niveau) et son inscription ${year} sera supprimée.`)) return;
    setUndoingReinscribe(true);
    try {
      await enrollmentsApi.undoReinscribe(student.id, year);
      await fetchData();
      await refreshActiveIds();
      setActiveStudent(null);
      alert(`Réinscription de ${name} annulée pour ${year}.`);
    } catch (e) {
      alert(e.message || "Erreur lors de l'annulation de la réinscription");
    } finally {
      setUndoingReinscribe(false);
    }
  };

  const sendBulkCredentialsToParents = async () => {
    if (selectedStudents.size === 0) {
      alert('Aucun élève sélectionné');
      return;
    }

    if (!confirm(`Envoyer les identifiants de ${selectedStudents.size} élève(s) à leurs parents via WhatsApp ?`)) {
      return;
    }

    const selectedStudentsList = students.filter(s => selectedStudents.has(s.id));
    let successCount = 0;
    let errorCount = 0;

    for (const student of selectedStudentsList) {
      try {
        await sendCredentialsToParent(student);
        successCount++;
        // Petit délai entre chaque envoi pour éviter de surcharger l'API
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Erreur envoi pour ${student.first_name} ${student.last_name}:`, error);
        errorCount++;
      }
    }

    alert(`${successCount} message(s) envoyé(s) avec succès${errorCount > 0 ? `. ${errorCount} erreur(s)` : ''}`);
    
    // Désélectionner tous les élèves après l'envoi
    setSelectedStudents(new Set());
  };

  const resetPassword = async (studentId) => {
    if (!confirm('Êtes-vous sûr de vouloir réinitialiser le mot de passe de cet élève ?')) {
      return;
    }

    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;
      
      // Trouver l'élève pour obtenir son prénom
      const student = students.find(s => s.id === studentId);
      const newPassword = generatePassword(student?.first_name || '');

      const endpoint = isAdmin
        ? `${apiUrl}/api/admin/students/${studentId}/reset-password`
        : `${apiUrl}/api/teacher/students/${studentId}/reset-password`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newPassword })
      });

      if (res.ok) {
        // Mettre à jour l'état local pour refléter le nouveau mot de passe
        setStudents(students.map(s => 
          s.id === studentId ? { ...s, password: newPassword } : s
        ));
        
        alert(`✅ Mot de passe réinitialisé: ${newPassword}`);
      } else {
        alert('❌ Erreur lors de la réinitialisation');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('Erreur lors de la réinitialisation du mot de passe');
    }
  };

  const sendCredentialsViaWhatsApp = async () => {
    try {
      setSendingCredentials(true);
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/students/send-credentials-whatsapp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: sendCredentialsFilter,
          filiere: sendCredentialsFiliere,
          classId: sendCredentialsClass,
          // Seuls les élèves inscrits dans l'année active reçoivent leurs identifiants.
          academicYear: year
        })
      });

      const data = await res.json();
      
      if (res.ok) {
        alert(`✅ Identifiants envoyés avec succès à ${data.sent || 0} parent(s) via WhatsApp`);
        setShowSendCredentialsModal(false);
      } else {
        alert(`❌ Erreur: ${data.error || 'Échec de l\'envoi'}`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de l\'envoi des identifiants');
    } finally {
      setSendingCredentials(false);
    }
  };

  if (loading) {
    return <div className="p-8">Chargement...</div>;
  }

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">
      {/* Modal pour envoyer les identifiants via WhatsApp */}
      {showSendCredentialsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSendCredentialsModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Envoyer les identifiants via WhatsApp</h3>
              <p className="text-sm text-gray-500 mt-1">Les login et mots de passe seront envoyés aux parents</p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Filtrer par</label>
                <select
                  value={sendCredentialsFilter}
                  onChange={(e) => {
                    setSendCredentialsFilter(e.target.value);
                    setSendCredentialsFiliere('');
                    setSendCredentialsClass('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                >
                  <option value="all">Tous les élèves</option>
                  <option value="filiere">Par filière</option>
                  <option value="class">Par classe</option>
                </select>
              </div>

              {sendCredentialsFilter === 'filiere' && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">Filière</label>
                  <select
                    value={sendCredentialsFiliere}
                    onChange={(e) => setSendCredentialsFiliere(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Sélectionner une filière</option>
                    {[...new Set(classes.map(c => c.filiere).filter(Boolean))].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
              )}

              {sendCredentialsFilter === 'class' && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">Classe</label>
                  <select
                    value={sendCredentialsClass}
                    onChange={(e) => setSendCredentialsClass(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Sélectionner une classe</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Les identifiants (login et mot de passe) seront envoyés séparément pour faciliter la copie.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowSendCredentialsModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                disabled={sendingCredentials}
              >
                Annuler
              </button>
              <button
                onClick={sendCredentialsViaWhatsApp}
                disabled={sendingCredentials || (sendCredentialsFilter === 'filiere' && !sendCredentialsFiliere) || (sendCredentialsFilter === 'class' && !sendCredentialsClass)}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {sendingCredentials ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Envoi en cours...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Envoyer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="py-2">
          {/* Tous les filtres + sélection + compteur + actions sur une seule ligne */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Nom..."
              value={filters.searchName}
              onChange={(e) => setFilters({ ...filters, searchName: e.target.value })}
              className="flex-1 min-w-[110px] px-2 py-1 border rounded text-xs"
            />
            <input
              type="text"
              placeholder="Email..."
              value={filters.searchEmail}
              onChange={(e) => setFilters({ ...filters, searchEmail: e.target.value })}
              className="flex-1 min-w-[110px] px-2 py-1 border rounded text-xs"
            />
            <select
              value={filters.className}
              onChange={(e) => setFilters({ ...filters, className: e.target.value })}
              className="min-w-[110px] px-2 py-1 border rounded text-xs"
            >
              <option value="">Toutes les classes</option>
              <option value="unassigned">Non assignés</option>
              {classes.map(cls => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
            <select
              value={filters.level}
              onChange={(e) => setFilters({ ...filters, level: e.target.value })}
              className="min-w-[100px] px-2 py-1 border rounded text-xs"
            >
              <option value="">Tous niveaux</option>
              {getAvailableLevels().map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
            <select
              value={filters.parentStatus}
              onChange={(e) => setFilters({ ...filters, parentStatus: e.target.value })}
              className="min-w-[100px] px-2 py-1 border rounded text-xs"
            >
              <option value="">Parent : tous</option>
              <option value="without">⚠ Sans parent</option>
              <option value="with">👪 Avec parent</option>
            </select>
            <select
              value={filters.locationStatus}
              onChange={(e) => setFilters({ ...filters, locationStatus: e.target.value })}
              className="min-w-[100px] px-2 py-1 border rounded text-xs"
            >
              <option value="">Localis. : tous</option>
              <option value="with">📍 Localisé</option>
              <option value="without">❌ Sans</option>
            </select>

            {isAdmin && getFilteredStudents().length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-blue-600"
              >
                {isAllSelected() ? (
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                ) : isSomeSelected() ? (
                  <div className="w-4 h-4 border-2 border-blue-600 bg-blue-100 rounded relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-blue-600 rounded-sm" />
                    </div>
                  </div>
                ) : (
                  <Square className="w-4 h-4 text-gray-400" />
                )}
                {isAllSelected() ? 'Désélect.' : 'Tout'}
                <span className="text-gray-500 font-normal">({selectedStudents.size}/{getFilteredStudents().length})</span>
              </button>
            )}

            <span className="text-xs text-gray-600 whitespace-nowrap">
              {getFilteredStudents().length}/{activeStudentsList.length} élève(s)
              {(() => {
                const without = activeStudentsList.filter(s => !(s.parents?.length > 0)).length;
                return without > 0 ? <span className="ml-1 text-amber-600 font-medium">• {without} sans parent</span> : null;
              })()}
            </span>

            {/* Actions à droite */}
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {isAdmin && selectedStudents.size > 0 && (
                <>
                  <button
                    onClick={() => openParentModal(students.filter(s => selectedStudents.has(s.id)))}
                    className="flex items-center gap-1 px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700"
                    title="Ajouter les parents des élèves sélectionnés"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Parents ({selectedStudents.size})
                  </button>
                  <button
                    onClick={sendBulkCredentialsToParents}
                    className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                    title="Envoyer les identifiants aux parents via WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp ({selectedStudents.size})
                  </button>
                  <button
                    onClick={openMoveModal}
                    className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                    title="Déplacer les élèves sélectionnés vers une autre classe"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Déplacer ({selectedStudents.size})
                  </button>
                  <button
                    onClick={deleteSelectedStudents}
                    className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Suppr. ({selectedStudents.size})
                  </button>
                </>
              )}
              {isAdmin && filters.parentStatus === 'without' && getFilteredStudents().length > 0 && (
                <button
                  onClick={() => openParentModal(getFilteredStudents())}
                  className="flex items-center gap-1 px-2 py-1 bg-amber-600 text-white rounded text-xs hover:bg-amber-700"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Ajouter parents ({getFilteredStudents().length})
                </button>
              )}
              {isAdmin && (
                <>
                  <button
                    onClick={() => setShowSendCredentialsModal(true)}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Identifiants WhatsApp
                  </button>
                  <button
                    onClick={openCrossModal}
                    title="Réinscrire des élèves de l'année précédente ou d'un établissement associé"
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-violet-600 text-white rounded hover:bg-violet-700"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Réinscription{reinscriptionCandidates.length ? ` (${reinscriptionCandidates.length})` : ''}
                  </button>
                  <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter un élève
                  </button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && showForm && (() => {
        const inputCls = 'w-full px-3 py-2 border rounded text-sm';
        const setF = (field) => (e) => setFormData(f => ({ ...f, [field]: e.target.value }));
        const setP = (pk, field) => (e) => setFormData(f => ({ ...f, [pk]: { ...f[pk], [field]: e.target.value } }));
        const Label = ({ children }) => <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>;
        const parentForm = (pk, titre) => {
          const p = formData[pk];
          return (
            <div className="border rounded-lg p-3 bg-amber-50/40">
              <p className="text-sm font-semibold text-gray-700 mb-2">{titre}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><Label>Nom</Label><input className={inputCls} value={p.lastName} onChange={setP(pk, 'lastName')} /></div>
                <div><Label>Prénom</Label><input className={inputCls} value={p.firstName} onChange={setP(pk, 'firstName')} /></div>
                <div><Label>Téléphone (06/07…)</Label><input className={inputCls} value={p.phone} onChange={setP(pk, 'phone')} placeholder="0650-123456" /></div>
                <div><Label>Email</Label><input className={inputCls} value={p.email} onChange={setP(pk, 'email')} /></div>
                <div><Label>CIN</Label><input className={inputCls} value={p.cin} onChange={setP(pk, 'cin')} /></div>
                <div><Label>Profession</Label><input className={inputCls} value={p.profession} onChange={setP(pk, 'profession')} /></div>
                <div>
                  <Label>Relation</Label>
                  <select className={inputCls} value={p.relationship} onChange={setP(pk, 'relationship')}>
                    <option value="pere">Père</option>
                    <option value="mere">Mère</option>
                    <option value="tuteur">Tuteur</option>
                  </select>
                </div>
                <div><Label>Situation familiale</Label><input className={inputCls} value={p.maritalStatus} onChange={setP(pk, 'maritalStatus')} placeholder="Marié(e), …" /></div>
              </div>
            </div>
          );
        };
        return (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => { if (!submitting) { resetForm(); setShowForm(false); } }}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-xl z-10">
                <div className="flex items-center gap-2">
                  {editingStudent ? <Edit2 className="w-5 h-5 text-blue-600" /> : <UserPlus className="w-5 h-5 text-blue-600" />}
                  <h3 className="font-semibold">
                    {editingStudent ? `Modifier l'élève — ${editingStudent.first_name} ${editingStudent.last_name}` : 'Fiche d\'inscription — Nouvel élève'} · {academicYear()}
                  </h3>
                </div>
                <button onClick={() => { if (!submitting) { resetForm(); setShowForm(false); } }} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-5 max-h-[78vh] overflow-y-auto">
                {/* ── Informations élève ── */}
                <section className="space-y-3">
                  <h4 className="text-sm font-bold text-blue-700">👦 Informations élève</h4>
                  <div className="flex gap-4 items-start">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-28 h-28 rounded-full border-2 border-blue-100 overflow-hidden bg-gray-100 flex items-center justify-center">
                        {photoPreview
                          ? <img src={photoPreview} alt="aperçu" className="w-full h-full object-cover" />
                          : <Camera className="w-8 h-8 text-gray-400" />}
                      </div>
                      <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
                      <button type="button" onClick={() => photoInputRef.current?.click()}
                        className="text-xs px-3 py-1.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600">{editingStudent ? 'Changer' : 'Sélectionner'}</button>
                    </div>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div><Label>Nom de famille *</Label><input required className={inputCls} value={formData.lastName} onChange={setF('lastName')} /></div>
                      <div><Label>Prénom *</Label><input required className={inputCls} value={formData.firstName} onChange={setF('firstName')} /></div>
                      <div><Label>الاسم العائلي (Nom ar)</Label><input dir="rtl" className={inputCls} value={formData.lastNameAr} onChange={setF('lastNameAr')} /></div>
                      <div><Label>الاسم الشخصي (Prénom ar)</Label><input dir="rtl" className={inputCls} value={formData.firstNameAr} onChange={setF('firstNameAr')} /></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label>Sexe</Label>
                      <select className={inputCls} value={formData.gender} onChange={setF('gender')}>
                        <option value="M">Garçon</option>
                        <option value="F">Fille</option>
                      </select>
                    </div>
                    <div><Label>Date de naissance</Label><input type="date" className={inputCls} value={formData.dateOfBirth} onChange={setF('dateOfBirth')} /></div>
                    <div><Label>Lieu de naissance</Label><input className={inputCls} value={formData.birthPlace} onChange={setF('birthPlace')} /></div>
                    <div><Label>Téléphone</Label><input className={inputCls} value={formData.phone} onChange={setF('phone')} /></div>
                    <div><Label>CIN</Label><input className={inputCls} value={formData.cin} onChange={setF('cin')} /></div>
                    <div><Label>Code Massar</Label><input className={inputCls} value={formData.massarCode} onChange={setF('massarCode')} /></div>
                    <div><Label>N° matricule</Label><input className={inputCls} value={formData.registrationNumber} onChange={setF('registrationNumber')} placeholder="2025_000091" /></div>
                    <div><Label>Date d'entrée</Label><input type="date" className={inputCls} value={formData.entryDate} onChange={setF('entryDate')} /></div>
                    <div>
                      <Label>Niveau</Label>
                      {levelOptions.length ? (
                        <select className={inputCls} value={formData.level} onChange={setF('level')}>
                          <option value="">Sélectionner un niveau</option>
                          {/* Un niveau déjà saisi hors liste (édition) reste sélectionnable */}
                          {formData.level && !levelOptions.includes(formData.level) && (
                            <option value={formData.level}>{formData.level}</option>
                          )}
                          {levelOptions.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
                        </select>
                      ) : (
                        <input className={inputCls} value={formData.level} onChange={setF('level')} placeholder="1APIC" />
                      )}
                    </div>
                    <div>
                      <Label>Classe</Label>
                      <select className={inputCls} value={formData.classId} onChange={setF('classId')}>
                        <option value="">Sélectionner une classe (optionnel)</option>
                        {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Dossier</Label>
                      <select className={inputCls} value={formData.dossierStatus} onChange={setF('dossierStatus')}>
                        <option value="complet">Complet</option>
                        <option value="incomplet">Incomplet</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* ── Informations parents ── */}
                <section className="space-y-3">
                  <h4 className="text-sm font-bold text-blue-700">👪 Informations parents</h4>

                  {editingStudent ? (
                    /* Édition : parents liés en cartes + Détacher + Rattacher */
                    <div className="space-y-2">
                      {(editingStudent.parents || []).length === 0 && (
                        <p className="text-sm text-gray-400">Aucun parent lié.</p>
                      )}
                      {(editingStudent.parents || []).map((p) => (
                        <div key={p.id} className="flex items-center justify-between border rounded-lg p-3 bg-amber-50/40">
                          <div className="text-sm">
                            <p className="font-medium">{p.last_name} {p.first_name} {p.relationship ? <span className="text-gray-400">· {p.relationship}</span> : null}</p>
                            <p className="text-xs text-gray-500">{[p.phone, p.email, p.cin && `CIN ${p.cin}`].filter(Boolean).join(' · ') || '—'}</p>
                          </div>
                          <button type="button" onClick={() => detachParent(editingStudent.id, p.id)}
                            className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50">Détacher</button>
                        </div>
                      ))}

                      {attachParent.open ? (
                        <div className="border rounded-lg p-3 bg-blue-50/40 space-y-2">
                          <p className="text-sm font-semibold text-gray-700">Rattacher un parent</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input className={inputCls} placeholder="Nom" value={attachParent.lastName} onChange={(e) => setAttachParent(a => ({ ...a, lastName: e.target.value }))} />
                            <input className={inputCls} placeholder="Prénom" value={attachParent.firstName} onChange={(e) => setAttachParent(a => ({ ...a, firstName: e.target.value }))} />
                            <input className={inputCls} placeholder="Téléphone (06/07…)" value={attachParent.phone} onChange={(e) => setAttachParent(a => ({ ...a, phone: e.target.value }))} />
                            <input className={inputCls} placeholder="Email" value={attachParent.email} onChange={(e) => setAttachParent(a => ({ ...a, email: e.target.value }))} />
                            <input className={inputCls} placeholder="CIN" value={attachParent.cin} onChange={(e) => setAttachParent(a => ({ ...a, cin: e.target.value }))} />
                            <input className={inputCls} placeholder="Profession" value={attachParent.profession} onChange={(e) => setAttachParent(a => ({ ...a, profession: e.target.value }))} />
                            <select className={inputCls} value={attachParent.relationship} onChange={(e) => setAttachParent(a => ({ ...a, relationship: e.target.value }))}>
                              <option value="pere">Père</option><option value="mere">Mère</option><option value="tuteur">Tuteur</option>
                            </select>
                            <input className={inputCls} placeholder="Situation familiale" value={attachParent.maritalStatus} onChange={(e) => setAttachParent(a => ({ ...a, maritalStatus: e.target.value }))} />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={attachParentToStudent} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700">Rattacher</button>
                            <button type="button" onClick={() => setAttachParent(a => ({ ...a, open: false }))} className="px-3 py-1.5 bg-gray-200 rounded-lg text-sm">Annuler</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setAttachParent(a => ({ ...a, open: true }))}
                          className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50">
                          <UserPlus className="w-4 h-4" /> Rattacher un parent
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Création : saisie inline Parent 1 / Parent 2 */
                    <>
                      {parentForm('parent1', 'Parent 1')}
                      {parentForm('parent2', 'Parent 2')}
                      <p className="text-xs text-gray-500">Un parent n'est enregistré que s'il a un <b>nom + un téléphone</b>.</p>
                    </>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div><Label>Téléphone domicile</Label><input className={inputCls} value={formData.homePhone} onChange={setF('homePhone')} /></div>
                    <div><Label>Adresse</Label><input className={inputCls} value={formData.homeAddress} onChange={setF('homeAddress')} /></div>
                    <div><Label>Quartier (الحي)</Label><input className={inputCls} value={formData.quartier} onChange={setF('quartier')} /></div>
                  </div>

                  {/* Localisation domicile (transport) — souvent renseignée par le parent via WhatsApp */}
                  <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                      <MapPin className="w-4 h-4" /> Localisation du domicile (transport)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div><Label>Latitude</Label><input className={inputCls} value={formData.homeLat} onChange={setF('homeLat')} placeholder="33.5731" /></div>
                      <div><Label>Longitude</Label><input className={inputCls} value={formData.homeLng} onChange={setF('homeLng')} placeholder="-7.5898" /></div>
                      <div className="flex items-end">
                        {formData.homeLat && formData.homeLng ? (
                          <a href={`https://www.google.com/maps?q=${formData.homeLat},${formData.homeLng}`} target="_blank" rel="noreferrer"
                            className="text-xs px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" /> Voir sur la carte
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">Aucune position — le parent peut l'envoyer via WhatsApp.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* ── Scolarité antérieure ── */}
                <section className="space-y-2">
                  <h4 className="text-sm font-bold text-blue-700">🏫 Scolarité antérieure</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div><Label>Établissement fréquenté l'an dernier</Label><input className={inputCls} value={formData.previousSchool} onChange={setF('previousSchool')} /></div>
                    <div><Label>Classe</Label><input className={inputCls} value={formData.previousClass} onChange={setF('previousClass')} /></div>
                  </div>
                </section>

                {/* ── Informations supplémentaires ── */}
                <section className="space-y-2">
                  <h4 className="text-sm font-bold text-blue-700">ℹ️ Informations supplémentaires</h4>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {[
                      ['isStaffChild', 'Enfant du personnel'],
                      ['isPartnerGroup', 'Groupe partenaire'],
                      ['isExpat', 'Expatrié'],
                      ['hadAccompaniment', 'Déjà accompagné'],
                      ['hasTransport', 'Transport scolaire'],
                    ].map(([key, lbl]) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!formData[key]} onChange={(e) => setFormData(f => ({ ...f, [key]: e.target.checked }))} />
                        {lbl}
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div><Label>Nationalité</Label><input className={inputCls} value={formData.nationality} onChange={setF('nationality')} /></div>
                    <div><Label>Pays</Label><input className={inputCls} value={formData.country} onChange={setF('country')} placeholder="Morocco" /></div>
                    <div><Label>Date de réinscription</Label><input type="date" className={inputCls} value={formData.reinscriptionDate} onChange={setF('reinscriptionDate')} /></div>
                    <div><Label>Établissement d'origine</Label><input className={inputCls} value={formData.originSchool} onChange={setF('originSchool')} /></div>
                  </div>
                </section>

                {/* ── Documents inscriptions ── */}
                <section className="space-y-2">
                  <h4 className="text-sm font-bold text-blue-700">📄 Documents du dossier</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                    {DOC_KEYS.map(([key, lbl]) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!formData.inscriptionDocuments?.[key]}
                          onChange={(e) => setFormData(f => ({ ...f, inscriptionDocuments: { ...f.inscriptionDocuments, [key]: e.target.checked } }))} />
                        {lbl}
                      </label>
                    ))}
                  </div>
                  <div><Label>Signature électronique</Label><input className={inputCls} value={formData.inscriptionSignature} onChange={setF('inscriptionSignature')} placeholder="Nom du signataire" /></div>
                </section>

                {/* ── Médical & autorisations ── */}
                <section className="space-y-2">
                  <h4 className="text-sm font-bold text-blue-700">🩺 Médical & autorisations</h4>
                  <div className="flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={formData.hasHealthIssue} onChange={(e) => setFormData(f => ({ ...f, hasHealthIssue: e.target.checked }))} />
                      Problème de santé
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={formData.photoAuthorized} onChange={(e) => setFormData(f => ({ ...f, photoAuthorized: e.target.checked }))} />
                      Autorisation d'utiliser la photo
                    </label>
                  </div>
                  {formData.hasHealthIssue && (
                    <div><Label>Précisions médicales</Label><input className={inputCls} value={formData.healthNotes} onChange={setF('healthNotes')} /></div>
                  )}
                </section>

                {/* ── Identifiants (création uniquement) ── */}
                {!editingStudent && (
                  <section className="space-y-2">
                    <h4 className="text-sm font-bold text-blue-700">🔑 Identifiants d'accès (auto-générés si vides)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div><Label>Email</Label><input type="email" className={inputCls} value={formData.email} onChange={setF('email')} placeholder="auto : codemassar@ecole.ma ou nom.prenom@ecole.ma" /></div>
                      <div><Label>Mot de passe</Label><input className={inputCls} value={formData.password} onChange={setF('password')} placeholder="auto (Prénom+année)" /></div>
                    </div>
                  </section>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <button type="submit" disabled={submitting} className="flex-1 min-w-[140px] px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                    {submitting ? 'Enregistrement…' : (editingStudent ? 'Enregistrer' : 'Valider')}
                  </button>
                  <button type="button" disabled={submitting} onClick={(e) => handleSubmit(e, { thenPrint: true })}
                    className="flex-1 min-w-[180px] px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    <FileText className="w-4 h-4" /> {editingStudent ? 'Enregistrer + fiche' : 'Valider + télécharger la fiche'}
                  </button>
                  <button type="button" disabled={submitting} onClick={() => { resetForm(); setShowForm(false); }} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      <Card>
        <CardContent className="pt-4">
          <div className="space-y-3">
            {getFilteredStudents().length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                {students.length === 0 ? 'Aucun élève' : 'Aucun élève ne correspond aux filtres'}
              </p>
            ) : (
              <div>
                {/* Bascule grille / liste */}
                <div className="flex items-center justify-end mb-3">
                  <GridListToggle value={viewMode} onChange={setViewMode} />
                </div>

                {(() => {
                  const list = getFilteredStudents();
                  const classMap = Object.fromEntries(classes.map((c) => [c.id, c.name]));
                  const classLabel = (s) => classMap[s.class_id] || (s.class_id ? 'Classe assignée' : 'Non assigné');
                  const parentStatus = (s) => (s.parents?.length > 0
                    ? <StatusPill tone="green" icon={Users}>{s.parents.length} parent{s.parents.length > 1 ? 's' : ''}</StatusPill>
                    : <StatusPill tone="amber" icon={AlertTriangle}>Sans parent</StatusPill>);
                  const locationStatus = (s) => (hasLocation(s)
                    ? <StatusPill tone="blue" icon={MapPin}>Localisé</StatusPill>
                    : <StatusPill tone="gray" icon={MapPinOff}>Sans localisation</StatusPill>);
                  const cardStatus = (s) => (
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {parentStatus(s)}{locationStatus(s)}
                    </div>
                  );
                  // Badge + bouton pour un élève non réinscrit (candidat).
                  const candidateStatus = (s) => (
                    <div className="flex flex-col items-center gap-1.5">
                      <StatusPill tone="red" icon={AlertTriangle}>Non réinscrit</StatusPill>
                      <button
                        onClick={(e) => { e.stopPropagation(); openReinscribe(s); }}
                        className="text-xs bg-violet-600 text-white px-2 py-1 rounded hover:bg-violet-700 flex items-center gap-1"
                      >
                        <ArrowRightLeft className="w-3 h-3" /> Réinscrire
                      </button>
                    </div>
                  );

                  if (viewMode === 'grid') {
                    return (
                      <CardGrid min={180}>
                        {list.map((student) => {
                          const isCandidate = studentYearStatus(student) === 'candidate';
                          return (
                            <div key={student.id} className={isCandidate ? 'opacity-90 grayscale-[35%]' : ''}>
                              <StudentCard
                                name={`${student.first_name} ${student.last_name}`}
                                photo={student.avatar_url}
                                gender={student.gender || ''}
                                className={classLabel(student)}
                                status={isCandidate ? candidateStatus(student) : cardStatus(student)}
                                selectable={isAdmin && !isCandidate}
                                selected={selectedStudents.has(student.id)}
                                onToggleSelect={() => toggleStudentSelection(student.id)}
                                onClick={() => isCandidate ? openReinscribe(student) : setActiveStudent(student)}
                              />
                            </div>
                          );
                        })}
                      </CardGrid>
                    );
                  }

                  return (
                    <div>
                      {list.map((student) => {
                        const isCandidate = studentYearStatus(student) === 'candidate';
                        return (
                          <div key={student.id} className={isCandidate ? 'opacity-90 grayscale-[35%]' : ''}>
                            <StudentRow
                              name={`${student.first_name} ${student.last_name}`}
                              photo={student.avatar_url}
                              gender={student.gender || ''}
                              className={classLabel(student)}
                              sub={student.email}
                              status={isCandidate ? candidateStatus(student) : cardStatus(student)}
                              selectable={isAdmin && !isCandidate}
                              selected={selectedStudents.has(student.id)}
                              onToggleSelect={() => toggleStudentSelection(student.id)}
                              onClick={() => isCandidate ? openReinscribe(student) : setActiveStudent(student)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fiche élève (drawer master-detail) */}
      <DetailDrawer
        open={!!activeStudent}
        onClose={() => setActiveStudent(null)}
        title={activeStudent ? `${activeStudent.first_name} ${activeStudent.last_name}` : ''}
      >
        {activeStudent && (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center gap-2">
              <Avatar name={`${activeStudent.first_name} ${activeStudent.last_name}`} src={activeStudent.avatar_url} size="lg" gender={activeStudent.gender || ''} />
              <div className="font-medium">{activeStudent.first_name} {activeStudent.last_name}</div>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {activeStudent.parents?.length > 0 ? (
                  <StatusPill tone="green" icon={Users}>{activeStudent.parents.length} parent{activeStudent.parents.length > 1 ? 's' : ''}</StatusPill>
                ) : (
                  <StatusPill tone="amber" icon={AlertTriangle}>Sans parent</StatusPill>
                )}
                {hasLocation(activeStudent)
                  ? <StatusPill tone="blue" icon={MapPin}>Localisé</StatusPill>
                  : <StatusPill tone="gray" icon={MapPinOff}>Sans localisation</StatusPill>}
              </div>
            </div>

            <div>
              <FieldRow label="Classe" value={classes.find((c) => c.id === activeStudent.class_id)?.name || (activeStudent.class_id ? 'Assignée' : 'Non assigné')} />
              {activeStudent.level && <FieldRow label="Niveau" value={activeStudent.level} />}
              {activeStudent.registration_number && <FieldRow label="N° matricule" value={activeStudent.registration_number} mono />}
              <FieldRow label="Code MASSAR" value={activeStudent.massar_code} mono />
              <FieldRow label="Genre" value={activeStudent.gender === 'M' ? 'Garçon' : activeStudent.gender === 'F' ? 'Fille' : '—'} />
              {(activeStudent.first_name_ar || activeStudent.last_name_ar) && (
                <FieldRow label="Nom (ar)" value={`${activeStudent.last_name_ar || ''} ${activeStudent.first_name_ar || ''}`.trim()} />
              )}
              {activeStudent.date_of_birth && <FieldRow label="Naissance" value={`${new Date(activeStudent.date_of_birth).toLocaleDateString('fr-FR')}${activeStudent.birth_place ? ` · ${activeStudent.birth_place}` : ''}`} />}
              {activeStudent.home_address && <FieldRow label="Adresse" value={activeStudent.home_address} />}
              <FieldRow label="Localisation" value={hasLocation(activeStudent)
                ? `${Number(activeStudent.home_lat).toFixed(5)}, ${Number(activeStudent.home_lng).toFixed(5)}`
                : 'Non renseignée'} />
              <FieldRow label="Email" value={activeStudent.email} />
            </div>

            {isAdmin && (
              <button
                onClick={() => openEdit(activeStudent)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Edit2 className="w-4 h-4" /> Modifier l'élève
              </button>
            )}

            {hasLocation(activeStudent) && (
              <a
                href={`https://www.google.com/maps?q=${activeStudent.home_lat},${activeStudent.home_lng}`}
                target="_blank" rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <MapPin className="w-4 h-4" /> Voir la localisation sur la carte
              </a>
            )}

            <button
              onClick={() => printInscriptionFiche(activeStudent)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" /> Télécharger la fiche d'inscription
            </button>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700 block">Mot de passe</label>
              <div className="flex items-center gap-2">
                <input
                  type={visiblePasswords[`pwd_${activeStudent.id}`] ? 'text' : 'password'}
                  value={activeStudent.password || ''}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                />
                <button
                  onClick={() => setVisiblePasswords((prev) => ({ ...prev, [`pwd_${activeStudent.id}`]: !prev[`pwd_${activeStudent.id}`] }))}
                  className="p-2 hover:bg-blue-100 rounded"
                  title={visiblePasswords[`pwd_${activeStudent.id}`] ? 'Masquer' : 'Afficher'}
                >
                  {visiblePasswords[`pwd_${activeStudent.id}`] ? <EyeOff className="w-4 h-4 text-blue-600" /> : <Eye className="w-4 h-4 text-blue-600" />}
                </button>
                <button onClick={() => copyToClipboard(activeStudent.password || '')} className="p-2 hover:bg-blue-100 rounded" title="Copier">
                  <Copy className="w-4 h-4 text-blue-600" />
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => sendCredentialsToParent(activeStudent)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Envoyer au parent via WhatsApp
              </button>
              {isAdmin && (
                <button
                  onClick={() => openParentModal([activeStudent])}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors"
                >
                  <UserPlus className="w-4 h-4" /> {activeStudent.parents?.length ? 'Ajouter un autre parent' : 'Ajouter les parents'}
                </button>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => resetPassword(activeStudent.id)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> Réinitialiser
                </button>
                {isAdmin && (
                  <button
                    onClick={() => { deleteStudent(activeStudent.id); setActiveStudent(null); }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Supprimer
                  </button>
                )}
              </div>

              {/* Annuler la réinscription : remet l'élève dans son état initial */}
              {isAdmin && studentYearStatus(activeStudent) === 'active' && (
                <div className="pt-2 mt-1 border-t border-border">
                  <button
                    onClick={() => undoReinscription(activeStudent)}
                    disabled={undoingReinscribe}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {undoingReinscribe ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    {undoingReinscribe ? 'Annulation…' : 'Annuler la réinscription'}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-1.5 text-center">
                    Supprime l'inscription {year} et remet l'élève dans sa classe et son niveau précédents.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* Modale d'ajout de parents */}
      {parentModalQueue.length > 0 && (() => {
        const student = parentModalQueue[parentModalIndex];
        if (!student) return null;
        const existing = student.parents || [];
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeParentModal}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-amber-600" />
                  <h3 className="font-semibold">Ajouter les parents</h3>
                </div>
                <button onClick={closeParentModal} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-4 space-y-4">
                {/* Élève + progression file d'attente */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-500">Élève</p>
                  <p className="font-medium">{student.first_name} {student.last_name}</p>
                  {parentModalQueue.length > 1 && (
                    <p className="text-xs text-gray-400 mt-1">Élève {parentModalIndex + 1} / {parentModalQueue.length}</p>
                  )}
                </div>

                {/* Parents déjà associés — éditables directement (nom / prénom / téléphone) */}
                {existing.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-700">👪 Parent(s) déjà associé(s)</p>
                    {existing.map(p => {
                      const edit = existingEdits[p.id] || {};
                      const ln = edit.last_name ?? p.last_name ?? '';
                      const fn = edit.first_name ?? p.first_name ?? '';
                      const ph = edit.phone ?? p.phone ?? '';
                      const isTmp = String(p.id).startsWith('tmp_');
                      const setField = (field) => (e) =>
                        setExistingEdits(s => ({ ...s, [p.id]: { ...s[p.id], [field]: e.target.value } }));
                      return (
                        <div key={p.id} className="border border-blue-200 rounded-lg p-2.5 bg-blue-50/40 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input className="px-3 py-2 border rounded text-sm" placeholder="Nom" value={ln} onChange={setField('last_name')} />
                            <input className="px-3 py-2 border rounded text-sm" placeholder="Prénom" value={fn} onChange={setField('first_name')} />
                            <input type="tel" className="px-3 py-2 border rounded text-sm" placeholder="Téléphone (06/07…)" value={ph} onChange={setField('phone')} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">{p.relationship || 'parent'}</span>
                            <button type="button" disabled={isTmp || savingExistingId === p.id}
                              onClick={() => saveExistingParent(p)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                              title={isTmp ? 'Rechargez la page pour modifier ce parent' : 'Enregistrer les modifications'}>
                              <Edit2 className="w-3.5 h-3.5" />
                              {savingExistingId === p.id ? 'Enregistrement…' : 'Modifier'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-orange-600">Ou ajoutez un <b>parent supplémentaire</b> ci-dessous (les numéros déjà connus seront réutilisés).</p>
                  </div>
                )}

                {/* Père */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">👨 Père</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input type="text" placeholder="Nom du père" value={parentForm.pereName}
                      onChange={e => setParentForm(f => ({ ...f, pereName: e.target.value }))}
                      className="px-3 py-2 border rounded text-sm" />
                    <input type="tel" placeholder="Téléphone (06/07…)" value={parentForm.perePhone}
                      onChange={e => setParentForm(f => ({ ...f, perePhone: e.target.value }))}
                      className="px-3 py-2 border rounded text-sm" />
                  </div>
                </div>

                {/* Mère */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">👩 Mère</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input type="text" placeholder="Nom de la mère" value={parentForm.mereName}
                      onChange={e => setParentForm(f => ({ ...f, mereName: e.target.value }))}
                      className="px-3 py-2 border rounded text-sm" />
                    <input type="tel" placeholder="Téléphone (06/07…)" value={parentForm.merePhone}
                      onChange={e => setParentForm(f => ({ ...f, merePhone: e.target.value }))}
                      className="px-3 py-2 border rounded text-sm" />
                  </div>
                </div>

                {/* Tuteur (optionnel) */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">🧑 Tuteur (optionnel)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input type="text" placeholder="Nom du tuteur" value={parentForm.tuteurName}
                      onChange={e => setParentForm(f => ({ ...f, tuteurName: e.target.value }))}
                      className="px-3 py-2 border rounded text-sm" />
                    <input type="tel" placeholder="Téléphone (06/07…)" value={parentForm.tuteurPhone}
                      onChange={e => setParentForm(f => ({ ...f, tuteurPhone: e.target.value }))}
                      className="px-3 py-2 border rounded text-sm" />
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  Renseignez au moins un parent (nom + téléphone). Le 1er renseigné devient le contact principal.
                  Les parents seront créés et associés à l'élève, puis visibles sur la page Parents.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 p-4 border-t bg-gray-50">
                {parentModalQueue.length > 1 && (
                  <button onClick={skipCurrentInQueue} disabled={parentSaving}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm disabled:opacity-50">
                    Passer
                  </button>
                )}
                <button onClick={saveParentsForCurrent} disabled={parentSaving}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm disabled:opacity-50">
                  {parentSaving ? 'Enregistrement…' : (parentModalIndex < parentModalQueue.length - 1 ? 'Enregistrer et suivant' : 'Enregistrer')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Modale : déplacer les élèves sélectionnés vers une autre classe ── */}
      {moveModalOpen && (() => {
        const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const q = norm(moveSearch);
        const matches = classes.filter(c => {
          if (!q) return true;
          return norm(`${c.name} ${c.level || ''} ${c.filiere || ''} ${c.academic_year || ''}`).includes(q);
        });
        const target = classes.find(c => c.id === moveTargetId);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => { if (!moving) setMoveModalOpen(false); }}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col"
              onClick={e => e.stopPropagation()}>
              {/* En-tête */}
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold">Déplacer {selectedStudents.size} élève(s)</h3>
                </div>
                <button onClick={() => { if (!moving) setMoveModalOpen(false); }}
                  className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
              </div>

              {/* Recherche */}
              <div className="p-4 pb-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    type="text"
                    value={moveSearch}
                    onChange={e => setMoveSearch(e.target.value)}
                    placeholder="Rechercher une classe (nom, niveau, filière…)"
                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              {/* Liste des classes (sélection) */}
              <div className="flex-1 overflow-y-auto px-4 py-1 min-h-[120px]">
                {matches.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Aucune classe trouvée</p>
                ) : (
                  <div className="space-y-1">
                    {matches.map(c => {
                      const selected = moveTargetId === c.id;
                      const sub = [c.level, c.filiere, c.academic_year].filter(Boolean).join(' · ');
                      return (
                        <button
                          key={c.id}
                          onClick={() => setMoveTargetId(c.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                            selected
                              ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{c.name}</div>
                            {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
                          </div>
                          {selected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pied : confirmation */}
              <div className="p-4 border-t flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 truncate">
                  {target ? <>Vers : <strong className="text-gray-700">{target.name}</strong></> : 'Sélectionnez une classe'}
                </span>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setMoveModalOpen(false)} disabled={moving}
                    className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                    Annuler
                  </button>
                  <button onClick={moveSelectedStudents} disabled={moving || !moveTargetId}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                    {moving ? 'Déplacement…' : <><ArrowRightLeft className="w-4 h-4" /> Déplacer</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fenêtre de réinscription : élèves de l'année précédente + établissements associés */}
      {crossOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCrossOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-violet-600" />
                <h3 className="font-semibold">Réinscription — {year}</h3>
              </div>
              <button onClick={() => setCrossOpen(false)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Section 1 — élèves d'une autre année (propre école) non réinscrits */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">Élèves non réinscrits</h4>
                  <span className="text-xs text-gray-400">{reinscriptionCandidates.length}</span>
                </div>
                <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                  {reinscriptionCandidates.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500">Aucun élève à réinscrire depuis une année précédente.</div>
                  ) : reinscriptionCandidates.map((s) => {
                    const cls = classes.find((c) => c.id === s.class_id);
                    const lvl = s.level || cls?.level || '';
                    const suggested = nextLevel(lvl);
                    return (
                      <button key={s.id} onClick={() => openReinscribe(s)}
                        className="flex items-center gap-3 w-full p-2.5 text-left hover:bg-violet-50">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{s.first_name} {s.last_name}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {cls?.name || 'Sans classe'}{lvl ? ` (${lvl})` : ''}
                          </div>
                        </div>
                        {suggested && (
                          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full shrink-0">→ {suggested}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isMultiSchool && (
              <>
              <div className="border-t pt-3">
                <h4 className="text-sm font-semibold text-gray-700">Établissements associés</h4>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    autoFocus
                    value={crossSearch}
                    onChange={(e) => { setCrossSearch(e.target.value); runCrossSearch(e.target.value, crossLevelFilter); }}
                    placeholder="Nom, prénom ou code Massar…"
                    className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <select
                  value={crossLevelFilter}
                  onChange={(e) => {
                    const lvl = e.target.value;
                    setCrossLevelFilter(lvl);
                    setCrossTargetLevel(nextLevel(lvl) || '');
                    runCrossSearch(crossSearch, lvl);
                  }}
                  className="border rounded-lg text-sm px-2 py-2 w-36"
                  title="Filtrer par niveau"
                >
                  <option value="">Niveau…</option>
                  {(crossLevels.length ? crossLevels : LEVEL_ORDER).map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-gray-400 -mt-2">
                Liste les élèves des établissements associés. Filtrez par niveau puis cliquez un élève, ou utilisez « Réinscrire tout le niveau » pour récupérer toute la promotion.
              </p>

              {crossLevelFilter && (
                <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg p-2">
                  <span className="text-xs text-violet-800 shrink-0">Niveau cible</span>
                  <select
                    value={crossTargetLevel}
                    onChange={(e) => setCrossTargetLevel(e.target.value)}
                    className="border rounded-lg text-sm px-2 py-1.5 w-28"
                  >
                    <option value="">(même)</option>
                    {LEVEL_ORDER.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                  </select>
                  <button
                    onClick={reinscribeWholeLevel}
                    disabled={crossSearching}
                    className="flex-1 flex items-center justify-center gap-2 bg-violet-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    Réinscrire tout {crossLevelFilter} → {crossTargetLevel || crossLevelFilter} ({crossResults.length})
                  </button>
                </div>
              )}

              <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                {crossSearching && <div className="p-3 text-sm text-gray-500">Chargement…</div>}
                {!crossSearching && crossResults.length === 0 && (
                  <div className="p-3 text-sm text-gray-500">Aucun élève dans les établissements associés (ou aucun pour ce filtre).</div>
                )}
                {crossResults.map((s) => (
                  <button key={s.id} onClick={() => openReinscribeFromCross(s)}
                    className="flex items-center gap-3 w-full p-2.5 text-left hover:bg-violet-50">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{s.first_name} {s.last_name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {s.school?.name || 'Établissement'}{s.class?.name ? ` · ${s.class.name}` : ''}{s.current_level ? ` (${s.current_level})` : ''}
                      </div>
                    </div>
                    {s.suggested_level && (
                      <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full shrink-0">→ {s.suggested_level}</span>
                    )}
                  </button>
                ))}
              </div>
              </>
              )}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={() => setCrossOpen(false)}
                className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale unifiée : confirmer la réinscription (niveau + classe optionnelle) */}
      {reinscribeTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!reinscribeBusy) setReinscribeTarget(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-violet-600" />
                <h3 className="font-semibold">Réinscrire — {year}</h3>
              </div>
              <button onClick={() => { if (!reinscribeBusy) setReinscribeTarget(null); }} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {reinscribeMsg && (
                <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${reinscribeMsg.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{reinscribeMsg.text}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
                <div className="font-semibold text-sm">{reinscribeTarget.name}</div>
                <div className="text-xs text-gray-600">
                  {reinscribeTarget.school_name ? `${reinscribeTarget.school_name} · ` : ''}
                  {reinscribeTarget.current_level ? `Niveau actuel : ${reinscribeTarget.current_level}` : 'Niveau actuel inconnu'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Niveau de réinscription (proposé automatiquement)</label>
                <select value={reinscribeLevel} onChange={(e) => { setReinscribeLevel(e.target.value); setReinscribeClassId(''); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  {LEVEL_ORDER.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Classe d'accueil (optionnel)</label>
                <select value={reinscribeClassId} onChange={(e) => setReinscribeClassId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">Niveau seul — à affecter à une classe plus tard</option>
                  {classes
                    .filter((c) => (!reinscribeLevel || c.level === reinscribeLevel) && (!c.academic_year || sameYear(c.academic_year, year)))
                    .map((c) => <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ''}</option>)}
                </select>
                {!reinscribeClassId && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Aucune classe ne sera créée : l'élève est promu au niveau {reinscribeLevel || '—'}. Vous l'affecterez à une classe depuis la page Classes.
                  </p>
                )}
              </div>

              {reinscribeTarget.isCross && (
                <p className="text-xs text-gray-500">
                  Cet élève vient d'un établissement associé : il sera <strong>déplacé</strong> ici (il quittera son école d'origine). Ses parents et son code Massar sont conservés.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={() => setReinscribeTarget(null)} disabled={reinscribeBusy}
                className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                Annuler
              </button>
              <button onClick={submitReinscribe} disabled={reinscribeBusy}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1.5">
                {reinscribeBusy ? 'Réinscription…' : <><Check className="w-4 h-4" /> Réinscrire</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentsPage;
