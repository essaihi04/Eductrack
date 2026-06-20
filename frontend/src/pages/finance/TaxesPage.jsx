import { useState, useEffect } from 'react';
import { Scale, Plus, Trash2, Check, RotateCcw } from 'lucide-react';
import { financeApi, formatMAD, formatDate } from '../../lib/financeApi';
import { PageHeader, DataTable, Money, Badge, Drawer, Button, Field } from '../../components/finance/ui';

const TAX_TYPES = [
  { v: 'is_acompte', l: 'IS (acompte)' }, { v: 'taxe_pro', l: 'Taxe professionnelle' },
  { v: 'taxe_habitation', l: 'Taxe habitation' }, { v: 'stamp_duty', l: 'Droits de timbre' },
  { v: 'tva', l: 'TVA' }, { v: 'other', l: 'Autre' },
];
const typeLabel = (v) => TAX_TYPES.find(t => t.v === v)?.l || v;

export default function TaxesPage() {
  const [taxes, setTaxes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const blank = { label: '', tax_type: 'is_acompte', account_id: '', period_label: '', due_date: new Date().toISOString().split('T')[0], amount: 0 };
  const [form, setForm] = useState(blank);

  useEffect(() => { load(); financeApi.getChart().then(d => setAccounts(d.accounts || [])).catch(() => {}); }, []);
  const load = async () => { try { const d = await financeApi.listTaxes(); setTaxes(d.taxes || []); } catch (e) { console.error(e); } };

  const expLines = accounts.filter(a => a.kind === 'expense' && a.node_type === 'line' && a.is_active);
  const sections = accounts.filter(a => a.kind === 'expense' && a.node_type === 'section');
  const accName = (id) => accounts.find(a => a.id === id)?.name || '—';

  const save = async () => { try { await financeApi.createTax(form); setShowForm(false); setForm(blank); load(); } catch (e) { alert('Erreur: ' + e.message); } };
  const remove = async (id) => { if (!confirm('Supprimer cette obligation ?')) return; try { await financeApi.deleteTax(id); load(); } catch (e) { alert(e.message); } };
  const pay = async (id) => { try { await financeApi.payTax(id); load(); } catch (e) { alert(e.message); } };
  const unpay = async (id) => { try { await financeApi.unpayTax(id); load(); } catch (e) { alert(e.message); } };

  const columns = [
    { key: 'label', header: 'Libellé', render: (t) => (
      <div><span className="font-medium text-gray-800">{t.label}</span><div className="text-xs text-gray-400">{accName(t.account_id)}</div></div>
    ) },
    { key: 'type', header: 'Type', render: (t) => <span className="text-gray-600">{typeLabel(t.tax_type)}</span> },
    { key: 'period', header: 'Période', render: (t) => <span className="text-gray-600">{t.period_label || '—'}</span> },
    { key: 'due', header: 'Échéance', render: (t) => <span className="text-gray-600">{formatDate(t.due_date)}</span> },
    { key: 'amount', header: 'Montant', align: 'right', render: (t) => <Money value={t.amount} /> },
    { key: 'status', header: 'Statut', align: 'right', render: (t) => <Badge tone={t.status === 'paid' ? 'green' : 'orange'}>{t.status === 'paid' ? 'Payée' : 'À payer'}</Badge> },
    { key: 'actions', header: '', align: 'right', render: (t) => (
      <div className="flex justify-end items-center gap-2 whitespace-nowrap">
        {t.status === 'paid'
          ? <button onClick={() => unpay(t.id)} className="text-xs inline-flex items-center gap-1 text-gray-500 hover:text-gray-800"><RotateCcw className="w-3 h-3" /> Annuler</button>
          : <button onClick={() => pay(t.id)} className="text-xs inline-flex items-center gap-1 text-green-600 hover:text-green-800"><Check className="w-3 h-3" /> Payer</button>}
        <button onClick={() => remove(t.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
      </div>
    ) },
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={Scale} title="Impôts & taxes" color="purple"
        subtitle="IS, taxe professionnelle, timbre, TVA… Le paiement alimente la matrice."
        actions={<Button color="purple" icon={Plus} onClick={() => setShowForm(true)}>Nouvelle obligation</Button>} />

      <DataTable columns={columns} rows={taxes} empty="Aucune obligation" />

      <Drawer open={showForm} onClose={() => setShowForm(false)} title="Nouvelle obligation fiscale"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button color="purple" onClick={save} disabled={!form.label}>Enregistrer</Button>
          </>
        }>
        <Field label="Libellé" required>
          <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={form.tax_type} onChange={e => setForm({ ...form, tax_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              {TAX_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </Field>
          <Field label="Poste">
            <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option value="">— Poste —</option>
              {sections.map(s => <optgroup key={s.id} label={s.name}>{expLines.filter(l => l.parent_id === s.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
            </select>
          </Field>
          <Field label="Période">
            <input value={form.period_label} onChange={e => setForm({ ...form, period_label: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="ex. T1 2025" />
          </Field>
          <Field label="Échéance">
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
          <Field label="Montant">
            <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
