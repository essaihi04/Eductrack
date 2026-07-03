import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, GraduationCap, BookOpen, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { useYear } from '../../contexts/YearContext';

const StatCard = ({ icon: Icon, title, value, description, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.02 }}
    transition={{ duration: 0.3 }}
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

const StatsPage = () => {
  const { year } = useYear();
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    attendanceRate: 0
  });
  const [loading, setLoading] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const fetchStats = async () => {
    try {
      const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
      const token = session?.access_token;

      // academic_year : les compteurs (élèves = inscriptions actives, classes)
      // sont scopés à l'année active — mêmes totaux que l'entonnoir et la finance.
      const res = await fetch(`${apiUrl}/api/admin/stats?academic_year=${encodeURIComponent(year)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Chargement...</div>;
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Statistiques</h1>
        <p className="text-muted-foreground mt-2">Vue d'ensemble de l'établissement · Année scolaire {year}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Users}
          title="Total Élèves"
          value={stats.totalStudents}
          description="Élèves inscrits"
          color="bg-blue-500"
        />
        <StatCard
          icon={GraduationCap}
          title="Professeurs"
          value={stats.totalTeachers}
          description="Enseignants actifs"
          color="bg-green-500"
        />
        <StatCard
          icon={BookOpen}
          title="Classes"
          value={stats.totalClasses}
          description="Classes actives"
          color="bg-purple-500"
        />
        <StatCard
          icon={TrendingUp}
          title="Taux de présence"
          value={`${stats.attendanceRate}%`}
          description="Moyenne globale"
          color="bg-orange-500"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Résumé</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-muted/50 rounded">
              <span className="font-medium">Élèves par classe</span>
              <span className="text-2xl font-bold">
                {stats.totalStudents > 0 && stats.totalClasses > 0
                  ? (stats.totalStudents / stats.totalClasses).toFixed(1)
                  : 0}
              </span>
            </div>
            <div className="flex justify-between items-center p-4 bg-muted/50 rounded">
              <span className="font-medium">Élèves par professeur</span>
              <span className="text-2xl font-bold">
                {stats.totalStudents > 0 && stats.totalTeachers > 0
                  ? (stats.totalStudents / stats.totalTeachers).toFixed(1)
                  : 0}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StatsPage;
