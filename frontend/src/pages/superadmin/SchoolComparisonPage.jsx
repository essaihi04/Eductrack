import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  GitCompare, RefreshCw, School, TrendingUp, TrendingDown
} from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];

const SchoolComparisonPage = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getToken = async () => {
    const { data } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return data?.session?.access_token;
  };

  const fetchComparison = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`${apiUrl}/api/superadmin/compare?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error('Erreur comparaison:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchComparison(); }, [days]);

  const pColor = (pct, good = 70, warn = 50) =>
    pct >= good ? 'text-green-700 bg-green-100' :
    pct >= warn ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100';

  const invColor = (pct) =>
    pct <= 5 ? 'text-green-700 bg-green-100' :
    pct <= 15 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100';

  const healthColor = (score) =>
    score >= 70 ? 'text-green-700' : score >= 50 ? 'text-amber-700' : 'text-red-700';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const schools = data?.schools || [];
  const withData = schools.filter(s => s.metrics);

  // Prepare bar chart data
  const barData = withData.map(s => ({
    name: s.code || s.name.slice(0, 10),
    presence: s.metrics.presence,
    participation: s.metrics.participation,
    attitude: s.metrics.attitude,
    cahier: s.metrics.cahier || 0,
    healthScore: s.healthScore
  }));

  // Prepare radar data for overlay
  const radarMetrics = ['Présence', 'Participation', 'Attitude', 'Cahier', 'Vigilance'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="w-7 h-7 text-indigo-600" />
            Comparaison inter-écoles
          </h1>
          <p className="text-muted-foreground">Analyse comparative des performances pédagogiques</p>
        </div>
        <div className="flex gap-2">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 text-xs rounded-full transition ${days === d ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground'}`}
            >
              {d} jours
            </button>
          ))}
        </div>
      </div>

      {schools.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            Aucune école active trouvée
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Classement par score de santé */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Classement par score de santé pédagogique</CardTitle>
              <CardDescription>Période: {data?.period?.start} → {data?.period?.end}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {schools.map((s, idx) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center gap-3 p-3 bg-muted/20 rounded-lg"
                  >
                    <span className={`text-lg font-bold w-8 text-center ${idx === 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      #{idx + 1}
                    </span>
                    <div className="p-1.5 rounded bg-indigo-100">
                      <School className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.totalRecords} suivis</p>
                    </div>
                    {s.healthScore != null ? (
                      <>
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${s.healthScore >= 70 ? 'bg-green-500' : s.healthScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${s.healthScore}%` }}
                          />
                        </div>
                        <span className={`text-sm font-bold w-12 text-right ${healthColor(s.healthScore)}`}>
                          {s.healthScore}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pas de données</span>
                    )}
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tableau comparatif détaillé */}
          {withData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tableau comparatif détaillé</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="py-2 px-3 text-left font-semibold">École</th>
                        <th className="py-2 px-3 text-center font-semibold">Suivis</th>
                        <th className="py-2 px-3 text-center font-semibold">Présence</th>
                        <th className="py-2 px-3 text-center font-semibold">Participation</th>
                        <th className="py-2 px-3 text-center font-semibold">Attitude</th>
                        <th className="py-2 px-3 text-center font-semibold">Cahier</th>
                        <th className="py-2 px-3 text-center font-semibold">Dormance</th>
                        <th className="py-2 px-3 text-center font-semibold">Téléphone</th>
                        <th className="py-2 px-3 text-center font-semibold">Éval.</th>
                        <th className="py-2 px-3 text-center font-semibold">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withData.map((s, idx) => (
                        <tr key={s.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-muted/10'}>
                          <td className="py-2 px-3 font-medium">{s.name}</td>
                          <td className="py-2 px-3 text-center">{s.totalRecords}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pColor(s.metrics.presence)}`}>{s.metrics.presence}%</span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pColor(s.metrics.participation, 40, 20)}`}>{s.metrics.participation}%</span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pColor(s.metrics.attitude)}`}>{s.metrics.attitude}%</span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {s.metrics.cahier != null ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pColor(s.metrics.cahier)}`}>{s.metrics.cahier}%</span>
                            ) : '—'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${invColor(s.metrics.sleeping)}`}>{s.metrics.sleeping}%</span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${invColor(s.metrics.phone)}`}>{s.metrics.phone}%</span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {s.metrics.evaluation != null ? `${s.metrics.evaluation}/100` : '—'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`text-sm font-bold ${healthColor(s.healthScore)}`}>{s.healthScore}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Graphique barres */}
          {barData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Comparaison visuelle</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="presence" name="Présence" fill="#22c55e" />
                    <Bar dataKey="participation" name="Participation" fill="#3b82f6" />
                    <Bar dataKey="attitude" name="Attitude" fill="#a855f7" />
                    <Bar dataKey="cahier" name="Cahier" fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default SchoolComparisonPage;
