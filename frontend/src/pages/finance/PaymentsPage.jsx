import { useState, useEffect } from 'react';
import { CreditCard, Search, Ban, Printer, LayoutGrid, List } from 'lucide-react';
import { financeApi, formatMAD, formatDate, METHOD_LABELS } from '../../lib/financeApi';
import { printHtmlDocument } from '../../lib/download';
import { askPrompt } from '../../lib/prompt';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { toDashYear } from '../../lib/schoolYear';
import { PageHeader, KpiGrid, KpiCard, FilterBar, DataTable, Money, Badge } from '../../components/finance/ui';

export default function PaymentsPage() {
  const { profile } = useAuth();
  const { year } = useYear();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '', method: '', search: '' });
  const [view, setView] = useState('cards'); // 'cards' | 'table'
  const isAdmin = ['admin', 'school_admin', 'super_admin'].includes(profile?.role);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters.from, filters.to, filters.method, year]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listPayments({ ...filters, academic_year: toDashYear(year) });
      setPayments(data.payments || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const cancelPayment = async (id) => {
    if (!isAdmin) return;
    const reason = await askPrompt('Motif de l\'annulation ?');
    if (!reason) return;
    try {
      await financeApi.cancelPayment(id, reason);
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const printReceipt = (payment) => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const school = payment.school || {};
    const logoSrc = school.logo_url
      ? (school.logo_url.startsWith('http') ? school.logo_url : `${apiBase}${school.logo_url.startsWith('/') ? '' : '/'}${school.logo_url}`)
      : null;
    const schoolHeader = `
      <div class="school-header">
        ${logoSrc ? `<img src="${logoSrc}" alt="Logo" class="logo"/>` : ''}
        <div class="school-info">
          <h2>${school.name || 'École'}</h2>
          ${school.address ? `<p>${school.address}</p>` : ''}
          ${school.phone ? `<p>Tél : ${school.phone}</p>` : ''}
        </div>
      </div>`;
    const html = `
      <html><head><title>Reçu ${payment.receipt_number}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:40px;max-width:700px;margin:0 auto;color:#1f2937}
        h1{color:#1e40af;margin:0}
        h2{margin:0 0 4px;color:#1e40af;font-size:1.2em}
        .school-header{display:flex;align-items:center;gap:16px;padding-bottom:15px;border-bottom:2px solid #1e40af;margin-bottom:20px}
        .school-header .logo{width:80px;height:80px;object-fit:contain}
        .school-info p{margin:2px 0;font-size:0.85em;color:#555}
        .doc-title{text-align:center;margin:20px 0}
        .doc-title h1{font-size:1.6em}
        .doc-title p{color:#666;margin:4px 0}
        .row{display:flex;justify-content:space-between;margin:8px 0;padding:4px 0;border-bottom:1px dotted #e5e7eb}
        .total{background:#f0f9ff;padding:18px;border-radius:8px;margin-top:25px;font-size:1.3em;font-weight:bold;color:#1e40af;text-align:center;border:2px solid #1e40af}
        .footer{margin-top:40px;padding-top:20px;border-top:1px solid #ccc;font-size:0.85em;color:#666;text-align:center}
        .signature{margin-top:50px;display:flex;justify-content:space-between}
        .signature div{width:45%;text-align:center;padding-top:50px;border-top:1px solid #999;font-size:0.85em}
        @media print { body{padding:20px} }
      </style></head><body>
      ${schoolHeader}
      <div class="doc-title">
        <h1>REÇU DE PAIEMENT</h1>
        <p>N° <strong>${payment.receipt_number}</strong></p>
      </div>
      <div class="row"><strong>Date :</strong><span>${formatDate(payment.payment_date)}</span></div>
      <div class="row"><strong>Élève :</strong><span>${payment.student?.first_name} ${payment.student?.last_name}</span></div>
      <div class="row"><strong>Classe :</strong><span>${payment.student?.classes?.name || '—'}</span></div>
      ${payment.invoice ? `<div class="row"><strong>Facture :</strong><span>${payment.invoice.invoice_number}${payment.invoice.period_label ? ' — ' + payment.invoice.period_label : ''}</span></div>` : ''}
      <div class="row"><strong>Mode :</strong><span>${METHOD_LABELS[payment.method] || payment.method}</span></div>
      ${payment.reference ? `<div class="row"><strong>Référence :</strong><span>${payment.reference}</span></div>` : ''}
      ${payment.notes ? `<div class="row"><strong>Notes :</strong><span>${payment.notes}</span></div>` : ''}
      <div class="total">Montant payé : ${formatMAD(payment.amount)}</div>
      <div class="signature">
        <div>Signature du responsable financier</div>
        <div>Cachet et signature de l'école</div>
      </div>
      <div class="footer">
        <p>Ce reçu atteste le paiement effectué. Veuillez le conserver précieusement.</p>
      </div>
      </body></html>`;
    printHtmlDocument(html, { title: `Reçu ${payment?.receipt_number || ''}`.trim() });
  };

  const filteredBySearch = filters.search
    ? payments.filter(p => {
        const q = filters.search.toLowerCase();
        return p.receipt_number?.toLowerCase().includes(q)
          || `${p.student?.first_name} ${p.student?.last_name}`.toLowerCase().includes(q)
          || p.invoice?.invoice_number?.toLowerCase().includes(q);
      })
    : payments;

  const total = filteredBySearch.reduce((s, p) => s + Number(p.amount), 0);
  const avg = filteredBySearch.length ? total / filteredBySearch.length : 0;

  const columns = [
    { key: 'receipt', header: 'N° Reçu', render: (p) => <span className="font-mono text-xs text-gray-700">{p.receipt_number}</span> },
    { key: 'date', header: 'Date', render: (p) => <span className="text-gray-600">{formatDate(p.payment_date)}</span> },
    { key: 'student', header: 'Élève', render: (p) => (
      <div>
        <span className="font-medium text-gray-800">{p.student?.first_name} {p.student?.last_name}</span>
        <div className="text-xs text-gray-500">{p.student?.classes?.name}</div>
      </div>
    ) },
    { key: 'invoice', header: 'Facture', render: (p) => p.invoice ? (
      <div>
        <span className="font-mono text-xs">{p.invoice.invoice_number}</span>
        {p.invoice.period_label && <div className="text-xs text-gray-500">{p.invoice.period_label}</div>}
      </div>
    ) : <span className="text-gray-400">—</span> },
    { key: 'method', header: 'Mode', render: (p) => <Badge tone="blue">{METHOD_LABELS[p.method] || p.method}</Badge> },
    { key: 'reference', header: 'Référence', render: (p) => <span className="text-gray-500 text-xs">{p.reference || '—'}</span> },
    { key: 'cashier', header: 'Caissier', render: (p) => <span className="text-gray-600 text-xs">{p.cashier ? `${p.cashier.first_name} ${p.cashier.last_name}` : '—'}</span> },
    { key: 'amount', header: 'Montant', align: 'right', render: (p) => <Money value={p.amount} tone="green" /> },
    { key: 'actions', header: 'Actions', align: 'right', render: (p) => (
      <div className="flex justify-end gap-1">
        <button onClick={() => printReceipt(p)} className="p-1.5 hover:bg-blue-50 rounded" title="Imprimer reçu">
          <Printer className="w-4 h-4 text-blue-500" />
        </button>
        {isAdmin && (
          <button onClick={() => cancelPayment(p.id)} className="p-1.5 hover:bg-red-50 rounded" title="Annuler">
            <Ban className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={CreditCard} title="Paiements" color="green"
        subtitle={`${filteredBySearch.length} paiement(s) encaissé(s)`}
        onRefresh={load} loading={loading} />

      <KpiGrid cols={3}>
        <KpiCard label="Total encaissé" value={formatMAD(total)} tone="green" />
        <KpiCard label="Nombre de reçus" value={filteredBySearch.length} />
        <KpiCard label="Paiement moyen" value={formatMAD(avg)} />
      </KpiGrid>

      <FilterBar>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Rechercher reçu, élève..." value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg" />
        </div>
        <select value={filters.method} onChange={e => setFilters({ ...filters, method: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg">
          <option value="">Tous modes</option>
          {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg" />
        <input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg" />
      </FilterBar>

      <div className="flex items-center justify-end gap-1">
        <button onClick={() => setView('cards')} title="Cartes"
          className={`p-2 rounded-lg border ${view === 'cards' ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button onClick={() => setView('table')} title="Tableau"
          className={`p-2 rounded-lg border ${view === 'table' ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          <List className="w-4 h-4" />
        </button>
      </div>

      {view === 'table' ? (
        <DataTable columns={columns} rows={filteredBySearch} empty="Aucun paiement" />
      ) : filteredBySearch.length === 0 ? (
        <div className="bg-card border border-border rounded-xl py-12 text-center text-gray-400">Aucun paiement</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredBySearch.map((p) => (
            <ReceiptCard key={p.id} p={p} isAdmin={isAdmin} onPrint={printReceipt} onCancel={cancelPayment} />
          ))}
        </div>
      )}
    </div>
  );
}

// Carte reçu façon Koolskools : montant, date, N° reçu, mois couverts, mode, actions.
function ReceiptCard({ p, isAdmin, onPrint, onCancel }) {
  const period = p.invoice?.period_label || p.reference || null;
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xl font-bold text-green-700 tabular-nums">{formatMAD(p.amount)}</span>
        <div className="flex flex-col items-end gap-1">
          <Badge tone="blue">{METHOD_LABELS[p.method] || p.method}</Badge>
          <Badge tone={p.status === 'cancelled' ? 'red' : 'green'}>{p.status === 'cancelled' ? 'Annulé' : 'Confirmé'}</Badge>
        </div>
      </div>
      <div className="text-sm font-medium text-gray-800 truncate">
        {p.student?.first_name} {p.student?.last_name}
        <span className="text-xs text-gray-400 font-normal"> · {p.student?.classes?.name || '—'}</span>
      </div>
      <div className="text-xs text-gray-500 space-y-0.5">
        <div>{formatDate(p.payment_date)} · <span className="font-mono">N° {p.receipt_number}</span></div>
        {period && <div className="text-gray-600">{period}</div>}
        {p.cashier && <div className="text-gray-400">Encaissé par {p.cashier.first_name} {p.cashier.last_name}</div>}
      </div>
      <div className="flex items-center gap-1.5 pt-1 mt-auto border-t border-border">
        <button onClick={() => onPrint(p)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
          <Printer className="w-3.5 h-3.5" /> Imprimer
        </button>
        {isAdmin && (
          <button onClick={() => onCancel(p.id)} className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100" title="Annuler / avoir">
            <Ban className="w-3.5 h-3.5" /> Annuler
          </button>
        )}
      </div>
    </div>
  );
}
