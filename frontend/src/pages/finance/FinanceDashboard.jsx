import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, AlertCircle, DollarSign, FileText, CreditCard, ArrowRight, Calendar } from 'lucide-react';
import { financeApi, formatMAD } from '../../lib/financeApi';

export default function FinanceDashboard() {
  const [summary, setSummary] = useState(null);
  const [cashflow, setCashflow] = useState([]);
  const [byClass, setByClass] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, cl] = await Promise.all([
        financeApi.getSummary(),
        financeApi.getCashflow(6),
        financeApi.getByClass()
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tableau de bord Finance</h1>
          <p className="text-sm text-gray-500">Vue d'ensemble de la trésorerie et des recouvrements</p>
        </div>
        <button onClick={load} className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
          Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<DollarSign className="w-5 h-5" />}
          label="Encaissé ce mois"
          value={loading ? '—' : formatMAD(summary?.collectedThisMonth)}
          color="green"
        />
        <KpiCard
          icon={<FileText className="w-5 h-5" />}
          label="Facturé ce mois"
          value={loading ? '—' : formatMAD(summary?.issuedThisMonth)}
          color="blue"
          sub={summary ? `Taux: ${(summary.collectionRate || 0).toFixed(0)}%` : ''}
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Dû total"
          value={loading ? '—' : formatMAD(summary?.totalDue)}
          color="orange"
        />
        <KpiCard
          icon={<AlertCircle className="w-5 h-5" />}
          label="En retard"
          value={loading ? '—' : formatMAD(summary?.totalOverdue)}
          color="red"
          sub={summary ? `${summary.overdueCount} facture(s)` : ''}
          href="/finance/overdue"
        />
      </div>

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
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Taux de recouvrement par classe</h2>
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

function KpiCard({ icon, label, value, color, sub, href }) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    red: 'bg-red-50 text-red-700 border-red-100'
  };
  const card = (
    <div className={`rounded-xl border ${colors[color]} p-5 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          <span>{label}</span>
        </div>
        {href && <ArrowRight className="w-4 h-4 opacity-60" />}
      </div>
      <p className="text-2xl font-bold mt-2">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
    </div>
  );
  return href ? <Link to={href}>{card}</Link> : card;
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
