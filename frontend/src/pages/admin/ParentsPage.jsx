import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Upload, Phone, UserPlus, X, Search, ChevronDown, ChevronUp, Link2, Unlink, Star, FileSpreadsheet, Download, Edit2, Key, Send, Copy, CheckCheck } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Avatar, ChannelBadge, ParentCard, DetailDrawer } from '../../components/directory/ui';
import { useYear } from '../../contexts/YearContext';
import { enrollmentsApi } from '../../lib/enrollmentsApi';
import * as XLSX from 'xlsx';

// Libellés lisibles des filières (lycée). Sert au filtre « Filière » de la page Parents.
const FILIERE_LABELS = {
  tc_sciences: 'TC Sciences', tc_lettres: 'TC Lettres', tc_tech: 'TC Technologique',
  sciences_exp: 'Sciences Expérimentales', sciences_math: 'Sciences Mathématiques',
  sciences_eco: 'Sciences Éco. et Gestion', ste: 'Sciences et Tech. Électriques',
  stm: 'Sciences et Tech. Mécaniques', lettres: 'Lettres et Sciences Humaines',
  svt: 'SVT', pc: 'Sciences Physiques (PC)', sciences_math_a: 'Sciences Math A',
  sciences_math_b: 'Sciences Math B', eco: 'Sciences Économiques',
  sciences_gestion: 'Sciences de Gestion Comptable', sciences_humaines: 'Sciences Humaines',
};
const filiereLabel = (v) => FILIERE_LABELS[v] || v || '';

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

  // Nom de la classe (« القسم : 1APIC-1 ») dans les lignes d'en-tête du fichier
  let className = null;
  for (let i = 0; i < subIdx; i++) {
    const row = raw[i] || [];
    const idx = row.findIndex(c => String(c).includes('القسم'));
    if (idx === -1) continue;
    for (let j = idx + 1; j < row.length; j++) {
      const v = String(row[j] || '').trim();
      if (v) { className = v; break; }
    }
    if (className) break;
  }

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

    // Père / Mère / Tuteur du même élève → UN SEUL parent (la famille), avec tous
    // les numéros regroupés dans `contacts`. Dédup par numéro. Le Tuteur duplique
    // souvent l'un des deux : il est ajouté en dernier (ignoré si numéro déjà vu).
    const seen = new Set();
    const contacts = [];
    const pushContact = (phoneCol, relationship) => {
      const phone = validMoroccoMobile(T(r, phoneCol));
      if (!phone || seen.has(phone)) return;
      const name = blockName(r, phoneCol);
      if (!name) return;
      seen.add(phone);
      contacts.push({ phone, name, relationship });
    };
    pushContact(perePhoneCol, 'père');
    pushContact(merePhoneCol, 'mère');
    pushContact(tutPhoneCol, mapTutelle(T(r, typeCol)));

    if (contacts.length === 0) continue;

    // Le contact principal (nom + numéro du compte parent) = père si présent,
    // sinon mère, sinon tuteur (= 1er contact, l'ordre ci-dessus le garantit).
    const primary = contacts[0];
    out.push({
      massar_code: massar,
      student_full_name: studentName,
      parent_full_name: primary.name,
      phone_1: primary.phone,
      relationship: primary.relationship,
      contacts // tous les numéros (père + mère + tuteur), avec libellé
    });
  }

  return { rows: out, className };
};

// Parse le format générique (modèle Élève / Parent / Téléphone / Relation).
// Une colonne « Classe » facultative permet de mettre PLUSIEURS classes dans un
// seul fichier : l'appelant regroupe alors les lignes par classe.
// Retourne { rows } ou null si l'en-tête n'est pas reconnu.
const parseGenericParents = (workbook) => {
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  let headerRowIndex = -1, colStudentName = -1, colParentName = -1, colPhone = -1, colRelationship = -1, colClass = -1;
  for (let i = 0; i < Math.min(rawData.length, 20); i++) {
    const row = rawData[i];
    if (!row) continue;
    let tmpStudent = -1, tmpParent = -1, tmpPhone = -1, tmpRelation = -1, tmpClass = -1;
    for (let j = 0; j < row.length; j++) {
      const raw = String(row[j] || '').trim();
      const cell = raw.toLowerCase();
      if (!cell) continue;
      if (cell === 'nom complet élève' || cell === 'nom complet eleve') { tmpStudent = j; continue; }
      if (cell === 'nom complet parent') { tmpParent = j; continue; }
      if (cell === 'téléphone' || cell === 'telephone') { tmpPhone = j; continue; }
      if (cell.startsWith('relation')) { tmpRelation = j; continue; }
      if (tmpClass === -1 && (cell === 'classe' || cell === 'class')) { tmpClass = j; continue; }
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
      headerRowIndex = i; colStudentName = tmpStudent; colParentName = tmpParent; colPhone = tmpPhone; colRelationship = tmpRelation; colClass = tmpClass;
      break;
    }
  }
  if (headerRowIndex === -1) return null;

  const rows = [];
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;
    const studentName = String(row[colStudentName] || '').trim();
    const parentName = String(row[colParentName] || '').trim();
    const phone = String(row[colPhone] || '').trim();
    const relationship = colRelationship !== -1 ? String(row[colRelationship] || '').trim() : '';
    const className = colClass !== -1 ? String(row[colClass] || '').trim() : '';
    if (studentName && parentName && phone) {
      rows.push({ student_full_name: studentName, parent_full_name: parentName, phone_1: phone, relationship: relationship || undefined, _className: className || undefined });
    }
  }
  return rows.length ? { rows } : null;
};

