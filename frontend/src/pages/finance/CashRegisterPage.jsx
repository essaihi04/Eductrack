import { useEffect, useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, Banknote, CreditCard, Building2, FileCheck, MoreHorizontal } from 'lucide-react';
import { financeApi, formatMAD, formatDate, METHOD_LABELS } from '../../lib/financeApi';

// Bornes de période (jour / semaine / mois / année / personnalisé)
const todayISO = () => new Date().toISOString().slice(0, 10);
const computeRange = (period, ref) => {
  const d = ref ? new Date(ref) : new Date();
  const iso = (x) => x.toISOString().slice(0, 10);
  if (period === 'day') return { from: iso(d), to: iso(d) };
  if (period === 'week') {
    const day = (d.getDay() + 6) % 7; // lundi = 0
    const monday = new Date(d); monday.setDate(d.getDate() - day);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { from: iso(monday), to: iso(sunday) };
  }
  if (period === 'month') {
    return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  }
  if (period === 'year') {
    return { from: iso(new Date(d.getFullYear(), 0, 1)), to: iso(new Date(d.getFullYear(), 11, 31)) };
  }
  return { from: iso(d), to: iso(d) };
};

const METHOD_ICONS = {
  cash: Banknote, check: FileCheck, transfer: Building2, card_pos: CreditCard, other: MoreHorizontal,
};
const METHOD_ORDER = ['cash', 'check', 'transfer', 'card_pos', 'other'];

const PERIODS = [
  { key: 'day', label: "Aujourd'hui" },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
  { key: 'year', label: 'Année' },
  { key: 'custom', label: 'Personnalisé' },
];

const CashRegisterPage = () => {
  const [period, setPeriod] = useState('day');
  const [custom, setCustom] = useState({ from: todayISO(), to: todayISO() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(
    () => (period === 'custom' ? custom : computeRange(period)),
    [period, custom]
  );

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range.from, range.to]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await financeApi.getCashRegister(range.from, range.to);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white p-6 shadow-lg mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="w-7 h-7" /> Caisse</h1>
        <p className="text-white/80 text-sm">Récapitulatif des encaissements par période et mode de paiement</p>
      </div>

      {/* Filtres période */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              period === p.key ? 'bg-emerald-600 text-white shadow' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            <span className="text-gray-400">→</span>
            <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </div>
        )}
        <span className="text-sm text-gray-500 ml-auto">
          {formatDate(range.from)} — {formatDate(range.to)}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-500">Chargement…</div>
      ) : error ? (
        <div className="p-6 text-red-600">{error}</div>
      ) : data ? (
        <>
          {/* Totaux */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <TotalCard label="Encaissements" value={formatMAD(data.income?.total)} sub={`${data.income?.count || 0} paiement(s)`} icon={TrendingUp} color="from-green-500 to-emerald-600" />
            <TotalCard label="Dépenses" value={formatMAD(data.expense?.total)} sub="sorties de caisse" icon={TrendingDown} color="from-rose-500 to-red-600" />
            <TotalCard label="Solde net" value={formatMAD(data.net)} sub="encaissé − dépensé" icon={Wallet} color={data.net >= 0 ? 'from-blue-500 to-indigo-600' : 'from-orange-500 to-red-600'} />
          </div>

          {/* Répartition par mode */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">Encaissements par mode de paiement</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {METHOD_ORDER.map((m) => {
                const Icon = METHOD_ICONS[m];
                const info = data.income?.by_method?.[m] || { total: 0, count: 0 };
                const pct = data.income?.total > 0 ? Math.round((info.total / data.income.total) * 100) : 0;
                return (
                  <div key={m} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{METHOD_LABELS[m]}</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{formatMAD(info.total)}</p>
                    <p className="text-xs text-gray-500">{info.count} · {pct}%</p>
                    <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Détail des paiements */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <h2 className="font-semibold text-gray-900 px-5 py-4 border-b border-gray-100">
              Détail des encaissements ({data.payments?.length || 0})
            </h2>
            {(!data.payments || data.payments.length === 0) ? (
              <p className="p-6 text-center text-gray-500">Aucun encaissement sur cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Reçu</th>
                      <th className="px-4 py-2 font-medium">Élève</th>
                      <th className="px-4 py-2 font-medium">Mode</th>
                      <th className="px-4 py-2 font-medium text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{formatDate(p.payment_date)}</td>
                        <td className="px-4 py-2 text-gray-500">{p.receipt_number}</td>
                        <td className="px-4 py-2 text-gray-900">
                          {p.student ? `${p.student.first_name} ${p.student.last_name}` : '—'}
                          {p.student?.classes?.name ? <span className="text-gray-400"> · {p.student.classes.name}</span> : ''}
                        </td>
                        <td className="px-4 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{METHOD_LABELS[p.method] || p.method}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatMAD(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

const TotalCard = ({ label, value, sub, icon: Icon, color }) => (
  <div className={`rounded-xl bg-gradient-to-br ${color} text-white p-5 shadow-sm`}>
    <div className="flex items-center justify-between">
      <span className="text-sm text-white/80">{label}</span>
      <Icon className="w-5 h-5 text-white/80" />
    </div>
    <p className="text-2xl font-bold mt-2">{value}</p>
    <p className="text-xs text-white/70 mt-1">{sub}</p>
  </div>
);

export default CashRegisterPage;
