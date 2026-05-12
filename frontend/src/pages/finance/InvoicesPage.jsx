import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Search, RefreshCw, Plus, Download, Ban, Eye, Zap, Filter } from 'lucide-react';
import { financeApi, formatMAD, formatDate, STATUS_LABELS, STATUS_COLORS } from '../../lib/financeApi';
import { supabase } from '../../lib/supabase';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', class_id: '', search: '', from: '', to: '' });
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({
    academic_year: getCurrentYear(),
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    due_day: 5,
    class_id: ''
  });
  const [generating, setGenerating] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  function getCurrentYear() {
    const y = new Date().getFullYear();
    const m = new Date().getMonth();
    return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  useEffect(() => {
    load();
    loadClasses();
  }, []);

  useEffect(() => { load(); }, [filters.status, filters.class_id, filters.from, filters.to]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listInvoices(filters);
      setInvoices(data.invoices || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadClasses = async () => {
    try {
      const data = await financeApi.listClasses();
      setClasses(Array.isArray(data) ? data : (data.classes || []));
    } catch (e) { console.error(e); }
  };

  const generateMonthly = async () => {
    if (!confirm(`Générer les factures pour ${genForm.month}/${genForm.year} ?`)) return;
    setGenerating(true);
    try {
      const res = await financeApi.generateMonthly({
        ...genForm,
        class_id: genForm.class_id || undefined
      });
      alert(`${res.created_count} facture(s) créée(s), ${res.skipped_count} ignorée(s)`);
      setShowGenerate(false);
      load();
    } catch (e) {
      alert('Erreur: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const cancelInvoice = async (id) => {
    const reason = prompt('Motif de l\'annulation ?');
    if (!reason) return;
    try {
      await financeApi.cancelInvoice(id, reason);
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const viewDetail = async (id) => {
    try {
      const data = await financeApi.getInvoice(id);
      setSelectedInvoice(data.invoice);
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const filteredBySearch = filters.search
    ? invoices.filter(i => {
        const q = filters.search.toLowerCase();
        return i.invoice_number?.toLowerCase().includes(q)
          || `${i.student?.first_name} ${i.student?.last_name}`.toLowerCase().includes(q);
      })
    : invoices;

  const totals = filteredBySearch.reduce((acc, i) => ({
    total: acc.total + Number(i.total || 0),
    paid: acc.paid + Number(i.amount_paid || 0),
    due: acc.due + Number(i.amount_due || 0)
  }), { total: 0, paid: 0, due: 0 });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-6 h-6" /> Factures
          </h1>
          <p className="text-sm text-gray-500">{filteredBySearch.length} facture(s) · {formatMAD(totals.total)} total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowGenerate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Zap className="w-4 h-4" /> Génération mensuelle
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <p className="text-xs text-blue-700 font-medium">Total facturé</p>
          <p className="text-xl font-bold text-blue-900">{formatMAD(totals.total)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-xs text-green-700 font-medium">Encaissé</p>
          <p className="text-xl font-bold text-green-900">{formatMAD(totals.paid)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
          <p className="text-xs text-orange-700 font-medium">Restant</p>
          <p className="text-xl font-bold text-orange-900">{formatMAD(totals.due)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Rechercher..." value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg">
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.class_id} onChange={e => setFilters({ ...filters, class_id: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg">
          <option value="">Toutes classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg" title="Du" />
        <input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg" title="Au" />
        <button onClick={load} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">N°</th>
                <th className="px-4 py-3 text-left">Élève</th>
                <th className="px-4 py-3 text-left">Classe</th>
                <th className="px-4 py-3 text-left">Période</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Payé</th>
                <th className="px-4 py-3 text-right">Reste</th>
                <th className="px-4 py-3 text-left">Échéance</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredBySearch.length === 0 && (
                <tr><td colSpan="10" className="px-4 py-8 text-center text-gray-400">Aucune facture</td></tr>
              )}
              {filteredBySearch.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoice_number}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-800">
                      {inv.student?.first_name} {inv.student?.last_name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{inv.student?.classes?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{inv.period_label || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMAD(inv.total)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{formatMAD(inv.amount_paid)}</td>
                  <td className="px-4 py-3 text-right text-orange-600 font-medium">{formatMAD(inv.amount_due)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(inv.due_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[inv.status] || 'bg-gray-100'}`}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => viewDetail(inv.id)} className="p-1.5 hover:bg-gray-100 rounded" title="Voir">
                        <Eye className="w-4 h-4 text-gray-500" />
                      </button>
                      {inv.status !== 'cancelled' && inv.status !== 'paid' && (
                        <button onClick={() => cancelInvoice(inv.id)} className="p-1.5 hover:bg-red-50 rounded" title="Annuler">
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

      {/* Modal génération mensuelle */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-600" /> Génération mensuelle
            </h2>
            <p className="text-sm text-gray-600">
              Génère automatiquement les factures pour tous les élèves ayant un plan actif.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Année scolaire</label>
                <input type="text" value={genForm.academic_year} onChange={e => setGenForm({ ...genForm, academic_year: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jour d'échéance</label>
                <input type="number" min="1" max="28" value={genForm.due_day} onChange={e => setGenForm({ ...genForm, due_day: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mois</label>
                <select value={genForm.month} onChange={e => setGenForm({ ...genForm, month: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  {['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'].map((n, i) => (
                    <option key={i} value={i + 1}>{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Année</label>
                <input type="number" value={genForm.year} onChange={e => setGenForm({ ...genForm, year: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Classe (optionnel, sinon toutes)</label>
              <select value={genForm.class_id} onChange={e => setGenForm({ ...genForm, class_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">Toutes les classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowGenerate(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={generateMonthly} disabled={generating}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Zap className="w-4 h-4" /> {generating ? 'Génération...' : 'Générer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal détail facture */}
      {selectedInvoice && (
        <InvoiceDetailModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} onRefresh={load} />
      )}
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose, onRefresh }) {
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: Number(invoice.amount_due || 0),
    method: 'cash',
    payment_date: new Date().toISOString().split('T')[0],
    reference: '',
    notes: ''
  });

  const recordPayment = async () => {
    try {
      await financeApi.createPayment({
        invoice_id: invoice.id,
        student_id: invoice.student_id,
        ...payForm,
        amount: Number(payForm.amount)
      });
      setShowPayment(false);
      onRefresh();
      onClose();
      alert('Paiement enregistré');
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Facture {invoice.invoice_number}</h2>
            <p className="text-sm text-gray-500">{invoice.student?.first_name} {invoice.student?.last_name}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Émise le:</span> {formatDate(invoice.issue_date)}</div>
            <div><span className="text-gray-500">Échéance:</span> {formatDate(invoice.due_date)}</div>
            <div><span className="text-gray-500">Période:</span> {invoice.period_label || '—'}</div>
            <div><span className="text-gray-500">Statut:</span>
              <span className={`ml-1 inline-block px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[invoice.status]}`}>
                {STATUS_LABELS[invoice.status]}
              </span>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Qté</th>
                  <th className="px-3 py-2 text-right">PU</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(invoice.lines || []).map(l => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right">{l.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatMAD(l.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMAD(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr><td colSpan="3" className="px-3 py-2 text-right">Sous-total</td><td className="px-3 py-2 text-right">{formatMAD(invoice.subtotal)}</td></tr>
                {Number(invoice.discount) > 0 && (
                  <tr><td colSpan="3" className="px-3 py-2 text-right">Réduction</td><td className="px-3 py-2 text-right text-green-600">-{formatMAD(invoice.discount)}</td></tr>
                )}
                <tr className="font-bold"><td colSpan="3" className="px-3 py-2 text-right">Total</td><td className="px-3 py-2 text-right">{formatMAD(invoice.total)}</td></tr>
                <tr><td colSpan="3" className="px-3 py-2 text-right text-green-600">Payé</td><td className="px-3 py-2 text-right text-green-600">{formatMAD(invoice.amount_paid)}</td></tr>
                <tr className="font-bold"><td colSpan="3" className="px-3 py-2 text-right text-orange-600">Reste</td><td className="px-3 py-2 text-right text-orange-600">{formatMAD(invoice.amount_due)}</td></tr>
              </tfoot>
            </table>
          </div>

          {(invoice.payments || []).length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-800 mb-2">Historique paiements</h3>
              <div className="space-y-1">
                {invoice.payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                    <div>
                      <span className="font-mono text-xs text-gray-500">{p.receipt_number}</span>
                      <span className="ml-2">{formatDate(p.payment_date)}</span>
                      <span className="ml-2 text-gray-500">({p.method})</span>
                    </div>
                    <span className="font-medium text-green-600">{formatMAD(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invoice.amount_due > 0 && invoice.status !== 'cancelled' && !showPayment && (
            <button onClick={() => setShowPayment(true)}
              className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
              + Enregistrer un paiement
            </button>
          )}

          {showPayment && (
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <h3 className="font-semibold text-gray-800">Nouveau paiement</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Montant *</label>
                  <input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Méthode *</label>
                  <select value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="cash">Espèces</option>
                    <option value="check">Chèque</option>
                    <option value="transfer">Virement</option>
                    <option value="card_pos">Carte</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Référence</label>
                  <input type="text" placeholder="N° chèque, virement..." value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea rows="2" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowPayment(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Annuler</button>
                <button onClick={recordPayment} disabled={!payForm.amount || Number(payForm.amount) <= 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  Valider paiement
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
