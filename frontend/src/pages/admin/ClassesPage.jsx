import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronDown, ChevronUp, Upload, Download, Edit2, School, GraduationCap, BookOpen, FolderOpen, X, Check, Calendar, FileSpreadsheet, Send, CreditCard, ListChecks, Save } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { GenderSplit, Avatar, ClassCard, DetailDrawer } from '../../components/directory/ui';
import * as XLSX from 'xlsx';
import { generateEmail, generatePassword } from '../../utils/studentUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';

// Moroccan education system hierarchy
const SCHOOL_HIERARCHY = {
  maternelle: {
    label: 'Maternelle',
    icon: BookOpen,
    levels: {
      'TPS': { label: 'Très Petite Section', filieres: [] },
      'PS': { label: 'Petite Section', filieres: [] },
      'MS': { label: 'Moyenne Section', filieres: [] },
      'GS': { label: 'Grande Section', filieres: [] }
    }
  },
  primaire: {
    label: 'École Primaire',
    icon: BookOpen,
    levels: {
      '1AP': { label: '1ère Année Primaire', filieres: [] },
      '2AP': { label: '2ème Année Primaire', filieres: [] },
      '3AP': { label: '3ème Année Primaire', filieres: [] },
      '4AP': { label: '4ème Année Primaire', filieres: [] },
      '5AP': { label: '5ème Année Primaire', filieres: [] },
      '6AP': { label: '6ème Année Primaire', filieres: [] }
    }
  },
  college: {
    label: 'Collège',
    icon: School,
    levels: {
      '1AC': { label: '1ère Année Collège', filieres: [] },
      '2AC': { label: '2ème Année Collège', filieres: [] },
      '3AC': { label: '3ème Année Collège', filieres: [] }
    }
  },
  lycee: {
    label: 'Lycée',
    icon: GraduationCap,
    levels: {
      'TC': {
        label: 'Tronc Commun',
        filieres: [
          { value: 'tc_sciences', label: 'TC Sciences' },
          { value: 'tc_lettres', label: 'TC Lettres' },
          { value: 'tc_tech', label: 'TC Technologique' }
        ]
      },
      '1BAC': {
        label: '1ère Bac',
        filieres: [
          { value: 'sciences_exp', label: 'Sciences Expérimentales' },
          { value: 'sciences_math', label: 'Sciences Mathématiques' },
          { value: 'sciences_eco', label: 'Sciences Économiques et de Gestion' },
          { value: 'ste', label: 'Sciences et Technologies Électriques' },
          { value: 'stm', label: 'Sciences et Technologies Mécaniques' },
          { value: 'lettres', label: 'Lettres et Sciences Humaines' }
        ]
      },
      '2BAC': {
        label: '2ème Bac',
        filieres: [
          { value: 'svt', label: 'Sciences de la Vie et de la Terre (SVT)' },
          { value: 'pc', label: 'Sciences Physiques (PC)' },
          { value: 'sciences_math_a', label: 'Sciences Math A' },
          { value: 'sciences_math_b', label: 'Sciences Math B' },
          { value: 'eco', label: 'Sciences Économiques' },
          { value: 'sciences_gestion', label: 'Sciences de Gestion Comptable' },
          { value: 'ste', label: 'Sciences et Technologies Électriques' },
          { value: 'stm', label: 'Sciences et Technologies Mécaniques' },
          { value: 'lettres', label: 'Lettres' },
          { value: 'sciences_humaines', label: 'Sciences Humaines' }
        ]
      }
    }
  }
};

const getFiliereLabel = (filiere) => {
  for (const type of Object.values(SCHOOL_HIERARCHY)) {
    for (const lvl of Object.values(type.levels)) {
      const found = lvl.filieres.find(f => f.value === filiere);
      if (found) return found.label;
    }
  }
  return filiere || '';
};

const getLevelLabel = (level) => {
  for (const type of Object.values(SCHOOL_HIERARCHY)) {
    if (type.levels[level]) return type.levels[level].label;
  }
  return level || '';
};

const normalizeSchoolType = (schoolType) => {
  if (!schoolType) return '';
  const normalized = String(schoolType)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized === 'maternelle' || normalized === 'ecole maternelle' || normalized === 'prescolaire' || normalized === 'prescolaire') return 'maternelle';
  if (normalized === 'primaire' || normalized === 'ecole primaire' || normalized === 'ecole') return 'primaire';
  if (normalized === 'college') return 'college';
  if (normalized === 'lycee' || normalized === 'lycee') return 'lycee';
  return normalized;
};

// Parse le fichier officiel Massar « InfoEleve » (export_InfoEleve_*.xlsx).
// Retourne { className, rows: [{ massar_code, student_full_name, massar_secret }] }.
const parseMassarInfoEleve = (workbook) => {
  const sheet = workbook.Sheets['Data'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return null;
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Ligne d'en-tête : contient à la fois « رقم التلميذ » et « الرمز السري »
  let headerIdx = -1, codeCol = -1, secretCol = -1, nameCol = -1;
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const row = raw[i] || [];
    let cCode = -1, cSecret = -1, cName = -1;
    for (let j = 0; j < row.length; j++) {
      const v = String(row[j] || '').trim();
      if (v.includes('رقم التلميذ')) cCode = j;
      else if (v.includes('الرمز السري') || v.includes('الرمز')) cSecret = j;
      else if (v.includes('الإسم و النسب') || v.includes('الإسم') || v.includes('النسب')) cName = j;
    }
    if (cCode !== -1 && cSecret !== -1) {
      headerIdx = i; codeCol = cCode; secretCol = cSecret;
      nameCol = cName !== -1 ? cName : cCode + 1;
      break;
    }
  }
  if (headerIdx === -1) return null; // pas le format InfoEleve

  // Nom de classe (« القسم : 1APIC-1 ») dans les lignes d'en-tête
  let className = null;
  for (let i = 0; i < headerIdx; i++) {
    const row = raw[i] || [];
    const idx = row.findIndex(c => String(c).includes('القسم'));
    if (idx === -1) continue;
    for (let j = idx + 1; j < row.length; j++) {
      const v = String(row[j] || '').trim();
      if (v) { className = v; break; }
    }
    if (className) break;
  }

  const rows = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const code = String(r[codeCol] || '').trim();
    const secret = String(r[secretCol] || '').trim();
    const name = String(r[nameCol] || '').trim();
    // Ignorer lignes vides ou réentêtes
    if ((!code && !secret) || code.includes('رقم') || secret.includes('الرمز')) continue;
    rows.push({ massar_code: code.toUpperCase(), student_full_name: name, massar_secret: secret });
  }

  return { className, rows };
};