// Parse la « Liste globale des élèves » exportée par KoolSchool.
// Structure : quelques lignes de titre, puis un en-tête. Deux variantes gérées :
//   • Ancienne : N° | Code massar | Nom et prénom | … | Tél parent 1 | Tél parent 2
//   • Récente  : … | Nom et prénom parent 1 | Tél parent 1 | E-mail… | CIN… | Profession… |
//                    Nom et prénom parent 2 | Tél parent 2 | …
// C'est une liste GLOBALE (toutes classes), donc le matching se fait par code Massar.
// Quand le fichier fournit le NOM du parent, on l'utilise ; sinon on retombe sur le
// nom de l'élève (la famille). Renvoie { rows } ou null si l'en-tête n'est pas reconnu.
const parseKoolSchool = (workbook) => {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return null;
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Repérer l'en-tête : une ligne contenant « code massar » ET au moins une colonne
  // « tél parent N ». Détection PRÉCISE des colonnes de chaque bloc parent (1 et 2) :
  // on distingue « Tél parent N » (téléphone) de « Nom et prénom parent N » (nom) —
  // l'ancien code écrasait la colonne téléphone par « Profession parent N » (bug :
  // aucun parent n'était importé car il lisait un texte à la place du numéro).
  let headerIdx = -1, colCode = -1, colName = -1, colNameAr = -1;
  const pName = [-1, -1], pPhone = [-1, -1]; // index 0 = parent 1, index 1 = parent 2
  for (let i = 0; i < Math.min(raw.length, 30); i++) {
    const row = raw[i] || [];
    let code = -1, name = -1, nameAr = -1;
    const nm = [-1, -1], ph = [-1, -1];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').trim().toLowerCase();
      if (!cell) continue;
      if (code === -1 && cell.includes('code massar')) { code = j; continue; }
      // « Nom et prénom (ar) » → colonne arabe ; « Nom et prénom » → colonne latine.
      if (cell.includes('nom et pr') && (cell.includes('(ar)') || cell.includes('ar)'))) { nameAr = j; continue; }
      if (cell === 'nom et prénom' || cell === 'nom et prenom') { name = j; continue; }
      // Blocs parent 1 / parent 2 : on classe chaque colonne « … parent N ».
      // Nom → colonne nom ; téléphone → tout ce qui n'est ni nom, ni e-mail, ni
      // CIN, ni profession (« Tél parent N » ou en-tête « Parent N » nu). Sans ça,
      // l'ancien code prenait « Profession parent N » comme téléphone → 0 parent.
      for (const k of [0, 1]) {
        if (!cell.includes(`parent ${k + 1}`) && !cell.includes(`parent${k + 1}`)) continue;
        if (cell.includes('nom')) { nm[k] = j; continue; }
        if (cell.includes('mail') || cell.includes('e-mail') || cell.includes('cin') || cell.includes('profession')) continue;
        if (ph[k] === -1) ph[k] = j; // 1re colonne « téléphone » du bloc
      }
    }
    if (code !== -1 && (ph[0] !== -1 || ph[1] !== -1)) {
      headerIdx = i; colCode = code; colName = name; colNameAr = nameAr;
      pName[0] = nm[0]; pName[1] = nm[1]; pPhone[0] = ph[0]; pPhone[1] = ph[1];
      break;
    }
  }
  if (headerIdx === -1) return null;

  const rows = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const massar = String(r[colCode] || '').trim().toUpperCase();
    const studentName = colName !== -1 ? String(r[colName] || '').trim() : '';
    const studentNameAr = colNameAr !== -1 ? String(r[colNameAr] || '').trim() : '';
    // On accepte les lignes SANS code Massar tant qu'un nom permet le matching
    // (cas réel : élève présent dans le fichier KoolSchool mais colonne code vide).
    // On ne saute que les lignes totalement vides.
    if (!massar && !studentName && !studentNameAr) continue;

    // Un contact par bloc parent, avec son VRAI nom si fourni (sinon nom de l'élève).
    const seen = new Set();
    const contacts = [];
    for (const k of [0, 1]) {
      if (pPhone[k] === -1) continue;
      const phone = validMoroccoMobile(r[pPhone[k]]);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      const parentName = pName[k] !== -1 ? String(r[pName[k]] || '').trim() : '';
      contacts.push({ phone, name: parentName || studentName || studentNameAr, relationship: undefined });
    }
    if (contacts.length === 0) continue;

    rows.push({
      massar_code: massar,
      student_full_name: studentName,
      student_full_name_ar: studentNameAr || undefined,
      // Nom du parent principal = nom du 1er contact (fichier récent) sinon nom de l'élève.
      parent_full_name: contacts[0].name || studentName || studentNameAr,
      phone_1: contacts[0].phone,
      relationship: undefined,
      contacts
    });
  }

  return rows.length ? { rows } : null;
};

