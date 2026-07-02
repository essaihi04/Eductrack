import { useEffect, useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, Banknote, CreditCard, Building2, FileCheck, MoreHorizontal, FileSpreadsheet, Ban, Printer, X } from 'lucide-react';
import { saveBlob } from '../../lib/download';
import { financeApi, formatMAD, formatDate, METHOD_LABELS } from '../../lib/financeApi';
import { PageHeader, KpiGrid, KpiCard, Card, Money, Badge, Button, Drawer } from '../../components/finance/ui';

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

const studentName = (p) => (p.student ? `${p.student.first_name} ${p.student.last_name}` : '—');
const personName = (x) => (x ? `${x.first_name || ''} ${x.last_name || ''}`.trim() : '');

const CashRegisterPage = () => {
  const [period, setPeriod] = useState('day');
  const [custom, setCustom] = useState({ from: todayISO(), to: todayISO() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Filtre par mode de paiement (partagé entre les cartes « caisse » et le coffre)
  const [methodFilter, setMethodFilter] = useState(null);
  // Reçu sélectionné pour le tiroir de détail
  const [detail, setDetail] = useState(null);

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

  // Reçus du coffre : confirmés + annulés (traçabilité), filtrés par mode si actif.
  const coffreItems = useMemo(() => {
    const conf = (data?.payments || []).map((p) => ({ ...p, _cancelled: false }));
    const canc = (data?.cancellations || []).map((p) => ({ ...p, _cancelled: true }));
    let all = [...conf, ...canc];
    if (methodFilter) all = all.filter((p) => p.method === methodFilter);
    return all;
  }, [data, methodFilter]);

  // Regroupement par journée (journal de caisse « Coffre »). Les annulés
  // n'entrent pas dans le total de la journée mais restent listés.
  const byDay = useMemo(() => {
    const groups = {};
    for (const p of coffreItems) {
      const d = String(p.payment_date).slice(0, 10);
      if (!groups[d]) groups[d] = { date: d, total: 0, items: [], cancelled: 0 };
      groups[d].items.push(p);
      if (p._cancelled) groups[d].cancelled += 1;
      else groups[d].total += Number(p.amount || 0);
    }
    // Confirmés d'abord, annulés ensuite, par n° de reçu décroissant
    for (const g of Object.values(groups)) {
      g.items.sort((a, b) => (a._cancelled - b._cancelled) || String(b.receipt_number).localeCompare(String(a.receipt_number)));
    }
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [coffreItems]);

  const cancelledCount = data?.cancellations?.length || 0;

  const printReceipt = async (p) => {
    try {
      if (p.batch_id) { await financeApi.openBatchReceiptPdf(p.batch_id); return; }
      if (p.invoice?.id) { await financeApi.openInvoicePdf(p.invoice.id); return; }
    } catch (e) { alert('Erreur impression : ' + e.message); }
  };

  const exportExcel = async () => {
    if (!coffreItems.length) return;
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Coffre');
    ws.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'N° Reçu', key: 'receipt', width: 16 },
      { header: 'Statut', key: 'status', width: 12 },
      { header: 'Élève', key: 'student', width: 28 },
      { header: 'Classe', key: 'class', width: 16 },
      { header: 'Mode', key: 'method', width: 14 },
      { header: 'Caissier', key: 'cashier', width: 22 },
      { header: 'Référence', key: 'reference', width: 18 },
      { header: 'Montant', key: 'amount', width: 14 },
      { header: 'Annulé par', key: 'canceller', width: 22 },
      { header: "Motif d'annulation", key: 'reason', width: 30 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const p of coffreItems) {
      ws.addRow({
        date: formatDate(p.payment_date),
        receipt: p.receipt_number,
        status: p._cancelled ? 'Annulé' : 'Confirmé',
        student: studentName(p),
        class: p.student?.classes?.name || '',
        method: METHOD_LABELS[p.method] || p.method,
        cashier: personName(p.cashier),
        reference: p.reference || '',
        amount: Number(p.amount || 0),
        canceller: p._cancelled ? personName(p.canceller) : '',
        reason: p._cancelled ? (p.cancellation_reason || '') : '',
      });
    }
    ws.addRow({});
    ws.addRow({ student: 'TOTAL', amount: data.income?.total || 0 }).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await saveBlob(blob, `coffre_${range.from}_${range.to}.xlsx`);
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={Wallet} title="Caisse" color="green"
        subtitle="Encaissements par période et mode de paiement"
        onRefresh={load} loading={loading}
        actions={
          <Button variant="secondary" icon={FileSpreadsheet} onClick={exportExcel} disabled={!coffreItems.length}>
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

          <Card title="Encaissements par mode de paiement"
            actions={methodFilter && (
              <button onClick={() => setMethodFilter(null)} className="text-xs font-medium text-emerald-700 hover:underline flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> Réinitialiser le filtre
              </button>
            )}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {METHOD_ORDER.map((m) => {
                const Icon = METHOD_ICONS[m];
                const info = data.income?.by_method?.[m] || { total: 0, count: 0 };
                const pct = data.income?.total > 0 ? Math.round((info.total / data.income.total) * 100) : 0;
                const active = methodFilter === m;
                return (
                  <button key={m} type="button" onClick={() => setMethodFilter(active ? null : m)}
                    title="Filtrer le coffre sur ce mode"
                    className={`text-left rounded-lg border p-3 transition ${
                      active ? 'border-emerald-500 ring-2 ring-emerald-200 bg-emerald-50' : 'border-gray-100 bg-muted/30 hover:border-emerald-300'
                    }`}>
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-medium">{METHOD_LABELS[m]}</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{formatMAD(info.total)}</p>
                    <p className="text-xs text-gray-500">{info.count} · {pct}%</p>
                    <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Journal de caisse groupé par journée (« Coffre ») */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-gray-800">
                Coffre — détail par journée ({coffreItems.filter((p) => !p._cancelled).length} reçu(s)
                {cancelledCount > 0 && <span className="text-red-500"> · {cancelledCount} annulé(s)</span>})
              </p>
              {methodFilter && (
                <Badge tone="green">Mode : {METHOD_LABELS[methodFilter]}</Badge>
              )}
            </div>
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
                      <th className="px-4 py-2 text-left">Caissier</th>
                      <th className="px-4 py-2 text-left">Détail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {day.items.map((p) => (
                      <tr key={p.id} onClick={() => setDetail(p)}
                        className={`cursor-pointer ${p._cancelled ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-muted/30'}`}>
                        <td className="px-4 py-2 font-mono text-xs text-gray-600">{p.receipt_number}</td>
                        <td className="px-4 py-2 text-right">
                          <Money value={p.amount} tone={p._cancelled ? undefined : 'green'} className={p._cancelled ? 'line-through text-gray-400' : ''} />
                        </td>
                        <td className="px-4 py-2"><Badge tone="gray">{METHOD_LABELS[p.method] || p.method}</Badge></td>
                        <td className="px-4 py-2 text-xs text-gray-600">{personName(p.cashier) || '—'}</td>
                        <td className="px-4 py-2 text-gray-700">
                          {p._cancelled && <Badge tone="red"><span className="inline-flex items-center gap-1"><Ban className="w-3 h-3" /> Annulé</span></Badge>}{' '}
                          {studentName(p)}
                          {p.student?.classes?.name && <span className="text-gray-400"> · {p.student.classes.name}</span>}
                          {p.reference && <span className="text-gray-400"> · {p.reference}</span>}
                          {p._cancelled && p.cancellation_reason && (
                            <span className="block text-xs text-red-500 mt-0.5">
                              Motif : {p.cancellation_reason}{personName(p.canceller) ? ` — par ${personName(p.canceller)}` : ''}
                            </span>
                          )}
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

      {/* Tiroir de détail d'un reçu */}
      <Drawer open={!!detail} onClose={() => setDetail(null)}
        title={detail ? `Reçu ${detail.receipt_number}` : ''}
        footer={detail && (detail.batch_id || detail.invoice?.id) && (
          <Button variant="secondary" icon={Printer} onClick={() => printReceipt(detail)}>Imprimer le reçu</Button>
        )}>
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              {detail._cancelled
                ? <Badge tone="red"><span className="inline-flex items-center gap-1"><Ban className="w-3 h-3" /> Annulé</span></Badge>
                : <Badge tone="green">Confirmé</Badge>}
              <span className="text-2xl font-bold text-gray-900">{formatMAD(detail.amount)}</span>
            </div>
            <DetailRow label="Élève" value={studentName(detail)} />
            <DetailRow label="Classe" value={detail.student?.classes?.name || '—'} />
            <DetailRow label="Date" value={formatDate(detail.payment_date)} />
            <DetailRow label="Mode" value={METHOD_LABELS[detail.method] || detail.method} />
            {detail.reference && <DetailRow label="Référence" value={detail.reference} />}
            <DetailRow label="Période / service" value={detail.invoice?.period_label || detail.notes || '—'} />
            {detail.invoice?.invoice_number && <DetailRow label="Facture" value={detail.invoice.invoice_number} />}
            <DetailRow label="Caissier" value={personName(detail.cashier) || '—'} />
            {detail._cancelled && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700 uppercase">Annulation</p>
                <DetailRow label="Annulé par" value={personName(detail.canceller) || '—'} />
                <DetailRow label="Le" value={detail.cancelled_at ? formatDate(detail.cancelled_at) : '—'} />
                <DetailRow label="Motif" value={detail.cancellation_reason || '—'} />
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}

export default CashRegisterPage;