// Mini-courbe d'évolution (7 jours). Couleur selon la tendance : vert (hausse),
// rouge (baisse), gris (stable). Affiche un trait plat si <2 points.
const Sparkline = ({ points = [], dir = 'flat', width = 46, height = 16 }) => {
  const color = dir === 'up' ? '#16a34a' : dir === 'down' ? '#dc2626' : '#9ca3af';
  if (!points.length) {
    return <svg width={width} height={height} aria-hidden="true"><line x1="2" y1={height / 2} x2={width - 2} y2={height / 2} stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="2 2" /></svg>;
  }
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const stepX = points.length > 1 ? (width - 4) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = 2 + i * stepX;
    const y = height - 2 - ((p - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} aria-hidden="true">
      {points.length === 1
        ? <circle cx={width / 2} cy={height / 2} r="2" fill={color} />
        : <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
};

const ClassesPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { year } = useYear();
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedClass, setExpandedClass] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [classTeachers, setClassTeachers] = useState({});
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, message: '' });
  // Prévisualisation avant import des élèves (détails : total / nouveaux / déjà présents / classe cible)
  const [importPreview, setImportPreview] = useState(null);
  // Récapitulatif après import (à fermer ; la fermeture rafraîchit la page)
  const [importRecap, setImportRecap] = useState(null);
  // Élèves de la classe ouverte dans le tiroir (photo, nom, n° de classement)
  const [classStudents, setClassStudents] = useState([]);
  const [classStudentsLoading, setClassStudentsLoading] = useState(false);
  // Stats par élève (absences, performance, courbe 7j, matière faible), clé = id élève
  const [classStudentStats, setClassStudentStats] = useState({});
  const [deletingClassId, setDeletingClassId] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState({ type: '', message: '' });
  const [editingClassId, setEditingClassId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    level: '',
    academicYear: '',
    teacherId: '',
    school_type: '',
    filiere: ''
  });

  // Bulk class import states
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [bulkImportProgress, setBulkImportProgress] = useState({ current: 0, total: 0, message: '' });
  const [parsedClasses, setParsedClasses] = useState([]);
  const [bulkImportErrors, setBulkImportErrors] = useState([]);
  const [bulkImportResult, setBulkImportResult] = useState(null);

  // Import codes Massar (InfoEleve) — supporte plusieurs fichiers (1 par classe)
  const [showMassarImport, setShowMassarImport] = useState(false);
  // massarFiles: [{ key, fileName, className, classId, rows, result, error }]
  const [massarFiles, setMassarFiles] = useState([]);
  const [massarBusy, setMassarBusy] = useState(false);
  const [massarCoverage, setMassarCoverage] = useState({});
  const [quickSendingClassId, setQuickSendingClassId] = useState(null);
  const [fixMassarNames, setFixMassarNames] = useState(true);

  // Édition manuelle des codes Massar d'une classe
  const [massarEditClass, setMassarEditClass] = useState(null); // { id, name }
  const [massarEditRows, setMassarEditRows] = useState([]);      // [{ id, first_name, last_name, massar_code, massar_secret }]
  const [massarEditLoading, setMassarEditLoading] = useState(false);
  const [massarEditSaving, setMassarEditSaving] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getMassarToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  const resetMassarModal = () => {
    setShowMassarImport(false);
    setMassarFiles([]);
  };

  const setMassarFileClass = (key, classId) =>
    setMassarFiles(prev => prev.map(f => f.key === key ? { ...f, classId, result: null } : f));

  const removeMassarFile = (key) =>
    setMassarFiles(prev => prev.filter(f => f.key !== key));

  const fetchMassarCoverage = async (token) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/classes/massar-coverage`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setMassarCoverage(data || {});
    } catch (err) {
      console.error('Erreur chargement couverture Massar:', err);
    }
  };

  // Ouvre la modale d'import Massar (multi-fichiers ; chaque fichier porte sa classe).
  const openMassarModalForClass = () => {
    setMassarFiles([]);
    setShowMassarImport(true);
  };

  // Ouvre la modale d'édition manuelle des codes Massar d'une classe :
  // charge la liste des élèves avec leurs code + secret, éditables.
  const openMassarEditForClass = async (cls) => {
    setMassarEditClass({ id: cls.id, name: cls.name });
    setMassarEditRows([]);
    setMassarEditLoading(true);
    try {
      const token = await getMassarToken();
      const res = await fetch(`${apiUrl}/api/admin/classes/${cls.id}/students-massar`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMassarEditRows((data.students || []).map(s => ({
          id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          massar_code: s.massar_code || '',
          massar_secret: s.massar_secret || '',
        })));
      } else {
        alert(data.error || 'Erreur de chargement des élèves');
        setMassarEditClass(null);
      }
    } catch (err) {
      console.error('Erreur chargement codes Massar:', err);
      alert('Erreur réseau');
      setMassarEditClass(null);
    } finally {
      setMassarEditLoading(false);
    }
  };

  const setMassarEditField = (id, field, value) =>
    setMassarEditRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const closeMassarEdit = () => {
    setMassarEditClass(null);
    setMassarEditRows([]);
  };

  const saveMassarEdit = async () => {
    if (!massarEditClass) return;
    setMassarEditSaving(true);
    try {
      const token = await getMassarToken();
      const res = await fetch(`${apiUrl}/api/admin/classes/students-massar`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: massarEditClass.id,
          updates: massarEditRows.map(r => ({
            id: r.id,
            massar_code: r.massar_code,
            massar_secret: r.massar_secret,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchMassarCoverage(token);
        closeMassarEdit();
      } else {
        alert(data.error || 'Erreur lors de l\'enregistrement');
      }
    } catch (err) {
      console.error('Erreur enregistrement codes Massar:', err);
      alert('Erreur réseau');
    } finally {
      setMassarEditSaving(false);
    }
  };

  // Envoi rapide des codes Massar depuis le badge de la carte classe,
  // sans ouvrir la modale d'import.
  const quickSendMassar = async (cls) => {
    if (!confirm(`Envoyer les codes Massar (code + secret) aux parents de la classe « ${cls.name} » par WhatsApp ?`)) return;
    setQuickSendingClassId(cls.id);
    try {
      const token = await getMassarToken();
      const res = await fetch(`${apiUrl}/api/admin/classes/${cls.id}/send-massar-whatsapp`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      let data = {};
      try { data = await res.json(); } catch { /* réponse non-JSON (timeout proxy) */ }
      if (!res.ok) { alert(data.error || `Erreur envoi (${res.status})`); return; }
      alert(data.message || `Envoyé à ${data.sent ?? data.total ?? 0} parent(s)`);
    } catch (err) {
      console.error(err);
      alert('Erreur envoi WhatsApp');
    } finally {
      setQuickSendingClassId(null);
    }
  };

  // Lecture de PLUSIEURS fichiers InfoEleve (1 par classe). Chaque fichier devient
  // une entrée avec sa classe détectée automatiquement.
  const handleMassarFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const norm = s => String(s || '').trim().toLowerCase();
    const parsedList = [];
    for (const file of files) {
      const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const parsed = parseMassarInfoEleve(workbook);
        if (!parsed || parsed.rows.length === 0) {
          parsedList.push({ key, fileName: file.name, className: null, classId: '', rows: [], result: null, error: 'Format non reconnu (fichier InfoEleve attendu)' });
          continue;
        }
        const match = parsed.className ? classes.find(c => norm(c.name) === norm(parsed.className)) : null;
        parsedList.push({ key, fileName: file.name, className: parsed.className || null, classId: match ? match.id : '', rows: parsed.rows, result: null, error: null });
      } catch (err) {
        console.error('Erreur lecture InfoEleve:', err);
        parsedList.push({ key, fileName: file.name, className: null, classId: '', rows: [], result: null, error: 'Erreur de lecture du fichier' });
      }
    }
    setMassarFiles(prev => [...prev, ...parsedList]);
    e.target.value = ''; // permet de re-sélectionner les mêmes fichiers
  };

  // Vérifie (dryRun) ou enregistre (commit) TOUS les fichiers prêts, en parallèle.
  const handleMassarImport = async (dryRun) => {
    const ready = massarFiles.filter(f => f.classId && f.rows.length > 0);
    if (ready.length === 0) { alert('Sélectionnez une classe pour au moins un fichier.'); return; }
    setMassarBusy(true);
    try {
      const token = await getMassarToken();
      const updated = await Promise.all(massarFiles.map(async (f) => {
        if (!f.classId || !f.rows.length) return f;
        try {
          const res = await fetch(`${apiUrl}/api/admin/classes/import-massar-secrets`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ class_id: f.classId, rows: f.rows, dryRun, fixNames: fixMassarNames }),
          });
          const data = await res.json();
          if (!res.ok) return { ...f, result: { error: data.error || 'Erreur' } };
          return { ...f, result: data };
        } catch {
          return { ...f, result: { error: 'Erreur réseau' } };
        }
      }));
      setMassarFiles(updated);
      if (!dryRun) fetchMassarCoverage(token);
    } finally {
      setMassarBusy(false);
    }
  };

  // Envoi WhatsApp des codes Massar aux parents d'une classe donnée.
  const handleSendMassar = async (classId, label) => {
    if (!classId) return;
    if (!confirm(`Envoyer les codes Massar (code + secret) aux parents de « ${label || 'cette classe'} » par WhatsApp ?`)) return;
    setMassarBusy(true);
    try {
      const token = await getMassarToken();
      const res = await fetch(`${apiUrl}/api/admin/classes/${classId}/send-massar-whatsapp`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      let data = {};
      try { data = await res.json(); } catch { /* réponse non-JSON (timeout proxy) */ }
      if (!res.ok) { alert(data.error || `Erreur envoi (${res.status})`); return; }
      alert(`${data.message || `Envoyé à ${data.sent ?? data.total ?? 0} parent(s)`}${data.skipped ? ` (${data.skipped} sans numéro)` : ''}`);
    } catch (err) {
      console.error(err);
      alert('Erreur envoi WhatsApp');
    } finally {
      setMassarBusy(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Charge les élèves de la classe + leurs stats quand on ouvre son tiroir.
  useEffect(() => {
    if (!expandedClass) { setClassStudents([]); setClassStudentStats({}); return; }
    let cancelled = false;
    (async () => {
      setClassStudentsLoading(true);
      try {
        const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
        const token = session?.access_token;
        const headers = { 'Authorization': `Bearer ${token}` };
        const [studRes, statsRes] = await Promise.all([
          fetch(`${apiUrl}/api/admin/classes/${expandedClass}/students`, { headers }),
          fetch(`${apiUrl}/api/admin/classes/${expandedClass}/students-stats`, { headers }),
        ]);
        const studData = await studRes.json();
        const statsData = statsRes.ok ? await statsRes.json() : {};
        if (!cancelled) {
          setClassStudents(Array.isArray(studData) ? studData : []);
          setClassStudentStats(statsData && typeof statsData === 'object' ? statsData : {});
        }
      } catch (err) {
        console.error('Erreur chargement élèves de la classe:', err);
        if (!cancelled) { setClassStudents([]); setClassStudentStats({}); }
      } finally {
        if (!cancelled) setClassStudentsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expandedClass]);

  const fetchData = async () => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const [classesRes, teachersRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/classes`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/teachers`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const classesData = await classesRes.json();
      const teachersData = await teachersRes.json();

      setClasses(Array.isArray(classesData) ? classesData : []);
      setTeachers(Array.isArray(teachersData) ? teachersData : []);

      // Charger les professeurs pour chaque classe
      for (const cls of classesData) {
        fetchClassTeachers(cls.id, token);
      }

      fetchMassarCoverage(token);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClassTeachers = async (classId, token) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/classes/${classId}/teachers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setClassTeachers(prev => ({
        ...prev,
        [classId]: Array.isArray(data) ? data : []
      }));
    } catch (error) {
      console.error('Error fetching class teachers:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/classes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        const newClass = await res.json();
        setClasses([...classes, newClass]);
        setFormData({ name: '', level: '', academicYear: '', teacherId: '', school_type: '', filiere: '' });
        setShowForm(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error adding class:', error);
    }
  };

  const openEditClass = (cls) => {
    setEditingClassId(cls.id);
    setEditForm({
      name: cls.name || '',
      level: cls.level || '',
      academicYear: cls.academic_year || '',
      school_type: cls.school_type || '',
      filiere: cls.filiere || ''
    });
  };

  const handleEditClass = async (e) => {
    e.preventDefault();
    if (!editingClassId) return;
    setSavingEdit(true);
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/classes/${editingClassId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });

      if (res.ok) {
        setEditingClassId(null);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Erreur modification');
      }
    } catch (error) {
      console.error('Error editing class:', error);
      alert('Erreur modification classe');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const deleteClass = async (id) => {
    try {
      setDeletingClassId(id);
      setDeleteStatus({ type: 'loading', message: 'Suppression en cours...' });
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/classes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setClasses(classes.filter(c => c.id !== id));
        setDeleteStatus({ type: 'success', message: 'Classe supprimée avec succès.' });
      } else {
        setDeleteStatus({ type: 'error', message: 'Erreur lors de la suppression.' });
      }
    } catch (error) {
      console.error('Error deleting class:', error);
      setDeleteStatus({ type: 'error', message: 'Erreur lors de la suppression.' });
    } finally {
      setDeletingClassId(null);
    }
  };

  // Suppression groupée : supprime une liste de classes une par une.
  const bulkDeleteClasses = async (classList, label) => {
    const list = (classList || []).filter(Boolean);
    if (list.length === 0) return;
    if (!window.confirm(`Supprimer ${list.length} classe(s) — ${label} ?\n\nTous les élèves, suivis et données liés à ces classes seront supprimés. Cette action est irréversible.`)) {
      return;
    }
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    const token = session?.access_token;
    let ok = 0, fail = 0;
    for (let i = 0; i < list.length; i++) {
      const cls = list[i];
      setDeleteStatus({ type: 'loading', message: `Suppression ${i + 1}/${list.length} — ${cls.name}...` });
      try {
        const res = await fetch(`${apiUrl}/api/admin/classes/${cls.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }
    setDeleteStatus({
      type: fail === 0 ? 'success' : 'error',
      message: `${ok} classe(s) supprimée(s)${fail ? `, ${fail} échec(s)` : ''} — ${label}`,
    });
    await fetchData();
  };

  const addTeacherToClass = async (classId, teacherId) => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/classes/${classId}/teachers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ teacherId })
      });

      if (res.ok) {
        await fetchClassTeachers(classId, token);
      }
    } catch (error) {
      console.error('Error adding teacher:', error);
    }
  };

  const removeTeacherFromClass = async (classId, teacherId) => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/classes/${classId}/teachers/${teacherId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        await fetchClassTeachers(classId, token);
      }
    } catch (error) {
      console.error('Error removing teacher:', error);
    }
  };

  const handleExcelImport = async (e, classId) => {
    try {
      const file = e.target.files[0];
      if (!file) return;

      setIsImporting(true);
      setImportProgress({ current: 0, total: 100, message: 'Lecture du fichier Excel...' });

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      setImportProgress({ current: 10, total: 100, message: 'Analyse de la structure du fichier...' });

      // Lire les données brutes pour supporter la structure arabe
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (rawData.length === 0) {
        alert('Le fichier Excel est vide');
        setIsImporting(false);
        return;
      }

      // Trouver la ligne d'en-tête en cherchant "رقم التلميذ" ou "رقم  التلميذ" (avec espaces)
      let headerRowIndex = -1;
      let studentIdColIndex = -1;
      let studentNameColIndex = -1;

      console.log('=== RECHERCHE DE L\'EN-TÊTE ===');
      console.log(`Total de lignes: ${rawData.length}`);
      
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) {
          console.log(`Ligne ${i}: VIDE`);
          continue;
        }

        // Réinitialiser les indices pour chaque ligne
        let tempStudentIdColIndex = -1;
        let tempStudentNameColIndex = -1;

        // Chercher les colonnes d'en-tête (avec ou sans espaces)
        for (let j = 0; j < row.length; j++) {
          const cell = row[j];
          if (typeof cell === 'string') {
            // Normaliser : trim + remplacer espaces multiples par un seul
            const trimmedCell = cell.trim().replace(/\s+/g, ' ');
            // Afficher seulement les cellules non vides
            if (trimmedCell.length > 0) {
              console.log(`  Ligne ${i}, Col ${j}: "${trimmedCell}"`);
            }
            
            // Chercher les variantes possibles
            if (trimmedCell.includes('رقم') && trimmedCell.includes('التلميذ')) {
              tempStudentIdColIndex = j;
              console.log(`  ✓ TROUVÉ "رقم التلميذ" (variante) à la colonne ${j}: "${trimmedCell}"`);
            }
            if (trimmedCell.includes('إسم') && trimmedCell.includes('التلميذ')) {
              tempStudentNameColIndex = j;
              console.log(`  ✓ TROUVÉ "إسم التلميذ" (variante) à la colonne ${j}: "${trimmedCell}"`);
            }
          }
        }

        // Si on a trouvé les deux colonnes, c'est l'en-tête
        if (tempStudentIdColIndex !== -1 && tempStudentNameColIndex !== -1) {
          headerRowIndex = i;
          studentIdColIndex = tempStudentIdColIndex;
          studentNameColIndex = tempStudentNameColIndex;
          console.log(`✓✓ EN-TÊTE TROUVÉ À LA LIGNE ${i} (colonnes ${studentIdColIndex} et ${studentNameColIndex})`);
          break;
        }
      }

      if (headerRowIndex === -1 || studentIdColIndex === -1 || studentNameColIndex === -1) {
        console.log('✗ EN-TÊTE NON TROUVÉ');
        console.log(`headerRowIndex: ${headerRowIndex}, studentIdColIndex: ${studentIdColIndex}, studentNameColIndex: ${studentNameColIndex}`);
        alert('En-tête non trouvé. Vérifiez que le fichier contient les colonnes: رقم التلميذ et إسم التلميذ. Consultez la console (F12) pour plus de détails.');
        setIsImporting(false);
        return;
      }

      setImportProgress({ current: 20, total: 100, message: 'Extraction des données des élèves...' });

      // Extraire les données des élèves (sauter la ligne d'en-tête et la sous-ligne)
      const students = [];
      const totalRows = rawData.length - (headerRowIndex + 2);
      
      for (let i = headerRowIndex + 2; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        const studentId = row[studentIdColIndex];
        const studentName = row[studentNameColIndex];

        // Vérifier que ce ne sont pas des cellules vides ou des en-têtes
        if (studentId && studentName && 
            typeof studentId === 'string' && 
            typeof studentName === 'string' && 
            studentId.trim() && 
            studentName.trim() &&
            !studentId.includes('رقم') &&
            !studentName.includes('إسم')) {
          
          // Séparer le nom complet en prénom et nom
          const fullName = studentName.trim();
          const nameParts = fullName.split(/\s+/);
          
          let firstName = '';
          let lastName = '';
          
          if (nameParts.length === 1) {
            // Un seul mot : c'est le prénom
            firstName = nameParts[0];
            lastName = '';
          } else if (nameParts.length === 2) {
            // Deux mots : premier = prénom, deuxième = nom
            firstName = nameParts[0];
            lastName = nameParts[1];
          } else {
            // Plus de deux mots : premier = prénom, reste = nom
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
          }
          
          // Générer email (codemassar@nomecole.ma) et mot de passe automatiquement
          const schoolDomain = profile?.school?.name
            ? profile.school.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '') + '.ma'
            : null;
          const email = generateEmail(studentId, fullName, schoolDomain);
          const password = generatePassword();

          students.push({
            email,
            password,
            firstName: firstName,
            lastName: lastName,
            // Enregistrer le code Massar (clé de matching pour l'import des parents),
            // pas seulement dans l'email. studentId = رقم التلميذ du fichier.
            massarCode: String(studentId).trim()
          });
        }

        // Mettre à jour la progression
        const progress = 20 + Math.round(((i - headerRowIndex - 2) / totalRows) * 40);
        setImportProgress({ current: progress, total: 100, message: `Extraction: ${students.length} élève(s) trouvé(s)...` });
      }

      console.log(`\n✓ ${students.length} élève(s) trouvé(s):`);
      students.slice(0, 5).forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.firstName} (${s.lastName}) -> ${s.email}`);
      });
      if (students.length > 5) {
        console.log(`  ... et ${students.length - 5} autre(s)`);
      }

      if (students.length === 0) {
        console.log('✗ AUCUN ÉLÈVE TROUVÉ');
        alert('Aucun élève valide trouvé dans le fichier. Vérifiez que les données commencent après la ligne d\'en-tête.');
        setIsImporting(false);
        return;
      }

      setImportProgress({ current: 70, total: 100, message: 'Vérification des élèves existants...' });

      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      // Dry-run : on demande au serveur le détail (nouveaux / déjà présents) SANS rien créer,
      // pour afficher une prévisualisation avant l'import réel.
      const res = await fetch(`${apiUrl}/api/admin/students/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ students, classId, dryRun: true })
      });

      if (!res.ok) {
        alert('Erreur lors de l\'analyse du fichier');
        setIsImporting(false);
        setImportProgress({ current: 0, total: 0, message: '' });
        e.target.value = '';
        return;
      }

      const preview = await res.json();
      const summary = preview.summary || { new: students.length, existing: 0, total: students.length };
      const targetClass = classes.find(c => c.id === classId);

      setImportProgress({ current: 100, total: 100, message: 'Analyse terminée' });
      // Ouvre la modale de prévisualisation ; l'import réel se fera à la confirmation.
      setImportPreview({
        classId,
        className: targetClass?.name || '—',
        fileName: file.name,
        students,
        summary,
        newStudents: preview.newStudents || [],
        existingStudents: preview.existingStudents || [],
      });
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0, message: '' });
      e.target.value = '';
    } catch (error) {
      console.error('Error importing Excel:', error);
      alert('Erreur lors de la lecture du fichier Excel: ' + error.message);
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0, message: '' });
    }
  };

  // Confirme et lance l'import réel des élèves prévisualisés, puis ouvre le récapitulatif.
  const confirmImport = async () => {
    if (!importPreview) return;
    const { students, classId } = importPreview;
    setIsImporting(true);
    setImportProgress({ current: 20, total: 100, message: 'Création des comptes élèves...' });
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/students/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ students, classId })
      });

      setImportProgress({ current: 80, total: 100, message: 'Traitement des comptes utilisateurs...' });

      if (!res.ok) {
        alert('Erreur lors de l\'import');
        setIsImporting(false);
        setImportProgress({ current: 0, total: 0, message: '' });
        return;
      }

      const result = await res.json();

      // Stocker les mots de passe générés dans localStorage
      const importedStudents = result.students || [];
      const passwordMap = {};
      importedStudents.forEach(student => {
        if (student.password !== '********') {
          passwordMap[student.id] = student.password;
        }
      });
      const existingPasswords = JSON.parse(localStorage.getItem('studentPasswords') || '{}');
      localStorage.setItem('studentPasswords', JSON.stringify({ ...existingPasswords, ...passwordMap }));

      const summary = result.summary || {
        new: importedStudents.length, existing: 0, errors: 0, total: students.length
      };

      setImportProgress({ current: 100, total: 100, message: 'Importation terminée !' });
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0, message: '' });
      // Bascule de la prévisualisation vers le récapitulatif (à fermer → rafraîchit la page).
      setImportPreview(null);
      setImportRecap({
        className: importPreview.className,
        fileName: importPreview.fileName,
        summary,
        errors: result.errors || [],
      });
    } catch (error) {
      console.error('Error importing students:', error);
      alert('Erreur lors de l\'import: ' + error.message);
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0, message: '' });
    }
  };

  // Fermeture du récapitulatif → rafraîchit la page pour refléter les nouveaux effectifs.
  const closeImportRecap = () => {
    setImportRecap(null);
    window.location.reload();
  };

  const downloadArabicTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['أكاديمية :', 'الدار البيضاء - سطات', '', 'م.الإقليمية :', 'عمالة مقاطعة عين الشق', '', 'ابن زيدون'],
      ['المستوى :', 'الجذع المشترك العلمي – خيار فرنسية', '', 'القسم :', 'TCSF-8', '', 'زهير السايحي'],
      ['', 'علوم الحياة والأرض'],
      ['الدورة :', 'الدورة الأولى', '', 'نقط :', '', '', ''],
      ['السنة الدراسية :', '2025/2026'],
      [],
      ['رقم التلميذ', 'إسم التلميذ', 'تاريخ الإزدياد', 'الفرض الأول', 'الفرض الثاني', 'الأنشطة المندمجة', 'ملاحظات الأستاذ'],
      ['', '', 'النقطة', 'النقطة', 'النقطة', '-', ''],
      ['F164115196', 'أيت المدني رانيا', '17-12-2010', '', '', '', ''],
      ['F166023242', 'ابت الساخي سعيد', '03-06-2008', '', '', '', ''],
      ['F165031651', 'اخزام جنات', '01-04-2010', '', '', '', '']
    ]);

    XLSX.utils.book_append_sheet(workbook, worksheet, 'نقط المراقبة المستمرة');
    XLSX.writeFile(workbook, 'modele_eleves_arabe.xlsx');
  };

  // Parse a single Excel file and extract class + students data
  const parseExcelFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data);

          // Un classeur = une ou PLUSIEURS classes (un onglet par classe, de la
          // maternelle au lycée). parseSheetData parse un onglet → objet classe
          // ou null. On garde le cas mono-onglet identique à avant.
          const parseSheetData = (rawData, sheetName) => {
            if (!rawData || rawData.length === 0) return null;

          // Extract class metadata from first rows
          let className = '';
          let levelName = '';
          let academicYear = '';
          let schoolType = '';
          let filiere = '';
          let academy = '';            // الأكاديمية
          let provincialDirection = ''; // المديرية الإقليمية
          let commune = '';            // الجماعة
          let establishment = '';      // المؤسسة

          // Helper : valeur d'une étiquette (cellule j+1, ou j+2 si vide)
          const valAfter = (row, j) => {
            let v = row[j + 1];
            if (!v || (typeof v === 'string' && !v.trim())) v = row[j + 2];
            return (v && typeof v === 'string' && v.trim()) ? v.trim()
                 : (v != null && typeof v !== 'string') ? String(v).trim() : '';
          };

          // Look for class name, level, and academic year in metadata rows (rows 0-9)
          for (let i = 0; i < Math.min(20, rawData.length); i++) {
            const row = rawData[i];
            if (!row) continue;

            for (let j = 0; j < row.length; j++) {
              const cell = row[j];
              if (typeof cell === 'string') {
                const trimmed = cell.trim();
                // Detect class name (like TCSF-8, 1BACSEF-1)
                if (trimmed.includes('القسم') || trimmed.includes('قسم')) {
                  // Look for value in next cell (j+1) or two cells over (j+2)
                  let valueCell = row[j + 1];
                  if (!valueCell || (typeof valueCell === 'string' && !valueCell.trim())) {
                    valueCell = row[j + 2];
                  }
                  if (valueCell && typeof valueCell === 'string' && valueCell.trim()) {
                    className = valueCell.trim();
                  }
                }
                // Detect level (like الجذع المشترك العلمي, الأولى بكالوريا)
                if (trimmed.includes('المستوى') || trimmed.includes('مستوى')) {
                  let valueCell = row[j + 1];
                  if (!valueCell || (typeof valueCell === 'string' && !valueCell.trim())) {
                    valueCell = row[j + 2];
                  }
                  if (valueCell && typeof valueCell === 'string' && valueCell.trim()) {
                    levelName = valueCell.trim();
                  }
                }
                // Detect academic year
                if (trimmed.includes('السنة') || trimmed.includes('الدراسية')) {
                  let valueCell = row[j + 1];
                  if (!valueCell || (typeof valueCell === 'string' && !valueCell.trim())) {
                    valueCell = row[j + 2];
                  }
                  if (valueCell && typeof valueCell === 'string' && valueCell.trim()) {
                    academicYear = valueCell.trim();
                  }
                }
                // Académie / Direction / Commune / Établissement (fichier officiel Massar)
                if (!academy && trimmed.includes('أكاديمية')) academy = valAfter(row, j);
                if (!provincialDirection && trimmed.includes('المديرية')) provincialDirection = valAfter(row, j);
                if (!commune && trimmed.includes('الجماعة')) commune = valAfter(row, j);
                if (!establishment && (trimmed.includes('المؤسسة') || trimmed.includes('مؤسسة'))) establishment = valAfter(row, j);
              }
            }
          }

          // Si pas de nom de classe → le nom d'onglet EST le code classe (Massar),
          // sinon repli sur le nom de fichier.
          if (!className) {
            className = (sheetName && sheetName.trim())
              ? sheetName.trim()
              : file.name.replace(/\.(xlsx|xls)$/i, '');
          }
          
          console.log(`[${file.name}] Metadata extracted:`, {
            className,
            levelName,
            academicYear
          });

          // Map Arabic/French level names to our codes
          let level = '';
          const levelMapping = {
            'جذع': 'TC',
            'tronc': 'TC',
            'TC': 'TC',
            'أولى باكالوريا': '1BAC',
            'الأولى باكالوريا': '1BAC',
            'اولى باكالوريا': '1BAC',
            '1ère': '1BAC',
            '1bac': '1BAC',
            'ثانية باكالوريا': '2BAC',
            'الثانية باكالوريا': '2BAC',
            'ثانية بكالوريا': '2BAC',
            '2ème': '2BAC',
            '2bac': '2BAC',
            'الأولى إعدادي': '1AC',
            'أولى إعدادي': '1AC',
            'اولى اعدادي': '1AC',
            '1ère année collège': '1AC',
            '1ac': '1AC',
            'الثانية إعدادي': '2AC',
            'ثانية إعدادي': '2AC',
            'ثانية اعدادي': '2AC',
            '2ème année collège': '2AC',
            '2ac': '2AC',
            'الثالثة إعدادي': '3AC',
            'ثالثة إعدادي': '3AC',
            'ثالثة اعدادي': '3AC',
            '3ème année collège': '3AC',
            '3ac': '3AC'
          };

          for (const [key, value] of Object.entries(levelMapping)) {
            if (levelName.toLowerCase().includes(key.toLowerCase())) {
              level = value;
              console.log(`[${file.name}] Matched level "${key}" -> ${value}`);
              break;
            }
          }

          // Repli robuste depuis le CODE de classe (onglet Massar), de la
          // maternelle au lycée. L'ordre compte (APIC avant AP, BAC avant AC).
          if (!level && className) {
            const code = className.toUpperCase();
            let m;
            if ((m = code.match(/(\d)\s*APIC/)))      level = `${m[1]}AC`;   // collège (parcours international)
            else if (/1\s*BAC/.test(code))            level = '1BAC';
            else if (/2\s*BAC/.test(code))            level = '2BAC';
            else if ((m = code.match(/(\d)\s*AC\b/)))  level = `${m[1]}AC`;   // collège
            else if ((m = code.match(/(\d)\s*AP/)))    level = `${m[1]}AP`;   // primaire (1APG..6APG)
            else if (/^TC/.test(code))                level = 'TC';          // tronc commun
            else if (/^TPS/.test(code))               level = 'TPS';
            else if (/^PS/.test(code))                level = 'PS';          // préscolaire
            else if (/^MS/.test(code))                level = 'MS';
            else if (/^GS/.test(code))                level = 'GS';
            if (level) console.log(`[${file.name}] Niveau déduit du code "${className}" -> ${level}`);
          }

          if (!level) {
            console.log(`[${file.name}] ⚠️ Could not map level from: "${levelName}" / "${className}"`);
          }

          // Determine school type based on level (maternelle → lycée)
          if (level && ['TPS', 'PS', 'MS', 'GS'].includes(level)) {
            schoolType = 'maternelle';
          } else if (level && ['1AP', '2AP', '3AP', '4AP', '5AP', '6AP'].includes(level)) {
            schoolType = 'primaire';
          } else if (level && ['1AC', '2AC', '3AC'].includes(level)) {
            schoolType = 'college';
          } else if (level && ['TC', '1BAC', '2BAC'].includes(level)) {
            schoolType = 'lycee';
          }

          // ── Détection de la filière selon le NIVEAU (programme officiel marocain) ──
          // Le texte combiné contient le nom/code de la classe (ex. "2bacsgc-1")
          // ET le libellé arabe du niveau (ex. "علوم التدبير المحاسباتي").
          // La détection dépend du niveau car une même voie change de code/valeur
          // entre TC, 1ère Bac et 2ème Bac (ex. sciences éco = "sciences_eco" en
          // 1Bac mais "eco" en 2Bac ; sciences exp se scinde en svt/pc en 2Bac).
          const combinedText = (className + ' ' + levelName).toLowerCase();
          const has = (...keys) => keys.some(k => combinedText.includes(k));
          filiere = '';

          if (level === 'TC') {
            // Tronc commun : 3 voies (technologique / scientifique / lettres)
            if (has('تكنولوج', 'technolog', 'tct')) filiere = 'tc_tech';
            else if (has('آداب', 'أدبي', 'إنساني', 'lettre', 'tcl')) filiere = 'tc_lettres';
            else if (has('علم', 'scientif', 'tcs')) filiere = 'tc_sciences';
          } else if (level === '1BAC') {
            if (has('كهربائي', 'électr', 'electr', 'ste')) filiere = 'ste';
            else if (has('ميكانيك', 'mécaniq', 'mecaniq', 'stm')) filiere = 'stm';
            else if (has('اقتصاد', 'إقتصاد', 'économ', 'econom', 'seg')) filiere = 'sciences_eco';
            else if (has('تجريبي', 'expériment', 'experiment', 'sef')) filiere = 'sciences_exp';
            else if (has('رياضي', 'mathémat', 'mathemat', 'smf')) filiere = 'sciences_math';
            else if (has('آداب', 'أدبي', 'إنساني', 'lettre', 'humaine')) filiere = 'lettres';
          } else if (level === '2BAC') {
            if (has('التدبير المحاسباتي', 'محاسب', 'gestion comptable', 'sgc')) filiere = 'sciences_gestion';
            else if (has('كهربائي', 'électr', 'electr', 'ste')) filiere = 'ste';
            else if (has('ميكانيك', 'mécaniq', 'mecaniq', 'stm')) filiere = 'stm';
            else if (has('اقتصاد', 'إقتصاد', 'économ', 'econom')) filiere = 'eco';
            else if (has('رياضية أ', 'math a', 'sma')) filiere = 'sciences_math_a';
            else if (has('رياضية ب', 'math b', 'smb')) filiere = 'sciences_math_b';
            else if (has('الحياة والأرض', 'svt')) filiere = 'svt';
            else if (has('فيزيائي', 'physiq', 'spf')) filiere = 'pc';
            else if (has('رياضي', 'mathémat', 'mathemat')) filiere = 'sciences_math_a';
            else if (has('إنساني', 'humaine')) filiere = 'sciences_humaines';
            else if (has('آداب', 'أدبي', 'lettre')) filiere = 'lettres';
          }
          // Maternelle / primaire / collège : aucune filière dans le système marocain.

          console.log(`[${file.name}] Filiere detection: "${combinedText}" -> ${filiere || '(none)'}`);

          // Find student data header row
          let headerRowIndex = -1;
          let studentIdColIndex = -1;
          let studentNameColIndex = -1;
          let lastNameColIndex = -1;
          let birthDateColIndex = -1;
          let genderColIndex = -1;
          let birthPlaceColIndex = -1;

          console.log(`[${file.name}] Searching for header in ${rawData.length} rows...`);
          
          // Log first 15 rows for debugging
          for (let i = 0; i < Math.min(15, rawData.length); i++) {
            const row = rawData[i];
            if (row && row.length > 0) {
              console.log(`[${file.name}] Row ${i}:`, row.slice(0, 10).map(cell => 
                typeof cell === 'string' ? `"${cell.trim()}"` : cell
              ));
            }
          }

          for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row) continue;

            let tempStudentIdCol = -1;
            let tempStudentNameCol = -1;
            let tempLastNameCol = -1;
            let tempBirthDateCol = -1;
            let tempGenderCol = -1;
            let tempBirthPlaceCol = -1;

            for (let j = 0; j < row.length; j++) {
              const cell = row[j];
              if (typeof cell === 'string') {
                const trimmed = cell.trim().replace(/\s+/g, ' ');

                // Format 1: رقم التلميذ (student number)
                if (trimmed.includes('رقم') && trimmed.includes('التلميذ')) {
                  tempStudentIdCol = j;
                  console.log(`[${file.name}] Found "رقم التلميذ" at row ${i}, col ${j}`);
                }
                // Format 2: الرمز (code/ID/Massar code) - this is the actual student ID
                if (trimmed === 'الرمز' || trimmed === 'رمز' || trimmed.includes('الرمز')) {
                  tempStudentIdCol = j;
                  console.log(`[${file.name}] Found "الرمز" at row ${i}, col ${j}`);
                }
                // Note: ر.ت is just row number, not student ID - we ignore it
                
                // Format 1: إسم التلميذ (full student name)
                if (trimmed.includes('إسم') && trimmed.includes('التلميذ')) {
                  tempStudentNameCol = j;
                  console.log(`[${file.name}] Found "إسم التلميذ" at row ${i}, col ${j}`);
                }
                // Format 2: الإسم (first name)
                if (trimmed === 'الإسم' || trimmed === 'الاسم' || trimmed === 'إسم' || trimmed === 'اسم') {
                  tempStudentNameCol = j;
                  console.log(`[${file.name}] Found "الإسم" at row ${i}, col ${j}`);
                }
                // Format 2: النسب (last name/family name)
                if (trimmed === 'النسب' || trimmed === 'نسب' || trimmed.includes('النسب')) {
                  tempLastNameCol = j;
                  console.log(`[${file.name}] Found "النسب" at row ${i}, col ${j}`);
                }
                
                // Birth date
                if (trimmed.includes('تاريخ') && (trimmed.includes('الإزدياد') || trimmed.includes('ازدياد') || trimmed.includes('الازدياد'))) {
                  tempBirthDateCol = j;
                  console.log(`[${file.name}] Found birth date at row ${i}, col ${j}`);
                }
                // Genre (النوع) — éviter de confondre avec un éventuel "نوع" hors contexte
                if (trimmed === 'النوع' || trimmed === 'نوع' || trimmed === 'الجنس') {
                  tempGenderCol = j;
                }
                // Lieu de naissance (مكان الازدياد)
                if (trimmed.includes('مكان') && (trimmed.includes('الازدياد') || trimmed.includes('الإزدياد') || trimmed.includes('ازدياد'))) {
                  tempBirthPlaceCol = j;
                }
              }
            }

            // Valid if we have student ID and at least one name column
            if (tempStudentIdCol !== -1 && (tempStudentNameCol !== -1 || tempLastNameCol !== -1)) {
              headerRowIndex = i;
              studentIdColIndex = tempStudentIdCol;
              studentNameColIndex = tempStudentNameCol;
              lastNameColIndex = tempLastNameCol;
              birthDateColIndex = tempBirthDateCol;
              genderColIndex = tempGenderCol;
              birthPlaceColIndex = tempBirthPlaceCol;
              console.log(`[${file.name}] ✓ Header found at row ${i}`);
              console.log(`[${file.name}] Columns: ID=${studentIdColIndex}, FirstName=${studentNameColIndex}, LastName=${lastNameColIndex}, BirthDate=${birthDateColIndex}`);
              break;
            }
          }

          if (headerRowIndex === -1) {
            // Onglet sans tableau d'élèves (récap, vide…) → on l'ignore
            console.warn(`[${file.name}] onglet "${sheetName}" sans en-tête élèves → ignoré`);
            return null;
          }

          // Extract students
          const students = [];
          console.log(`[${file.name}] Extracting students from row ${headerRowIndex + 1} to ${rawData.length}...`);
          
          for (let i = headerRowIndex + 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0) continue;

            const massarCode = row[studentIdColIndex];
            const birthDate = birthDateColIndex !== -1 ? row[birthDateColIndex] : null;
            const gender = genderColIndex !== -1 ? row[genderColIndex] : null;
            const birthPlace = birthPlaceColIndex !== -1 ? row[birthPlaceColIndex] : null;

            // Skip if no massar code or if it's a header row
            if (!massarCode || typeof massarCode !== 'string' || !massarCode.trim() ||
                massarCode.includes('رقم') || massarCode.includes('الرمز') || massarCode.includes('ر.ت')) {
              continue;
            }

            let firstName = '';
            let lastName = '';

            // Libellés d'en-tête EXACTS à exclure (et non en sous-chaîne : un vrai
            // prénom comme « اسماعيل » commence par « اسم » et était filtré à tort).
            const HEADER_FIRST = ['الإسم', 'الاسم', 'إسم', 'اسم', 'إسم التلميذ', 'اسم التلميذ'];
            const HEADER_LAST = ['النسب', 'نسب'];

            // Format 2: Separate first name and last name columns (الإسم and النسب)
            if (lastNameColIndex !== -1 && studentNameColIndex !== -1) {
              const firstNameCell = row[studentNameColIndex];
              const lastNameCell = row[lastNameColIndex];

              if (firstNameCell && typeof firstNameCell === 'string' && firstNameCell.trim() &&
                  !HEADER_FIRST.includes(firstNameCell.trim())) {
                firstName = firstNameCell.trim();
              }

              if (lastNameCell && typeof lastNameCell === 'string' && lastNameCell.trim() &&
                  !HEADER_LAST.includes(lastNameCell.trim())) {
                lastName = lastNameCell.trim();
              }
            }
            // Format 1: Full name in one column (إسم التلميذ)
            else if (studentNameColIndex !== -1) {
              const studentName = row[studentNameColIndex];

              if (studentName && typeof studentName === 'string' && studentName.trim() &&
                  !HEADER_FIRST.includes(studentName.trim())) {
                const fullName = studentName.trim();
                const nameParts = fullName.split(/\s+/);

                if (nameParts.length === 1) {
                  firstName = nameParts[0];
                  lastName = '';
                } else if (nameParts.length === 2) {
                  firstName = nameParts[0];
                  lastName = nameParts[1];
                } else {
                  firstName = nameParts[0];
                  lastName = nameParts.slice(1).join(' ');
                }
              }
            }

            // Only add if we have at least a first name
            if (firstName) {
              students.push({
                massarCode: massarCode.trim(),
                firstName,
                lastName,
                birthDate: birthDate || null,
                gender: (gender != null && String(gender).trim()) ? String(gender).trim() : null,
                birthPlace: (birthPlace != null && String(birthPlace).trim()) ? String(birthPlace).trim() : null
              });
            }
          }
          
          console.log(`[${file.name}] ✓ Extracted ${students.length} students`);
          if (students.length > 0) {
            console.log(`[${file.name}] First student:`, students[0]);
            console.log(`[${file.name}] Last student:`, students[students.length - 1]);
          }

          const result = {
            fileName: file.name,
            sheetName,
            className,
            level,
            schoolType,
            filiere,
            academicYear,
            academy,
            provincialDirection,
            commune,
            establishment,
            students,
            studentCount: students.length
          };

          console.log(`[${file.name}] ✓ Onglet ${sheetName}:`, {
            className: result.className, level: result.level,
            schoolType: result.schoolType, filiere: result.filiere,
            studentCount: result.studentCount
          });

          return result;
          }; // ── fin parseSheetData ──

          // Parcourir TOUS les onglets (= toutes les classes du fichier)
          const allResults = [];
          for (const sheetName of workbook.SheetNames) {
            try {
              const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
              const parsed = parseSheetData(sheetRows, sheetName);
              if (parsed && parsed.students && parsed.students.length > 0) allResults.push(parsed);
            } catch (err) {
              console.warn(`[${file.name}] onglet "${sheetName}" ignoré:`, err.message);
            }
          }

          if (allResults.length === 0) {
            reject(new Error(`Aucune classe/élève détecté dans ${file.name}`));
            return;
          }
          resolve(allResults);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  };

  // Handle multiple file selection for bulk import
  const handleBulkFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsBulkImporting(true);
    setBulkImportProgress({ current: 0, total: files.length, message: 'Analyse des fichiers Excel...' });
    setParsedClasses([]);
    setBulkImportErrors([]);

    const parsed = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        setBulkImportProgress({
          current: i + 1,
          total: files.length,
          message: `Analyse de ${file.name}...`
        });
        // parseExcelFile renvoie un tableau de classes (un onglet = une classe)
        const classList = await parseExcelFile(file);
        (Array.isArray(classList) ? classList : [classList]).forEach(c => parsed.push(c));
      } catch (error) {
        errors.push({ fileName: file.name, error: error.message });
      }
    }

    setParsedClasses(parsed);
    setBulkImportErrors(errors);
    setBulkImportProgress({ current: files.length, total: files.length, message: `Analyse terminée : ${parsed.length} classe(s) détectée(s)` });
    setIsBulkImporting(false);
  };

  // Submit parsed classes to backend
  const submitBulkImport = async () => {
    if (parsedClasses.length === 0) return;

    setIsBulkImporting(true);
    const total = parsedClasses.length;
    setBulkImportProgress({ current: 0, total, message: 'Création des classes et élèves...' });

    // Import CLASSE PAR CLASSE : chaque classe = 1 requête courte → évite le
    // timeout 504 du proxy quand un fichier contient beaucoup d'élèves.
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    const token = session?.access_token;

    const storedPasswords = JSON.parse(localStorage.getItem('studentPasswords') || '{}');
    const aggClasses = [];
    const aggErrors = [];
    let aggStudents = 0, aggExisting = 0, aggReassigned = 0, aggOther = 0, aggRateLimited = 0;

    for (let i = 0; i < parsedClasses.length; i++) {
      const pc = parsedClasses[i];
      setBulkImportProgress({
        current: i, total,
        message: `Import ${i + 1}/${total} : ${pc.className} (${pc.studentCount} élèves)…`
      });

      const payload = {
        name: pc.className,
        level: pc.level,
        school_type: pc.schoolType,
        filiere: pc.filiere || null,
        academic_year: pc.academicYear,
        academy: pc.academy || null,
        provincialDirection: pc.provincialDirection || null,
        commune: pc.commune || null,
        establishment: pc.establishment || null,
        students: pc.students
      };

      try {
        const res = await fetch(`${apiUrl}/api/admin/classes/import`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ classes: [payload] })
        });

        // Réponse non-JSON (ex. page 504 HTML) → on signale et on continue
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) {
          let reason = `HTTP ${res.status}`;
          if (res.status === 504) reason = 'Délai dépassé (classe trop volumineuse) — réessayez cette classe seule';
          aggErrors.push({ fileName: pc.className, error: reason });
          continue;
        }

        const result = await res.json();
        (result.classes || []).forEach(cls => {
          aggClasses.push(cls);
          (cls.students || []).forEach(s => { if (s.id && s.password) storedPasswords[s.id] = s.password; });
        });
        aggStudents   += result.summary?.new ?? result.totalStudents ?? 0;
        aggExisting   += result.summary?.existing ?? 0;
        aggReassigned += result.summary?.reassigned ?? 0;
        aggOther      += result.summary?.otherSchool ?? 0;
        aggRateLimited += result.summary?.rateLimited ?? result.rateLimited ?? 0;
        (result.errors || []).forEach(e => aggErrors.push({ fileName: pc.className, error: e.reason || e.error || 'erreur' }));
      } catch (err) {
        console.error('Import classe', pc.className, err);
        aggErrors.push({ fileName: pc.className, error: err.message });
      }
    }

    localStorage.setItem('studentPasswords', JSON.stringify(storedPasswords));

    setBulkImportResult({
      message: aggRateLimited > 0
        ? `${aggClasses.length} classe(s), ${aggStudents} élève(s) créé(s). ${aggRateLimited} élève(s) non créé(s) (limite Supabase) → réimportez le MÊME fichier dans ~1h pour les reprendre.`
        : `${aggClasses.length} classe(s) importée(s), ${aggStudents} nouvel(le)(s) élève(s)`,
      classes: aggClasses,
      totalStudents: aggStudents,
      rateLimited: aggRateLimited,
      summary: { new: aggStudents, existing: aggExisting, reassigned: aggReassigned, otherSchool: aggOther, rateLimited: aggRateLimited, errors: aggErrors.length },
      errors: aggErrors.length ? aggErrors : undefined,
    });
    setBulkImportErrors(aggErrors);
    setBulkImportProgress({ current: total, total, message: 'Importation terminée !' });

    await fetchData();
    setIsBulkImporting(false);
  };

  // Download bulk import template
  const downloadBulkTemplate = () => {
    // Create a template with multiple sheets (one example per school type)
    const workbook = XLSX.utils.book_new();

    // College template (1AC)
    const collegeSheet = XLSX.utils.aoa_to_sheet([
      ['أكاديمية :', 'الدار البيضاء - سطات', '', 'م.الإقليمية :', 'عمالة مقاطعة عين الشق', '', 'École Collège'],
      ['المستوى :', '1ère Année Collège', '', 'القسم :', '1AC-3', '', 'Nom Prof'],
      ['', ''],
      ['الدورة :', 'الدورة الأولى', '', 'نقط :', '', '', ''],
      ['السنة الدراسية :', '2025/2026'],
      [],
      ['رقم التلميذ', 'إسم التلميذ', 'تاريخ الإزدياد', 'الفرض 1', 'الفرض 2', 'الأنشطة', 'ملاحظات'],
      ['', '', 'النقطة', 'النقطة', 'النقطة', '-', ''],
      ['F123456789', 'أحمد علي', '15-05-2012', '', '', '', ''],
      ['F987654321', 'فاطمة محمد', '20-08-2011', '', '', '', '']
    ]);
    XLSX.utils.book_append_sheet(workbook, collegeSheet, '1AC-Exemple');

    // Lycée template (TC)
    const lyceeSheet = XLSX.utils.aoa_to_sheet([
      ['أكاديمية :', 'الدار البيضاء - سطات', '', 'م.الإقليمية :', 'عمالة مقاطعة عين الشق', '', 'École Lycée'],
      ['المستوى :', 'Tronc Commun Scientifique', '', 'القسم :', 'TCSF-8', '', 'Nom Prof'],
      ['', 'علوم الحياة والأرض'],
      ['الدورة :', 'الدورة الأولى', '', 'نقط :', '', '', ''],
      ['السنة الدراسية :', '2025/2026'],
      [],
      ['رقم التلميذ', 'إسم التلميذ', 'تاريخ الإزدياد', 'الفرض 1', 'الفرض 2', 'الأنشطة', 'ملاحظات'],
      ['', '', 'النقطة', 'النقطة', 'النقطة', '-', ''],
      ['F164115196', 'أيت المدني رانيا', '17-12-2010', '', '', '', ''],
      ['F166023242', 'ابت الساخي سعيد', '03-06-2008', '', '', '', '']
    ]);
    XLSX.utils.book_append_sheet(workbook, lyceeSheet, 'TCSF-Exemple');

    XLSX.writeFile(workbook, 'modele_import_classes_multi.xlsx');
  };

  if (loading) {
    return <div className="p-8">Chargement...</div>;
  }

  // ---- Build hierarchy for display ----
  const availableLevels = formData.school_type && SCHOOL_HIERARCHY[formData.school_type]
    ? Object.entries(SCHOOL_HIERARCHY[formData.school_type].levels)
    : [];

  const availableFilieres = formData.school_type && formData.level && SCHOOL_HIERARCHY[formData.school_type]?.levels[formData.level]
    ? SCHOOL_HIERARCHY[formData.school_type].levels[formData.level].filieres
    : [];

  // Same for edit form
  const editLevels = editForm.school_type && SCHOOL_HIERARCHY[editForm.school_type]
    ? Object.entries(SCHOOL_HIERARCHY[editForm.school_type].levels)
    : [];

  const editFilieres = editForm.school_type && editForm.level && SCHOOL_HIERARCHY[editForm.school_type]?.levels[editForm.level]
    ? SCHOOL_HIERARCHY[editForm.school_type].levels[editForm.level].filieres
    : [];

  // Filtre par année scolaire active (les classes sans année — legacy — restent visibles).
  const visibleClasses = classes.filter(c => !c.academic_year || c.academic_year === year);

  // Group classes by school_type → level → filiere
  const grouped = {};
  const uncategorized = [];

  visibleClasses.forEach(cls => {
    const normalizedType = normalizeSchoolType(cls.school_type);

    if (!normalizedType || !SCHOOL_HIERARCHY[normalizedType]) {
      uncategorized.push(cls);
      return;
    }
    if (!grouped[normalizedType]) grouped[normalizedType] = {};
    const lvl = cls.level || '_none';
    if (!grouped[normalizedType][lvl]) grouped[normalizedType][lvl] = {};
    const fil = cls.filiere || '_none';
    if (!grouped[normalizedType][lvl][fil]) grouped[normalizedType][lvl][fil] = [];
    grouped[normalizedType][lvl][fil].push(cls);
  });

  // Render a single class card
  const renderClassCard = (cls) => {
    const isExpanded = expandedClass === cls.id;
    const isEditing = editingClassId === cls.id;
    const studentCount = cls.student_count ?? cls.studentCount ?? 0;

    return (
      <ClassCard
        key={cls.id}
        name={cls.name}
        subtitle={[getLevelLabel(cls.level) || cls.level, cls.filiere && getFiliereLabel(cls.filiere), cls.academic_year].filter(Boolean).join(' · ')}
        count={studentCount}
        boys={cls.boys_count}
        girls={cls.girls_count}
        teachers={(classTeachers[cls.id] || []).map(ct => {
          const p = ct.profiles || {};
          return {
            name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || '—',
            photo: p.avatar_url,
            subject: p.subject || p.subjects?.name,
          };
        })}
        onClick={() => setExpandedClass(cls.id)}
        actions={[
          { icon: CreditCard, label: massarCoverage[cls.id]?.withSecret > 0 ? 'Réimporter les codes Massar' : 'Importer les codes Massar', tone: 'purple', onClick: () => openMassarModalForClass(cls) },
          { icon: ListChecks, label: 'Voir / modifier les codes Massar', tone: 'purple', onClick: () => openMassarEditForClass(cls) },
          ...(massarCoverage[cls.id]?.withSecret > 0
            ? [{ icon: Send, label: 'Envoyer les codes Massar (WhatsApp)', tone: 'purple', onClick: () => quickSendMassar(cls) }]
            : []),
          { icon: Calendar, label: 'Emploi du temps', tone: 'blue', onClick: () => navigate(`/classes/${cls.id}/timetable`) },
          { icon: Edit2, label: 'Modifier', tone: 'blue', onClick: () => { openEditClass(cls); setExpandedClass(cls.id); } },
          { icon: Trash2, label: 'Supprimer', tone: 'red', onClick: () => deleteClass(cls.id) },
        ]}
      />
    );
  };

  // Contenu de gestion d'une classe, affiché dans le drawer (clic sur une carte).
  const renderClassDrawerBody = (cls) => {
    if (!cls) return null;
    const isEditing = editingClassId === cls.id;
    return (
      <div className="space-y-4">
        {/* Edit form */}
        {isEditing && (
          <div className="border rounded-lg px-3 py-2 bg-blue-50/50 dark:bg-blue-950/20">
            <form onSubmit={handleEditClass} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nom" className="px-2 py-1.5 border rounded text-sm bg-background" />
              <select value={editForm.school_type} onChange={e => setEditForm(f => ({ ...f, school_type: e.target.value, level: '', filiere: '' }))}
                className="px-2 py-1.5 border rounded text-sm bg-background">
                <option value="">-- Type --</option>
                {Object.entries(SCHOOL_HIERARCHY).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select value={editForm.level} onChange={e => setEditForm(f => ({ ...f, level: e.target.value, filiere: '' }))}
                className="px-2 py-1.5 border rounded text-sm bg-background" disabled={!editForm.school_type}>
                <option value="">-- Niveau --</option>
                {editLevels.map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              {editFilieres.length > 0 && (
                <select value={editForm.filiere} onChange={e => setEditForm(f => ({ ...f, filiere: e.target.value }))}
                  className="px-2 py-1.5 border rounded text-sm bg-background">
                  <option value="">-- Filière --</option>
                  {editFilieres.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              )}
              <input type="text" value={editForm.academicYear} onChange={e => setEditForm(f => ({ ...f, academicYear: e.target.value }))}
                placeholder="Année scolaire" className="px-2 py-1.5 border rounded text-sm bg-background" />
              <div className="flex gap-1">
                <button type="submit" disabled={savingEdit}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50">
                  {savingEdit ? '...' : 'OK'}
                </button>
                <button type="button" onClick={() => setEditingClassId(null)}
                  className="px-3 py-1.5 border rounded text-sm hover:bg-accent">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Professeurs ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm">Professeurs</h4>
                <span className="text-xs text-muted-foreground">
                  {classTeachers[cls.id]?.length || 0} assigné(s) / {teachers.length} total
                </span>
              </div>
              {teachers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun professeur dans l'école</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {teachers.map(teacher => {
                    const isAssigned = classTeachers[cls.id]?.some(
                      ct => ct.teacher_id === teacher.id || ct.profiles?.id === teacher.id
                    );
                    return (
                      <button
                        key={teacher.id}
                        onClick={async () => {
                          if (isAssigned) {
                            await removeTeacherFromClass(cls.id, teacher.id);
                          } else {
                            await addTeacherToClass(cls.id, teacher.id);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                          isAssigned
                            ? 'bg-green-100 text-green-800 border-green-300 hover:bg-red-50 hover:text-red-700 hover:border-red-300'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-300'
                        }`}
                        title={isAssigned ? `Retirer ${teacher.first_name} ${teacher.last_name}` : `Assigner ${teacher.first_name} ${teacher.last_name}`}
                      >
                        {isAssigned ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        {teacher.first_name} {teacher.last_name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">
                Cliquez sur un professeur pour l'assigner ou le retirer de cette classe.
              </p>
            </div>

            {/* ── Élèves de la classe (cliquables → fiche éditable, page Élèves) ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm">Élèves</h4>
                <span className="text-xs text-muted-foreground">
                  {classStudentsLoading ? 'Chargement…' : `${classStudents.length} élève(s)`}
                </span>
              </div>
              {classStudentsLoading ? (
                <p className="text-sm text-muted-foreground">Chargement des élèves…</p>
              ) : classStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun élève dans cette classe.</p>
              ) : (
                <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                  {classStudents.map((s, idx) => {
                    const st = classStudentStats[s.id] || {};
                    const perf = st.performance;
                    const perfColor = perf == null ? 'text-gray-400'
                      : perf >= 50 ? 'text-green-600' : perf >= 35 ? 'text-amber-600' : 'text-red-600';
                    return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => navigate(`/students?student=${s.id}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                      title="Voir / modifier la fiche de l'élève"
                    >
                      <span className="w-6 text-xs font-semibold text-muted-foreground text-right flex-shrink-0">
                        {s.import_order ?? idx + 1}
                      </span>
                      <Avatar name={`${s.first_name} ${s.last_name}`} src={s.avatar_url} gender={s.gender} size="sm" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{s.first_name} {s.last_name}</span>
                        <span className="flex items-center gap-2 mt-0.5 text-[11px]">
                          <span className="text-gray-500" title="Absences">🚫 {st.absences ?? 0}</span>
                          <span className={perfColor} title="Performance">{perf == null ? '—' : `${perf}%`}</span>
                          <Sparkline points={st.trend || []} dir={st.trendDir || 'flat'} />
                          {st.weakSubject && (
                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-semibold" title={`Matière faible : ${st.weakSubject.subject} (${st.weakSubject.avg}%)`}>
                              {st.weakSubject.abbr}
                            </span>
                          )}
                        </span>
                      </span>
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">
                Cliquez sur un élève pour ouvrir sa fiche et la modifier (page Élèves).
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-2">Importer des élèves (Excel)</h4>
              <div className="space-y-2">
                <button onClick={downloadArabicTemplate}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded cursor-pointer hover:bg-green-100">
                  <Download className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-600">Télécharger le modèle (Arabe)</span>
                </button>
                <label className={`flex items-center gap-2 px-4 py-2 border rounded cursor-pointer ${isImporting ? 'bg-gray-100 border-gray-300 cursor-not-allowed' : 'bg-blue-50 border-blue-200 hover:bg-blue-100'}`}>
                  <Upload className={`w-4 h-4 ${isImporting ? 'text-gray-400' : 'text-blue-600'}`} />
                  <span className={`text-sm ${isImporting ? 'text-gray-400' : 'text-blue-600'}`}>
                    {isImporting ? 'Importation en cours...' : 'Choisir un fichier Excel'}
                  </span>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleExcelImport(e, cls.id)} className="hidden" disabled={isImporting} />
                </label>
                {isImporting && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-800">{importProgress.message}</span>
                      <span className="text-sm font-bold text-blue-600">{importProgress.current}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${importProgress.current}%` }}></div>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Format: إسم التلميذ (Nom), رقم التلميذ (Code Massar). L'email sera généré automatiquement : <strong>codemassar@{profile?.school?.name ? profile.school.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '') + '.ma' : 'nomecole.ma'}</strong>
              </p>
            </div>
      </div>
    );
  };

  const activeClass = classes.find(c => c.id === expandedClass) || null;

  return (
    <div className="p-8 space-y-6">
      {/* Drawer de gestion d'une classe */}
      <DetailDrawer
        open={!!expandedClass}
        onClose={() => { setExpandedClass(null); setEditingClassId(null); }}
        title={activeClass?.name || ''}
        width={520}
      >
        {renderClassDrawerBody(activeClass)}
      </DetailDrawer>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Classes</h1>
          <div className="flex gap-3 mt-2 text-sm text-muted-foreground">
            <span>{classes.length} classe(s)</span>
            {[
              ['maternelle', 'maternelle'],
              ['primaire', 'primaire'],
              ['college', 'collège'],
              ['lycee', 'lycée'],
            ].map(([key, label]) => {
              const n = classes.filter(c => normalizeSchoolType(c.school_type) === key).length;
              if (!n) return null;
              return <span key={key}>· {n} {label}</span>;
            })}
            {uncategorized.length > 0 && <span className="text-orange-600">· {uncategorized.length} non classifiée(s)</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            const years = [...new Set(classes.map((c) => c.academic_year).filter(Boolean))].sort().reverse();
            if (years.length === 0) return null;
            return (
              <select
                value=""
                onChange={(e) => {
                  const yr = e.target.value;
                  if (!yr) return;
                  bulkDeleteClasses(classes.filter((c) => c.academic_year === yr), `année ${yr}`);
                  e.target.value = '';
                }}
                className="px-3 py-1.5 border border-red-200 text-red-700 rounded-lg text-sm bg-white"
                title="Supprimer toutes les classes d'une année scolaire"
              >
                <option value="">🗑️ Supprimer une année…</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            );
          })()}
          <button
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importer classes (Excel)
          </button>
          <button
            onClick={() => setShowMassarImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            title="Importer les codes Massar (InfoEleve) et les envoyer aux parents"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Codes Massar
          </button>
          <button
            onClick={() => {
              if (!showForm && !formData.academicYear) {
                setFormData((f) => ({ ...f, academicYear: year }));
              }
              setShowForm(!showForm);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Plus className="w-4 h-4" />
            Ajouter une classe
          </button>
        </div>
      </div>

      {deleteStatus.message && (
        <div className={`px-4 py-3 rounded-lg border text-sm font-medium ${
          deleteStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700'
          : deleteStatus.type === 'error' ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          {deleteStatus.message}
        </div>
      )}

      {/* Create Form with Cascade Dropdowns */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter une nouvelle classe</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Type d'établissement *</label>
                  <select
                    value={formData.school_type}
                    onChange={(e) => setFormData({ ...formData, school_type: e.target.value, level: '', filiere: '' })}
                    required
                    className="w-full px-3 py-2 border rounded bg-background"
                  >
                    <option value="">-- Sélectionner --</option>
                    {Object.entries(SCHOOL_HIERARCHY).map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Niveau *</label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value, filiere: '' })}
                    required
                    disabled={!formData.school_type}
                    className="w-full px-3 py-2 border rounded bg-background disabled:opacity-50"
                  >
                    <option value="">-- Sélectionner --</option>
                    {availableLevels.map(([key, val]) => (
                      <option key={key} value={key}>{val.label}</option>
                    ))}
                  </select>
                </div>
                {availableFilieres.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium mb-1 text-muted-foreground">Filière</label>
                    <select
                      value={formData.filiere}
                      onChange={(e) => setFormData({ ...formData, filiere: e.target.value })}
                      className="w-full px-3 py-2 border rounded bg-background"
                    >
                      <option value="">-- Sélectionner --</option>
                      {availableFilieres.map(f => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Nom de la classe *</label>
                  <input
                    type="text"
                    placeholder="Ex: TCSF-8, 1AC-3"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 border rounded bg-background"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Année scolaire *</label>
                  <input
                    type="text"
                    placeholder="2024/2025"
                    value={formData.academicYear}
                    onChange={(e) => setFormData({ ...formData, academicYear: e.target.value })}
                    required
                    className="w-full px-3 py-2 border rounded bg-background"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Professeur principal</label>
                  <select
                    value={formData.teacherId}
                    onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                    className="w-full px-3 py-2 border rounded bg-background"
                  >
                    <option value="">Aucun</option>
                    {teachers.map(teacher => (
                      <option key={teacher.id} value={teacher.id}>{teacher.first_name} {teacher.last_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                  Ajouter
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-accent">
                  Annuler
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <Card className="border-green-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <CardTitle>Importer des classes en vrac</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Importez plusieurs classes avec leurs élèves depuis des fichiers Excel
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowBulkImport(false);
                  setParsedClasses([]);
                  setBulkImportErrors([]);
                  setBulkImportResult(null);
                }}
                className="p-2 hover:bg-muted rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">📋 Instructions</h4>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Chaque fichier Excel = 1 classe avec ses élèves</li>
                <li>Formats supportés :
                  <ul className="ml-6 mt-1 space-y-0.5">
                    <li>• Format 1: <strong>رقم التلميذ</strong> + <strong>إسم التلميذ</strong></li>
                    <li>• Format 2: <strong>الرمز</strong> + <strong>الإسم</strong> + <strong>النسب</strong></li>
                  </ul>
                </li>
                <li>Le nom de la classe sera extrait de la cellule "القسم" ou du nom du fichier</li>
                <li>Vous pouvez sélectionner plusieurs fichiers à la fois</li>
              </ul>
            </div>

            {/* Template Download */}
            <button
              onClick={downloadBulkTemplate}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
            >
              <Download className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-600">Télécharger les modèles Excel (Collège + Lycée)</span>
            </button>

            {/* File Upload */}
            {!bulkImportResult && (
              <div className="border-2 border-dashed border-green-300 rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium mb-2">Sélectionnez un ou plusieurs fichiers Excel</p>
                <p className="text-xs text-muted-foreground mb-4">.xlsx, .xls - Fichiers de notes marocains</p>
                <label className={`inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg cursor-pointer hover:bg-green-700 ${isBulkImporting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <span className="text-sm font-medium">
                    {isBulkImporting ? 'Analyse en cours...' : 'Choisir les fichiers'}
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    onChange={handleBulkFileSelect}
                    className="hidden"
                    disabled={isBulkImporting}
                  />
                </label>
              </div>
            )}

            {/* Progress */}
            {isBulkImporting && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-800">{bulkImportProgress.message}</span>
                  <span className="text-sm font-bold text-green-600">
                    {bulkImportProgress.current} / {bulkImportProgress.total}
                  </span>
                </div>
                <div className="w-full bg-green-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${bulkImportProgress.total > 0 ? (bulkImportProgress.current / bulkImportProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* Parsed Classes Preview */}
            {parsedClasses.length > 0 && !bulkImportResult && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Classes détectées ({parsedClasses.length})</h4>
                  <button
                    onClick={submitBulkImport}
                    disabled={isBulkImporting}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {isBulkImporting ? 'Importation...' : 'Confirmer l\'import'}
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2">
                  {parsedClasses.map((cls, idx) => (
                    <div key={idx} className="border rounded-lg p-3 bg-white">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium">{cls.className || 'Sans nom'}</p>
                            <p className="text-xs text-muted-foreground">
                              {cls.level || 'Niveau à préciser'} • {
                                cls.schoolType === 'maternelle' ? 'Maternelle'
                                : cls.schoolType === 'primaire' ? 'Primaire'
                                : cls.schoolType === 'college' ? 'Collège'
                                : cls.schoolType === 'lycee' ? 'Lycée'
                                : 'Type à préciser'
                              }
                              {cls.filiere && ` • ${getFiliereLabel(cls.filiere)}`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-green-700">{cls.studentCount} élève(s)</p>
                          <p className="text-xs text-muted-foreground">{cls.fileName}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {bulkImportErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-medium text-red-800 mb-2">Erreurs ({bulkImportErrors.length})</h4>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {bulkImportErrors.map((err, idx) => (
                    <p key={idx} className="text-sm text-red-700">
                      • {err.fileName}: {err.error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Success Result */}
            {bulkImportResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <h4 className="font-medium text-green-800 mb-1">Importation réussie !</h4>
                <p className="text-sm text-green-700">
                  {bulkImportResult.message}
                </p>
                {bulkImportResult.errors && bulkImportResult.errors.length > 0 && (
                  <p className="text-xs text-orange-600 mt-2">
                    {bulkImportResult.errors.length} erreur(s) - voir console
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Massar Codes Import Modal */}
      {/* Modale : édition manuelle des codes Massar d'une classe */}
      {massarEditClass && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeMassarEdit}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <ListChecks className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Codes Massar — {massarEditClass.name}</h3>
                  <p className="text-sm text-muted-foreground">Modifiez manuellement le code Massar et le code secret de chaque élève</p>
                </div>
              </div>
              <button onClick={closeMassarEdit} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {massarEditLoading ? (
                <p className="text-center text-muted-foreground py-8">Chargement des élèves…</p>
              ) : massarEditRows.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucun élève dans cette classe.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-3 font-medium">Élève</th>
                      <th className="py-2 px-2 font-medium">Code Massar</th>
                      <th className="py-2 pl-2 font-medium">Code secret</th>
                    </tr>
                  </thead>
                  <tbody>
                    {massarEditRows.map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 align-middle">{r.last_name} {r.first_name}</td>
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={r.massar_code}
                            onChange={e => setMassarEditField(r.id, 'massar_code', e.target.value)}
                            placeholder="Code Massar"
                            className="w-full px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 bg-transparent uppercase"
                          />
                        </td>
                        <td className="py-2 pl-2">
                          <input
                            type="text"
                            value={r.massar_secret}
                            onChange={e => setMassarEditField(r.id, 'massar_secret', e.target.value)}
                            placeholder="Code secret"
                            className="w-full px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 bg-transparent"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t">
              <button onClick={closeMassarEdit} className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
                Fermer
              </button>
              <button
                onClick={saveMassarEdit}
                disabled={massarEditSaving || massarEditLoading || massarEditRows.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {massarEditSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMassarImport && (
        <Card className="border-indigo-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <CardTitle>Codes Massar (InfoEleve)</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Importez les codes Massar + codes secrets, puis envoyez-les aux parents
                  </p>
                </div>
              </div>
              <button onClick={resetMassarModal} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-medium mb-1">📋 Fichiers officiels Massar « InfoEleve » (un par classe)</p>
              <p>Vous pouvez sélectionner <strong>plusieurs fichiers</strong> à la fois. Chaque fichier contient <strong>رقم التلميذ</strong> (code Massar) et <strong>الرمز السري</strong> (code secret) ; la classe est détectée automatiquement.</p>
            </div>

            {/* Option correction des noms (globale) */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={fixMassarNames}
                onChange={e => setFixMassarNames(e.target.checked)}
                className="rounded"
              />
              <span>Corriger les noms des élèves avec les noms officiels Massar</span>
            </label>

            {/* Upload (multiple) */}
            <div className="border-2 border-dashed border-indigo-300 rounded-lg p-6 text-center">
              <Upload className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
              <p className="text-sm font-medium mb-3">Sélectionnez un ou plusieurs fichiers InfoEleve (.xlsx)</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700">
                <span className="text-sm font-medium">Choisir les fichiers</span>
                <input type="file" accept=".xlsx,.xls" multiple onChange={handleMassarFileChange} className="hidden" />
              </label>
              {massarFiles.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">{massarFiles.length} fichier(s) chargé(s) — vous pouvez en ajouter d'autres.</p>
              )}
            </div>

            {/* Liste des fichiers (1 carte par fichier/classe) */}
            {massarFiles.map((f) => {
              const matched = f.result?.results?.filter(r => r.matchStatus === 'matched').length || 0;
              const notFound = f.result?.results?.filter(r => r.matchStatus === 'not_found').length || 0;
              const namesToFix = f.result?.results?.filter(r => r.nameUpdate).length || 0;
              const committed = f.result && f.result.updated != null;
              return (
                <div key={f.key} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span className="truncate">{f.fileName}</span>
                      </p>
                      {f.error ? (
                        <p className="text-xs text-red-500 mt-1">{f.error}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {f.rows.length} élève(s){f.className ? <> • Classe détectée : <strong>{f.className}</strong></> : null}
                        </p>
                      )}
                    </div>
                    <button onClick={() => removeMassarFile(f.key)} className="p-1 hover:bg-muted rounded shrink-0" title="Retirer ce fichier">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {!f.error && (
                    <>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-xs font-medium mb-1">Classe cible *</label>
                          <select
                            value={f.classId}
                            onChange={e => setMassarFileClass(f.key, e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
                          >
                            <option value="">— Sélectionner —</option>
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>{c.name}{c.level ? ` · ${c.level}` : ''}</option>
                            ))}
                          </select>
                          {!f.classId && f.className && (
                            <p className="text-xs text-amber-600 mt-1">Classe « {f.className} » non trouvée — sélectionnez-la manuellement.</p>
                          )}
                        </div>
                        {f.classId && (
                          <button
                            onClick={() => handleSendMassar(f.classId, f.className || classes.find(c => c.id === f.classId)?.name)}
                            disabled={massarBusy}
                            className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
                            title="Envoyer code + secret aux parents de cette classe par WhatsApp"
                          >
                            Envoyer (WhatsApp)
                          </button>
                        )}
                      </div>

                      {/* Aperçu compact */}
                      <div className="max-h-40 overflow-y-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="text-left py-1 px-2">Élève</th>
                              <th className="text-left py-1 px-2">Code</th>
                              <th className="text-left py-1 px-2">Secret</th>
                              {f.result?.results && <th className="text-left py-1 px-2">Statut</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {f.rows.map((row, idx) => {
                              const r = f.result?.results?.[idx];
                              return (
                                <tr key={idx} className="border-t">
                                  <td className="py-1 px-2">{row.student_full_name || '—'}</td>
                                  <td className="py-1 px-2 font-mono">{row.massar_code}</td>
                                  <td className="py-1 px-2 font-mono">{row.massar_secret}</td>
                                  {r && (
                                    <td className="py-1 px-2">
                                      {r.matchStatus === 'matched' && (
                                        <span className="text-green-600">
                                          ✓ {r.student.first_name} {r.student.last_name}
                                          {r.nameUpdate && (
                                            <span className="block text-amber-600 text-xs">
                                              ✎ {r.nameUpdate.from} → <strong>{r.nameUpdate.to}</strong>
                                            </span>
                                          )}
                                        </span>
                                      )}
                                      {r.matchStatus === 'not_found' && <span className="text-red-500">✗ Non trouvé</span>}
                                      {r.matchStatus === 'ambiguous' && <span className="text-yellow-600">⚠ Ambigu</span>}
                                      {r.matchStatus === 'invalid' && <span className="text-muted-foreground">— Ignoré</span>}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Récap par fichier */}
                      {f.result?.error && <p className="text-sm text-red-500">{f.result.error}</p>}
                      {f.result?.results && (
                        <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
                          <span className="text-green-600">✓ {matched} correspondance(s)</span>
                          {notFound > 0 && <span className="text-red-500">✗ {notFound} non trouvé(s)</span>}
                          {namesToFix > 0 && !committed && <span className="text-amber-600">✎ {namesToFix} nom(s) à corriger</span>}
                          {committed && <span className="text-indigo-600 font-medium">{f.result.updated} secret(s) enregistré(s){f.result.namesFixed > 0 ? `, ${f.result.namesFixed} nom(s) corrigé(s)` : ''}</span>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}

            {/* Actions globales */}
            {massarFiles.some(f => !f.error) && (() => {
              const ready = massarFiles.filter(f => f.classId && f.rows.length > 0);
              const totalMatched = massarFiles.reduce((s, f) => s + (f.result?.results?.filter(r => r.matchStatus === 'matched').length || 0), 0);
              const anyDry = massarFiles.some(f => f.result?.dryRun);
              const anyCommitted = massarFiles.some(f => f.result && f.result.updated != null);
              return (
                <div className="flex flex-wrap gap-2 pt-1 border-t">
                  <button
                    onClick={() => handleMassarImport(true)}
                    disabled={massarBusy || ready.length === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {massarBusy ? 'Vérification…' : `Vérifier les correspondances (${ready.length} fichier${ready.length > 1 ? 's' : ''})`}
                  </button>
                  {anyDry && !anyCommitted && totalMatched > 0 && (
                    <button
                      onClick={() => handleMassarImport(false)}
                      disabled={massarBusy}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {massarBusy ? 'Enregistrement…' : `Enregistrer tout (${totalMatched})`}
                    </button>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Hierarchical Class List */}
      {classes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucune classe. Utilisez le bouton "Ajouter une classe" pour commencer.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Grouped by school_type */}
          {Object.entries(SCHOOL_HIERARCHY).map(([typeKey, typeInfo]) => {
            const typeLevels = grouped[typeKey];
            if (!typeLevels) return null;

            const TypeIcon = typeInfo.icon;
            const typeClassCount = Object.values(typeLevels).reduce((sum, lvls) =>
              sum + Object.values(lvls).reduce((s, arr) => s + arr.length, 0), 0);
            const typeGroupKey = `type_${typeKey}`;
            const isTypeExpanded = expandedGroups[typeGroupKey] !== false;

            return (
              <Card key={typeKey}>
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleGroup(typeGroupKey)}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    {
                      maternelle: 'bg-pink-100 text-pink-600',
                      primaire: 'bg-green-100 text-green-600',
                      college: 'bg-blue-100 text-blue-600',
                      lycee: 'bg-purple-100 text-purple-600',
                    }[typeKey] || 'bg-purple-100 text-purple-600'
                  }`}>
                    <TypeIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold">{typeInfo.label}</h2>
                    <p className="text-sm text-muted-foreground">{typeClassCount} classe(s)</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); bulkDeleteClasses(Object.values(typeLevels).flatMap((lvls) => Object.values(lvls).flat()), `tout ${typeInfo.label}`); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50 text-xs font-medium"
                    title={`Supprimer toutes les classes de ${typeInfo.label}`}
                  >
                    <Trash2 className="w-4 h-4" /> Tout supprimer
                  </button>
                  {isTypeExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </div>

                {isTypeExpanded && (
                  <div className="border-t">
                    {Object.entries(typeInfo.levels).map(([lvlKey, lvlInfo]) => {
                      const lvlFilieres = typeLevels[lvlKey];
                      if (!lvlFilieres) return null;

                      const lvlClassCount = Object.values(lvlFilieres).reduce((s, arr) => s + arr.length, 0);
                      const lvlGroupKey = `lvl_${typeKey}_${lvlKey}`;
                      const isLvlExpanded = expandedGroups[lvlGroupKey] !== false;

                      return (
                        <div key={lvlKey} className="border-b last:border-b-0">
                          <div
                            className="flex items-center gap-3 px-6 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => toggleGroup(lvlGroupKey)}
                          >
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                            <div className="flex-1">
                              <span className="font-semibold text-sm">{lvlInfo.label}</span>
                              <span className="text-xs text-muted-foreground ml-2">({lvlClassCount})</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); bulkDeleteClasses(Object.values(lvlFilieres).flat(), `${typeInfo.label} · ${lvlInfo.label}`); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-red-600 hover:bg-red-50 text-xs font-medium"
                              title={`Supprimer toutes les classes de ${lvlInfo.label}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Supprimer
                            </button>
                            {isLvlExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>

                          {isLvlExpanded && (
                            <div className="px-6 pb-3">
                              {lvlInfo.filieres.length > 0 ? (
                                // Has filieres: group by filiere
                                <>
                                  {lvlInfo.filieres.map(filInfo => {
                                    const filClasses = lvlFilieres[filInfo.value];
                                    if (!filClasses || filClasses.length === 0) return null;

                                    return (
                                      <div key={filInfo.value} className="mb-3">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 pl-2 border-l-2 border-purple-300">
                                          {filInfo.label} ({filClasses.length})
                                        </p>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 ml-2">
                                          {filClasses.map(cls => renderClassCard(cls))}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {Object.entries(lvlFilieres)
                                    .filter(([filKey, filClasses]) => {
                                      if (!filClasses || filClasses.length === 0) return false;
                                      if (filKey === '_none') return false;
                                      return !lvlInfo.filieres.some((f) => f.value === filKey);
                                    })
                                    .map(([filKey, filClasses]) => (
                                      <div key={filKey} className="mb-3">
                                        <p className="text-xs font-medium text-orange-500 uppercase tracking-wide mb-1.5 pl-2 border-l-2 border-orange-300">
                                          Filière non reconnue ({filClasses.length}) — {getFiliereLabel(filKey) || filKey}
                                        </p>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 ml-2">
                                          {filClasses.map(cls => renderClassCard(cls))}
                                        </div>
                                      </div>
                                    ))}
                                </>
                              ) : (
                                // No filieres: directly list classes
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                  {Object.values(lvlFilieres).flat().map(cls => renderClassCard(cls))}
                                </div>
                              )}

                              {/* Classes without filiere in levels that have filieres */}
                              {lvlInfo.filieres.length > 0 && lvlFilieres['_none'] && lvlFilieres['_none'].length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-medium text-orange-500 uppercase tracking-wide mb-1.5 pl-2 border-l-2 border-orange-300">
                                    Sans filière ({lvlFilieres['_none'].length})
                                  </p>
                                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 ml-2">
                                    {lvlFilieres['_none'].map(cls => renderClassCard(cls))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Levels not in hierarchy */}
                    {Object.entries(typeLevels)
                      .filter(([k]) => !typeInfo.levels[k])
                      .map(([lvlKey, lvlFilieres]) => {
                        const allClasses = Object.values(lvlFilieres).flat();
                        return (
                          <div key={lvlKey} className="border-b last:border-b-0 px-6 py-3">
                            <p className="text-xs font-medium text-orange-500 mb-1.5">{lvlKey || 'Sans niveau'} ({allClasses.length})</p>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                              {allClasses.map(cls => renderClassCard(cls))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </Card>
            );
          })}

          {/* Uncategorized classes */}
          {uncategorized.length > 0 && (
            <Card>
              <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => toggleGroup('uncategorized')}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-100 text-orange-600">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold">Non classifiées</h2>
                  <p className="text-sm text-orange-600">{uncategorized.length} classe(s) sans type — cliquez sur ✏ pour catégoriser</p>
                </div>
                {expandedGroups['uncategorized'] !== false ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
              </div>
              {expandedGroups['uncategorized'] !== false && (
                <div className="border-t px-4 pb-4 pt-2 grid grid-cols-2 lg:grid-cols-3 gap-2">
                  {uncategorized.map(cls => renderClassCard(cls))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Modale de PRÉVISUALISATION avant import des élèves */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                Vérification avant import
              </h3>
              <button onClick={() => setImportPreview(null)} className="text-gray-400 hover:text-gray-600" disabled={isImporting}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto space-y-4">
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between"><span>Fichier</span><span className="font-medium text-gray-900 truncate ml-2">{importPreview.fileName}</span></div>
                <div className="flex justify-between"><span>Classe cible</span><span className="font-medium text-gray-900">{importPreview.className}</span></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900">{importPreview.summary.total}</div>
                  <div className="text-xs text-gray-500 mt-1">Total dans le fichier</div>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{importPreview.summary.new}</div>
                  <div className="text-xs text-green-600 mt-1">Nouveaux à créer</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                  <div className="text-2xl font-bold text-amber-700">{importPreview.summary.existing}</div>
                  <div className="text-xs text-amber-600 mt-1">Déjà présents</div>
                </div>
              </div>

              {importPreview.summary.new === 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Aucun nouvel élève à créer : tous les élèves du fichier existent déjà.
                </p>
              )}

              {importPreview.newStudents.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-green-700 font-medium">Voir les {importPreview.newStudents.length} nouveaux élève(s)</summary>
                  <ul className="mt-2 max-h-40 overflow-y-auto border rounded-lg divide-y">
                    {importPreview.newStudents.map((s, i) => (
                      <li key={i} className="px-3 py-1.5 text-gray-700">{s.first_name} {s.last_name}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setImportPreview(null)}
                disabled={isImporting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmImport}
                disabled={isImporting || importPreview.summary.new === 0}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isImporting ? 'Import en cours...' : `Importer ${importPreview.summary.new} élève(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de RÉCAPITULATIF après import — à fermer (rafraîchit la page) */}
      {importRecap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              <h3 className="text-lg font-bold">Importation terminée</h3>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between"><span>Classe</span><span className="font-medium text-gray-900">{importRecap.className}</span></div>
                <div className="flex justify-between"><span>Fichier</span><span className="font-medium text-gray-900 truncate ml-2">{importRecap.fileName}</span></div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                  <span className="text-green-700">Nouveaux élèves créés</span>
                  <span className="font-bold text-green-700">{importRecap.summary.new}</span>
                </div>
                {importRecap.summary.existing > 0 && (
                  <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                    <span className="text-amber-700">Déjà présents (ignorés)</span>
                    <span className="font-bold text-amber-700">{importRecap.summary.existing}</span>
                  </div>
                )}
                {importRecap.summary.errors > 0 && (
                  <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-red-700">Erreurs</span>
                    <span className="font-bold text-red-700">{importRecap.summary.errors}</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="text-gray-600">Total traité</span>
                  <span className="font-bold text-gray-900">{importRecap.summary.total}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t flex justify-end">
              <button
                onClick={closeImportRecap}
                className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassesPage;
