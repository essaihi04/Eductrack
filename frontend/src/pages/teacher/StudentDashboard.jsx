import { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, AlertCircle, Star, Activity } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { studentId } = useParams();
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getAuthToken = async () => {
    const { supabase } = await import('../../lib/supabase');
    const { data: { session: authSession } } = await supabase.auth.getSession();
    return authSession?.access_token;
  };

  useEffect(() => {
    fetchMetrics();
  }, [studentId]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      const res = await fetch(`${apiUrl}/api/teacher/students/${studentId}/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      console.error('Erreur:', err);
      setError('Impossible de charger les métriques');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  if (error || !metrics) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-600">{error || 'Erreur'}</div>
      </div>
    );
  }

  const { student, presenceScore, workScore, participationScore, disciplineScore, phoneScore, heatmap, cahierStats, totalSessions } = metrics;

  // Déterminer le badge global
  const globalScore = Math.round((presenceScore + workScore + participationScore + disciplineScore) / 4);
  let badgeColor = 'bg-yellow-100 text-yellow-800';
  let badgeText = 'Normal';
  if (globalScore >= 80) {
    badgeColor = 'bg-green-100 text-green-800';
    badgeText = 'Excellent';
  } else if (globalScore >= 60) {
    badgeColor = 'bg-blue-100 text-blue-800';
    badgeText = 'Bon';
  } else if (globalScore < 40) {
    badgeColor = 'bg-red-100 text-red-800';
    badgeText = 'Alerte';
  }

  // Composant KPI Card
  const KPICard = ({ title, score, icon: Icon, color }) => (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600 uppercase">{title}</p>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-bold text-gray-900">{score}%</p>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${color.replace('text', 'bg')}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );

  // Composant Heatmap
  const HeatmapCell = ({ value, label }) => {
    let bgColor = 'bg-gray-100';
    if (value === 'present' || value === 'excellent' || value === 'good' || value === false) {
      bgColor = 'bg-green-200';
    } else if (value === 'late' || value === 'average') {
      bgColor = 'bg-yellow-200';
    } else if (value === 'absent' || value === 'poor' || value === true) {
      bgColor = 'bg-red-200';
    } else if (value === 'excused') {
      bgColor = 'bg-blue-200';
    }
    return (
      <div className={`w-8 h-8 rounded text-xs flex items-center justify-center font-bold ${bgColor}`} title={label}>
        {value !== null && value !== undefined ? String(value)[0].toUpperCase() : '—'}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {student.first_name} {student.last_name}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Suivi pédagogique • {totalSessions} séances enregistrées
            </p>
          </div>
          <div className={`px-4 py-2 rounded-full font-semibold text-sm ${badgeColor}`}>
            {badgeText}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard title="Présence" score={presenceScore} icon={Activity} color="text-blue-600" />
        <KPICard title="Travail" score={workScore} icon={TrendingUp} color="text-green-600" />
        <KPICard title="Discipline" score={disciplineScore} icon={AlertCircle} color="text-orange-600" />
        <KPICard title="Téléphone" score={phoneScore} icon={Activity} color="text-red-600" />
      </div>

      {/* Heatmap Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Thermique — 7 derniers jours</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-semibold text-gray-600">Catégorie</th>
                {heatmap.map((day, idx) => (
                  <th key={idx} className="text-center py-2 px-1 font-semibold text-gray-600">
                    {new Date(day.date).toLocaleDateString('fr-FR', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-2 font-medium text-gray-700">Présence</td>
                {heatmap.map((day, idx) => (
                  <td key={idx} className="text-center py-3 px-1">
                    <HeatmapCell value={day.presence} label={day.presence} />
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-2 font-medium text-gray-700">Travail</td>
                {heatmap.map((day, idx) => (
                  <td key={idx} className="text-center py-3 px-1">
                    <HeatmapCell value={day.work_status} label={day.work_status} />
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-2 font-medium text-gray-700">Discipline</td>
                {heatmap.map((day, idx) => (
                  <td key={idx} className="text-center py-3 px-1">
                    <HeatmapCell value={day.discipline} label={day.discipline} />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 px-2 font-medium text-gray-700">Téléphone</td>
                {heatmap.map((day, idx) => (
                  <td key={idx} className="text-center py-3 px-1">
                    <HeatmapCell value={day.phone_use} label={day.phone_use ? 'Utilisé' : 'Non utilisé'} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cahier Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Cahier de classe</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">Écriture de la leçon</p>
            <p className="text-2xl font-bold text-blue-600">{cahierStats.lecon}</p>
            <p className="text-xs text-blue-700 mt-1">séances complètes</p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-green-50 to-green-100 p-4">
            <p className="text-sm font-semibold text-green-900 mb-2">Collage des documents</p>
            <p className="text-2xl font-bold text-green-600">{cahierStats.collage}</p>
            <p className="text-xs text-green-700 mt-1">séances correctes</p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 p-4">
            <p className="text-sm font-semibold text-purple-900 mb-2">Lisibilité</p>
            <p className="text-2xl font-bold text-purple-600">{cahierStats.lisibilite}</p>
            <p className="text-xs text-purple-700 mt-1">séances lisibles</p>
          </div>
        </div>
      </div>

      {/* Recommandations IA */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
          <Star className="w-5 h-5" />
          Recommandations pédagogiques
        </h2>
        <ul className="space-y-2 text-sm text-amber-800">
          {globalScore < 40 && (
            <li>⚠️ <strong>Action urgente :</strong> Élève en difficulté. Prévoir un entretien avec la famille.</li>
          )}
          {presenceScore < 60 && (
            <li>📍 <strong>Présence :</strong> Taux d'absence élevé. Vérifier les raisons et communiquer avec les parents.</li>
          )}
          {workScore < 60 && (
            <li>📚 <strong>Devoirs :</strong> Élève ne complète pas régulièrement ses devoirs. Mettre en place un suivi.</li>
          )}
          {participationScore < 60 && (
            <li>🗣️ <strong>Participation :</strong> Élève peu actif en classe. Encourager la participation.</li>
          )}
          {disciplineScore < 60 && (
            <li>⚡ <strong>Discipline :</strong> Comportement à améliorer. Discuter des attentes en classe.</li>
          )}
          {globalScore >= 80 && (
            <li>⭐ <strong>Excellent :</strong> Élève en très bonne progression. Continuer à encourager.</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default StudentDashboard;
