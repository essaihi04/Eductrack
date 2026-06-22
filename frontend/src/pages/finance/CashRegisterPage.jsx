import { useEffect, useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, Banknote, CreditCard, Building2, FileCheck, MoreHorizontal, FileSpreadsheet } from 'lucide-react';
import { financeApi, formatMAD, formatDate, METHOD_LABELS } from '../../lib/financeApi';
import { PageHeader, KpiGrid, KpiCard, Card, Money, Badge, Button } from '../../components/finance/ui';

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

  // Regroupement des reçus par journée (journal de caisse façon « Coffre »).
  const byDay = useMemo(() => {
    const groups = {};
    for (const p of data?.payments || []) {
      const d = String(p.payment_date).slice(0, 10);
      if (!groups[d]) groups[d] = { date: d, total: 0, items: [] };
      groups[d].items.push(p);
      groups[d].total += Number(p.amount || 0);
    }
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);

  const exportExcel = async () => {
    if (!data?.payments?.length) return;
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Coffre');
    ws.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'N° Reçu', key: 'receipt', width: 16 },
      { header: 'Élève', key: 'student', width: 28 },
      { header: 'Classe', key: 'class', width: 16 },
      { header: 'Mode', key: 'method', width: 14 },
      { header: 'Référence', key: 'reference', width: 18 },
      { header: 'Montant', key: 'amount', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of data.payments) {
      ws.addRow({
        date: formatDate(p.payment_date),
        receipt: p.receipt_number,
        student: p.student ? `${p.student.first_name} ${p.student.last_name}` : '—',
        class: p.student?.classes?.name || '',
        method: METHOD_LABELS[p.method] || p.method,
        reference: p.reference || '',
        amount: Number(p.amount || 0),
      });
    }
    ws.addRow({});
    ws.addRow({ student: 'TOTAL', amount: data.income?.total || 0 }).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `coffre_${range.from}_${range.to}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={Wallet} title="Caisse" color="green"
        subtitle="Encaissements par période et mode de paiement"
        onRefresh={load} loading={loading}
        actions={
          <Button variant="secondary" icon={FileSpreadsheet} onClick={exportExcel} disabled={!data?.payments?.length}>
            Export Excel
          </Button>
        } />

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              period === p.key ? 'bg-emerald-600 text-white' : 'bg-card border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}>
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
        <span className="text-sm text-gray-500 ml-auto">{formatDate(range.from)} — {formatDate(range.to)}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">Chargement…</div>
      ) : error ? (
        <div className="p-6 text-red-600">{error}</div>
      ) : data ? (
        <>
          <KpiGrid cols={3}>
            <KpiCard icon={TrendingUp} label="Encaissements" value={formatMAD(data.income?.total)} tone="green" sub={`${data.income?.count || 0} paiement(s)`} />
            <KpiCard icon={TrendingDown} label="Dépenses" value={formatMAD(data.expense?.total)} tone="red" sub="sorties de caisse" />
            <KpiCard icon={Wallet} label="Solde net" value={formatMAD(data.net)} tone={data.net >= 0 ? 'blue' : 'orange'} sub="encaissé − dépensé" />
          </KpiGrid>

          <Card title="Encaissements par mode de paiement">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {METHOD_ORDER.map((m) => {
                const Icon = METHOD_ICONS[m];
                const info = data.income?.by_method?.[m] || { total: 0, count: 0 };
                const pct = data.income?.total > 0 ? Math.round((info.total / data.income.total) * 100) : 0;
                return (
                  <div key={m} className="rounded-lg border border-gray-100 bg-muted/30 p-3">
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
          </Card>

          {/* Journal de caisse groupé par journée (« Coffre ») */}
          <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-800">Coffre — détail par journée ({data.payments?.length || 0} reçu(s))</p>
            {byDay.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-10 text-center text-gray-400">
                Aucun encaissement sur cette période.
              </div>
            ) : byDay.map((day) => (
              <Card key={day.date}
                title={`Journée du ${formatDate(day.date)}`}
                actions={<span className="text-sm font-semibold text-green-700">{formatMAD(day.total)}</span>}
                bodyClassName="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">N° Reçu</th>
                      <th className="px-4 py-2 text-right">Montant</th>
                      <th className="px-4 py-2 text-left">Mode</th>
                      <th className="px-4 py-2 text-left">Détail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {day.items.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-mono text-xs text-gray-600">{p.receipt_number}</td>
                        <td className="px-4 py-2 text-right"><Money value={p.amount} tone="green" /></td>
                        <td className="px-4 py-2"><Badge tone="gray">{METHOD_LABELS[p.method] || p.method}</Badge></td>
                        <td className="px-4 py-2 text-gray-700">
                          {p.student ? `${p.student.first_name} ${p.student.last_name}` : '—'}
                          {p.student?.classes?.name && <span className="text-gray-400"> · {p.student.classes.name}</span>}
                          {p.reference && <span className="text-gray-400"> · {p.reference}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default CashRegisterPage;
