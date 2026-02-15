import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Calendar, MessageSquare, ClipboardList, BookOpen, TrendingUp, AlertCircle, Star, ArrowRight, Trophy } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const StatCard = ({ icon: Icon, title, value, description, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.02 }}
  >
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-3xl font-bold mt-2">{value}</h3>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
          <div className={`p-4 rounded-full ${color}`}>
            <Icon className="w-8 h-8 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

const TeacherDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalClasses: 0,
    totalSubjects: 0,
    excellentStudents: 0,
    goodStudents: 0,
    alertStudents: 0,
  });
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [studentsMetrics, setStudentsMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rankingData, setRankingData] = useState(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchDashboardData();
    fetchRanking();
  }, []);

  const fetchRanking = async () => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${apiUrl}/api/teacher/dashboard/class-ranking`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRankingData(data);
      }
    } catch (error) {
      console.error('Error fetching ranking:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      const [classesRes, subjectsRes] = await Promise.all([
        fetch(`${apiUrl}/api/teacher/my-classes`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${apiUrl}/api/teacher/my-subjects`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      const classesData = await classesRes.json();
      const subjectsData = await subjectsRes.json();

      setClasses(Array.isArray(classesData) ? classesData : []);
      setSubjects(Array.isArray(subjectsData) ? subjectsData : []);

      let totalStudents = 0;
      for (const cls of classesData) {
        const studentsRes = await fetch(`${apiUrl}/api/teacher/classes/${cls.id}/students`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const studentsData = await studentsRes.json();
        totalStudents += Array.isArray(studentsData) ? studentsData.length : 0;
      }

      // Fetch students metrics for the first class
      if (Array.isArray(classesData) && classesData.length > 0) {
        const metricsRes = await fetch(`${apiUrl}/api/teacher/classes/${classesData[0].id}/students-metrics`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const metricsData = await metricsRes.json();
        setStudentsMetrics(Array.isArray(metricsData) ? metricsData : []);

        const excellentCount = (metricsData || []).filter(s => s.badge === 'excellent').length;
        const goodCount = (metricsData || []).filter(s => s.badge === 'good').length;
        const alertCount = (metricsData || []).filter(s => s.badge === 'alert').length;

        setStats({
          totalStudents,
          totalClasses: classesData.length || 0,
          totalSubjects: subjectsData.length || 0,
          excellentStudents: excellentCount,
          goodStudents: goodCount,
          alertStudents: alertCount,
        });
      } else {
        setStats({
          totalStudents,
          totalClasses: classesData.length || 0,
          totalSubjects: subjectsData.length || 0,
          excellentStudents: 0,
          goodStudents: 0,
          alertStudents: 0,
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Tableau de bord Professeur</h1>
        <p className="text-muted-foreground mt-2">Bienvenue, {profile.first_name} {profile.last_name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Users}
          title="Élèves"
          value={stats.totalStudents}
          description="Total élèves assignés"
          color="bg-blue-500"
        />
        <StatCard
          icon={Calendar}
          title="Classes"
          value={stats.totalClasses}
          description="Classes assignées"
          color="bg-green-500"
        />
        <StatCard
          icon={BookOpen}
          title="Matières"
          value={stats.totalSubjects}
          description="Matières enseignées"
          color="bg-purple-500"
        />
        <StatCard
          icon={TrendingUp}
          title="Statistiques"
          value={`${stats.excellentStudents} ⭐`}
          description="Élèves excellents"
          color="bg-orange-500"
        />
      </div>

      {/* Suivi Rapide Stats */}
      {studentsMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-green-600" />
                Élèves Excellents
              </CardTitle>
              <CardDescription>Performance supérieure à 80%</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-green-600">{stats.excellentStudents}</div>
              <p className="text-sm text-gray-600 mt-2">
                {Math.round((stats.excellentStudents / studentsMetrics.length) * 100)}% des élèves
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Élèves Bons
              </CardTitle>
              <CardDescription>Performance entre 60% et 80%</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-blue-600">{stats.goodStudents}</div>
              <p className="text-sm text-gray-600 mt-2">
                {Math.round((stats.goodStudents / studentsMetrics.length) * 100)}% des élèves
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                Élèves à Risque
              </CardTitle>
              <CardDescription>Performance inférieure à 40%</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-red-600">{stats.alertStudents}</div>
              <p className="text-sm text-gray-600 mt-2">
                {Math.round((stats.alertStudents / studentsMetrics.length) * 100)}% des élèves
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Performing Students */}
      {studentsMetrics.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Top Élèves</CardTitle>
                <CardDescription>Meilleures performances du suivi rapide</CardDescription>
              </div>
              <button
                onClick={() => navigate('/teacher/class-metrics')}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Voir tout
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {studentsMetrics
                .sort((a, b) => b.globalScore - a.globalScore)
                .slice(0, 5)
                .map((student) => {
                  let badgeColor = 'bg-yellow-100 text-yellow-800';
                  let badgeIcon = '⚪';
                  if (student.badge === 'excellent') {
                    badgeColor = 'bg-green-100 text-green-800';
                    badgeIcon = '⭐';
                  } else if (student.badge === 'good') {
                    badgeColor = 'bg-blue-100 text-blue-800';
                    badgeIcon = '✓';
                  } else if (student.badge === 'alert') {
                    badgeColor = 'bg-red-100 text-red-800';
                    badgeIcon = '⚠️';
                  }

                  return (
                    <div
                      key={student.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => navigate(`/teacher/student/${student.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${badgeColor}`}>
                          {badgeIcon}
                        </span>
                        <span className="font-medium text-gray-900">{student.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">{student.totalSessions} séances</span>
                        <span className="text-lg font-bold text-gray-900">{student.globalScore}%</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Class Ranking */}
      {rankingData && rankingData.ranking?.length > 0 && (() => {
        const { ranking } = rankingData;
        const getRankBadge = (rank) => {
          if (rank === 1) return { emoji: '🥇', bg: 'bg-yellow-100 border-yellow-400', text: 'text-yellow-800' };
          if (rank === 2) return { emoji: '🥈', bg: 'bg-gray-100 border-gray-400', text: 'text-gray-700' };
          if (rank === 3) return { emoji: '🥉', bg: 'bg-orange-100 border-orange-400', text: 'text-orange-800' };
          return { emoji: `#${rank}`, bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600' };
        };
        const getScoreColor = (score) => {
          if (score >= 80) return 'text-green-600';
          if (score >= 60) return 'text-blue-600';
          if (score >= 40) return 'text-yellow-600';
          return 'text-red-600';
        };
        const getBarColor = (value) => {
          if (value >= 80) return 'bg-green-500';
          if (value >= 60) return 'bg-blue-500';
          if (value >= 40) return 'bg-yellow-500';
          return 'bg-red-500';
        };
        return (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    Classement de mes classes
                  </CardTitle>
                  <CardDescription>Score composite sur les 30 derniers jours</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ranking.map((cls) => {
                  const badge = cls.rank ? getRankBadge(cls.rank) : null;
                  return (
                    <div key={cls.classId} className={`p-4 rounded-lg border-2 transition-all ${
                      cls.rank === 1 ? 'border-yellow-300 bg-yellow-50' :
                      cls.rank === 2 ? 'border-gray-300 bg-gray-50' :
                      cls.rank === 3 ? 'border-orange-300 bg-orange-50' :
                      'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          {badge ? (
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${badge.bg} ${badge.text} border`}>
                              {cls.rank <= 3 ? badge.emoji : cls.rank}
                            </span>
                          ) : (
                            <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">—</span>
                          )}
                          <div>
                            <p className="font-bold text-gray-900">{cls.name}</p>
                            <p className="text-xs text-gray-500">{cls.level} • {cls.studentCount} élèves • {cls.sessionCount} séances</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {cls.compositeScore !== null ? (
                            <p className={`text-2xl font-black ${getScoreColor(cls.compositeScore)}`}>{cls.compositeScore}</p>
                          ) : (
                            <p className="text-sm text-gray-400">N/A</p>
                          )}
                        </div>
                      </div>
                      {cls.compositeScore !== null && (
                        <div className="grid grid-cols-5 gap-2 mt-3">
                          {[
                            { key: 'attendanceRate', label: 'Présence' },
                            { key: 'incidentRate', label: 'Discipline' },
                            { key: 'participationRate', label: 'Participation' },
                            { key: 'homeworkRate', label: 'Devoirs' },
                            { key: 'cahierRate', label: 'Cahier' }
                          ].map(({ key, label }) => (
                            <div key={key} className="text-center">
                              <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
                              {cls.metrics[key] !== null ? (
                                <>
                                  <p className="text-xs font-bold">{cls.metrics[key]}%</p>
                                  <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-0.5">
                                    <div className={`h-full rounded-full ${getBarColor(cls.metrics[key])}`} style={{ width: `${Math.min(cls.metrics[key], 100)}%` }} />
                                  </div>
                                </>
                              ) : (
                                <p className="text-xs text-gray-400">—</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Actions rapides</CardTitle>
            <CardDescription>Accès rapide aux fonctionnalités</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <button className="p-4 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg text-left transition-colors">
                <Calendar className="w-6 h-6 text-blue-600 mb-2" />
                <p className="font-medium text-sm">Marquer présence</p>
              </button>
              <button className="p-4 bg-green-500/10 hover:bg-green-500/20 rounded-lg text-left transition-colors">
                <ClipboardList className="w-6 h-6 text-green-600 mb-2" />
                <p className="font-medium text-sm">Nouveau devoir</p>
              </button>
              <button className="p-4 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg text-left transition-colors">
                <MessageSquare className="w-6 h-6 text-purple-600 mb-2" />
                <p className="font-medium text-sm">Évaluer comportement</p>
              </button>
              <button className="p-4 bg-orange-500/10 hover:bg-orange-500/20 rounded-lg text-left transition-colors">
                <BookOpen className="w-6 h-6 text-orange-600 mb-2" />
                <p className="font-medium text-sm">Ajouter leçon</p>
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mes Classes</CardTitle>
            <CardDescription>Classes assignées</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {classes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune classe assignée</p>
              ) : (
                classes.map(cls => (
                  <div key={cls.id} className="p-3 bg-blue-50 rounded-lg">
                    <p className="font-medium text-sm">{cls.name}</p>
                    <p className="text-xs text-muted-foreground">{cls.level} - {cls.academic_year}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Mes Matières</CardTitle>
            <CardDescription>Matières enseignées</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune matière assignée</p>
              ) : (
                subjects.map(subject => (
                  <div key={subject.id} className="p-3 bg-purple-50 rounded-lg">
                    <p className="font-medium text-sm">{subject.name}</p>
                    <p className="text-xs text-muted-foreground">{subject.code}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions rapides</CardTitle>
            <CardDescription>Accès rapide aux fonctionnalités</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <button className="p-4 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg text-left transition-colors">
                <Calendar className="w-6 h-6 text-blue-600 mb-2" />
                <p className="font-medium text-sm">Marquer présence</p>
              </button>
              <button className="p-4 bg-green-500/10 hover:bg-green-500/20 rounded-lg text-left transition-colors">
                <ClipboardList className="w-6 h-6 text-green-600 mb-2" />
                <p className="font-medium text-sm">Nouveau devoir</p>
              </button>
              <button className="p-4 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg text-left transition-colors">
                <MessageSquare className="w-6 h-6 text-purple-600 mb-2" />
                <p className="font-medium text-sm">Évaluer comportement</p>
              </button>
              <button className="p-4 bg-orange-500/10 hover:bg-orange-500/20 rounded-lg text-left transition-colors">
                <BookOpen className="w-6 h-6 text-orange-600 mb-2" />
                <p className="font-medium text-sm">Ajouter leçon</p>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assistant IA</CardTitle>
          <CardDescription>Aide personnalisée pour vos élèves</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-primary/10 rounded-lg">
              <p className="text-sm font-medium mb-2">💡 Suggestion du jour</p>
              <p className="text-sm text-muted-foreground">
                Organisez une séance de soutien pour les élèves ayant des difficultés en mathématiques.
              </p>
            </div>
            <button className="w-full p-3 bg-accent hover:bg-accent/80 rounded-lg text-sm font-medium transition-colors">
              Demander conseil à l'IA
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherDashboard;
