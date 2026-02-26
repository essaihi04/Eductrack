import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, RefreshCw, Copy, Eye, EyeOff, CheckCircle, User, Upload, Download, FileSpreadsheet, AlertCircle, Send, Edit2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';

const TeachersPage = () => {
  const { profile } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedTeacher, setExpandedTeacher] = useState(null);
  const [teacherSubjects, setTeacherSubjects] = useState({});
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showSendCredentialsModal, setShowSendCredentialsModal] = useState(false);
  const [sendCredentialsFilter, setSendCredentialsFilter] = useState('all');
  const [sendingCredentials, setSendingCredentials] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    phone: ''
  });
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    subjectId: ''
  });

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const togglePasswordVisibility = (teacherId) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [teacherId]: !prev[teacherId]
    }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copié dans le presse-papiers !');
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const [teachersRes, subjectsRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/teachers`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/admin/subjects`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const teachersData = await teachersRes.json();
      const subjectsData = await subjectsRes.json();

      setTeachers(Array.isArray(teachersData) ? teachersData : []);
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);

      // Charger les matières pour chaque professeur
      for (const teacher of teachersData) {
        fetchTeacherSubjects(teacher.id, token);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeacherSubjects = async (teacherId, token) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/teachers/${teacherId}/subjects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setTeacherSubjects(prev => ({
        ...prev,
        [teacherId]: Array.isArray(data) ? data : []
      }));
    } catch (error) {
      console.error('Error fetching teacher subjects:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/teachers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || null,
          subjectId: formData.subjectId || null
        })
      });

      const data = await res.json();
      if (res.ok) {
        setTeachers([...teachers, data]);
        setCreatedCredentials({
          name: `${formData.firstName} ${formData.lastName}`,
          email: data.generatedEmail || data.email,
          password: data.password || 'Prof@2025'
        });
        setFormData({ firstName: '', lastName: '', phone: '', subjectId: '' });
        fetchData();
      } else {
        alert(data.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Error adding teacher:', error);
      alert('Erreur lors de la création du professeur');
    }
  };

  const deleteTeacher = async (id) => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/students/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setTeachers(teachers.filter(t => t.id !== id));
      }
    } catch (error) {
      console.error('Error deleting teacher:', error);
    }
  };

  const addSubjectToTeacher = async (teacherId, subjectId) => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/teachers/${teacherId}/subjects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ subjectId })
      });

      if (res.ok) {
        await fetchTeacherSubjects(teacherId, token);
      }
    } catch (error) {
      console.error('Error adding subject:', error);
    }
  };

  const removeSubjectFromTeacher = async (teacherId, subjectId) => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/teachers/${teacherId}/subjects/${subjectId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        await fetchTeacherSubjects(teacherId, token);
      }
    } catch (error) {
      console.error('Error removing subject:', error);
    }
  };

  const resetPassword = async (teacherId) => {
    if (!confirm('Êtes-vous sûr de vouloir réinitialiser le mot de passe de ce professeur ?')) {
      return;
    }

    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;
      
      // Générer un nouveau mot de passe
      const newPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);

      const res = await fetch(`${apiUrl}/api/admin/teachers/${teacherId}/reset-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newPassword })
      });

      if (res.ok) {
        const data = await res.json();
        
        // Mettre à jour l'état
        setTeachers(teachers.map(t => 
          t.id === teacherId ? { ...t, password: newPassword } : t
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

  const downloadTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const data = [
      ['Prénom', 'Nom', 'Téléphone', 'Matière'],
      ['Ahmed', 'Bennani', '0612345678', 'Mathématiques'],
      ['Fatima', 'El Amrani', '0623456789', 'Physique-Chimie'],
      ['Youssef', 'Tazi', '0634567890', 'Français']
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    worksheet['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Professeurs');
    XLSX.writeFile(workbook, 'modele_import_professeurs.xlsx');
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    setImporting(true);
    setImportResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rows.length < 2) {
        alert('Le fichier est vide ou ne contient que l\'en-tête');
        setImporting(false);
        return;
      }

      // Détecter les colonnes
      const header = rows[0].map(h => (h || '').toString().toLowerCase().trim());
      let firstNameCol = header.findIndex(h => h.includes('prénom') || h.includes('prenom') || h === 'first name');
      let lastNameCol = header.findIndex(h => (h.includes('nom') && !h.includes('prénom') && !h.includes('prenom')) || h === 'last name');
      let phoneCol = header.findIndex(h => h.includes('téléphone') || h.includes('telephone') || h.includes('phone') || h.includes('tel'));
      let subjectCol = header.findIndex(h => h.includes('matière') || h.includes('matiere') || h.includes('subject'));

      if (firstNameCol === -1) firstNameCol = 0;
      if (lastNameCol === -1) lastNameCol = 1;
      if (phoneCol === -1) phoneCol = 2;
      if (subjectCol === -1) subjectCol = 3;

      const teachersToImport = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const firstName = (row[firstNameCol] || '').toString().trim();
        const lastName = (row[lastNameCol] || '').toString().trim();
        const phone = (row[phoneCol] || '').toString().trim();
        const subjectName = (row[subjectCol] || '').toString().trim();

        if (firstName && lastName) {
          teachersToImport.push({ firstName, lastName, phone, subjectName });
        }
      }

      if (teachersToImport.length === 0) {
        alert('Aucun professeur valide trouvé dans le fichier');
        setImporting(false);
        return;
      }

      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/teachers/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ teachers: teachersToImport })
      });

      const result = await res.json();
      setImportResult(result);
      fetchData();
    } catch (error) {
      console.error('Erreur import Excel:', error);
      alert('Erreur lors de l\'importation du fichier Excel');
    } finally {
      setImporting(false);
    }
  };

  const openEditModal = (teacher) => {
    setEditingTeacher(teacher);
    setEditFormData({
      firstName: teacher.first_name || '',
      lastName: teacher.last_name || '',
      phone: teacher.phone || ''
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/teachers/${editingTeacher.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editFormData)
      });

      if (res.ok) {
        const updatedTeacher = await res.json();
        setTeachers(teachers.map(t => t.id === editingTeacher.id ? updatedTeacher : t));
        setEditingTeacher(null);
        alert('✅ Professeur modifié avec succès');
      } else {
        alert('❌ Erreur lors de la modification');
      }
    } catch (error) {
      console.error('Error updating teacher:', error);
      alert('Erreur lors de la modification du professeur');
    }
  };

  const sendCredentialsViaWhatsApp = async () => {
    try {
      setSendingCredentials(true);
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiUrl}/api/admin/teachers/send-credentials-whatsapp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: sendCredentialsFilter
        })
      });

      const data = await res.json();
      
      if (res.ok) {
        alert(`✅ Identifiants envoyés avec succès à ${data.sent || 0} professeur(s) via WhatsApp`);
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
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Professeurs</h1>
          <p className="text-muted-foreground mt-2">Total: {teachers.length} professeurs</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSendCredentialsModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            <Send className="w-5 h-5" />
            Envoyer identifiants WhatsApp
          </button>
          <button
            onClick={() => { setShowImport(!showImport); setShowForm(false); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Upload className="w-5 h-5" />
            Importer Excel
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowImport(false); }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus className="w-5 h-5" />
            Ajouter un professeur
          </button>
        </div>
      </div>

      {/* Modal pour modifier un professeur */}
      {editingTeacher && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingTeacher(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Modifier le professeur</h3>
              <p className="text-sm text-gray-500 mt-1">Mettre à jour les informations personnelles</p>
            </div>
            <form onSubmit={handleEditSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Prénom</label>
                <input
                  type="text"
                  value={editFormData.firstName}
                  onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Nom</label>
                <input
                  type="text"
                  value={editFormData.lastName}
                  onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Téléphone</label>
                <input
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  placeholder="+212 6XX XXX XXX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Format: +212 6XX XXX XXX</p>
              </div>
              <div className="pt-2 border-t border-gray-200 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingTeacher(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal pour envoyer les identifiants via WhatsApp */}
      {showSendCredentialsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSendCredentialsModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Envoyer les identifiants via WhatsApp</h3>
              <p className="text-sm text-gray-500 mt-1">Les login et mots de passe seront envoyés aux professeurs</p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Envoyer à</label>
                <select
                  value={sendCredentialsFilter}
                  onChange={(e) => setSendCredentialsFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">Tous les professeurs</option>
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Les identifiants (login et mot de passe) seront envoyés séparément aux numéros de téléphone des professeurs pour faciliter la copie.
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
                disabled={sendingCredentials}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      {/* Identifiants générés après création */}
      {createdCredentials && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-green-100">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-green-900">Professeur créé avec succès !</h3>
                  <p className="text-sm text-gray-600 mt-1">Voici les identifiants de connexion de <strong>{createdCredentials.name}</strong> :</p>
                </div>
                <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Email de connexion</p>
                      <p className="font-mono text-sm font-medium">{createdCredentials.email}</p>
                    </div>
                    <button onClick={() => copyToClipboard(createdCredentials.email)} className="p-1.5 hover:bg-gray-200 rounded transition">
                      <Copy className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Mot de passe</p>
                      <p className="font-mono text-sm font-medium">{createdCredentials.password}</p>
                    </div>
                    <button onClick={() => copyToClipboard(createdCredentials.password)} className="p-1.5 hover:bg-gray-200 rounded transition">
                      <Copy className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setCreatedCredentials(null)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Fermer
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section Import Excel */}
      {showImport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              Importer des professeurs via Excel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Instructions</h4>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Téléchargez le modèle Excel ci-dessous</li>
                <li>Remplissez les colonnes : <strong>Prénom</strong>, <strong>Nom</strong>, <strong>Téléphone</strong>, <strong>Matière</strong></li>
                <li>Le téléphone est optionnel (format: 0612345678)</li>
                <li>La matière doit correspondre exactement au nom d'une matière existante</li>
                <li>L'email et le mot de passe seront générés automatiquement</li>
              </ol>
              {subjects.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs font-medium text-blue-900 mb-1">Matières disponibles :</p>
                  <div className="flex flex-wrap gap-1">
                    {subjects.map(s => (
                      <span key={s.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{s.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Download className="w-4 h-4" />
                Télécharger le modèle
              </button>

              <label className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                importing ? 'bg-gray-300 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
                <Upload className="w-4 h-4" />
                {importing ? 'Importation en cours...' : 'Charger le fichier Excel'}
                <input type="file" accept=".xlsx,.xls" onChange={handleExcelImport} className="hidden" disabled={importing} />
              </label>
            </div>

            {/* Résultats d'import */}
            {importResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-800">{importResult.message}</span>
                </div>

                {importResult.teachers && importResult.teachers.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b">
                      <h4 className="font-medium text-sm">Professeurs créés ({importResult.teachers.length})</h4>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left px-4 py-2">Nom</th>
                            <th className="text-left px-4 py-2">Email</th>
                            <th className="text-left px-4 py-2">Mot de passe</th>
                            <th className="text-left px-4 py-2">Matière</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importResult.teachers.map((t, i) => (
                            <tr key={i} className="border-t hover:bg-gray-50">
                              <td className="px-4 py-2">{t.first_name} {t.last_name}</td>
                              <td className="px-4 py-2 font-mono text-xs">{t.email}</td>
                              <td className="px-4 py-2 font-mono text-xs">{t.password}</td>
                              <td className="px-4 py-2">{t.assignedSubject || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="border border-red-200 rounded-lg overflow-hidden">
                    <div className="bg-red-50 px-4 py-2 border-b border-red-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <h4 className="font-medium text-sm text-red-800">Erreurs ({importResult.errors.length})</h4>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {importResult.errors.map((err, i) => (
                        <div key={i} className="px-4 py-2 border-t border-red-100 text-sm">
                          <span className="font-medium">{err.name}</span> : <span className="text-red-600">{err.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Ajouter un nouveau professeur
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Prénom *</label>
                  <input
                    type="text"
                    placeholder="Prénom du professeur"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Nom *</label>
                  <input
                    type="text"
                    placeholder="Nom du professeur"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    required
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Téléphone</label>
                  <input
                    type="tel"
                    placeholder="0612345678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Matière</label>
                  <select
                    value={formData.subjectId}
                    onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="">— Aucune matière —</option>
                    {subjects.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                L'email et le mot de passe seront générés automatiquement ({profile?.school?.name ? `prénomnom@${profile.school.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')}.ma` : 'prénomnom@école.ma'}).
              </p>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                  Créer le professeur
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setCreatedCredentials(null); }}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 text-gray-700"
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
          <CardTitle>Liste des professeurs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {teachers.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Aucun professeur</p>
            ) : (
              teachers.map((teacher) => (
                <div key={teacher.id} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-muted/50 hover:bg-muted cursor-pointer"
                    onClick={() => setExpandedTeacher(expandedTeacher === teacher.id ? null : teacher.id)}>
                    <div className="flex-1">
                      <p className="font-medium">{teacher.first_name} {teacher.last_name}</p>
                      <p className="text-sm text-muted-foreground">{teacher.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {teacherSubjects[teacher.id]?.length || 0} matière(s)
                      </span>
                      {expandedTeacher === teacher.id ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </div>

                  {expandedTeacher === teacher.id && (
                    <div className="p-4 border-t space-y-3">
                      {/* Informations du professeur */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium text-gray-900">Informations personnelles</h4>
                          <button
                            onClick={() => openEditModal(teacher)}
                            className="p-2 hover:bg-gray-200 rounded transition-colors"
                            title="Modifier les informations"
                          >
                            <Edit2 className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="text-sm font-medium text-gray-700">Nom complet:</label>
                            <p className="text-sm text-gray-900">{teacher.first_name} {teacher.last_name}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700">Téléphone:</label>
                            <p className="text-sm text-gray-900">{teacher.phone || 'Non renseigné'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Carte avec identifiants */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-medium text-blue-900 mb-3">Identifiants de connexion</h4>
                        
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <label className="text-sm font-medium text-gray-700">Email:</label>
                              <p className="text-sm text-gray-900 font-mono bg-white px-2 py-1 rounded border">
                                {teacher.email}
                              </p>
                            </div>
                            <button
                              onClick={() => copyToClipboard(teacher.email)}
                              className="p-2 hover:bg-blue-100 rounded transition-colors"
                              title="Copier l'email"
                            >
                              <Copy className="w-4 h-4 text-blue-600" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <label className="text-sm font-medium text-gray-700">Mot de passe:</label>
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-gray-900 font-mono bg-white px-2 py-1 rounded border flex-1">
                                  {visiblePasswords[teacher.id] ? (teacher.password || 'Non défini') : '•••••••••'}
                                </p>
                                <button
                                  onClick={() => togglePasswordVisibility(teacher.id)}
                                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                                  title={visiblePasswords[teacher.id] ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                >
                                  {visiblePasswords[teacher.id] ? (
                                    <EyeOff className="w-4 h-4 text-gray-600" />
                                  ) : (
                                    <Eye className="w-4 h-4 text-gray-600" />
                                  )}
                                </button>
                              </div>
                            </div>
                            {teacher.password && (
                              <button
                                onClick={() => copyToClipboard(teacher.password)}
                                className="p-2 hover:bg-blue-100 rounded transition-colors"
                                title="Copier le mot de passe"
                              >
                                <Copy className="w-4 h-4 text-blue-600" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Matières assignées</h4>
                        <div className="space-y-1">
                          {teacherSubjects[teacher.id]?.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Aucune matière assignée</p>
                          ) : (
                            teacherSubjects[teacher.id]?.map((ts) => (
                              <div key={ts.id} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                                <span className="text-sm">{ts.subjects?.name || 'Matière inconnue'}</span>
                                <button
                                  onClick={() => removeSubjectFromTeacher(teacher.id, ts.subject_id)}
                                  className="p-1 hover:bg-red-500/20 rounded transition-colors"
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Ajouter une matière</h4>
                        <div className="flex gap-2">
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                addSubjectToTeacher(teacher.id, e.target.value);
                                e.target.value = '';
                              }
                            }}
                            className="flex-1 px-3 py-2 border rounded text-sm"
                          >
                            <option value="">Sélectionner une matière</option>
                            {subjects.map(subject => {
                              const isAssigned = teacherSubjects[teacher.id]?.some(ts => ts.subject_id === subject.id);
                              return !isAssigned && (
                                <option key={subject.id} value={subject.id}>
                                  {subject.name}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t">
                        <button
                          onClick={() => resetPassword(teacher.id)}
                          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center justify-center gap-2"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Réinitialiser le mot de passe
                        </button>
                        <button
                          onClick={() => deleteTeacher(teacher.id)}
                          className="flex-1 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                        >
                          Supprimer le professeur
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeachersPage;
