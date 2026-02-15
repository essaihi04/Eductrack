import { useState, useEffect } from 'react';
import { ChevronLeft, BarChart3, TrendingUp, AlertCircle, Users, Target, Phone, Moon, Heart, Eye, PenLine, MessageSquare, Lightbulb } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { 
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, Legend, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';

const StudentProfile = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [student, setStudent] = useState(null);
  const [stats, setStats] = useState(null);
  const [recentTracking, setRecentTracking] = useState([]);
  const [loading, setLoading] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchData();
  }, [studentId]);

  const fetchData = async () => {
    try {
      const { data: { session: authSession } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = authSession?.access_token;

      const [studentRes, statsRes, trackingRes] = await Promise.all([
        fetch(`${apiUrl}/api/teacher/students/${studentId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/teacher/students/${studentId}/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/api/teacher/students/${studentId}/tracking`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const studentData = await studentRes.json();
      const statsData = await statsRes.json();
      const trackingData = await trackingRes.json();

      setStudent(studentData);
      setStats(statsData);
      setRecentTracking(Array.isArray(trackingData) ? trackingData.slice(0, 10) : []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  if (!student) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-600">Élève non trouvé</p>
      </div>
    );
  }

  const getPresenceColor = (status) => {
    switch (status) {
      case 'present': return 'text-green-600';
      case 'absent': return 'text-red-600';
      case 'late': return 'text-yellow-600';
      case 'excused': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getPresenceLabel = (status) => {
    switch (status) {
      case 'present': return 'Présent';
      case 'absent': return 'Absent';
      case 'late': return 'Retard';
      case 'excused': return 'Excusé';
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-3xl font-bold">{student.first_name} {student.last_name}</h1>
          <p className="text-muted-foreground mt-1">Fiche élève - Lecture seule</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Présences
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Présent</span>
                <span className="text-2xl font-bold text-green-600">{stats?.present_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Absent</span>
                <span className="text-2xl font-bold text-red-600">{stats?.absent_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Retards</span>
                <span className="text-2xl font-bold text-yellow-600">{stats?.late_count || 0}</span>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="text-xs text-gray-500">Taux de présence</div>
                <div className="text-lg font-bold text-green-600">
                  {stats?.total_sessions > 0 ? Math.round((stats.present_count / stats.total_sessions) * 100) : 0}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              Travail & Écriture
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">⭐ Excellent</span>
                <span className="text-2xl font-bold text-green-600">{stats?.excellent_participation ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">🙋 Bon</span>
                <span className="text-2xl font-bold text-blue-600">{stats?.bon_participation ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">😐 Faible</span>
                <span className="text-2xl font-bold text-yellow-600">{stats?.faible_participation ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">📚 Devoirs</span>
                <span className="text-2xl font-bold text-emerald-600">
                  {stats?.homework_rate !== null && stats?.homework_rate !== undefined ? `${stats.homework_rate}%` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">📘 Cahier</span>
                <span className="text-2xl font-bold text-cyan-600">
                  {stats?.cahier_rate !== null && stats?.cahier_rate !== undefined ? `${stats.cahier_rate}%` : '—'}
                </span>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="text-xs text-gray-500">✍️ Écriture</div>
                <div className="text-lg font-bold text-indigo-600">
                  {stats?.writing_rate !== null && stats?.writing_rate !== undefined ? `${stats.writing_rate}%` : '—'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="w-5 h-5 text-orange-600" />
              Comportement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  🟢 Concentré
                </span>
                <span className="text-2xl font-bold text-green-600">{stats?.concentre_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 flex items-center gap-1">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                  🟡 Moyen
                </span>
                <span className="text-2xl font-bold text-yellow-600">{stats?.moyen_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 flex items-center gap-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  🔴 Distrait
                </span>
                <span className="text-2xl font-bold text-red-600">{stats?.distrait_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">📱 Téléphone</span>
                <span className="text-2xl font-bold text-red-600">{stats?.phone_use_rate ?? 0}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">😴 Dort en classe</span>
                <span className="text-2xl font-bold text-orange-600">{stats?.sleeping_count ?? 0}</span>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="text-xs text-gray-500">Attitude</div>
                <div className="text-sm text-gray-700">
                  ✅ {stats?.correct_count ?? 0} correct · 💬 {stats?.bavarde_count ?? 0} bavarde · ⚠️ {stats?.perturbateur_count ?? 0} perturbateur
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Historique détaillé
          </CardTitle>
          <CardDescription>10 dernières séances avec indicateurs complets</CardDescription>
        </CardHeader>
        <CardContent>
          {recentTracking.length === 0 ? (
            <p className="text-gray-600 text-center py-8">Aucun suivi enregistré</p>
          ) : (
            <div className="space-y-2">
              {recentTracking.map((tracking, idx) => (
                <div key={idx} className="p-3 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-900">{tracking.session_date}</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      tracking.presence === 'present' 
                        ? 'bg-green-100 text-green-700' 
                        : tracking.presence === 'absent'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {tracking.presence === 'present' ? 'Présent' : tracking.presence === 'absent' ? 'Absent' : 'Retard'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div className="flex flex-col">
                      <span className="text-gray-500 mb-1">Travail</span>
                      <span className={`font-medium px-2 py-1 rounded text-center ${
                        tracking.work_status === 'excellent' ? 'bg-green-100 text-green-700' :
                        tracking.work_status === 'good' ? 'bg-blue-100 text-blue-700' :
                        tracking.work_status === 'average' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {tracking.work_status === 'excellent' ? 'Excellent' : 
                         tracking.work_status === 'good' ? 'Bon' :
                         tracking.work_status === 'average' ? 'Moyen' : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500 mb-1">Vigilance</span>
                      <span className={`font-medium px-2 py-1 rounded text-center ${
                        tracking.discipline === 'concentre' ? 'bg-green-100 text-green-700' :
                        tracking.discipline === 'moyen' ? 'bg-yellow-100 text-yellow-700' :
                        tracking.discipline === 'distrait' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {tracking.discipline === 'concentre' ? 'Vigilant' :
                         tracking.discipline === 'moyen' ? 'Moyen' :
                         tracking.discipline === 'distrait' ? 'Distrait' : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500 mb-1">Téléphone</span>
                      <span className={`font-medium px-2 py-1 rounded text-center ${
                        tracking.phone_use ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {tracking.phone_use ? '✓ Utilisé' : '○ Non utilisé'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500 mb-1">Attitude</span>
                      <span className={`font-medium px-2 py-1 rounded text-center ${
                        tracking.attitude === 'correct' ? 'bg-green-100 text-green-700' :
                        tracking.attitude === 'bavarre' ? 'bg-blue-100 text-blue-700' :
                        tracking.attitude === 'perturbateur' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {tracking.attitude === 'correct' ? 'Correct' :
                         tracking.attitude === 'bavarre' ? 'Bavarre' :
                         tracking.attitude === 'perturbateur' ? 'Perturbateur' : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-gray-500 mb-1">Écriture</span>
                      <span className={`font-medium px-2 py-1 rounded text-center ${
                        tracking.writing ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {tracking.writing ? '✓ Fait' : '○ Non fait'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Observations</CardTitle>
          <CardDescription>Remarques pédagogiques</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-900">
                Cette fiche est en lecture seule. Les données sont agrégées à partir des suivis de séance.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tendances et recommandations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Évolution sur 30 jours
            </CardTitle>
            <CardDescription>Présence, participation et vigilance</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={recentTracking.map((t, idx) => ({
                date: t.session_date?.slice(5) || `S${idx}`,
                presence: t.presence === 'present' ? 100 : 0,
                participation: t.participation === 'excellent' ? 100 : t.participation === 'bon' ? 70 : t.participation === 'faible' ? 30 : 0,
                vigilance: t.discipline === 'concentre' ? 100 : t.discipline === 'moyen' ? 60 : t.discipline === 'distrait' ? 20 : 0
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#94a3b8" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
                <Line type="monotone" dataKey="presence" name="Présence" stroke="#22c55e" strokeWidth={2} />
                <Line type="monotone" dataKey="participation" name="Participation" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="vigilance" name="Vigilance" stroke="#eab308" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Profil global
            </CardTitle>
            <CardDescription>Vue radar des compétences</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={[
                { subject: 'Présence', value: stats?.total_sessions > 0 ? Math.round((stats.present_count / stats.total_sessions) * 100) : 0, fullMark: 100 },
                { subject: 'Participation', value: stats?.total_sessions > 0 ? Math.round(((stats.excellent_participation * 100 + stats.bon_participation * 70 + stats.faible_participation * 30) / stats.total_sessions)) : 0, fullMark: 100 },
                { subject: 'Vigilance', value: stats?.total_sessions > 0 ? Math.round(((stats.concentre_count * 100 + stats.moyen_count * 60 + stats.distrait_count * 20) / stats.total_sessions)) : 0, fullMark: 100 },
                { subject: 'Attitude', value: stats?.total_sessions > 0 ? Math.round(((stats.correct_count * 100 + stats.bavarde_count * 40 + stats.perturbateur_count * 10) / stats.total_sessions)) : 0, fullMark: 100 },
                { subject: 'Écriture', value: stats?.writing_rate ?? 0, fullMark: 100 },
                { subject: 'Cahier', value: stats?.cahier_rate ?? 0, fullMark: 100 }
              ]}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar name="Compétences" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                <Tooltip formatter={(v) => `${Math.round(v)}%`} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recommandations pédagogiques */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="w-5 h-5 text-blue-600" />
            Recommandations pédagogiques
          </CardTitle>
          <CardDescription>Stratégies personnalisées basées sur les observations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-blue-900 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Points forts
              </h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5"></div>
                  <span>Assiduité remarquable ({stats?.present_count || 0} présences)</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5"></div>
                  <span>Comportement stable en classe</span>
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-orange-900 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Axes d'amélioration
              </h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-1.5"></div>
                  <span>Stimuler la participation orale</span>
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-1.5"></div>
                  <span>Renforcer l'engagement dans les activités</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-4 p-3 bg-white rounded-lg border border-blue-200">
            <h5 className="font-medium text-blue-900 mb-2">Actions suggérées</h5>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                Questions directes
              </span>
              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                Travail en binôme
              </span>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                Feedback positif
              </span>
              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                Rôle de leader
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentProfile;
