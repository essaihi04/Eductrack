import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Eye, EyeOff, Copy, CheckSquare, Square, RefreshCw, MessageCircle, Send, UserPlus, X, AlertTriangle, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import {
  CardGrid, StudentCard, StudentRow, StatusPill, GridListToggle,
  DetailDrawer, FieldRow, Avatar,
} from '../../components/directory/ui';
import { useAuth } from '../../contexts/AuthContext';
import { generateEmail, generatePassword } from '../../utils/studentUtils';

const StudentsPage = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'school_admin' || profile?.role === 'pedagogical_director' || profile?.role === 'pedagogical_manager';
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [activeStudent, setActiveStudent] = useState(null); // fiche ouverte dans le drawer
  const [filters, setFilters] = useState({
    className: '',
    level: '',
    searchName: '',
    searchEmail: '',
    parentStatus: '' // '', 'with', 'without'
  });
  // Modale d'ajout de parents (file d'attente pour traiter plusieurs élèves)
  const [parentModalQueue, setParentModalQueue] = useState([]);
  const [parentModalIndex, setParentModalIndex] = useState(0);
  const [parentForm, setParentForm] = useState({ pereName: '', perePhone: '', mereName: '', merePhone: '', tuteurName: '', tuteurPhone: '' });
  const [parentSaving, setParentSaving] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    classId: ''
  });
  const [showSendCredentialsModal, setShowSendCredentialsModal] = useState(false);
  const [sendCredentialsFilter, setSendCredentialsFilter] = useState('all');
  const [sendCredentialsFiliere, setSendCredentialsFiliere] = useState('');
  const [sendCredentialsClass, setSendCredentialsClass] = useState('');
  const [sendingCredentials, setSendingCredentials] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

      // Filtre par nom
      if (filters.searchName) {
        const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
        if (!fullName.includes(filters.searchName.toLowerCase())) {
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
        body: JSON.stringify({ contacts }),
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/students`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        const newStudent = await res.json();
        
        // Stocker le mot de passe dans localStorage
        if (newStudent.password) {
          const storedPasswords = JSON.parse(localStorage.getItem('studentPasswords') || '{}');
          storedPasswords[newStudent.id] = newStudent.password;
          localStorage.setItem('studentPasswords', JSON.stringify(storedPasswords));
        }
        
        setStudents([...students, newStudent]);
        setFormData({ email: '', password: '', firstName: '', lastName: '', classId: '' });
        setShowForm(false);
      }
    } catch (error) {
      console.error('Error adding student:', error);
    }
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
          classId: sendCredentialsClass
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
    <div className="p-3 md:p-8 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Élèves</h1>
          <p className="text-muted-foreground mt-1">Total: {students.length} élèves</p>
        </div>
        {isAdmin && (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowSendCredentialsModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Send className="w-5 h-5" />
              Envoyer identifiants WhatsApp
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-5 h-5" />
              Ajouter un élève
            </button>
          </div>
        )}
      </div>

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
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Rechercher par nom</label>
              <input
                type="text"
                placeholder="Nom ou prénom..."
                value={filters.searchName}
                onChange={(e) => setFilters({ ...filters, searchName: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Rechercher par email</label>
              <input
                type="text"
                placeholder="Adresse email..."
                value={filters.searchEmail}
                onChange={(e) => setFilters({ ...filters, searchEmail: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Classe</label>
              <select
                value={filters.className}
                onChange={(e) => setFilters({ ...filters, className: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm"
              >
                <option value="">Toutes les classes</option>
                <option value="unassigned">Élèves non assignés</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Niveau</label>
              <select
                value={filters.level}
                onChange={(e) => setFilters({ ...filters, level: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm"
              >
                <option value="">Tous les niveaux</option>
                {getAvailableLevels().map(level => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Statut parent</label>
              <select
                value={filters.parentStatus}
                onChange={(e) => setFilters({ ...filters, parentStatus: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm"
              >
                <option value="">Tous</option>
                <option value="without">⚠ Sans parent</option>
                <option value="with">👪 Avec parent</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-gray-600">
              Affichage: <span className="font-semibold">{getFilteredStudents().length}</span> / <span className="font-semibold">{students.length}</span> élève(s)
              {(() => {
                const without = students.filter(s => !(s.parents?.length > 0)).length;
                return without > 0 ? <span className="ml-2 text-amber-600 font-medium">• {without} sans parent</span> : null;
              })()}
            </div>
            {isAdmin && filters.parentStatus === 'without' && getFilteredStudents().length > 0 && (
              <button
                onClick={() => openParentModal(getFilteredStudents())}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
              >
                <UserPlus className="w-4 h-4" />
                Ajouter les parents ({getFilteredStudents().length})
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {isAdmin && showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter un nouvel élève</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="px-3 py-2 border rounded"
                />
                <input
                  type="password"
                  placeholder="Mot de passe"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="px-3 py-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Prénom"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                  className="px-3 py-2 border rounded"
                />
                <input
                  type="text"
                  placeholder="Nom"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                  className="px-3 py-2 border rounded"
                />
              </div>
              <select
                value={formData.classId}
                onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                <option value="">Sélectionner une classe (optionnel)</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Annuler
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Liste des élèves</CardTitle>
              <CardDescription className="hidden sm:block">Cliquez sur une ligne pour voir les identifiants</CardDescription>
            </div>
            {isAdmin && selectedStudents.size > 0 && (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => openParentModal(students.filter(s => selectedStudents.has(s.id)))}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
                  title="Ajouter les parents des élèves sélectionnés"
                >
                  <UserPlus className="w-4 h-4" />
                  Parents ({selectedStudents.size})
                </button>
                <button
                  onClick={sendBulkCredentialsToParents}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  title="Envoyer les identifiants aux parents via WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp ({selectedStudents.size})
                </button>
                <button
                  onClick={deleteSelectedStudents}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Supprimer ({selectedStudents.size})
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {getFilteredStudents().length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                {students.length === 0 ? 'Aucun élève' : 'Aucun élève ne correspond aux filtres'}
              </p>
            ) : (
              <div>
                {/* Checkbox pour sélectionner tous (admin uniquement) */}
                {isAdmin && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded mb-3">
                    <button
                      onClick={toggleSelectAll}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      {isAllSelected() ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : isSomeSelected() ? (
                        <div className="w-5 h-5 border-2 border-blue-600 bg-blue-100 rounded relative">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-3 h-3 bg-blue-600 rounded-sm" />
                          </div>
                        </div>
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      {isAllSelected() ? 'Désélectionner tout' : 'Sélectionner tout'}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({selectedStudents.size} / {getFilteredStudents().length})
                    </span>
                  </div>
                )}

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

                  if (viewMode === 'grid') {
                    return (
                      <CardGrid>
                        {list.map((student) => (
                          <StudentCard
                            key={student.id}
                            name={`${student.first_name} ${student.last_name}`}
                            photo={student.avatar_url}
                            classLabel={classLabel(student)}
                            status={parentStatus(student)}
                            selectable={isAdmin}
                            selected={selectedStudents.has(student.id)}
                            onToggleSelect={() => toggleStudentSelection(student.id)}
                            onClick={() => setActiveStudent(student)}
                          />
                        ))}
                      </CardGrid>
                    );
                  }

                  return (
                    <div>
                      {list.map((student) => (
                        <StudentRow
                          key={student.id}
                          name={`${student.first_name} ${student.last_name}`}
                          photo={student.avatar_url}
                          classLabel={classLabel(student)}
                          sub={student.email}
                          status={parentStatus(student)}
                          selectable={isAdmin}
                          selected={selectedStudents.has(student.id)}
                          onToggleSelect={() => toggleStudentSelection(student.id)}
                          onClick={() => setActiveStudent(student)}
                        />
                      ))}
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
              <Avatar name={`${activeStudent.first_name} ${activeStudent.last_name}`} src={activeStudent.avatar_url} size="lg" />
              <div className="font-medium">{activeStudent.first_name} {activeStudent.last_name}</div>
              {activeStudent.parents?.length > 0 ? (
                <StatusPill tone="green" icon={Users}>{activeStudent.parents.length} parent{activeStudent.parents.length > 1 ? 's' : ''}</StatusPill>
              ) : (
                <StatusPill tone="amber" icon={AlertTriangle}>Sans parent</StatusPill>
              )}
            </div>

            <div>
              <FieldRow label="Classe" value={classes.find((c) => c.id === activeStudent.class_id)?.name || (activeStudent.class_id ? 'Assignée' : 'Non assigné')} />
              <FieldRow label="Code MASSAR" value={activeStudent.massar_code} mono />
              <FieldRow label="Genre" value={activeStudent.gender === 'M' ? 'Garçon' : activeStudent.gender === 'F' ? 'Fille' : '—'} />
              <FieldRow label="Email" value={activeStudent.email} />
            </div>

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

                {/* Détection parent existant */}
                {existing.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800 flex gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      Cet élève a déjà <strong>{existing.length} parent(s)</strong> associé(s) :
                      <span className="block mt-0.5">{existing.map(p => `${p.first_name} ${p.last_name}${p.relationship ? ` (${p.relationship})` : ''}`).join(', ')}</span>
                      <span className="block mt-1 text-orange-600">Vous ajoutez un parent supplémentaire (les numéros déjà connus seront réutilisés).</span>
                    </div>
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
    </div>
  );
};

export default StudentsPage;
