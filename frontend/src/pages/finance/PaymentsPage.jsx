import { useState, useEffect } from 'react';
import { CreditCard, Search, RefreshCw, Ban, Printer, Receipt } from 'lucide-react';
import { financeApi, formatMAD, formatDate, METHOD_LABELS } from '../../lib/financeApi';
import { useAuth } from '../../contexts/AuthContext';

export default function PaymentsPage() {
  const { profile } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '', method: '', search: '' });
  const isAdmin = ['admin', 'school_admin', 'super_admin'].includes(profile?.role);

  useEffect(() => { load(); }, [filters.from, filters.to, filters.method]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listPayments(filters);
      setPayments(data.payments || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const cancelPayment = async (id) => {
    if (!isAdmin) return;
    const reason = prompt('Motif de l\'annulation ?');
    if (!reason) return;
    try {
      await financeApi.cancelPayment(id, reason);
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const printReceipt = (payment) => {
    const w = window.open('', '_blank');
    const html = `
      <html><head><title>Reçu ${payment.receipt_number}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:40px;max-width:600px;margin:0 auto}
        h1{color:#1e40af;margin:0}
        .header{border-bottom:2px solid #1e40af;padding-bottom:15px;margin-bottom:25px}
        .row{display:flex;justify-content:space-between;margin:8px 0}
        .total{background:#f0f9ff;padding:15px;border-radius:8px;margin-top:20px;font-size:1.3em;font-weight:bold;color:#1e40af;text-align:center}
        .footer{margin-top:40px;padding-top:20px;border-top:1px solid #ccc;font-size:0.85em;color:#666}
      </style></head><body>
      <div class="header">
        <h1>REÇU DE PAIEMENT</h1>
        <p style="color:#666;margin:5px 0">N° ${payment.receipt_number}</p>
      </div>
      <div class="row"><strong>Date :</strong><span>${formatDate(payment.payment_date)}</span></div>
      <div class="row"><strong>Élève :</strong><span>${payment.student?.first_name} ${payment.student?.last_name}</span></div>
      <div class="row"><strong>Classe :</strong><span>${payment.student?.classes?.name || '—'}</span></div>
      ${payment.invoice ? `<div class="row"><strong>Facture :</strong><span>${payment.invoice.invoice_number}${payment.invoice.period_label ? ' — ' + payment.invoice.period_label : ''}</span></div>` : ''}
      <div class="row"><strong>Mode :</strong><span>${METHOD_LABELS[payment.method] || payment.method}</span></div>
      ${payment.reference ? `<div class="row"><strong>Référence :</strong><span>${payment.reference}</span></div>` : ''}
      ${payment.notes ? `<div class="row"><strong>Notes :</strong><span>${payment.notes}</span></div>` : ''}
      <div class="total">Montant payé : ${formatMAD(payment.amount)}</div>
      <div class="footer">
        <p>Ce reçu atteste le paiement effectué. Veuillez le conserver.</p>
      </div>
      </body></html>`;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <CreditCard className="w-6 h-6" /> Paiements
          </h1>
          <p className="text-sm text-gray-500">{filteredBySearch.length} paiement(s) · {formatMAD(total)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
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
        <button onClick={load} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">N° Reçu</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Élève</th>
                <th className="px-4 py-3 text-left">Facture</th>
                <th className="px-4 py-3 text-left">Mode</th>
                <th className="px-4 py-3 text-left">Référence</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredBySearch.length === 0 && <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-400">Aucun paiement</td></tr>}
              {filteredBySearch.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.receipt_number}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(p.payment_date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{p.student?.first_name} {p.student?.last_name}<br/><span className="text-xs text-gray-500">{p.student?.classes?.name}</span></td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.invoice ? (
                      <>
                        <span className="font-mono text-xs">{p.invoice.invoice_number}</span>
                        {p.invoice.period_label && <div className="text-xs text-gray-500">{p.invoice.period_label}</div>}
                      </>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{METHOD_LABELS[p.method] || p.method}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.reference || '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-600">{formatMAD(p.amount)}</td>
                  <td className="px-4 py-3">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
