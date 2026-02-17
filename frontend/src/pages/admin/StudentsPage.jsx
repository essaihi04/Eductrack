import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Eye, EyeOff, Copy, CheckSquare, Square, RefreshCw, MessageCircle, Send } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { generateEmail, generatePassword } from '../../utils/studentUtils';

const StudentsPage = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'school_admin';
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [filters, setFilters] = useState({
    className: '',
    level: '',
    searchName: '',
    searchEmail: ''
  });
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    classId: ''
  });

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

      return true;
    });
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

      if (profile.role === 'admin' || profile.role === 'school_admin') {
        // Admin: récupère tous les élèves et classes
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
      
      // Générer un nouveau mot de passe
      const newPassword = generatePassword();

      const endpoint = (profile.role === 'admin' || profile.role === 'school_admin') 
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
        const data = await res.json();
        
        // Mettre à jour le localStorage
        const storedPasswords = JSON.parse(localStorage.getItem('studentPasswords') || '{}');
        storedPasswords[studentId] = newPassword;
        localStorage.setItem('studentPasswords', JSON.stringify(storedPasswords));

        // Mettre à jour l'état
        setStudents(students.map(s => 
          s.id === studentId ? { ...s, password: newPassword } : s
        ));

        alert(`Mot de passe réinitialisé avec succès !\n\nNouveau mot de passe : ${newPassword}`);
      } else {
        const errorData = await res.json();
        alert(`Erreur : ${errorData.error || 'Impossible de réinitialiser le mot de passe'}`);
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('Erreur lors de la réinitialisation du mot de passe');
    }
  };

  if (loading) {
    return <div className="p-8">Chargement...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Élèves</h1>
          <p className="text-muted-foreground mt-2">Total: {students.length} élèves</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Ajouter un élève
          </button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          </div>
          <div className="mt-3 text-sm text-gray-600">
            Affichage: <span className="font-semibold">{getFilteredStudents().length}</span> / <span className="font-semibold">{students.length}</span> élève(s)
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
              <div className="grid grid-cols-2 gap-4">
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Liste des élèves</CardTitle>
              <CardDescription>Cliquez sur une ligne pour voir les identifiants de connexion</CardDescription>
            </div>
            {isAdmin && selectedStudents.size > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={sendBulkCredentialsToParents}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  title="Envoyer les identifiants aux parents via WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                  Envoyer via WhatsApp ({selectedStudents.size})
                </button>
                <button
                  onClick={deleteSelectedStudents}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
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

                {getFilteredStudents().map((student) => (
                  <div key={student.id} className="border rounded-lg overflow-hidden">
                    <div className="p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        {/* Checkbox de sélection (admin uniquement) */}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStudentSelection(student.id);
                            }}
                            className="p-1 hover:bg-gray-200 rounded flex-shrink-0"
                          >
                            {selectedStudents.has(student.id) ? (
                              <CheckSquare className="w-5 h-5 text-blue-600" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                        )}

                        {/* Informations de l'élève */}
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => togglePasswordVisibility(student.id)}
                        >
                          <p className="font-medium text-gray-900">{student.first_name} {student.last_name}</p>
                          <p className="text-sm text-gray-600">{student.email}</p>
                        </div>

                        <div className="text-sm text-gray-600">
                          {student.class_id ? 'Classe assignée' : '-'}
                        </div>

                        <div className="flex items-center gap-2">
                          <span 
                            className="text-xs text-gray-500 cursor-pointer hover:text-gray-700"
                            onClick={() => togglePasswordVisibility(student.id)}
                          >
                            {visiblePasswords[student.id] ? '▼' : '▶'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              resetPassword(student.id);
                            }}
                            className="p-2 hover:bg-blue-500/20 rounded transition-colors"
                            title="Réinitialiser le mot de passe"
                          >
                            <RefreshCw className="w-4 h-4 text-blue-600" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteStudent(student.id);
                              }}
                              className="p-2 hover:bg-red-500/20 rounded transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                  {visiblePasswords[student.id] && (
                    <div className="p-4 bg-blue-50 border-t border-gray-200 space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1">Email</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={student.email}
                            readOnly
                            className="flex-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                          />
                          <button
                            onClick={() => copyToClipboard(student.email)}
                            className="p-2 hover:bg-blue-200 rounded transition-colors"
                            title="Copier"
                          >
                            <Copy className="w-4 h-4 text-blue-600" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1">Mot de passe</label>
                        <div className="flex items-center gap-2">
                          <input
                            type={visiblePasswords[`pwd_${student.id}`] ? 'text' : 'password'}
                            value={student.password || ''}
                            readOnly
                            className="flex-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                          />
                          <button
                            onClick={() => setVisiblePasswords(prev => ({
                              ...prev,
                              [`pwd_${student.id}`]: !prev[`pwd_${student.id}`]
                            }))}
                            className="p-2 hover:bg-blue-200 rounded transition-colors"
                            title={visiblePasswords[`pwd_${student.id}`] ? 'Masquer' : 'Afficher'}
                          >
                            {visiblePasswords[`pwd_${student.id}`] ? (
                              <EyeOff className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Eye className="w-4 h-4 text-blue-600" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(student.password || '')}
                            className="p-2 hover:bg-blue-200 rounded transition-colors"
                            title="Copier"
                          >
                            <Copy className="w-4 h-4 text-blue-600" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-gray-600 bg-yellow-50 p-2 rounded">
                        ⚠️ Conservez ces identifiants en sécurité. L'élève doit les utiliser pour sa première connexion.
                      </p>

                      {/* Bouton WhatsApp pour envoyer au parent */}
                      <button
                        onClick={() => sendCredentialsToParent(student)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Envoyer au parent via WhatsApp
                      </button>
                    </div>
                  )}
                </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentsPage;