// Sélecteur d'élève recherchable, pour résoudre manuellement les lignes « non trouvées ».
// `students` = liste candidate ; `value` = id sélectionné ; `onChange(id)`.
const StudentPicker = ({ students, value, onChange }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const selected = students.find(s => s.id === value);
  const needle = search.trim().toLowerCase();
  const matches = needle
    ? students.filter(s => `${s.last_name || ''} ${s.first_name || ''}`.toLowerCase().includes(needle)).slice(0, 12)
    : students.slice(0, 12);

  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="text"
        value={open ? search : (selected ? `${selected.last_name || ''} ${selected.first_name || ''}`.trim() : search)}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => { setSearch(''); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Rechercher un élève…"
        className={`w-full px-2 py-1 border rounded text-sm bg-background ${selected ? 'border-green-500' : ''}`}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-popover border rounded-lg shadow-lg">
          {matches.map(s => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => { onChange(s.id); setOpen(false); }}
              className="w-full text-left px-2 py-1 text-sm hover:bg-accent"
            >
              {s.last_name} {s.first_name}{s.class?.name ? <span className="text-muted-foreground"> · {s.class.name}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ParentsPage = () => {
  const { year } = useYear(); // année active : seuls les parents d'élèves inscrits
  const [parents, setParents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  // Ids des élèves inscrits (RI/NI) pour l'année active — même source de vérité
  // que la page Élèves/finance. null = pas de scope (année absente) → tous les élèves.
  const [activeIds, setActiveIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedParent, setExpandedParent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterFiliere, setFilterFiliere] = useState('');
  // Rattachement : '' = tous, 'without' = parents sans aucun élève, 'with' = avec enfant(s)
  const [filterLink, setFilterLink] = useState('');

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
  // Progression de la suppression groupée : { done, total, ok, ko }
  const [bulkProgress, setBulkProgress] = useState(null);

  // Import (multi-fichiers : 1 par classe)
  const [showImport, setShowImport] = useState(false);
  const [importClassId, setImportClassId] = useState(''); // pour le modèle à télécharger
  // importFiles: [{ key, fileName, className, classId, rows, source, result, error }]
  const [importFiles, setImportFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  // Créer aussi les parents dont aucun élève n'a été retrouvé (compte sans enfant).
  const [createUnmatched, setCreateUnmatched] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { done, total } pendant le commit

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getToken = async () => {
    const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return session?.access_token;
  };

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      const [parentsRes, classesRes, studentsRes] = await Promise.all([
        // academic_year : seuls les parents ayant au moins un enfant inscrit
        // (RI/NI) dans l'année active — les familles des non-réinscrits sortent.
        fetch(`${apiUrl}/api/admin/parents${year ? `?academic_year=${encodeURIComponent(year)}` : ''}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/classes`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/students`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const parentsData = await parentsRes.json();
      const classesData = await classesRes.json();
      const studentsData = await studentsRes.json();

      setParents(Array.isArray(parentsData) ? parentsData : []);
      setClasses(Array.isArray(classesData) ? classesData : []);
      setStudents(Array.isArray(studentsData) ? studentsData : []);

      // Élèves inscrits pour l'année active : sert à scoper les compteurs
      // (Élèves / Avec parent / Sans parent) sur la même base que la liste des
      // parents. Sans ça, une année neuve (aucune réinscription) afficherait
      // quand même tous les profils élèves au lieu de 0.
      if (year) {
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
      } else {
        setActiveIds(null);
      }
    } catch (error) {
      console.error('Error fetching parents data:', error);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, year]);

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
    // Détection : l'élève a-t-il déjà un (autre) parent associé ?
    const target = students.find(s => s.id === linkStudentId);
    const others = (target?.parents || []).filter(p => p.id !== parentId);
    if (others.length > 0) {
      const list = others.map(p => `${p.first_name} ${p.last_name}${p.relationship ? ` (${p.relationship})` : ''}`).join(', ');
      if (!confirm(`⚠ Cet élève est déjà associé à ${others.length} parent(s) : ${list}.\n\nVoulez-vous quand même ajouter ce parent supplémentaire ?`)) {
        return;
      }
    }
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/admin/parents/${parentId}/link`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: linkStudentId, relationship: linkRelationship || null, academic_year: year })
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
  // Lecture de PLUSIEURS fichiers (Massar Tuteur ou modèle générique). Chaque
  // fichier devient une entrée avec sa classe détectée automatiquement (Massar).
  const handleImportFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const norm = s => String(s || '').trim().toLowerCase();
    // Clé de comparaison des noms de classe : « 1APG-1 », « 1apg 1 », « 1_APG1 »
    // désignent la même classe.
    const clsKey = s => norm(s).replace(/[^a-z0-9]/g, '');
    const findClassByName = (name) => {
      const k = clsKey(name);
      return k ? classes.find(c => clsKey(c.name) === k) || null : null;
    };
    // Classe déduite du nom de fichier : « PARENTS_1APG-1.xlsx » → classe 1APG-1.
    const classFromFileName = (fileName) => {
      const base = fileName.replace(/\.(xlsx|xls|csv)$/i, '');
      const candidates = [base, base.replace(/^\s*(parents?|eleves?|élèves?)[\s_-]*/i, '')];
      for (const cand of candidates) {
        const found = findClassByName(cand);
        if (found) return found;
      }
      return null;
    };
    const parsedList = [];
    for (const file of files) {
      const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);

        // 1) Format officiel Massar « Tuteur » (auto-détection de la classe).
        const massar = parseMassarTuteur(workbook);
        if (massar && massar.rows.length > 0) {
          const match = massar.className ? findClassByName(massar.className) : null;
          parsedList.push({ key, fileName: file.name, className: massar.className || null, classId: match ? match.id : '', rows: massar.rows, source: 'massar', result: null, error: null });
          continue;
        }

        // 2) Liste globale KoolSchool (toutes classes, match par code Massar).
        const kool = parseKoolSchool(workbook);
        if (kool && kool.rows.length > 0) {
          parsedList.push({ key, fileName: file.name, className: null, classId: '', rows: kool.rows, source: 'koolschool', global: true, result: null, error: null });
          continue;
        }

        // 3) Modèle générique (Élève / Parent / Téléphone / Relation).
        //    La classe est déduite automatiquement (colonne « Classe » du fichier,
        //    sinon nom du fichier) pour éviter de la choisir fichier par fichier.
        const generic = parseGenericParents(workbook);
        if (generic) {
          // a) Colonne « Classe » renseignée → un bloc par classe, même si le
          //    fichier couvre toute l'école.
          const byClass = new Map();
          for (const r of generic.rows) {
            const cls = r._className || '';
            if (!byClass.has(cls)) byClass.set(cls, []);
            byClass.get(cls).push(r);
          }
          const named = [...byClass.keys()].filter(Boolean);
          if (named.length > 0 && byClass.size === named.length) {
            for (const cls of named) {
              const match = findClassByName(cls);
              parsedList.push({
                key: `${key}-${cls}`, fileName: `${file.name} — ${cls}`, className: cls,
                classId: match ? match.id : '', rows: byClass.get(cls),
                source: 'generic', result: null, error: null
              });
            }
            continue;
          }
          // b) Sinon : classe déduite du nom du fichier (ex. PARENTS_1APG-1.xlsx).
          const guessed = classFromFileName(file.name);
          parsedList.push({
            key, fileName: file.name, className: guessed ? guessed.name : null,
            classId: guessed ? guessed.id : '', rows: generic.rows,
            source: 'generic', result: null, error: null
          });
          continue;
        }

        parsedList.push({ key, fileName: file.name, className: null, classId: '', rows: [], source: null, result: null, error: 'Format non reconnu (Massar Tuteur, liste globale KoolSchool, ou modèle Élève/Parent/Téléphone)' });
      } catch (error) {
        console.error('Error reading Excel:', error);
        parsedList.push({ key, fileName: file.name, className: null, classId: '', rows: [], source: null, result: null, error: 'Erreur de lecture du fichier' });
      }
    }
    setImportFiles(prev => [...prev, ...parsedList]);
    e.target.value = ''; // permet de re-sélectionner les mêmes fichiers
  };

  const setImportFileClass = (key, classId) =>
    setImportFiles(prev => prev.map(f => f.key === key ? { ...f, classId, result: null } : f));

  // Assigne manuellement un élève à une ligne (résolution des « non trouvés »).
  // On garde le résultat affiché : la ligne reste visible tant qu'on n'a pas re-vérifié.
  const setRowStudent = (key, rowIdx, studentId) =>
    setImportFiles(prev => prev.map(f => {
      if (f.key !== key) return f;
      const rows = f.rows.map((r, i) => i === rowIdx ? { ...r, student_id: studentId || undefined } : r);
      return { ...f, rows };
    }));

  const removeImportFile = (key) =>
    setImportFiles(prev => prev.filter(f => f.key !== key));

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

  // Vérifie (dryRun) ou enregistre (commit) TOUS les fichiers prêts, en parallèle.
  // Un fichier est « prêt » s'il a des lignes et (soit une classe cible, soit le mode global).
  const isFileReady = (f) => f.rows.length > 0 && (f.global || f.classId);

  // Taille d'un lot de commit : chaque ligne crée un compte parent (lent), donc on
  // découpe pour rester sous le timeout du serveur et alimenter la barre de progression.
  const COMMIT_CHUNK = 20;

  const runImport = async (dryRun) => {
    const ready = importFiles.filter(f => isFileReady(f) && (dryRun || f.result?.dryRun));
    if (ready.length === 0) {
      alert(dryRun ? 'Sélectionnez une classe pour au moins un fichier.' : 'Vérifiez d\'abord les correspondances.');
      return;
    }
    if (!dryRun && !confirm(
      'Confirmer l\'import ? Les parents seront créés et associés aux élèves.' +
      (createUnmatched ? '\n\nLes parents dont l\'élève n\'a pas été trouvé seront aussi créés, sans enfant rattaché.' : '')
    )) return;
    setImporting(true);
    try {
      const token = await getToken();
      const postChunk = (f, rows, isDry) => fetch(`${apiUrl}/api/admin/parents/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(f.global ? { global: true } : { class_id: f.classId }),
          rows,
          dryRun: isDry,
          academic_year: year,
          // Créer aussi les parents dont aucun élève n'a été retrouvé (sans lien).
          createUnmatched
        })
      });

      // Envoi d'un lot avec relance automatique (réseau / 5xx / timeout) → fiabilité.
      const postChunkWithRetry = async (f, rows, attempts = 3) => {
        for (let a = 1; a <= attempts; a++) {
          try {
            const res = await postChunk(f, rows, false);
            const data = await res.json().catch(() => ({}));
            if (res.ok) return { ok: true, data };
            // 5xx / 504 → on retente ; 4xx → inutile de retenter.
            if (res.status < 500 || a === attempts) return { ok: false, error: data.error || `Erreur ${res.status}` };
          } catch (e) {
            if (a === attempts) return { ok: false, error: 'Erreur réseau' };
          }
          await new Promise(r => setTimeout(r, 800 * a)); // back-off progressif
        }
        return { ok: false, error: 'Échec après plusieurs tentatives' };
      };

      // ---- DRY RUN : lecture seule + matching en mémoire → une requête par fichier (rapide). ----
      if (dryRun) {
        const updated = await Promise.all(importFiles.map(async (f) => {
          if (!isFileReady(f)) return f;
          try {
            const res = await postChunk(f, f.rows, true);
            const data = await res.json();
            if (!res.ok) return { ...f, result: { error: data.error || 'Erreur' } };
            return { ...f, result: data };
          } catch {
            return { ...f, result: { error: 'Erreur réseau' } };
          }
        }));
        setImportFiles(updated);
        return;
      }

      // ---- COMMIT : découpé en lots séquentiels, avec barre de progression. ----
      const commitFiles = ready; // déjà filtrés (vérifiés + prêts)
      const total = commitFiles.reduce((s, f) => s + f.rows.length, 0);
      setImportProgress({ done: 0, total });
      let totalCommits = 0, totalMassar = 0, totalCreated = 0, totalReused = 0, failedChunks = 0;
      // Lignes « sans élève trouvé » : nouveau compte vs rattachement à un
      // compte existant (numéro déjà connu) — deux issues à ne pas confondre.
      let unlinkedCreated = 0, unlinkedMerged = 0, failedRows = 0;
      const resultByKey = {};
      for (const f of commitFiles) {
        const agg = { dryRun: false, results: [], commitsCount: 0, massarBackfilled: 0 };
        for (let i = 0; i < f.rows.length; i += COMMIT_CHUNK) {
          const chunk = f.rows.slice(i, i + COMMIT_CHUNK);
          const { ok, data, error } = await postChunkWithRetry(f, chunk);
          if (ok) {
            if (Array.isArray(data.results)) agg.results.push(...data.results);
            agg.commitsCount += data.commitsCount || 0;
            agg.massarBackfilled += data.massarBackfilled || 0;
            totalCreated += data.parentsCreated || 0;
            totalReused += data.parentsReused || 0;
            unlinkedCreated += data.unlinkedCreated ?? data.unlinkedParents ?? 0;
            unlinkedMerged += data.unlinkedMerged || 0;
          } else {
            agg.error = error || 'Erreur';
            failedChunks++;
            failedRows += chunk.length;
          }
          setImportProgress(p => (p ? { ...p, done: p.done + chunk.length } : p));
        }
        totalCommits += agg.commitsCount;
        totalMassar += agg.massarBackfilled;
        resultByKey[f.key] = agg;
      }
      setImportFiles(prev => prev.map(f => resultByKey[f.key] ? { ...f, result: resultByKey[f.key] } : f));
      await fetchData();
      alert(
        `Import terminé : ${totalCommits} association(s) créée(s).\n` +
        `• ${totalCreated} compte(s) parent créé(s), ${totalReused} réutilisé(s) (même numéro = même compte).` +
        (unlinkedCreated > 0 ? `\n• ${unlinkedCreated} parent(s) créé(s) SANS enfant rattaché — filtre « Sans élève rattaché » pour les retrouver.` : '') +
        (unlinkedMerged > 0 ? `\n• ${unlinkedMerged} ligne(s) sans élève trouvé ont rejoint un compte existant (numéro déjà connu, souvent le parent d'un frère ou d'une sœur) — rien à rattacher.` : '') +
        (totalMassar > 0 ? `\n• ${totalMassar} code(s) Massar renseigné(s) sur les élèves.` : '') +
        (failedChunks > 0 ? `\n⚠ ${failedChunks} lot(s) en échec, soit ${failedRows} ligne(s) non traitées — rechargez le même fichier et relancez l'import pour les terminer (aucun doublon : les associations déjà créées sont réutilisées).` : '')
      );
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleImportDryRun = () => runImport(true);
  const handleImportCommit = () => runImport(false);

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

  // Tout sélectionner / tout désélectionner (sur les parents actuellement filtrés).
  // On AJOUTE ou RETIRE les parents affichés au lieu de remplacer la sélection :
  // on peut ainsi cumuler plusieurs filtres successifs (ex. deux classes) sans
  // perdre ce qui a été coché avant.
  const toggleSelectAll = () => {
    const visibleIds = filteredParents.map(p => p.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedParents.has(id));
    setSelectedParents(prev => {
      const n = new Set(prev);
      visibleIds.forEach(id => (allSelected ? n.delete(id) : n.add(id)));
      return n;
    });
  };

  // Suppression groupée des parents sélectionnés
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedParents);
    if (ids.length === 0) { alert('Sélectionnez au moins un parent'); return; }
    if (!confirm(`Supprimer ${ids.length} parent(s) et toutes leurs associations ? Cette action est irréversible.`)) return;
    setBulkSending(true);
    // Suppression une par une (une requête par parent) : sur plusieurs centaines
    // de comptes l'écran restait figé plusieurs minutes sans le moindre retour.
    setBulkProgress({ done: 0, total: ids.length, ok: 0, ko: 0 });
    let ok = 0, ko = 0;
    try {
      const token = await getToken();
      for (const id of ids) {
        try {
          const res = await fetch(`${apiUrl}/api/admin/parents/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) ok++; else ko++;
        } catch { ko++; }
        setBulkProgress(p => (p ? { ...p, done: p.done + 1, ok, ko } : p));
      }
      alert(`${ok} parent(s) supprimé(s)${ko > 0 ? `, ${ko} échec(s)` : ''}`);
      setBulkMode(false);
      setSelectedParents(new Set());
      await fetchData();
    } finally {
      setBulkSending(false);
      setBulkProgress(null);
    }
  };

  // ---- FILTER ----
  const filteredParents = parents.filter(p => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
    const phone = (p.phone || '').toLowerCase();
    const matchSearch = !searchTerm || name.includes(searchTerm.toLowerCase()) || phone.includes(searchTerm.toLowerCase());

    const matchClass = !filterClass || (p.children || []).some(c => c.class?.name === filterClass);
    const matchFiliere = !filterFiliere || (p.children || []).some(c => c.class?.filiere === filterFiliere);
    // Parents sans élève : comptes importés (ou créés à la main) sans lien
    // parent↔élève, à rattacher. Les filtres classe/filière n'ont alors pas de sens.
    const childCount = (p.children || []).length;
    const matchLink = !filterLink || (filterLink === 'without' ? childCount === 0 : childCount > 0);

    return matchSearch && matchLink && (filterLink === 'without' || (matchClass && matchFiliere));
  });

  // Options de classes : TOUTES les classes (pas seulement celles ayant déjà un parent),
  // pour pouvoir repérer les classes sans aucun parent. Triées par niveau puis nom.
  const classOptions = [...classes]
    .filter(c => c?.name)
    .sort((a, b) => String(a.level || '').localeCompare(String(b.level || '')) || a.name.localeCompare(b.name));

  // Options de filières présentes dans l'école (classes ayant une filière renseignée).
  const filiereOptions = [...new Set(classes.map(c => c?.filiere).filter(Boolean))]
    .sort((a, b) => filiereLabel(a).localeCompare(filiereLabel(b)));

  // Tous les parents actuellement affichés (donc filtrés) sont-ils sélectionnés ?
  const allFilteredSelected = filteredParents.length > 0 && filteredParents.every(p => selectedParents.has(p.id));

  // Parents sans aucun élève rattaché, sur la TOTALITÉ des parents (le compteur
  // doit rester stable quand on filtre, c'est lui qui alimente le filtre dédié).
  const parentsWithoutChild = parents.filter(p => (p.children || []).length === 0).length;

  // Répartition des parents (filtrés) par nombre d'enfants : 1 / 2 / 3 / 4+.
  const childrenDistribution = filteredParents.reduce((acc, p) => {
    const n = (p.children || []).length;
    if (n <= 0) acc.zero += 1;
    else if (n === 1) acc.one += 1;
    else if (n === 2) acc.two += 1;
    else if (n === 3) acc.three += 1;
    else acc.fourPlus += 1;
    return acc;
  }, { zero: 0, one: 0, two: 0, three: 0, fourPlus: 0 });
  const distribTotal = childrenDistribution.one + childrenDistribution.two + childrenDistribution.three + childrenDistribution.fourPlus;

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
  const scopedStudents = students
    // Année active : ne compter que les élèves inscrits (RI/NI) cette année-là,
    // comme la liste des parents et la page Élèves. Une année neuve → 0 élève.
    .filter(s => activeIds === null || activeIds.has(s.id))
    .filter(s => !filterClassIds || filterClassIds.has(s.class_id));

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
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { setBulkMode(!bulkMode); setSelectedParents(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${bulkMode ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}
          >
            <CheckCheck className="w-4 h-4" />
            {bulkMode ? `${selectedParents.size} sélectionné(s)` : 'Sélection multiple'}
          </button>
          {bulkMode && (
            <>
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200"
              >
                <CheckCheck className="w-4 h-4" />
                {allFilteredSelected
                  ? `Tout désélectionner (${filteredParents.length})`
                  : `Tout sélectionner (${filteredParents.length})`}
              </button>
              <button
                onClick={() => handleBulkSend('selected')}
                disabled={bulkSending || selectedParents.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {bulkSending ? 'Envoi…' : `Envoyer ID (${selectedParents.size})`}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkSending || selectedParents.size === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {bulkProgress
                  ? `Suppression… ${bulkProgress.done}/${bulkProgress.total}`
                  : bulkSending ? '...' : `Supprimer (${selectedParents.size})`}
              </button>
            </>
          )}
          <button
            onClick={() => handleBulkSend('all')}
            disabled={bulkSending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            title="Régénérer + envoyer les identifiants à tous les parents"
          >
            <Send className="w-4 h-4" />
            {bulkSending ? 'Envoi…' : 'Envoyer ID à tous'}
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importer Excel
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-colors"
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
              Importez <strong>un ou plusieurs fichiers</strong> à la fois. Trois formats sont reconnus automatiquement :
              le format officiel <strong>Massar « Tuteur »</strong> (détecte la classe + père/mère/tuteur),
              la <strong>liste globale KoolSchool</strong> (« Liste globale des élèves » — reconnaissance par code Massar, toutes classes),
              ou le modèle générique avec les colonnes <strong>Élève</strong>, <strong>Parent</strong>, <strong>Téléphone</strong>, <strong>Relation</strong>.
            </p>

            {/* Upload (multiple) */}
            <div>
              <label className="block text-sm font-medium mb-1">Fichiers Excel *</label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                multiple
                onChange={handleImportFileChange}
                className="w-full px-3 py-2 border rounded-lg bg-background"
              />
              {importFiles.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {importFiles.length} fichier(s) chargé(s) — vous pouvez en ajouter d'autres. La classe est détectée
                  automatiquement (colonne « Classe » ou nom du fichier) et tout s'importe en une seule fois.
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Download className="w-5 h-5 text-blue-600 shrink-0" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-300">Modèle Excel (optionnel)</p>
                <p className="text-blue-600 dark:text-blue-400">Téléchargez un modèle pré-rempli avec les élèves d'une classe.</p>
              </div>
              <select
                value={importClassId}
                onChange={e => setImportClassId(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm"
              >
                <option value="">-- Classe du modèle --</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.level})</option>
                ))}
              </select>
              <button
                onClick={handleExportTemplate}
                disabled={!importClassId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Télécharger
              </button>
            </div>

            {/* Liste des fichiers (1 carte par fichier/classe) */}
            {importFiles.map((f) => {
              const matched = f.result?.results?.filter(r => r.matchStatus === 'matched').length || 0;
              const notFound = f.result?.results?.filter(r => r.matchStatus === 'not_found').length || 0;
              const ambiguous = f.result?.results?.filter(r => r.matchStatus === 'ambiguous').length || 0;
              const committed = f.result && f.result.commitsCount != null && !f.result.dryRun;
              return (
                <div key={f.key} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Upload className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate">{f.fileName}</span>
                        {f.source === 'massar' && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Massar</span>}
                        {f.source === 'koolschool' && <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">KoolSchool</span>}
                      </p>
                      {f.error ? (
                        <p className="text-xs text-red-500 mt-1">{f.error}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {f.rows.length} ligne(s){f.className ? <> • Classe détectée : <strong>{f.className}</strong></> : null}
                        </p>
                      )}
                    </div>
                    <button onClick={() => removeImportFile(f.key)} className="p-1 hover:bg-muted rounded shrink-0" title="Retirer ce fichier">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {!f.error && (
                    <>
                      {f.global ? (
                        <p className="text-xs text-teal-700 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-lg px-3 py-2">
                          Liste globale — les élèves sont reconnus automatiquement par leur <strong>code Massar</strong> (toutes classes). Aucune classe à sélectionner.
                        </p>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium mb-1">Classe cible *</label>
                          <select
                            value={f.classId}
                            onChange={e => setImportFileClass(f.key, e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
                          >
                            <option value="">-- Sélectionner une classe --</option>
                            {classes.map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.level})</option>
                            ))}
                          </select>
                          {!f.classId && f.className && (
                            <p className="text-xs text-amber-600 mt-1">Classe « {f.className} » non trouvée — sélectionnez-la manuellement.</p>
                          )}
                        </div>
                      )}

                      {/* Aperçu compact */}
                      <div className="max-h-48 overflow-y-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="text-left py-1 px-2">Élève</th>
                              <th className="text-left py-1 px-2">Parent</th>
                              <th className="text-left py-1 px-2">Tél.</th>
                              {f.result?.results && <th className="text-left py-1 px-2">Statut</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {f.rows.map((row, idx) => {
                              const result = f.result?.results?.[idx];
                              return (
                                <tr key={idx} className="border-t">
                                  <td className="py-1 px-2">{row.student_full_name}</td>
                                  <td className="py-1 px-2">
                                    {row.contacts?.length ? row.contacts.map((c, i) => <div key={i}>{c.name}{c.relationship ? ` (${c.relationship})` : ''}</div>) : row.parent_full_name}
                                  </td>
                                  <td className="py-1 px-2">
                                    {row.contacts?.length ? row.contacts.map((c, i) => <div key={i}>{c.phone}</div>) : row.phone_1}
                                  </td>
                                  {result && (
                                    <td className="py-1 px-2">
                                      {result.matchStatus === 'matched' && <span className="text-green-600 font-medium">✓ {result.student.first_name} {result.student.last_name}</span>}
                                      {result.matchStatus === 'not_found' && <span className="text-red-500 font-medium">✗ Non trouvé</span>}
                                      {result.matchStatus === 'ambiguous' && <span className="text-yellow-600 font-medium">⚠ Ambigu</span>}
                                      {result.matchStatus === 'invalid' && <span className="text-gray-400">— Invalide</span>}
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
                          {ambiguous > 0 && <span className="text-yellow-600">⚠ {ambiguous} ambigu(s)</span>}
                          {committed && <span className="text-green-700 font-medium">{f.result.commitsCount} association(s) créée(s)</span>}
                        </div>
                      )}

                      {/* Résolution manuelle des lignes non trouvées / ambiguës */}
                      {f.result?.results && !committed && (notFound + ambiguous > 0) && (() => {
                        // Élèves candidats : ceux de la classe cible, ou toute l'école (liste globale).
                        const candidates = f.global
                          ? students
                          : students.filter(s => s.class_id === f.classId);
                        const candidatesSorted = [...candidates].sort((a, b) =>
                          `${a.last_name || ''} ${a.first_name || ''}`.localeCompare(`${b.last_name || ''} ${b.first_name || ''}`));
                        return (
                          <div className="border border-amber-300 rounded-lg p-2 bg-amber-50/60 dark:bg-amber-950/20 space-y-2">
                            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                              Associer manuellement les élèves non trouvés ({notFound + ambiguous}), puis re-cliquez sur « Vérifier les correspondances » :
                            </p>
                            {f.rows.map((row, idx) => {
                              const result = f.result.results[idx];
                              if (!result || (result.matchStatus !== 'not_found' && result.matchStatus !== 'ambiguous')) return null;
                              const phones = row.contacts?.length ? row.contacts.map(c => c.phone).join(', ') : row.phone_1;
                              const assigned = row.student_id ? students.find(s => s.id === row.student_id) : null;
                              return (
                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2">
                                  <div className="sm:w-1/3 min-w-0 text-sm">
                                    <span className="font-medium truncate">{row.student_full_name || '(sans nom)'}</span>
                                    <span className="text-muted-foreground text-xs block truncate">{phones}</span>
                                  </div>
                                  <StudentPicker
                                    students={candidatesSorted}
                                    value={row.student_id}
                                    onChange={(id) => setRowStudent(f.key, idx, id)}
                                  />
                                  {assigned && (
                                    <span className="text-xs text-green-600 shrink-0">✓ à re-vérifier</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              );
            })}

            {/* Actions globales */}
            {importFiles.some(f => !f.error) && (() => {
              const ready = importFiles.filter(f => isFileReady(f));
              const totalMatched = importFiles.reduce((s, f) => s + (f.result?.results?.filter(r => r.matchStatus === 'matched').length || 0), 0);
              // Lignes sans élève retrouvé : créables en parents « sans enfant ».
              const totalNotFound = importFiles.reduce((s, f) => s + (f.result?.results?.filter(r => r.matchStatus === 'not_found').length || 0), 0);
              const anyDry = importFiles.some(f => f.result?.dryRun);
              const anyCommitted = importFiles.some(f => f.result && f.result.commitsCount != null && !f.result.dryRun);
              return (
                <div className="pt-1 border-t space-y-3">
                  {/* Barre de progression du commit (par lots) */}
                  {importProgress && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Import en cours… {importProgress.done}/{importProgress.total}</span>
                        <span>{Math.round((importProgress.done / Math.max(importProgress.total, 1)) * 100)}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-600 transition-all duration-300"
                          style={{ width: `${Math.round((importProgress.done / Math.max(importProgress.total, 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {/* Fichiers restés sans classe : ils seraient ignorés par l'import. */}
                  {importFiles.some(f => !f.error && !f.global && !f.classId) && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {importFiles.filter(f => !f.error && !f.global && !f.classId).length} fichier(s) sans classe —
                      sélectionnez-la ci-dessus, sinon ils seront ignorés. Astuce : nommez le fichier comme la classe
                      (ex. <strong>1APG-1.xlsx</strong>) ou ajoutez une colonne <strong>Classe</strong>, la détection est automatique.
                    </p>
                  )}

                  {/* Parents dont l'élève n'a pas été retrouvé : on peut quand même
                      créer le compte (sans enfant), à rattacher plus tard. */}
                  <label className="flex items-start gap-2 text-sm p-2.5 rounded-lg bg-blue-50 border border-blue-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createUnmatched}
                      onChange={e => setCreateUnmatched(e.target.checked)}
                      disabled={importing}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Créer aussi les parents sans élève trouvé</span>
                      {totalNotFound > 0 && <span className="text-blue-700"> ({totalNotFound} ligne{totalNotFound > 1 ? 's' : ''})</span>}
                      <span className="block text-xs text-muted-foreground">
                        Le compte parent et ses numéros sont créés sans enfant rattaché — vous ferez le lien depuis sa fiche.
                      </span>
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleImportDryRun}
                      disabled={importing || ready.length === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {importing && !importProgress ? 'Vérification...' : `Vérifier les correspondances (${ready.length} fichier${ready.length > 1 ? 's' : ''})`}
                    </button>
                    {anyDry && !anyCommitted && (totalMatched > 0 || (createUnmatched && totalNotFound > 0)) && (
                      <button
                        onClick={handleImportCommit}
                        disabled={importing}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {importProgress
                          ? 'Import en cours...'
                          : `Confirmer l'import (${totalMatched} parent(s)${createUnmatched && totalNotFound > 0 ? ` + ${totalNotFound} sans enfant` : ''})`}
                      </button>
                    )}
                    <button
                      onClick={() => setImportFiles([])}
                      disabled={importing}
                      className="px-4 py-2 border rounded-lg hover:bg-accent disabled:opacity-50"
                    >
                      Tout effacer
                    </button>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher par nom ou téléphone..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-lg bg-background"
          />
        </div>
        {filiereOptions.length > 0 && (
          <select
            value={filterFiliere}
            onChange={e => setFilterFiliere(e.target.value)}
            className="px-3 py-1.5 text-sm border rounded-lg bg-background"
          >
            <option value="">Toutes les filières</option>
            {filiereOptions.map(f => (
              <option key={f} value={f}>{filiereLabel(f)}</option>
            ))}
          </select>
        )}
        {classOptions.length > 0 && (
          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            disabled={filterLink === 'without'}
            className="px-3 py-1.5 text-sm border rounded-lg bg-background disabled:opacity-50"
          >
            <option value="">Toutes les classes</option>
            {classOptions.map(c => (
              <option key={c.id} value={c.name}>{c.name}{c.level ? ` · ${c.level}` : ''}</option>
            ))}
          </select>
        )}
        {/* Rattachement à un élève — isole les parents importés « sans enfant ». */}
        <select
          value={filterLink}
          onChange={e => setFilterLink(e.target.value)}
          className="px-3 py-1.5 text-sm border rounded-lg bg-background"
        >
          <option value="">Tous les parents</option>
          <option value="without">Sans élève rattaché ({parentsWithoutChild})</option>
          <option value="with">Avec au moins un enfant</option>
        </select>
        {filterLink === 'without' && (
          <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1">
            Comptes à rattacher — ouvrez la fiche puis « Associer un élève ».
          </span>
        )}
      </div>

      {/* Tableau de bord : couverture parents + répartition par nombre d'enfants (1 seule ligne) */}
      {(() => {
        const buckets = distribTotal > 0 ? [
          { key: 'one', label: '1 enfant', value: childrenDistribution.one, color: 'bg-sky-500', text: 'text-sky-600' },
          { key: 'two', label: '2 enfants', value: childrenDistribution.two, color: 'bg-violet-500', text: 'text-violet-600' },
          { key: 'three', label: '3 enfants', value: childrenDistribution.three, color: 'bg-amber-500', text: 'text-amber-600' },
          { key: 'fourPlus', label: '4 enfants et +', value: childrenDistribution.fourPlus, color: 'bg-rose-500', text: 'text-rose-600' },
        ] : [];
        const dpct = (n) => distribTotal ? Math.round((n / distribTotal) * 100) : 0;
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              <div className="rounded-lg border bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground">Élèves{filterClass ? ` · ${filterClass}` : ''}</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground">Avec parent</p>
                <p className="text-xl font-bold text-green-600">{stats.withParent} <span className="text-xs font-normal text-muted-foreground">{pct(stats.withParent)}%</span></p>
              </div>
              <div className="rounded-lg border bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground">Sans parent</p>
                <p className="text-xl font-bold text-red-500">{stats.withoutParent} <span className="text-xs font-normal text-muted-foreground">{pct(stats.withoutParent)}%</span></p>
              </div>
              {buckets.map(b => (
                <div key={b.key} className="rounded-lg border bg-card px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-2 h-2 rounded-full ${b.color}`} />
                    <p className="text-xs text-muted-foreground">{b.label}</p>
                  </div>
                  <p className={`text-xl font-bold ${b.text}`}>{b.value} <span className="text-xs font-normal text-muted-foreground">{dpct(b.value)}%</span></p>
                </div>
              ))}
            </div>
            {parentsWithoutChild > 0 && (
              <button
                type="button"
                onClick={() => setFilterLink(filterLink === 'without' ? '' : 'without')}
                className="text-xs text-left underline decoration-dotted underline-offset-2 text-muted-foreground hover:text-foreground"
              >
                {filterLink === 'without'
                  ? `← Retirer le filtre (${parentsWithoutChild} parent(s) sans élève affiché(s))`
                  : `+ ${parentsWithoutChild} parent(s) sans enfant associé (non comptés dans la répartition) — cliquer pour les afficher`}
              </button>
            )}
          </div>
        );
      })()}

      {/* Sélection multiple : case « tout sélectionner » au ras de la liste, pour
          ne pas avoir à la chercher parmi les boutons de l'en-tête. Elle porte sur
          les parents AFFICHÉS — combinée au filtre « sans élève rattaché », elle
          permet d'agir en masse sur ces seuls comptes. */}
      {bulkProgress && (
        <div className="space-y-1 px-3 py-2 rounded-lg border bg-card">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Suppression en cours… {bulkProgress.done}/{bulkProgress.total}</span>
            <span>
              {bulkProgress.ko > 0 ? `${bulkProgress.ko} échec(s) · ` : ''}
              {Math.round((bulkProgress.done / Math.max(bulkProgress.total, 1)) * 100)}%
            </span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600 transition-all duration-300"
              style={{ width: `${Math.round((bulkProgress.done / Math.max(bulkProgress.total, 1)) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Ne fermez pas la page tant que la suppression n'est pas terminée.</p>
        </div>
      )}

      {bulkMode && filteredParents.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4"
            />
            Tout sélectionner ({filteredParents.length} parent{filteredParents.length > 1 ? 's' : ''} affiché{filteredParents.length > 1 ? 's' : ''})
          </label>
          <span className="text-xs text-muted-foreground">
            {selectedParents.size} sélectionné(s)
            {(filterLink || filterClass || filterFiliere || searchTerm) ? ' — la sélection suit les filtres en cours' : ''}
          </span>
          {selectedParents.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedParents(new Set())}
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              Vider la sélection
            </button>
          )}
        </div>
      )}

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          {filteredParents.map(parent => {
            const isExpanded = expandedParent === parent.id;
            const childrenList = parent.children || [];
            const contactsList = parent.contacts || [];
            const primaryContact = contactsList.find(c => c.is_primary);

            return (
              <div key={parent.id} className="contents">
                <ParentCard
                  name={`${parent.first_name} ${parent.last_name}`}
                  photo={parent.avatar_url}
                  children={childrenList.length > 0 ? `${childrenList.length} enfant(s)` : null}
                  channel={primaryContact ? (primaryContact.channel === 'whatsapp' ? 'whatsapp' : 'push') : null}
                  onClick={() => setExpandedParent(parent.id)}
                  menu={bulkMode ? (
                    <input
                      type="checkbox"
                      checked={selectedParents.has(parent.id)}
                      onChange={() => toggleSelectParent(parent.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 shrink-0"
                    />
                  ) : null}
                />
                <DetailDrawer
                  open={isExpanded}
                  onClose={() => { setExpandedParent(null); setEditingParent(null); }}
                  title={`${parent.first_name} ${parent.last_name}`}
                  width={460}
                >
                  <div className="space-y-4">
                    {/* Coordonnées + statut */}
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
                      {primaryContact && (
                        <ChannelBadge channel={primaryContact.channel === 'whatsapp' ? 'whatsapp' : 'push'} />
                      )}
                      {parent.classes?.length > 0 && parent.classes.map(c => (
                        <span key={c.name} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{c.name}</span>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleCreateCredentials(parent, false)}
                        disabled={generatingCreds === parent.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-50"
                      >
                        <Key className="w-4 h-4" /> Login
                      </button>
                      <button
                        onClick={() => openEditParent(parent)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50"
                      >
                        <Edit2 className="w-4 h-4" /> Modifier
                      </button>
                      <button
                        onClick={() => handleDeleteParent(parent.id, `${parent.first_name} ${parent.last_name}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" /> Supprimer
                      </button>
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
                                          {s.parents?.length > 0 && (
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}
                                              title={s.parents.map(p => `${p.first_name} ${p.last_name}${p.relationship ? ` (${p.relationship})` : ''}`).join(', ')}>
                                              déjà {s.parents.length} parent{s.parents.length > 1 ? 's' : ''}
                                            </span>
                                          )}
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
                                {contact.label && (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                    {contact.label}
                                  </span>
                                )}
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
                  </div>
                </DetailDrawer>
              </div>
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
