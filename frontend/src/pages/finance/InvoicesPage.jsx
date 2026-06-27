import { useState, useEffect } from 'react';
import { FileText, Search, Ban, Eye, Zap, Printer } from 'lucide-react';
import { financeApi, formatMAD, formatDate, STATUS_LABELS, STATUS_COLORS } from '../../lib/financeApi';
import { PageHeader, KpiGrid, KpiCard, FilterBar, DataTable, Money, Badge, Drawer, Button, Field } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';
import { useAuth } from '../../contexts/AuthContext';
import { toDashYear } from '../../lib/schoolYear';
import { printStudentInvoice } from '../../lib/printDocs';

const STATUS_TONE = { draft: 'gray', issued: 'blue', partial: 'yellow', paid: 'green', overdue: 'red', cancelled: 'gray' };

export default function InvoicesPage() {
  const { year } = useYear();
  const dashYear = toDashYear(year);
  const [invoices, setInvoices] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', class_id: '', search: '', from: '', to: '' });
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({
    academic_year: dashYear,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    due_day: 5,
    class_id: ''
  });
  const [generating, setGenerating] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  useEffect(() => {
    load();
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters.status, filters.class_id, filters.from, filters.to, year]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listInvoices({ ...filters, academic_year: dashYear });
      setInvoices(data.invoices || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadClasses = async () => {
    try {
      const data = await financeApi.listClasses(year);
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

  const columns = [
    { key: 'number', header: 'N°', width: '11%', truncate: true, render: (i) => <span className="font-mono text-gray-700" title={i.invoice_number}>{i.invoice_number}</span> },
    { key: 'student', header: 'Élève', width: '16%', truncate: true, render: (i) => <span className="font-medium text-gray-800">{i.student?.first_name} {i.student?.last_name}</span> },
    { key: 'class', header: 'Classe', width: '9%', truncate: true, render: (i) => <span className="text-gray-600">{i.student?.classes?.name || '—'}</span> },
    { key: 'period', header: 'Période', width: '12%', truncate: true, render: (i) => <span className="text-gray-600" title={i.period_label || ''}>{i.period_label || '—'}</span> },
    { key: 'total', header: 'Total', align: 'right', width: '10%', render: (i) => <Money value={i.total} /> },
    { key: 'paid', header: 'Payé', align: 'right', width: '10%', render: (i) => <Money value={i.amount_paid} tone="green" /> },
    { key: 'due', header: 'Reste', align: 'right', width: '10%', render: (i) => <span className="text-orange-600 font-medium tabular-nums">{formatMAD(i.amount_due)}</span> },
    { key: 'due_date', header: 'Échéance', width: '10%', render: (i) => <span className="text-gray-600 whitespace-nowrap">{formatDate(i.due_date)}</span> },
    { key: 'status', header: 'Statut', width: '8%', render: (i) => <Badge tone={STATUS_TONE[i.status] || 'gray'}>{STATUS_LABELS[i.status] || i.status}</Badge> },
    { key: 'actions', header: '', align: 'right', width: '64px', render: (i) => (
      <div className="flex justify-end gap-0.5">
        <button onClick={(e) => { e.stopPropagation(); viewDetail(i.id); }} className="p-1 hover:bg-gray-100 rounded" title="Voir">
          <Eye className="w-4 h-4 text-gray-500" />
        </button>
        {i.status !== 'cancelled' && i.status !== 'paid' && (
          <button onClick={(e) => { e.stopPropagation(); cancelInvoice(i.id); }} className="p-1 hover:bg-red-50 rounded" title="Annuler">
            <Ban className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={FileText} title="Factures" color="green"
        subtitle={`${filteredBySearch.length} facture(s)`}
        onRefresh={load} loading={loading}
        actions={<Button color="green" icon={Zap} onClick={() => setShowGenerate(true)}>Génération mensuelle</Button>} />

      <KpiGrid cols={3}>
        <KpiCard label="Total facturé" value={formatMAD(totals.total)} tone="blue" />
        <KpiCard label="Encaissé" value={formatMAD(totals.paid)} tone="green" />
        <KpiCard label="Restant dû" value={formatMAD(totals.due)} tone="orange" />
      </KpiGrid>

      <FilterBar>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Rechercher..." value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg" />
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
      </FilterBar>

      <DataTable columns={columns} rows={filteredBySearch} empty="Aucune facture" onRowClick={(i) => viewDetail(i.id)} compact />

      <Drawer open={showGenerate} onClose={() => setShowGenerate(false)} title="Génération mensuelle"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowGenerate(false)}>Annuler</Button>
            <Button color="green" icon={Zap} onClick={generateMonthly} disabled={generating}>{generating ? 'Génération...' : 'Générer'}</Button>
          </>
        }>
        <p className="text-sm text-gray-600">Génère automatiquement les factures pour tous les élèves ayant un plan actif.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Année scolaire">
            <input type="text" value={genForm.academic_year} onChange={e => setGenForm({ ...genForm, academic_year: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
          <Field label="Jour d'échéance">
            <input type="number" min="1" max="28" value={genForm.due_day} onChange={e => setGenForm({ ...genForm, due_day: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
          <Field label="Mois">
            <select value={genForm.month} onChange={e => setGenForm({ ...genForm, month: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              {['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'].map((n, i) => (
                <option key={i} value={i + 1}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="Année">
            <input type="number" value={genForm.year} onChange={e => setGenForm({ ...genForm, year: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
        </div>
        <Field label="Classe (optionnel, sinon toutes)">
          <select value={genForm.class_id} onChange={e => setGenForm({ ...genForm, class_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg">
            <option value="">Toutes les classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </Drawer>

      {selectedInvoice && (
        <InvoiceDetailModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} onRefresh={load} />
      )}
    </div>
  );
}

function InvoiceDetailModal({ invoice, onClose, onRefresh }) {
  const { school } = useAuth();
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

  // Impression en double exemplaire (École + Parent), logo et nom de l'école.
  const printInvoice = () => printStudentInvoice(invoice, school);

  return (
    <Drawer open onClose={onClose} width="max-w-2xl"
      title={`Facture ${invoice.invoice_number}`}
      footer={<Button variant="secondary" icon={Printer} onClick={printInvoice}>Imprimer (double)</Button>}>
        <p className="text-sm text-gray-500 -mt-1">{invoice.student?.first_name} {invoice.student?.last_name}</p>
        <div className="space-y-4">
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
    </Drawer>
  );
}
