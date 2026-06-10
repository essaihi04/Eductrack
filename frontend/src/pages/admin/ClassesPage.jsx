import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronDown, ChevronUp, Upload, Download, Edit2, School, GraduationCap, BookOpen, FolderOpen, X, Check, Calendar, FileSpreadsheet } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import * as XLSX from 'xlsx';
import { generateEmail, generatePassword } from '../../utils/studentUtils';
import { useAuth } from '../../contexts/AuthContext';

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
          { value: 'sciences_eco', label: 'Sciences Économiques' },
          { value: 'lettres', label: 'Lettres et Sciences Humaines' }
        ]
      },
      '2BAC': {
        label: '2ème Bac',
        filieres: [
          { value: 'svt', label: 'SVT' },
          { value: 'pc', label: 'PC' },
          { value: 'sciences_math_a', label: 'Sciences Math A' },
          { value: 'sciences_math_b', label: 'Sciences Math B' },
          { value: 'eco', label: 'Sciences Économiques' },
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

const ClassesPage = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedClass, setExpandedClass] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [classTeachers, setClassTeachers] = useState({});
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, message: '' });
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

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchData();
  }, []);

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
            lastName: lastName
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

      setImportProgress({ current: 60, total: 100, message: 'Envoi des données au serveur...' });

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

      if (res.ok) {
        const result = await res.json();
        
        setImportProgress({ current: 90, total: 100, message: 'Stockage des identifiants...' });

        // Stocker les mots de passe générés dans localStorage
        const importedStudents = result.students || [];
        const passwordMap = {};
        importedStudents.forEach(student => {
          if (student.password !== '********') {
            passwordMap[student.id] = student.password;
          }
        });
        
        // Récupérer les mots de passe existants et les fusionner
        const existingPasswords = JSON.parse(localStorage.getItem('studentPasswords') || '{}');
        const updatedPasswords = { ...existingPasswords, ...passwordMap };
        localStorage.setItem('studentPasswords', JSON.stringify(updatedPasswords));
        
        const otherSchoolCount = result.otherSchoolCount || 0;
        const summary = result.summary || { 
          new: importedStudents.length, 
          existing: 0, 
          errors: 0, 
          otherSchool: otherSchoolCount,
          total: students.length 
        };
        
        console.log(`✓ ${summary.new} nouvel(s) élève(s) créé(s)`);
        console.log(`✓ ${summary.existing} élève(s) existaient déjà`);
        console.log(`⚠️ ${otherSchoolCount} élève(s) dans d'autres écoles (ignorés)`);
        console.log(`✓ Mots de passe stockés pour ${Object.keys(passwordMap).length} élève(s)`);
        
        setImportProgress({ current: 100, total: 100, message: 'Importation terminée !' });
        
        setTimeout(() => {
          let message = `📊 **Rapport d'importation**\n\n`;
          message += `✅ **${summary.new}** nouvel(s) élève(s) créé(s)\n`;
          if (summary.existing > 0) {
            message += `ℹ️ **${summary.existing}** élève(s) existaient déjà\n`;
          }
          if (otherSchoolCount > 0) {
            message += `⚠️ **${otherSchoolCount}** élève(s) appartiennent à une autre école (non importés)\n`;
          }
          if (summary.errors > 0) {
            message += `❌ **${summary.errors}** erreur(s)\n`;
          }
          message += `\n📋 **Total traité**: ${summary.total} élève(s)`;
          
          alert(message);
          setIsImporting(false);
          setImportProgress({ current: 0, total: 0, message: '' });
          e.target.value = '';
        }, 1000);
      } else {
        alert('Erreur lors de l\'import');
        setIsImporting(false);
      }
    } catch (error) {
      console.error('Error importing Excel:', error);
      alert('Erreur lors de la lecture du fichier Excel: ' + error.message);
      setIsImporting(false);
    }
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

          // Determine filiere based on class name or level name
          const combinedText = (className + ' ' + levelName).toLowerCase();
          
          // Sciences Expérimentales (SVT)
          if (combinedText.includes('علوم تجريبية') || combinedText.includes('sciences exp') || 
              combinedText.includes('sef') || combinedText.includes('svt')) {
            filiere = 'sciences_exp';
          }
          // Sciences Physiques (PC)
          else if (combinedText.includes('علوم فيزيائية') || combinedText.includes('sciences physiques') || 
                   combinedText.includes('spf') || combinedText.includes('pc')) {
            filiere = 'pc';
          }
          // Sciences Mathématiques
          else if (combinedText.includes('علوم رياضية') || combinedText.includes('sciences math') || 
                   combinedText.includes('sm') || combinedText.includes('math')) {
            filiere = 'sciences_math';
          }
          // Sciences Économiques
          else if (combinedText.includes('علوم اقتصادية') || combinedText.includes('économique') || 
                   combinedText.includes('eco') || combinedText.includes('se')) {
            filiere = 'sciences_eco';
          }
          // Lettres
          else if (combinedText.includes('آداب') || combinedText.includes('أدبي') || 
                   combinedText.includes('lettres') || combinedText.includes('la')) {
            filiere = 'lettres';
          }
          // Tronc Commun - no filiere needed
          else if (level === 'TC') {
            filiere = '';
          }
          // College - no filiere needed
          else if (schoolType === 'college') {
            filiere = '';
          }
          
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

            // Format 2: Separate first name and last name columns (الإسم and النسب)
            if (lastNameColIndex !== -1 && studentNameColIndex !== -1) {
              const firstNameCell = row[studentNameColIndex];
              const lastNameCell = row[lastNameColIndex];

              if (firstNameCell && typeof firstNameCell === 'string' && firstNameCell.trim() &&
                  !firstNameCell.includes('الإسم') && !firstNameCell.includes('اسم')) {
                firstName = firstNameCell.trim();
              }

              if (lastNameCell && typeof lastNameCell === 'string' && lastNameCell.trim() &&
                  !lastNameCell.includes('النسب') && !lastNameCell.includes('نسب')) {
                lastName = lastNameCell.trim();
              }
            }
            // Format 1: Full name in one column (إسم التلميذ)
            else if (studentNameColIndex !== -1) {
              const studentName = row[studentNameColIndex];

              if (studentName && typeof studentName === 'string' && studentName.trim() &&
                  !studentName.includes('إسم') && !studentName.includes('اسم')) {
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
    let aggStudents = 0, aggExisting = 0, aggReassigned = 0, aggOther = 0;

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
        (result.errors || []).forEach(e => aggErrors.push({ fileName: pc.className, error: e.reason || e.error || 'erreur' }));
      } catch (err) {
        console.error('Import classe', pc.className, err);
        aggErrors.push({ fileName: pc.className, error: err.message });
      }
    }

    localStorage.setItem('studentPasswords', JSON.stringify(storedPasswords));

    setBulkImportResult({
      message: `${aggClasses.length} classe(s) importée(s), ${aggStudents} nouvel(le)(s) élève(s)`,
      classes: aggClasses,
      totalStudents: aggStudents,
      summary: { new: aggStudents, existing: aggExisting, reassigned: aggReassigned, otherSchool: aggOther, errors: aggErrors.length },
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

  // Group classes by school_type → level → filiere
  const grouped = {};
  const uncategorized = [];

  classes.forEach(cls => {
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
      <div key={cls.id} className="border rounded-lg overflow-hidden bg-background">
        <div className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer"
          onClick={() => setExpandedClass(isExpanded ? null : cls.id)}>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{cls.name}</p>
            <p className="text-xs text-muted-foreground">
              {getLevelLabel(cls.level) || cls.level}
              {cls.filiere && ` · ${getFiliereLabel(cls.filiere)}`}
              {cls.academic_year && ` · ${cls.academic_year}`}
            </p>
            {classTeachers[cls.id]?.length > 0 && (
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 truncate">
                {classTeachers[cls.id].map(ct =>
                  ct.profiles ? `${ct.profiles.first_name} ${ct.profiles.last_name}` : ''
                ).filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
              {studentCount} élève(s)
            </span>
            <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
              {classTeachers[cls.id]?.length || 0} prof(s)
            </span>
            <button onClick={() => navigate(`/classes/${cls.id}/timetable`)} className="p-1 text-indigo-600 hover:bg-indigo-100 rounded" title="Emploi du temps">
              <Calendar className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => openEditClass(cls)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="Modifier">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => deleteClass(cls.id)} disabled={deletingClassId === cls.id}
              className="p-1 text-red-500 hover:bg-red-100 rounded" title="Supprimer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <div onClick={() => setExpandedClass(isExpanded ? null : cls.id)} className="cursor-pointer p-0.5">
              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
        </div>

        {/* Edit form */}
        {isEditing && (
          <div className="border-t px-3 py-2 bg-blue-50/50 dark:bg-blue-950/20">
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

        {/* Expanded details */}
        {isExpanded && (
          <div className="p-4 border-t space-y-4">
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
        )}
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Classes</h1>
          <div className="flex gap-3 mt-2 text-sm text-muted-foreground">
            <span>{classes.length} classe(s)</span>
            <span>·</span>
            <span>{classes.filter(c => normalizeSchoolType(c.school_type) === 'college').length} collège</span>
            <span>·</span>
            <span>{classes.filter(c => normalizeSchoolType(c.school_type) === 'lycee').length} lycée</span>
            {uncategorized.length > 0 && <><span>·</span><span className="text-orange-600">{uncategorized.length} non classifiée(s)</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileSpreadsheet className="w-5 h-5" />
            Importer des classes (Excel)
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Plus className="w-5 h-5" />
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
                    typeKey === 'college' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'
                  }`}>
                    <TypeIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold">{typeInfo.label}</h2>
                    <p className="text-sm text-muted-foreground">{typeClassCount} classe(s)</p>
                  </div>
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
                                        <div className="space-y-1.5 ml-2">
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
                                        <div className="space-y-1.5 ml-2">
                                          {filClasses.map(cls => renderClassCard(cls))}
                                        </div>
                                      </div>
                                    ))}
                                </>
                              ) : (
                                // No filieres: directly list classes
                                <div className="space-y-1.5">
                                  {Object.values(lvlFilieres).flat().map(cls => renderClassCard(cls))}
                                </div>
                              )}

                              {/* Classes without filiere in levels that have filieres */}
                              {lvlInfo.filieres.length > 0 && lvlFilieres['_none'] && lvlFilieres['_none'].length > 0 && (
                                <div className="mb-3">
                                  <p className="text-xs font-medium text-orange-500 uppercase tracking-wide mb-1.5 pl-2 border-l-2 border-orange-300">
                                    Sans filière ({lvlFilieres['_none'].length})
                                  </p>
                                  <div className="space-y-1.5 ml-2">
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
                            <div className="space-y-1.5">
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
                <div className="border-t px-4 pb-4 pt-2 space-y-1.5">
                  {uncategorized.map(cls => renderClassCard(cls))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default ClassesPage;
