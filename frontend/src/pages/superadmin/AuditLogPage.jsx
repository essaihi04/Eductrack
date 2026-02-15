import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, RefreshCw, School, Shield, Filter } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { useAuth } from '../../contexts/AuthContext';

const ACTION_LABELS = {
  create_school: { label: 'Création école', color: 'bg-green-100 text-green-700' },
  update_school: { label: 'Modification école', color: 'bg-blue-100 text-blue-700' },
  suspend_school: { label: 'Suspension école', color: 'bg-red-100 text-red-700' },
  reactivate_school: { label: 'Réactivation école', color: 'bg-green-100 text-green-700' },
  create_admin: { label: 'Création admin', color: 'bg-indigo-100 text-indigo-700' },
  remove_admin: { label: 'Retrait admin', color: 'bg-amber-100 text-amber-700' }
};

const AuditLogPage = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const getToken = async () => {
    const { data } = await (await import('../../lib/supabase')).supabase.auth.getSession();
    return data?.session?.access_token;
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      let url = `${apiUrl}/api/superadmin/audit?limit=100`;
      if (filterAction) url += `&action=${filterAction}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Erreur audit log:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [filterAction]);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-7 h-7 text-indigo-600" />
            Journal d'audit
          </h1>
          <p className="text-muted-foreground">Historique des actions administratives</p>
        </div>
        <button onClick={fetchLogs} className="p-2 rounded-lg hover:bg-muted transition">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <button
          onClick={() => setFilterAction('')}
          className={`px-3 py-1 text-xs rounded-full transition ${!filterAction ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground'}`}
        >
          Tout
        </button>
        {Object.entries(ACTION_LABELS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setFilterAction(key)}
            className={`px-3 py-1 text-xs rounded-full transition ${filterAction === key ? 'bg-indigo-600 text-white' : 'bg-muted text-muted-foreground'}`}
          >
            {val.label}
          </button>
        ))}
      </div>

      {/* Logs */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Aucune action enregistrée</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {logs.map((log, idx) => {
                const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-700' };
                const userName = log.profiles
                  ? `${log.profiles.first_name || ''} ${log.profiles.last_name || ''}`.trim() || log.profiles.email
                  : 'Système';
                const schoolName = log.schools?.name || '—';

                return (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.02 }}
                    className="flex items-center gap-4 p-4 hover:bg-muted/30 transition"
                  >
                    <div className={`px-2 py-1 rounded-full text-[10px] font-bold ${actionInfo.color} whitespace-nowrap`}>
                      {actionInfo.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{userName}</span>
                        {log.details?.name && <span className="text-muted-foreground"> — {log.details.name}</span>}
                        {log.details?.email && <span className="text-muted-foreground"> — {log.details.email}</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                        <School className="w-3 h-3" /> {schoolName}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AuditLogPage;
