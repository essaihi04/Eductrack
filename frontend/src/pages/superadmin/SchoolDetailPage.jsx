import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  School, ArrowLeft, Users, GraduationCap, BookOpen, Calendar,
  TrendingUp, TrendingDown, Shield, UserPlus, X, RefreshCw,
  CheckCircle, AlertTriangle, Eye, Phone, Moon, Activity,
  Upload, Trash2, ImageIcon, Building2, Link, Unlink
} from 'lucide-react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';

const SchoolDetailPage = () => {
  const { schoolId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [school, setSchool] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [stats, setStats] = useState(null);
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Établissements rattachés à chaque admin (multi-écoles)
  const [allSchools, setAllSchools] = useState([]); // toutes les écoles de la plateforme
  const [adminLinkedSchools, setAdminLinkedSchools] = useState({}); // { userId: [school...] }
  const [expandedAdminLinks, setExpandedAdminLinks] = useState(null); // userId dont on affiche le panneau

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getToken = async () => {
    const { data } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return data?.session?.access_token;
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [schoolRes, overviewRes, trendsRes] = await Promise.all([
        fetch(`${apiUrl}/api/superadmin/schools/${schoolId}`, { headers }),
        fetch(`${apiUrl}/api/superadmin/schools/${schoolId}/overview?days=${days}`, { headers }),
        fetch(`${apiUrl}/api/superadmin/schools/${schoolId}/trends?days=${days}`, { headers })
      ]);

      const schoolData = await schoolRes.json();
      const overviewData = await overviewRes.json();
      const trendsData = await trendsRes.json();

      setSchool(schoolData.school);
      setAdmins(schoolData.admins || []);
      setStats(schoolData.stats);
      setOverview(overviewData);
      setTrends(trendsData.trends || []);
    } catch (err) {
      console.error('Erreur chargement détail école:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [schoolId, days]);

  const handleAddAdmin = async () => {
    if (!newAdmin.email || !newAdmin.password || !newAdmin.firstName || !newAdmin.lastName) return;
    try {
      setCreatingAdmin(true);
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/superadmin/schools/${schoolId}/admins`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdmin)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Erreur');
        return;
      }
      setNewAdmin({ email: '', password: '', firstName: '', lastName: '' });
      setShowAddAdmin(false);
      fetchAll();
    } catch (err) {
      console.error('Erreur ajout admin:', err);
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (userId) => {
    if (!confirm('Rétrograder cet admin en professeur ?')) return;
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/api/superadmin/schools/${schoolId}/admins/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAll();
    } catch (err) {
      console.error('Erreur suppression admin:', err);
    }
  };

  // Logo upload
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingLogo(true);
      const token = await getToken();
      const formData = new FormData();
      formData.append('logo', file);
      const res = await fetch(`${apiUrl}/api/superadmin/schools/${schoolId}/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Erreur upload');
        return;
      }
      fetchAll();
    } catch (err) {
      console.error('Erreur upload logo:', err);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm('Supprimer le logo de cette école ?')) return;
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/api/superadmin/schools/${schoolId}/logo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchAll();
    } catch (err) {
      console.error('Erreur suppression logo:', err);
    }
  };

  // Charge les écoles rattachées à un admin (et toutes les écoles pour le select)
  const loadAdminLinks = async (userId) => {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const [linksRes, allRes] = await Promise.all([
      fetch(`${apiUrl}/api/superadmin/admins/${userId}/schools`, { headers }),
      fetch(`${apiUrl}/api/superadmin/schools`, { headers }),
    ]);
    const linksData = await linksRes.json();
    const allData = await allRes.json();
    setAdminLinkedSchools((prev) => ({ ...prev, [userId]: linksData.schools || [] }));
    setAllSchools(allData.schools || []);
    setExpandedAdminLinks(userId);
  };

  const handleLinkSchool = async (userId, schoolId) => {
    if (!schoolId) return;
    const token = await getToken();
    await fetch(`${apiUrl}/api/superadmin/admins/${userId}/schools`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_id: schoolId }),
    });
    await loadAdminLinks(userId);
  };

  const handleUnlinkSchool = async (userId, sId) => {
    if (!confirm('Détacher cette école du compte ?')) return;
    const token = await getToken();
    const res = await fetch(`${apiUrl}/api/superadmin/admins/${userId}/schools/${sId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Impossible de détacher l'école active du compte");
      return;
    }
    await loadAdminLinks(userId);
  };

  const pColor = (pct, good = 70, warn = 50) =>
    pct >= good ? 'bg-green-100 text-green-800' :
    pct >= warn ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';

  const invColor = (pct) =>
    pct <= 5 ? 'bg-green-100 text-green-800' :
    pct <= 15 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!school) {
    return <div className="text-center py-20 text-muted-foreground">École introuvable</div>;
  }

  const ov = overview?.overview;
  const radarData = ov ? [
    { metric: 'Présence', value: ov.presence.present },
    { metric: 'Discipline', value: ov.discipline.correct },
    { metric: 'Participation', value: ov.participation.positive },
    { metric: 'Attitude', value: ov.attitude.correct },
    { metric: 'Cahier', value: ov.cahier.present },
    { metric: 'Vigilance', value: 100 - (ov.sleeping.rate || 0) }
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/superadmin/schools')} className="p-2 rounded-lg hover:bg-muted transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        {/* Logo de l'école */}
        <div className="relative group flex-shrink-0">
          {school.logo_url ? (
            <img
              src={`${apiUrl}${school.logo_url}`}
              alt={school.name}
              className="w-16 h-16 rounded-xl object-cover border-2 border-indigo-200 shadow-sm"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-indigo-100 border-2 border-dashed border-indigo-300 flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-indigo-400" />
            </div>
          )}
          <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
            <label className="p-1.5 bg-white rounded-lg cursor-pointer hover:bg-gray-100 transition" title="Changer le logo">
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
            {school.logo_url && (
              <button onClick={handleDeleteLogo} className="p-1.5 bg-white rounded-lg hover:bg-red-50 transition" title="Supprimer le logo">
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            )}
          </div>
          {uploadingLogo && (
            <div className="absolute inset-0 rounded-xl bg-white/80 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
            </div>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {school.name}
          </h1>
          <p className="text-muted-foreground text-sm">Code: {school.code} • Statut: {school.status === 'active' ? '🟢 Active' : '🔴 Suspendue'}</p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded-full transition ${days === d ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              {d}j
            </button>
          ))}
        </div>
      </div>

      {/* Stats rapides */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Professeurs', value: stats.teachers, icon: Users, color: 'text-blue-600 bg-blue-100' },
            { label: 'Élèves', value: stats.students, icon: GraduationCap, color: 'text-green-600 bg-green-100' },
            { label: 'Classes', value: stats.classes, icon: BookOpen, color: 'text-purple-600 bg-purple-100' },
            { label: 'Séances', value: stats.sessions, icon: Calendar, color: 'text-amber-600 bg-amber-100' }
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.color}`}><s.icon className="w-4 h-4" /></div>
                <div>
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* KPIs pédagogiques */}
      {ov ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Indicateurs pédagogiques — {days} derniers jours</CardTitle>
            <CardDescription>{overview.totalRecords} suivis • {overview.totalSessions} séances • {overview.totalClasses} classes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                { label: 'Présence', value: `${ov.presence.present}%`, cls: pColor(ov.presence.present) },
                { label: 'Absents', value: `${ov.presence.absent}%`, cls: invColor(ov.presence.absent) },
                { label: 'Discipline', value: `${ov.discipline.correct}%`, cls: pColor(ov.discipline.correct) },
                { label: 'Participation+', value: `${ov.participation.positive}%`, cls: pColor(ov.participation.positive, 40, 20) },
                { label: 'Attitude', value: `${ov.attitude.correct}%`, cls: pColor(ov.attitude.correct) },
                { label: 'Cahier', value: `${ov.cahier.present}%`, cls: pColor(ov.cahier.present) },
                { label: 'Dormance', value: `${ov.sleeping.rate}%`, cls: invColor(ov.sleeping.rate) },
                { label: 'Téléphone', value: `${ov.phone.rate}%`, cls: invColor(ov.phone.rate) }
              ].map((m, i) => (
                <div key={i} className={`text-center p-2.5 rounded-lg ${m.cls}`}>
                  <p className="text-sm font-bold">{m.value}</p>
                  <p className="text-[10px] font-medium opacity-80">{m.label}</p>
                </div>
              ))}
            </div>
            {ov.evaluation.average !== null && (
              <div className="mt-3 text-center">
                <span className="text-xs px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                  Évaluation moyenne: {ov.evaluation.average}/100 ({ov.evaluation.count} notes)
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            Aucune donnée pédagogique pour cette période
          </CardContent>
        </Card>
      )}

      {/* Radar + Tendances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Radar */}
        {radarData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Profil pédagogique</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar name="Score" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Tendances */}
        {trends.filter(t => t.records > 0).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Évolution sur {days} jours</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trends.filter(t => t.records > 0)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="presenceRate" name="Présence" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="participationRate" name="Participation" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cahierRate" name="Cahier" stroke="#a855f7" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sleepingRate" name="Dormance" stroke="#ef4444" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                  <Line type="monotone" dataKey="phoneRate" name="Téléphone" stroke="#f97316" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Gestion des admins */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Administrateurs de l'école</CardTitle>
              <CardDescription>{admins.length} admin{admins.length > 1 ? 's' : ''}</CardDescription>
            </div>
            <button
              onClick={() => setShowAddAdmin(!showAddAdmin)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              <UserPlus className="w-3 h-3" />
              Ajouter admin
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddAdmin && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-muted/30 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Prénom *"
                  value={newAdmin.firstName}
                  onChange={e => setNewAdmin({ ...newAdmin, firstName: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm"
                />
                <input
                  type="text"
                  placeholder="Nom *"
                  value={newAdmin.lastName}
                  onChange={e => setNewAdmin({ ...newAdmin, lastName: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm"
                />
                <input
                  type="email"
                  placeholder="Email *"
                  value={newAdmin.email}
                  onChange={e => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm"
                />
                <input
                  type="password"
                  placeholder="Mot de passe *"
                  value={newAdmin.password}
                  onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddAdmin}
                  disabled={creatingAdmin}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {creatingAdmin ? 'Création...' : 'Créer'}
                </button>
                <button onClick={() => setShowAddAdmin(false)} className="px-3 py-1.5 text-xs border rounded-lg hover:bg-muted">
                  Annuler
                </button>
              </div>
            </motion.div>
          )}

          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun administrateur assigné</p>
          ) : (
            admins.map(admin => {
              const isExpanded = expandedAdminLinks === admin.id;
              const linked = adminLinkedSchools[admin.id] || [];
              const linkableSchools = allSchools.filter(
                (s) => !linked.some((l) => l.id === s.id)
              );
              return (
                <div key={admin.id} className="rounded-lg border border-border overflow-hidden">
                  <div className="flex items-center justify-between p-3 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{admin.first_name} {admin.last_name}</p>
                        <p className="text-xs text-muted-foreground">{admin.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => isExpanded ? setExpandedAdminLinks(null) : loadAdminLinks(admin.id)}
                        title="Établissements rattachés"
                        className="flex items-center gap-1 text-xs text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded transition"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        Établissements
                      </button>
                      <button
                        onClick={() => handleRemoveAdmin(admin.id)}
                        className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded transition"
                      >
                        Retirer
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border p-3 bg-white space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Établissements pilotables par ce compte</p>
                      {linked.length === 0 && (
                        <p className="text-xs text-muted-foreground">Aucun établissement rattaché. L'école active courante est toujours accessible.</p>
                      )}
                      {linked.map((s) => (
                        <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30">
                          <div className="flex items-center gap-2">
                            {s.logo_url
                              ? <img src={s.logo_url} alt="" className="w-5 h-5 rounded object-cover" />
                              : <Building2 className="w-4 h-4 text-indigo-500" />}
                            <span className="text-sm">{s.name}</span>
                          </div>
                          <button onClick={() => handleUnlinkSchool(admin.id, s.id)}
                            title="Détacher"
                            className="text-red-500 hover:bg-red-50 p-1 rounded">
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {linkableSchools.length > 0 && (
                        <div className="flex items-center gap-2 pt-1">
                          <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                          <select
                            defaultValue=""
                            onChange={(e) => { handleLinkSchool(admin.id, e.target.value); e.target.value = ''; }}
                            className="flex-1 px-2 py-1.5 border rounded-lg text-xs"
                          >
                            <option value="" disabled>Rattacher une autre école…</option>
                            {linkableSchools.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SchoolDetailPage;
