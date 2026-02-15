import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  School, Plus, Search, Users, GraduationCap, BookOpen,
  Calendar, MoreVertical, CheckCircle, XCircle, RefreshCw,
  TrendingUp, Shield
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';

const SchoolsListPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [globalStats, setGlobalStats] = useState(null);
  const [newSchool, setNewSchool] = useState({ name: '', code: '', address: '', phone: '' });

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getToken = async () => {
    const { data } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return data?.session?.access_token;
  };

  const fetchSchools = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/superadmin/schools`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSchools(data.schools || []);
    } catch (err) {
      console.error('Erreur chargement écoles:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGlobalStats = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/superadmin/global-stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setGlobalStats(data);
    } catch (err) {
      console.error('Erreur stats globales:', err);
    }
  };

  useEffect(() => {
    fetchSchools();
    fetchGlobalStats();
  }, []);

  const handleCreate = async () => {
    if (!newSchool.name || !newSchool.code) return;
    try {
      setCreating(true);
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/superadmin/schools`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newSchool)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Erreur création');
        return;
      }
      setNewSchool({ name: '', code: '', address: '', phone: '' });
      setShowCreate(false);
      fetchSchools();
      fetchGlobalStats();
    } catch (err) {
      console.error('Erreur création école:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (schoolId, newStatus) => {
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/api/superadmin/schools/${schoolId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      fetchSchools();
    } catch (err) {
      console.error('Erreur changement statut:', err);
    }
  };

  const filtered = schools.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-7 h-7 text-indigo-600" />
            Super Administration
          </h1>
          <p className="text-muted-foreground">Gestion des écoles et vision pédagogique globale</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
        >
          <Plus className="w-4 h-4" />
          Nouvelle école
        </button>
      </div>

      {/* Stats globales */}
      {globalStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Écoles', value: globalStats.schools, icon: School, color: 'text-indigo-600 bg-indigo-100' },
            { label: 'Professeurs', value: globalStats.teachers, icon: Users, color: 'text-blue-600 bg-blue-100' },
            { label: 'Élèves', value: globalStats.students, icon: GraduationCap, color: 'text-green-600 bg-green-100' },
            { label: 'Classes', value: globalStats.classes, icon: BookOpen, color: 'text-purple-600 bg-purple-100' }
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Formulaire création */}
      {showCreate && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-indigo-200 bg-indigo-50/30">
            <CardHeader>
              <CardTitle className="text-base">Créer une nouvelle école</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Nom de l'école *</label>
                  <input
                    type="text"
                    value={newSchool.name}
                    onChange={(e) => setNewSchool({ ...newSchool, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Ex: Lycée Al Jabr"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Code unique *</label>
                  <input
                    type="text"
                    value={newSchool.code}
                    onChange={(e) => setNewSchool({ ...newSchool, code: e.target.value.toUpperCase() })}
                    className="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Ex: ALJABR"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Adresse</label>
                  <input
                    type="text"
                    value={newSchool.address}
                    onChange={(e) => setNewSchool({ ...newSchool, address: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                    placeholder="Adresse de l'école"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Téléphone</label>
                  <input
                    type="text"
                    value={newSchool.phone}
                    onChange={(e) => setNewSchool({ ...newSchool, phone: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                    placeholder="Ex: 0522-123456"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newSchool.name || !newSchool.code}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {creating ? 'Création...' : 'Créer l\'école'}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-muted transition"
                >
                  Annuler
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          placeholder="Rechercher une école..."
        />
      </div>

      {/* Liste des écoles */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <School className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Aucune école trouvée</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((school, idx) => (
            <motion.div
              key={school.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card
                className={`cursor-pointer hover:shadow-lg transition-shadow ${
                  school.status === 'suspended' ? 'opacity-60 border-red-200' : 'border-slate-200'
                }`}
                onClick={() => navigate(`/superadmin/schools/${school.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {school.logo_url ? (
                        <img
                          src={`${apiUrl}${school.logo_url}`}
                          alt={school.name}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-200"
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <div className={`p-2 rounded-lg bg-indigo-100 ${school.logo_url ? 'hidden' : ''}`}>
                        <School className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{school.name}</h3>
                        <p className="text-xs text-muted-foreground">{school.code}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                      school.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {school.status === 'active' ? 'Active' : 'Suspendue'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: 'Profs', value: school.stats?.teachers || 0, icon: Users },
                      { label: 'Élèves', value: school.stats?.students || 0, icon: GraduationCap },
                      { label: 'Classes', value: school.stats?.classes || 0, icon: BookOpen },
                      { label: 'Séances', value: school.stats?.sessions || 0, icon: Calendar }
                    ].map((s) => (
                      <div key={s.label} className="p-2 bg-muted/30 rounded-lg">
                        <p className="text-sm font-bold">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end mt-3 gap-2" onClick={(e) => e.stopPropagation()}>
                    {school.status === 'active' ? (
                      <button
                        onClick={() => handleStatusChange(school.id, 'suspended')}
                        className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded transition"
                      >
                        Suspendre
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(school.id, 'active')}
                        className="text-xs px-2 py-1 text-green-600 hover:bg-green-50 rounded transition"
                      >
                        Réactiver
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SchoolsListPage;
