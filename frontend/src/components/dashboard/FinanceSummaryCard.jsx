import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, AlertCircle, ArrowRight, DollarSign } from 'lucide-react';
import { financeApi, formatMAD } from '../../lib/financeApi';
import { useYear } from '../../contexts/YearContext';

export default function FinanceSummaryCard() {
  const { year } = useYear();
  const [summary, setSummary] = useState(null);
  const [cashflow, setCashflow] = useState([]);
  const [byClass, setByClass] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const loadAll = async () => {
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
      console.error('Finance summary error:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (error) return null;

  const maxCashflow = Math.max(1, ...cashflow.flatMap(c => [c.collected, c.issued]));
  const worstClasses = byClass.filter(c => c.total > 0).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-white to-blue-50/30 rounded-xl border border-blue-100 shadow-sm overflow-hidden"
    >
      <div className="p-5 border-b border-blue-100/50 bg-white/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Trésorerie {year}</h2>
              <p className="text-xs text-gray-500">Aperçu des recouvrements et retards</p>
            </div>
          </div>
          <Link
            to="/finance"
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Détails <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : !summary ? (
          <div className="text-center py-8 text-gray-400">
            <p>Aucune donnée financière</p>
            <Link to="/finance/fee-templates" className="text-sm text-blue-600 hover:underline">
              Créer un premier modèle de frais →
            </Link>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <Kpi
                label="Encaissé"
                value={formatMAD(summary.collectedThisMonth)}
                icon={<DollarSign className="w-4 h-4" />}
                color="green"
              />
              <Kpi
                label="Facturé"
                value={formatMAD(summary.issuedThisMonth)}
                icon={<TrendingUp className="w-4 h-4" />}
                color="blue"
                sub={`Taux: ${(summary.collectionRate || 0).toFixed(0)}%`}
              />
              <Kpi
                label="Dû total"
                value={formatMAD(summary.totalDue)}
                icon={<Wallet className="w-4 h-4" />}
                color="orange"
              />
              <Link to="/finance/overdue" className="block">
                <Kpi
                  label="En retard"
                  value={formatMAD(summary.totalOverdue)}
                  icon={<AlertCircle className="w-4 h-4" />}
                  color="red"
                  sub={`${summary.overdueCount} facture(s)`}
                  clickable
                />
              </Link>
            </div>

            {/* Cashflow + worst classes */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">6 derniers mois</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-sm"></span>Facturé</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-sm"></span>Encaissé</span>
                  </div>
                </div>
                <div className="flex items-end gap-2 h-24">
                  {cashflow.map((c, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end gap-0.5 h-20">
                        <div
                          className="flex-1 bg-blue-400 rounded-t"
                          style={{ height: `${(c.issued / maxCashflow) * 100}%` }}
                          title={`Facturé: ${formatMAD(c.issued)}`}
                        />
                        <div
                          className="flex-1 bg-green-500 rounded-t"
                          style={{ height: `${(c.collected / maxCashflow) * 100}%` }}
                          title={`Encaissé: ${formatMAD(c.collected)}`}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">{c.month_short}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Classes à surveiller</p>
                <div className="space-y-2">
                  {worstClasses.length === 0 && <p className="text-xs text-gray-400">Aucune donnée</p>}
                  {worstClasses.map(c => (
                    <div key={c.class_id}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="font-medium text-gray-700 truncate mr-2">{c.class_name}</span>
                        <span className={c.rate >= 80 ? 'text-green-600' : c.rate >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                          {c.rate.toFixed(0)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${c.rate >= 80 ? 'bg-green-500' : c.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, c.rate)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

function Kpi({ label, value, icon, color, sub, clickable }) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    red: 'bg-red-50 text-red-700 border-red-100'
  };
  return (
    <div className={`rounded-lg border ${colors[color]} p-3 ${clickable ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-lg font-bold mt-1">{value}</p>
      {sub && <p className="text-[10px] mt-0.5 opacity-70">{sub}</p>}
    </div>
  );
}
