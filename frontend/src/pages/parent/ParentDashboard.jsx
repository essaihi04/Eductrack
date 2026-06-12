import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Bus, BookOpen, AlertCircle, CheckCircle2, ChevronRight, User, Bell } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ParentDashboard = () => {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${apiUrl}/api/parent/children`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erreur de chargement');
      const data = await res.json();
      setChildren(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Chargement…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Espace parent</h1>
        <p className="text-gray-600 mt-1">Suivi pédagogique et transport de vos enfants</p>
      </header>

      {children.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <User className="w-10 h-10 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-700 font-medium">Aucun enfant n'est encore associé à votre compte.</p>
          <p className="text-gray-500 text-sm mt-1">Contactez l'établissement pour finaliser l'association.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {children.map(child => (
          <ChildCard key={child.id} child={child} onOpen={() => navigate(`/parent/children/${child.id}`)} />
        ))}
      </div>

      {children.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/parent/notifications')}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-3"><Bell className="w-6 h-6 text-purple-600" /></div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">Notifications</p>
                <p className="text-sm text-gray-500">Messages de l'école (absences, contrôles, transport…)</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          <button
            onClick={() => navigate('/parent/transport')}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-3"><Bus className="w-6 h-6 text-blue-600" /></div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">Suivi transport en direct</p>
                <p className="text-sm text-gray-500">Position du bus et événements</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      )}
    </div>
  );
};

const ChildCard = ({ child, onOpen }) => {
  const s = child.summary || {};
  const presence = s.presence_rate;
  const presenceColor = presence === null
    ? 'text-gray-400'
    : presence >= 90 ? 'text-green-600'
    : presence >= 75 ? 'text-blue-600'
    : presence >= 50 ? 'text-orange-600' : 'text-red-600';

  return (
    <button
      onClick={onOpen}
      className="text-left rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition group"
    >
      <div className="flex items-start gap-4">
        {child.avatar_url ? (
          <img
            src={child.avatar_url.startsWith('http') ? child.avatar_url : `${apiUrl}${child.avatar_url}`}
            alt={`${child.first_name} ${child.last_name}`}
            className="w-14 h-14 rounded-full object-cover shrink-0 border border-gray-200"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white flex items-center justify-center font-bold text-lg shrink-0">
            {(child.first_name?.[0] || '').toUpperCase()}{(child.last_name?.[0] || '').toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 truncate">
              {child.first_name} {child.last_name}
            </h3>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-700" />
          </div>
          <p className="text-sm text-gray-500 truncate">
            {child.class ? `${child.class.name}${child.class.level ? ` • ${child.class.level}` : ''}` : 'Aucune classe'}
            {child.relationship ? ` • ${child.relationship}` : ''}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Metric
              icon={CheckCircle2}
              color={presenceColor}
              label="Présence"
              value={presence === null ? '—' : `${presence}%`}
            />
            <Metric
              icon={BookOpen}
              color="text-purple-600"
              label="Devoirs à rendre"
              value={s.pending_homework ?? 0}
            />
            <Metric
              icon={GraduationCap}
              color="text-gray-700"
              label="Séances"
              value={s.total_sessions ?? 0}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {s.overdue_homework > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                <AlertCircle className="w-3.5 h-3.5" />
                {s.overdue_homework} devoir{s.overdue_homework > 1 ? 's' : ''} en retard
              </span>
            )}
            {s.upcoming_homework > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                <BookOpen className="w-3.5 h-3.5" />
                {s.upcoming_homework} à venir
              </span>
            )}
            {s.absent_count > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                <AlertCircle className="w-3.5 h-3.5" />
                {s.absent_count} absence{s.absent_count > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

const Metric = ({ icon: Icon, color, label, value }) => (
  <div className="rounded-lg bg-gray-50 p-2">
    <Icon className={`w-4 h-4 mx-auto ${color}`} />
    <p className={`text-base font-bold mt-1 ${color}`}>{value}</p>
    <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
  </div>
);

export default ParentDashboard;
