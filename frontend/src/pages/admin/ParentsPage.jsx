import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Upload, Phone, UserPlus, X, Search, ChevronDown, ChevronUp, Link2, Unlink, Star, FileSpreadsheet, Download, Edit2, Key, Send, Copy, CheckCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import * as XLSX from 'xlsx';

// Validation stricte d'un mobile marocain (06/07) → +2126…/+2127… ou null.
// Le fichier officiel Massar met parfois une adresse dans la colonne téléphone.
const validMoroccoMobile = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('212')) d = '0' + d.slice(3);
  if (d.length === 9 && /^[67]/.test(d)) d = '0' + d;
  if (/^0[67][0-9]{8}$/.test(d)) return '+212' + d.slice(1);
  return null;
};

// Mappe le type de tutelle Massar (arabe) → libellé relation FR
const mapTutelle = (t) => {
  const s = String(t || '').trim();
  if (s.includes('أب')) return 'père';
  if (s.includes('أم')) return 'mère';
  if (s.includes('وصي')) return 'tuteur';
  return 'tuteur';
};

// Parse le fichier officiel Massar « Tuteur » (export_Tuteur_*.xlsx).
// Structure : en-tête sur 2 lignes, 3 blocs (Tuteur / Père / Mère), chacun avec
// nom AR+FR, profession, téléphone, adresse. L'élève est identifié par son code Massar.
// Renvoie un tableau de lignes { massar_code, student_full_name, parent_full_name,
// phone_1, relationship } (1 ligne par contact distinct), ou null si ce n'est pas ce format.
const parseMassarTuteur = (workbook) => {
  const sheet = workbook.Sheets['Tuteur'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return null;
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Repérer la ligne de sous-entête : celle qui contient au moins 2 cellules « الهاتف »
  let subIdx = -1;
  let phoneCols = [];
  for (let i = 0; i < Math.min(raw.length, 15); i++) {
    const cols = (raw[i] || []).map((c, j) => (String(c).trim() === 'الهاتف' ? j : -1)).filter(j => j !== -1);
    if (cols.length >= 2) { subIdx = i; phoneCols = cols; break; }
  }
  if (subIdx === -1) return null; // pas le format Massar Tuteur

  // Colonne du code Massar (« رقم التلميذ ») dans la ligne d'entête (subIdx-1)
  const headerRow = raw[subIdx - 1] || [];
  let codeCol = headerRow.findIndex(c => String(c).trim() === 'رقم التلميذ');
  if (codeCol === -1) codeCol = 2; // position standard
  const lastCol = codeCol + 1;  // النسب
  const firstCol = codeCol + 2; // الإسم
  const typeCol = codeCol + 3;  // نوع الوصاية

  // 3 blocs téléphone, dans l'ordre : Tuteur, Père, Mère
  const [tutPhoneCol, perePhoneCol, merePhoneCol] = phoneCols;
  const T = (r, c) => (c == null ? '' : String(r[c] || '').trim());
  // Pour un bloc, nom = FR si dispo (phoneCol-3 = prénom FR, phoneCol-2 = nom FR),
  // sinon AR (phoneCol-5 = prénom AR, phoneCol-4 = nom AR).
  const blockName = (r, phoneCol) => {
    const frFirst = T(r, phoneCol - 3), frLast = T(r, phoneCol - 2);
    const arFirst = T(r, phoneCol - 5), arLast = T(r, phoneCol - 4);
    const fr = `${frFirst} ${frLast}`.trim();
    const ar = `${arFirst} ${arLast}`.trim();
    return fr || ar;
  };

  const out = [];
  for (let i = subIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const massar = T(r, codeCol).toUpperCase();
    if (!massar) continue;
    const studentName = `${T(r, lastCol)} ${T(r, firstCol)}`.trim();

    // Candidats contacts : Père et Mère d'abord, puis Tuteur en repli (il duplique
    // souvent l'un des deux). Dédup par numéro.
    const seen = new Set();
    const pushContact = (phoneCol, relationship) => {
      const phone = validMoroccoMobile(T(r, phoneCol));
      if (!phone || seen.has(phone)) return;
      const name = blockName(r, phoneCol);
      if (!name) return;
      seen.add(phone);
      out.push({ massar_code: massar, student_full_name: studentName, parent_full_name: name, phone_1: phone, relationship });
    };
    pushContact(perePhoneCol, 'père');
    pushContact(merePhoneCol, 'mère');
    pushContact(tutPhoneCol, mapTutelle(T(r, typeCol)));
  }

  return out;
};

const ParentsPage = () => {
  const [parents, setParents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedParent, setExpandedParent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('');

  // Create parent form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ parent_full_name: '', phone_1: '', email: '' });
  const [creating, setCreating] = useState(false);

  // Link student
  const [linkingParentId, setLinkingParentId] = useState(null);
  const [linkStudentId, setLinkStudentId] = useState('');
  const [linkRelationship, setLinkRelationship] = useState('');
  const [linkSearch, setLinkSearch] = useState('');
  const [linkClassFilter, setLinkClassFilter] = useState('');

  // Edit parent
  const [editingParent, setEditingParent] = useState(null);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);

  // Add contact
  const [addingContactParentId, setAddingContactParentId] = useState(null);
  const [newContactPhone, setNewContactPhone] = useState('');

  // Credentials modal
  const [credentialsModal, setCredentialsModal] = useState(null); // { email, password, first_name, last_name, parent_id }
  const [generatingCreds, setGeneratingCreds] = useState(null); // parentId currently generating
  const [copied, setCopied] = useState(false);

  // Bulk send credentials
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedParents, setSelectedParents] = useState(new Set());
  const [bulkSending, setBulkSending] = useState(false);

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importClassId, setImportClassId] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      const [parentsRes, classesRes, studentsRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/parents`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/classes`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/students`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const parentsData = await parentsRes.json();
      const classesData = await classesRes.json();
      const studentsData = await studentsRes.json();

      setParents(Array.isArray(parentsData) ? parentsData : []);
      setClasses(Array.isArray(classesData) ? classesData : []);
      setStudents(Array.isArray(studentsData) ? studentsData : []);
    } catch (error) {
      console.error('Error fetching parents data:', error);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- CREATE PARENT ----
  const handleCreateParent = async (e) => {
    e.preventDefault();
    if (!createForm.parent_full_name.trim()) return;
    setCreating(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });
      if (res.ok) {
        const created = await res.json();
        setCreateForm({ parent_full_name: '', phone_1: '', email: '' });
        setShowCreateForm(false);
        await fetchData();
        if (created?.password && created?.email) {
          setCredentialsModal({
            parent_id: created.id,
            email: created.email,
            password: created.password,
            first_name: created.first_name,
            last_name: created.last_name,
          });
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Erreur création parent');
      }
    } catch (error) {
      console.error('Error creating parent:', error);
      alert('Erreur création parent');
    } finally {
      setCreating(false);
    }
  };

  // ---- EDIT PARENT ----
  const openEditParent = (parent) => {
    setEditingParent(parent.id);
    setEditForm({
      first_name: parent.first_name || '',
      last_name: parent.last_name || '',
      phone: parent.phone || '',
      email: parent.email || ''
    });
  };

  const handleEditParent = async (e) => {
    e.preventDefault();
    if (!editingParent) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/${editingParent}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      if (res.ok) {
        setEditingParent(null);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Erreur modification');
      }
    } catch (error) {
      console.error('Error editing parent:', error);
      alert('Erreur modification parent');
    } finally {
      setSaving(false);
    }
  };

  // ---- DELETE PARENT ----
  const handleDeleteParent = async (parentId, parentName) => {
    if (!confirm(`Supprimer le parent "${parentName}" et toutes ses associations ?`)) return;
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/${parentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Erreur suppression');
      }
    } catch (error) {
      console.error('Error deleting parent:', error);
      alert('Erreur suppression parent');
    }
  };

  // ---- LINK STUDENT ----
  const handleLinkStudent = async (parentId) => {
    if (!linkStudentId) return;
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/${parentId}/link`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: linkStudentId, relationship: linkRelationship || null })
      });
      if (res.ok) {
        setLinkingParentId(null);
        setLinkStudentId('');
        setLinkRelationship('');
        setLinkSearch('');
        setLinkClassFilter('');
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Erreur association');
      }
    } catch (error) {
      console.error('Error linking student:', error);
    }
  };

  // ---- UNLINK STUDENT ----
  const handleUnlinkStudent = async (parentId, studentId) => {
    if (!confirm('Supprimer cette association parent-élève ?')) return;
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/api/admin/parents/${parentId}/unlink/${studentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      await fetchData();
    } catch (error) {
      console.error('Error unlinking student:', error);
    }
  };

  // ---- ADD CONTACT ----
  const handleAddContact = async (parentId) => {
    if (!newContactPhone.trim()) return;
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/${parentId}/contacts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: newContactPhone, channel: 'whatsapp' })
      });
      if (res.ok) {
        setAddingContactParentId(null);
        setNewContactPhone('');
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Erreur ajout contact');
      }
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  };

  // ---- SET PRIMARY CONTACT ----
  const handleSetPrimary = async (parentId, contactId) => {
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/api/admin/parents/${parentId}/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true })
      });
      await fetchData();
    } catch (error) {
      console.error('Error setting primary:', error);
    }
  };

  // ---- DELETE CONTACT ----
  const handleDeleteContact = async (parentId, contactId) => {
    if (!confirm('Supprimer ce numéro de contact ?')) return;
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/api/admin/parents/${parentId}/contacts/${contactId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      await fetchData();
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  };

  // ---- IMPORT EXCEL ----
  const handleImportFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      // 1) Tenter d'abord le format OFFICIEL Massar « Tuteur » (export_Tuteur_*.xlsx).
      //    Si détecté, on extrait directement code Massar + père/mère/tuteur + téléphones.
      const massarRows = parseMassarTuteur(workbook);
      if (massarRows && massarRows.length > 0) {
        setImportPreview({ rows: massarRows, source: 'massar' });
        return;
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // Find header row: look for columns containing student name, parent name, phone
      let headerRowIndex = -1;
      let colStudentName = -1;
      let colParentName = -1;
      let colPhone = -1;
      let colRelationship = -1;

      for (let i = 0; i < Math.min(rawData.length, 20); i++) {
        const row = rawData[i];
        if (!row) continue;

        // Reset per row
        let tmpStudent = -1, tmpParent = -1, tmpPhone = -1, tmpRelation = -1;

        for (let j = 0; j < row.length; j++) {
          const raw = String(row[j] || '').trim();
          const cell = raw.toLowerCase();
          if (!cell) continue;

          // Exact matches for our template headers (highest priority)
          if (cell === 'nom complet élève' || cell === 'nom complet eleve') {
            tmpStudent = j; continue;
          }
          if (cell === 'nom complet parent') {
            tmpParent = j; continue;
          }
          if (cell === 'téléphone' || cell === 'telephone') {
            tmpPhone = j; continue;
          }
          if (cell.startsWith('relation')) {
            tmpRelation = j; continue;
          }

          // Keyword fallback (order matters: check relation first to avoid père/mère matching parent)
          if (tmpRelation === -1 && (cell.includes('relation') || cell.includes('lien') || cell.includes('صلة'))) {
            tmpRelation = j;
          } else if (tmpPhone === -1 && (cell.includes('téléphone') || cell.includes('telephone') || cell.includes('phone') || cell.includes('هاتف') || cell.includes('whatsapp'))) {
            tmpPhone = j;
          } else if (tmpStudent === -1 && (cell.includes('élève') || cell.includes('eleve') || cell.includes('etudiant') || cell.includes('étudiant') || cell.includes('student') || cell.includes('التلميذ'))) {
            tmpStudent = j;
          } else if (tmpParent === -1 && (cell.includes('parent') || cell.includes('الولي'))) {
            tmpParent = j;
          }
        }

        if (tmpStudent !== -1 && tmpParent !== -1 && tmpPhone !== -1) {
          headerRowIndex = i;
          colStudentName = tmpStudent;
          colParentName = tmpParent;
          colPhone = tmpPhone;
          colRelationship = tmpRelation;
          break;
        }
      }

      if (headerRowIndex === -1) {
        alert('En-tête non trouvé. Le fichier doit contenir des colonnes: Élève (nom complet), Parent (nom), Téléphone.');
        setImportFile(null);
        return;
      }

      const rows = [];
      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row) continue;

        const studentName = String(row[colStudentName] || '').trim();
        const parentName = String(row[colParentName] || '').trim();
        const phone = String(row[colPhone] || '').trim();
        const relationship = colRelationship !== -1 ? String(row[colRelationship] || '').trim() : '';

        if (studentName && parentName && phone) {
          rows.push({
            student_full_name: studentName,
            parent_full_name: parentName,
            phone_1: phone,
            relationship: relationship || undefined
          });
        }
      }

      if (rows.length === 0) {
        alert('Aucune ligne valide trouvée dans le fichier.');
        setImportFile(null);
        return;
      }

      setImportPreview({ rows, headerRowIndex, colStudentName, colParentName, colPhone });
    } catch (error) {
      console.error('Error reading Excel:', error);
      alert('Erreur lecture du fichier Excel');
      setImportFile(null);
    }
  };

  const handleExportTemplate = () => {
    const selectedClass = classes.find(c => c.id === importClassId);
    const className = selectedClass ? selectedClass.name : 'classe';

    // Get students for the selected class
    const classStudents = importClassId
      ? students.filter(s => s.class_id === importClassId)
      : [];

    // Build rows: pre-fill student names, leave parent columns empty
    const header = ['Nom complet élève', 'Nom complet parent', 'Téléphone', 'Relation (père/mère/tuteur)'];
    const rows = classStudents.length > 0
      ? classStudents.map(s => [`${s.last_name || ''} ${s.first_name || ''}`.trim(), '', '', ''])
      : [['', '', '', '']];

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

    // Column widths
    ws['!cols'] = [
      { wch: 30 },
      { wch: 30 },
      { wch: 18 },
      { wch: 25 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parents');
    XLSX.writeFile(wb, `modele_parents_${className.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleImportDryRun = async () => {
    if (!importClassId || !importPreview?.rows?.length) return;
    setImporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: importClassId, rows: importPreview.rows, dryRun: true })
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
      } else {
        alert(data.error || 'Erreur dry run');
      }
    } catch (error) {
      console.error('Error dry run:', error);
      alert('Erreur dry run');
    } finally {
      setImporting(false);
    }
  };

  const handleImportCommit = async () => {
    if (!importClassId || !importPreview?.rows?.length) return;
    if (!confirm('Confirmer l\'import ? Les parents seront créés et associés aux élèves.')) return;
    setImporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: importClassId, rows: importPreview.rows, dryRun: false })
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        alert(`Import terminé : ${data.commitsCount || 0} association(s) créée(s).`);
        setShowImport(false);
        setImportFile(null);
        setImportPreview(null);
        setImportResult(null);
        setImportClassId('');
        await fetchData();
      } else {
        alert(data.error || 'Erreur import');
      }
    } catch (error) {
      console.error('Error import commit:', error);
      alert('Erreur import');
    } finally {
      setImporting(false);
    }
  };

  // ---- CREATE / RESET CREDENTIALS (single parent) ----
  const handleCreateCredentials = async (parent, force = false) => {
    setGeneratingCreds(parent.id);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/${parent.id}/create-credentials`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erreur génération identifiants');
        return;
      }
      setCredentialsModal({
        parent_id: parent.id,
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
      });
      await fetchData();
    } catch (e) {
      console.error(e);
      alert('Erreur génération identifiants');
    } finally {
      setGeneratingCreds(null);
    }
  };

  // ---- COPY CREDENTIALS ----
  const copyCredentials = async () => {
    if (!credentialsModal) return;
    const text = `Login : ${credentialsModal.email}\nMot de passe : ${credentialsModal.password}\nLien : https://etrack.ma/login`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // ---- SEND CREDENTIALS WHATSAPP (single) ----
  const sendCredentialsWhatsApp = async (parentId) => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/send-credentials-whatsapp`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_ids: [parentId] }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erreur envoi WhatsApp');
        return;
      }
      alert(data.message || 'Identifiants envoyés');
      setCredentialsModal(null);
      await fetchData();
    } catch (e) {
      console.error(e);
      alert('Erreur envoi WhatsApp');
    }
  };

  // ---- BULK SEND CREDENTIALS ----
  const handleBulkSend = async (mode /* 'all' | 'selected' */) => {
    const ids = mode === 'all' ? null : Array.from(selectedParents);
    if (mode === 'selected' && ids.length === 0) {
      alert('Sélectionnez au moins un parent');
      return;
    }
    const label = mode === 'all' ? 'TOUS les parents' : `${ids.length} parent(s) sélectionné(s)`;
    if (!confirm(`Envoyer (et régénérer) les identifiants par WhatsApp à ${label} ?`)) return;
    setBulkSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/send-credentials-whatsapp`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'all' ? { all: true } : { parent_ids: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erreur envoi en masse');
        return;
      }
      alert(`${data.message}\n${data.errors > 0 ? `Échecs : ${data.errors}` : ''}`);
      setBulkMode(false);
      setSelectedParents(new Set());
      await fetchData();
    } catch (e) {
      console.error(e);
      alert('Erreur envoi en masse');
    } finally {
      setBulkSending(false);
    }
  };

  const toggleSelectParent = (parentId) => {
    setSelectedParents(prev => {
      const n = new Set(prev);
      if (n.has(parentId)) n.delete(parentId); else n.add(parentId);
      return n;
    });
  };

  // ---- FILTER ----
  const filteredParents = parents.filter(p => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
    const phone = (p.phone || '').toLowerCase();
    const matchSearch = !searchTerm || name.includes(searchTerm.toLowerCase()) || phone.includes(searchTerm.toLowerCase());

    const matchClass = !filterClass || (p.children || []).some(c => c.class?.name === filterClass);

    return matchSearch && matchClass;
  });

  // Options de classes : TOUTES les classes (pas seulement celles ayant déjà un parent),
  // pour pouvoir repérer les classes sans aucun parent. Triées par niveau puis nom.
  const classOptions = [...classes]
    .filter(c => c?.name)
    .sort((a, b) => String(a.level || '').localeCompare(String(b.level || '')) || a.name.localeCompare(b.name));

  // Map élève → parents liés (pour savoir qui a un parent / un numéro)
  const studentParentMap = new Map();
  parents.forEach(p => (p.children || []).forEach(c => {
    if (!c?.id) return;
    if (!studentParentMap.has(c.id)) studentParentMap.set(c.id, []);
    studentParentMap.get(c.id).push(p);
  }));

  // Élèves dans le périmètre (classe filtrée par nom, ou tous)
  const filterClassIds = filterClass
    ? new Set(classes.filter(c => c.name === filterClass).map(c => c.id))
    : null;
  const scopedStudents = students.filter(s => !filterClassIds || filterClassIds.has(s.class_id));

  // Statistiques de couverture parents/numéros
  const stats = scopedStudents.reduce((acc, s) => {
    const linked = studentParentMap.get(s.id) || [];
    const hasParent = linked.length > 0;
    const hasPhone = linked.some(p => (p.contacts || []).length > 0 || p.phone);
    acc.total += 1;
    if (hasParent) acc.withParent += 1; else acc.withoutParent += 1;
    if (hasPhone) acc.withPhone += 1; else acc.withoutPhone += 1;
    return acc;
  }, { total: 0, withParent: 0, withoutParent: 0, withPhone: 0, withoutPhone: 0 });
  const pct = (n) => stats.total ? Math.round((n / stats.total) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Parents</h1>
          <p className="text-muted-foreground">{parents.length} parent(s) enregistré(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setBulkMode(!bulkMode); setSelectedParents(new Set()); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${bulkMode ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}
          >
            <CheckCheck className="w-4 h-4" />
            {bulkMode ? `${selectedParents.size} sélectionné(s)` : 'Sélection multiple'}
          </button>
          {bulkMode && (
            <button
              onClick={() => handleBulkSend('selected')}
              disabled={bulkSending || selectedParents.size === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {bulkSending ? 'Envoi…' : `Envoyer ID (${selectedParents.size})`}
            </button>
          )}
          <button
            onClick={() => handleBulkSend('all')}
            disabled={bulkSending}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            title="Régénérer + envoyer les identifiants à tous les parents"
          >
            <Send className="w-4 h-4" />
            {bulkSending ? 'Envoi…' : 'Envoyer ID à tous'}
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importer Excel
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ajouter un parent
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nouveau parent</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateParent} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Nom complet du parent"
                value={createForm.parent_full_name}
                onChange={e => setCreateForm(f => ({ ...f, parent_full_name: e.target.value }))}
                className="px-3 py-2 border rounded-lg bg-background"
                required
              />
              <input
                type="text"
                placeholder="Téléphone (ex: 0612345678)"
                value={createForm.phone_1}
                onChange={e => setCreateForm(f => ({ ...f, phone_1: e.target.value }))}
                className="px-3 py-2 border rounded-lg bg-background"
              />
              <input
                type="email"
                placeholder="Email (optionnel)"
                value={createForm.email}
                onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                className="px-3 py-2 border rounded-lg bg-background"
              />
              <div className="sm:col-span-3 flex gap-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? 'Création...' : 'Créer'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-accent"
                >
                  Annuler
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Import Section */}
      {showImport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Importer des parents depuis Excel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Le fichier Excel doit contenir les colonnes : <strong>Élève</strong> (nom complet), <strong>Parent</strong> (nom), <strong>Téléphone</strong>.
              Une colonne <strong>Relation</strong> (père/mère/tuteur) est optionnelle.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Classe *</label>
                <select
                  value={importClassId}
                  onChange={e => { setImportClassId(e.target.value); setImportPreview(null); setImportResult(null); }}
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                >
                  <option value="">-- Sélectionner une classe --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.level})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fichier Excel *</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFileChange}
                  className="w-full px-3 py-2 border rounded-lg bg-background"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Download className="w-5 h-5 text-blue-600 shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-300">Modèle Excel</p>
                <p className="text-blue-600 dark:text-blue-400">Téléchargez le modèle pré-rempli avec les noms des élèves de la classe sélectionnée.</p>
              </div>
              <button
                onClick={handleExportTemplate}
                disabled={!importClassId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Télécharger le modèle
              </button>
            </div>

            {importPreview && (
              <div className="border rounded-lg p-4 space-y-3">
                <p className="font-medium">{importPreview.rows.length} ligne(s) détectée(s)</p>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1 px-2">#</th>
                        <th className="text-left py-1 px-2">Élève</th>
                        <th className="text-left py-1 px-2">Parent</th>
                        <th className="text-left py-1 px-2">Relation</th>
                        <th className="text-left py-1 px-2">Téléphone</th>
                        {importResult && <th className="text-left py-1 px-2">Statut</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((row, idx) => {
                        const result = importResult?.results?.[idx];
                        return (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="py-1 px-2 text-muted-foreground">{idx + 1}</td>
                            <td className="py-1 px-2">{row.student_full_name}</td>
                            <td className="py-1 px-2">{row.parent_full_name}</td>
                            <td className="py-1 px-2 capitalize">{row.relationship || '—'}</td>
                            <td className="py-1 px-2">{row.phone_1}</td>
                            {result && (
                              <td className="py-1 px-2">
                                {result.matchStatus === 'matched' && (
                                  <span className="text-green-600 font-medium">
                                    ✓ {result.student.first_name} {result.student.last_name}
                                  </span>
                                )}
                                {result.matchStatus === 'not_found' && (
                                  <span className="text-red-500 font-medium">✗ Non trouvé</span>
                                )}
                                {result.matchStatus === 'ambiguous' && (
                                  <span className="text-yellow-600 font-medium">⚠ Ambigu</span>
                                )}
                                {result.matchStatus === 'invalid' && (
                                  <span className="text-gray-400">— Invalide</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {importResult && (
                  <div className="text-sm space-y-1">
                    <p className="text-green-600">✓ Correspondances : {importResult.results.filter(r => r.matchStatus === 'matched').length}</p>
                    <p className="text-red-500">✗ Non trouvés : {importResult.results.filter(r => r.matchStatus === 'not_found').length}</p>
                    <p className="text-yellow-600">⚠ Ambigus : {importResult.results.filter(r => r.matchStatus === 'ambiguous').length}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {!importResult && (
                    <button
                      onClick={handleImportDryRun}
                      disabled={importing || !importClassId}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {importing ? 'Vérification...' : 'Vérifier les correspondances'}
                    </button>
                  )}
                  {importResult?.dryRun && importResult.results.some(r => r.matchStatus === 'matched') && (
                    <button
                      onClick={handleImportCommit}
                      disabled={importing}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {importing ? 'Import en cours...' : `Confirmer l'import (${importResult.results.filter(r => r.matchStatus === 'matched').length} parent(s))`}
                    </button>
                  )}
                  <button
                    onClick={() => { setImportPreview(null); setImportResult(null); setImportFile(null); }}
                    className="px-4 py-2 border rounded-lg hover:bg-accent"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher par nom ou téléphone..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background"
          />
        </div>
        {classOptions.length > 0 && (
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-background"
          >
            <option value="">Toutes les classes</option>
            {classOptions.map(c => (
              <option key={c.id} value={c.name}>{c.name}{c.level ? ` · ${c.level}` : ''}</option>
            ))}
          </select>
        )}
      </div>

      {/* Statistiques de couverture (globales ou pour la classe filtrée) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Élèves{filterClass ? ` · ${filterClass}` : ''}</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Avec parent</p>
          <p className="text-2xl font-bold text-green-600">{stats.withParent}</p>
          <p className="text-xs text-muted-foreground">{pct(stats.withParent)}%</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Sans parent</p>
          <p className="text-2xl font-bold text-red-500">{stats.withoutParent}</p>
          <p className="text-xs text-muted-foreground">{pct(stats.withoutParent)}%</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Avec numéro</p>
          <p className="text-2xl font-bold text-green-600">{stats.withPhone}</p>
          <p className="text-xs text-muted-foreground">{pct(stats.withPhone)}%</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Sans numéro</p>
          <p className="text-2xl font-bold text-amber-500">{stats.withoutPhone}</p>
          <p className="text-xs text-muted-foreground">{pct(stats.withoutPhone)}%</p>
        </div>
      </div>

      {/* Parents List */}
      {filteredParents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {parents.length === 0
              ? 'Aucun parent enregistré. Utilisez le bouton "Ajouter" ou "Importer Excel" pour commencer.'
              : 'Aucun parent ne correspond aux filtres.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredParents.map(parent => {
            const isExpanded = expandedParent === parent.id;
            const childrenList = parent.children || [];
            const contactsList = parent.contacts || [];
            const primaryContact = contactsList.find(c => c.is_primary);

            return (
              <Card key={parent.id} className="overflow-hidden">
                {/* Parent Row */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => setExpandedParent(isExpanded ? null : parent.id)}
                >
                  {bulkMode && (
                    <input
                      type="checkbox"
                      checked={selectedParents.has(parent.id)}
                      onChange={() => toggleSelectParent(parent.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 shrink-0"
                    />
                  )}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {(parent.first_name?.[0] || '').toUpperCase()}{(parent.last_name?.[0] || '').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {parent.first_name} {parent.last_name}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {primaryContact && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {primaryContact.phone_e164}
                        </span>
                      )}
                      {parent.email && !parent.email.endsWith('@parents.local') && !parent.email.startsWith('parent_') ? (
                        <span className="text-xs text-emerald-700 truncate" title="Login actif">🔐 {parent.email}</span>
                      ) : (
                        <span className="text-xs text-orange-600">⚠️ Pas de login</span>
                      )}
                      {childrenList.length > 0 && (
                        <span>{childrenList.length} enfant(s)</span>
                      )}
                      {parent.classes?.length > 0 && (
                        <span className="flex gap-1">
                          {parent.classes.map(c => (
                            <span key={c.name} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{c.name}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleCreateCredentials(parent, false)}
                      disabled={generatingCreds === parent.id}
                      className="p-1.5 text-purple-600 hover:bg-purple-100 rounded transition-colors disabled:opacity-50"
                      title="Créer / Réinitialiser le login"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditParent(parent)}
                      className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                      title="Modifier"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteParent(parent.id, `${parent.first_name} ${parent.last_name}`)}
                      className="p-1.5 text-red-500 hover:bg-red-100 rounded transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </div>

                {/* Edit Form */}
                {editingParent === parent.id && (
                  <div className="border-t px-4 py-3 bg-blue-50/50 dark:bg-blue-950/20">
                    <form onSubmit={handleEditParent} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1 text-muted-foreground">Prénom</label>
                        <input
                          type="text"
                          value={editForm.first_name}
                          onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                          className="w-full px-3 py-1.5 border rounded-lg bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-muted-foreground">Nom</label>
                        <input
                          type="text"
                          value={editForm.last_name}
                          onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                          className="w-full px-3 py-1.5 border rounded-lg bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-muted-foreground">Téléphone</label>
                        <input
                          type="text"
                          value={editForm.phone}
                          onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                          className="w-full px-3 py-1.5 border rounded-lg bg-background text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-muted-foreground">Email</label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                          className="w-full px-3 py-1.5 border rounded-lg bg-background text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
                        <button
                          type="submit"
                          disabled={saving}
                          className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 disabled:opacity-50"
                        >
                          {saving ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingParent(null)}
                          className="px-4 py-1.5 border rounded-lg text-sm hover:bg-accent"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4 space-y-4">
                    {/* Children */}
                    <div className="pt-4">
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Link2 className="w-4 h-4" />
                        Enfants associés
                      </h4>
                      {childrenList.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucun enfant associé</p>
                      ) : (
                        <div className="space-y-1">
                          {childrenList.map(child => (
                            <div key={child.id} className="flex items-center justify-between py-1.5 px-3 bg-accent/30 rounded-lg">
                              <div className="text-sm">
                                <span className="font-medium">{child.first_name} {child.last_name}</span>
                                {child.class && <span className="ml-2 text-muted-foreground">({child.class.name})</span>}
                                {child.relationship && <span className="ml-2 text-xs text-purple-600">— {child.relationship}</span>}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleUnlinkStudent(parent.id, child.id); }}
                                className="p-1 text-red-500 hover:bg-red-100 rounded"
                                title="Dissocier"
                              >
                                <Unlink className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Link student form */}
                      {linkingParentId === parent.id ? (
                        <div className="mt-3 border rounded-xl bg-background shadow-sm overflow-hidden">
                          {/* Header */}
                          <div className="px-3 py-2.5 bg-primary/5 border-b flex items-center justify-between">
                            <span className="text-sm font-semibold text-primary flex items-center gap-1.5">
                              <UserPlus className="w-4 h-4" />
                              Associer un élève
                            </span>
                            <button
                              onClick={() => { setLinkingParentId(null); setLinkStudentId(''); setLinkRelationship(''); setLinkSearch(''); setLinkClassFilter(''); }}
                              className="p-1 rounded hover:bg-accent text-muted-foreground"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Filters */}
                          <div className="px-3 pt-3 pb-2 flex gap-2 flex-wrap">
                            <div className="relative flex-1 min-w-[160px]">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                              <input
                                autoFocus
                                type="text"
                                placeholder="Nom ou prénom..."
                                value={linkSearch}
                                onChange={e => setLinkSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                            </div>
                            <select
                              value={linkClassFilter}
                              onChange={e => setLinkClassFilter(e.target.value)}
                              className="px-2 py-1.5 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="">Toutes les classes</option>
                              {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Student list */}
                          {(() => {
                            const q = linkSearch.trim().toLowerCase();
                            const filtered = students
                              .filter(s => !childrenList.some(c => c.id === s.id))
                              .filter(s => !linkClassFilter || s.class_id === linkClassFilter)
                              .filter(s => !q || `${s.first_name} ${s.last_name}`.toLowerCase().includes(q));

                            const grouped = {};
                            filtered.forEach(s => {
                              const cls = classes.find(c => c.id === s.class_id);
                              const key = cls ? cls.name : 'Sans classe';
                              if (!grouped[key]) grouped[key] = [];
                              grouped[key].push({ ...s, _cls: cls });
                            });

                            const avatarColors = ['bg-blue-100 text-blue-700','bg-purple-100 text-purple-700','bg-green-100 text-green-700','bg-orange-100 text-orange-700','bg-pink-100 text-pink-700','bg-teal-100 text-teal-700'];
                            const colorFor = (name) => {
                              let h = 0;
                              for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
                              return avatarColors[Math.abs(h) % avatarColors.length];
                            };

                            const highlight = (text) => {
                              if (!q) return text;
                              const idx = text.toLowerCase().indexOf(q);
                              if (idx === -1) return text;
                              return <>{text.slice(0,idx)}<mark className="bg-yellow-200 rounded px-0.5">{text.slice(idx, idx+q.length)}</mark>{text.slice(idx+q.length)}</>;
                            };

                            return filtered.length === 0 ? (
                              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                                <Search className="w-6 h-6 mx-auto mb-2 opacity-30" />
                                Aucun élève trouvé
                              </div>
                            ) : (
                              <div className="max-h-52 overflow-y-auto px-2 pb-2 divide-y">
                                {Object.entries(grouped).map(([clsName, slist]) => (
                                  <div key={clsName}>
                                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-background/95 backdrop-blur-sm">
                                      {clsName} <span className="font-normal text-xs">({slist.length})</span>
                                    </div>
                                    {slist.map(s => {
                                      const initials = `${s.first_name?.[0] || ''}${s.last_name?.[0] || ''}`.toUpperCase();
                                      const color = colorFor(`${s.first_name}${s.last_name}`);
                                      const isSelected = linkStudentId === s.id;
                                      return (
                                        <button
                                          key={s.id}
                                          type="button"
                                          onClick={() => setLinkStudentId(isSelected ? '' : s.id)}
                                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                                            isSelected
                                              ? 'bg-primary text-primary-foreground'
                                              : 'hover:bg-accent'
                                          }`}
                                        >
                                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                            isSelected ? 'bg-white/20 text-white' : color
                                          }`}>
                                            {initials}
                                          </span>
                                          <span className="flex-1 font-medium">
                                            {highlight(`${s.first_name} ${s.last_name}`)}
                                          </span>
                                          {isSelected && (
                                            <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">✓ Sélectionné</span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Footer actions */}
                          <div className="px-3 py-2.5 border-t bg-muted/20 flex items-center gap-2 flex-wrap">
                            <select
                              value={linkRelationship}
                              onChange={e => setLinkRelationship(e.target.value)}
                              className="px-2 py-1.5 border rounded-lg text-sm bg-background flex-1 min-w-[120px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="">Relation...</option>
                              <option value="père">Père</option>
                              <option value="mère">Mère</option>
                              <option value="tuteur">Tuteur</option>
                            </select>
                            <button
                              onClick={() => handleLinkStudent(parent.id)}
                              disabled={!linkStudentId}
                              className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-1.5"
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              Associer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setLinkingParentId(parent.id)}
                          className="flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
                        >
                          <UserPlus className="w-4 h-4" />
                          Associer un élève
                        </button>
                      )}
                    </div>

                    {/* Contacts */}
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Contacts WhatsApp
                      </h4>
                      {contactsList.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucun contact</p>
                      ) : (
                        <div className="space-y-1">
                          {contactsList.map(contact => (
                            <div key={contact.id} className="flex items-center justify-between py-1.5 px-3 bg-accent/30 rounded-lg">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="font-mono">{contact.phone_e164}</span>
                                {contact.is_primary && (
                                  <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs flex items-center gap-1">
                                    <Star className="w-3 h-3" /> Principal
                                  </span>
                                )}
                                <span className={`px-1.5 py-0.5 rounded text-xs ${
                                  contact.consent_status === 'opted_in' ? 'bg-green-100 text-green-700' :
                                  contact.consent_status === 'opted_out' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {contact.consent_status === 'opted_in' ? 'Accepté' :
                                   contact.consent_status === 'opted_out' ? 'Refusé' : 'En attente'}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                {!contact.is_primary && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleSetPrimary(parent.id, contact.id); }}
                                    className="p-1 text-yellow-600 hover:bg-yellow-100 rounded"
                                    title="Définir comme principal"
                                  >
                                    <Star className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteContact(parent.id, contact.id); }}
                                  className="p-1 text-red-500 hover:bg-red-100 rounded"
                                  title="Supprimer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add contact form */}
                      {addingContactParentId === parent.id ? (
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            placeholder="Numéro (ex: 0612345678)"
                            value={newContactPhone}
                            onChange={e => setNewContactPhone(e.target.value)}
                            className="px-2 py-1.5 border rounded-lg bg-background text-sm flex-1"
                          />
                          <button
                            onClick={() => handleAddContact(parent.id)}
                            disabled={!newContactPhone.trim()}
                            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50"
                          >
                            Ajouter
                          </button>
                          <button
                            onClick={() => { setAddingContactParentId(null); setNewContactPhone(''); }}
                            className="px-3 py-1.5 border rounded-lg text-sm hover:bg-accent"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingContactParentId(parent.id)}
                          className="flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
                        >
                          <Plus className="w-4 h-4" />
                          Ajouter un numéro
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Credentials Modal */}
      {credentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCredentialsModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Key className="w-5 h-5 text-purple-600" />
                Identifiants générés
              </h2>
              <button onClick={() => setCredentialsModal(null)} className="text-gray-500 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Identifiants de <strong>{credentialsModal.first_name} {credentialsModal.last_name}</strong> :
            </p>

            <div className="space-y-3 mb-4">
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                <p className="text-xs uppercase font-semibold text-gray-500 mb-1">Login (email)</p>
                <p className="font-mono text-sm break-all">{credentialsModal.email}</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                <p className="text-xs uppercase font-semibold text-gray-500 mb-1">Mot de passe</p>
                <p className="font-mono text-base font-bold">{credentialsModal.password}</p>
              </div>
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-xs text-blue-800 dark:text-blue-300">
                ⚠️ Ce mot de passe ne sera plus affiché. Copiez-le ou envoyez-le maintenant.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyCredentials}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {copied ? <CheckCheck className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
              <button
                onClick={() => sendCredentialsWhatsApp(credentialsModal.parent_id)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                <Send className="w-4 h-4" />
                Envoyer WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentsPage;
