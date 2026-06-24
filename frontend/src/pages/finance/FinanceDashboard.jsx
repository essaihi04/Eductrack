import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, AlertCircle, DollarSign, FileText, CreditCard, Calendar } from 'lucide-react';
import { financeApi, formatMAD } from '../../lib/financeApi';
import { PageHeader, KpiGrid, KpiCard } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';

export default function FinanceDashboard() {
  const { year } = useYear();
  const [summary, setSummary] = useState(null);
  const [cashflow, setCashflow] = useState([]);
  const [byClass, setByClass] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, cl] = await Promise.all([
        financeApi.getSummary(year),
        financeApi.getCashflow(6),
        financeApi.getByClass(year)
      ]);
      setSummary(s);
      setCashflow(c.cashflow || []);
      setByClass(cl.classes || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const maxCashflow = Math.max(1, ...cashflow.flatMap(c => [c.collected, c.issued]));

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={DollarSign} title="Tableau de bord Finance" color="blue"
        subtitle="Vue d'ensemble de la trésorerie et des recouvrements"
        onRefresh={load} loading={loading} />

      <KpiGrid cols={4}>
        <KpiCard icon={DollarSign} label={`Encaissé ${year}`} tone="green"
          value={loading ? '—' : formatMAD(summary?.collectedThisMonth)}
          sub={summary ? `Taux d'encaissement (réel): ${(summary.realRate || 0).toFixed(0)}%` : ''} />
        <KpiCard icon={FileText} label={`${summary?.forecast ? 'Attendu (prévisionnel)' : 'Facturé'} ${year}`} tone="blue"
          value={loading ? '—' : formatMAD(summary?.issuedThisMonth)}
          sub={summary ? `${summary.forecast ? 'Avancement' : 'Taux'}: ${(summary.collectionRate || 0).toFixed(0)}%${summary.forecast ? ` · ${summary.forecastStudents || 0} élève(s)` : ''}` : ''} />
        <KpiCard icon={TrendingUp} label={summary?.forecast ? 'Dû prévisionnel' : 'Dû total'} tone="orange"
          value={loading ? '—' : formatMAD(summary?.totalDue)} />
        <KpiCard icon={AlertCircle} label="En retard" tone="red"
          value={loading ? '—' : formatMAD(summary?.totalOverdue)}
          sub={summary ? `${summary.overdueCount} service(s)` : ''}
          href="/finance/overdue" />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cashflow chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Évolution 6 derniers mois</h2>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-400"></span>Facturé</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500"></span>Encaissé</span>
            </div>
          </div>
          <div className="flex items-end gap-3 h-48">
            {cashflow.map((c, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end gap-1 h-40">
                  <div
                    className="flex-1 bg-blue-400 rounded-t hover:bg-blue-500 transition-colors relative group"
                    style={{ height: `${(c.issued / maxCashflow) * 100}%` }}
                    title={`Facturé: ${formatMAD(c.issued)}`}
                  />
                  <div
                    className="flex-1 bg-green-500 rounded-t hover:bg-green-600 transition-colors"
                    style={{ height: `${(c.collected / maxCashflow) * 100}%` }}
                    title={`Encaissé: ${formatMAD(c.collected)}`}
                  />
                </div>
                <span className="text-xs text-gray-500">{c.month_short}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top retards par classe */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-0.5">Avancement par classe (prévisionnel)</h2>
          <p className="text-xs text-gray-400 mb-4">Encaissé / attendu de l'année</p>
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {byClass.length === 0 && <p className="text-sm text-gray-500">Aucune donnée</p>}
            {byClass.slice(0, 10).map(c => (
              <div key={c.class_id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{c.class_name}</span>
                  <span className={c.rate >= 80 ? 'text-green-600' : c.rate >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                    {c.rate.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${c.rate >= 80 ? 'bg-green-500' : c.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, c.rate)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {formatMAD(c.paid)} / {formatMAD(c.total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickAction to="/finance/invoices" icon={<FileText className="w-5 h-5" />} label="Factures" color="blue" />
        <QuickAction to="/finance/payments" icon={<CreditCard className="w-5 h-5" />} label="Paiements" color="green" />
        <QuickAction to="/finance/fee-templates" icon={<Calendar className="w-5 h-5" />} label="Modèles de frais" color="purple" />
        <QuickAction to="/finance/overdue" icon={<AlertCircle className="w-5 h-5" />} label="Retards" color="red" />
      </div>
    </div>
  );
}

function QuickAction({ to, icon, label, color }) {
  const colors = {
    blue: 'bg-blue-600 hover:bg-blue-700',
    green: 'bg-green-600 hover:bg-green-700',
    purple: 'bg-purple-600 hover:bg-purple-700',
    red: 'bg-red-600 hover:bg-red-700'
  };
  return (
    <Link
      to={to}
      className={`${colors[color]} text-white rounded-xl p-4 flex items-center gap-3 transition-colors shadow-sm`}
    >
      {icon}
      <span className="font-medium text-sm">{label}</span>
    </Link>
  );
}
