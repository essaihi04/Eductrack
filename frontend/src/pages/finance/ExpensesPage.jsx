import { useState, useEffect } from 'react';
import { TrendingDown, Plus, Trash2 } from 'lucide-react';
import { financeApi, formatMAD, formatDate, EXPENSE_CATEGORIES } from '../../lib/financeApi';
import { PageHeader, KpiGrid, KpiCard, FilterBar, DataTable, Money, Badge, Drawer, Button, Field } from '../../components/finance/ui';
import { useYear } from '../../contexts/YearContext';

const blankForm = () => ({
  account_id: '', description: '', amount: 0,
  expense_date: new Date().toISOString().split('T')[0],
  paid_to: '', payment_method: 'transfer', reference: '', notes: ''
});

export default function ExpensesPage() {
  const { year } = useYear();
  const [expenses, setExpenses] = useState([]);
  const [accounts, setAccounts] = useState([]);     // lignes de dépense du plan comptable
  const [sections, setSections] = useState([]);     // sections de dépense
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '', account_id: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm());

  useEffect(() => { loadChart(); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filters.from, filters.to, filters.account_id, year]);

  const loadChart = async () => {
    try {
      const data = await financeApi.getChart();
      const all = data.accounts || [];
      const lines = all.filter(a => a.kind === 'expense' && a.node_type === 'line' && a.is_active);
      setSections(all.filter(a => a.kind === 'expense' && a.node_type === 'section'));
      setAccounts(lines);
      setForm(f => ({ ...f, account_id: f.account_id || lines[0]?.id || '' }));
    } catch (e) { console.error(e); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await financeApi.listExpenses({ ...filters, academic_year: year });
      setExpenses(data.expenses || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const accById = Object.fromEntries(accounts.map(a => [a.id, a]));
  const labelFor = (e) => accById[e.account_id]?.name || EXPENSE_CATEGORIES[e.category] || e.category || '—';

  // Options groupées par section
  const groupedOptions = sections.map(sec => ({
    section: sec,
    lines: accounts.filter(a => a.parent_id === sec.id),
  })).filter(g => g.lines.length > 0);
  const orphanLines = accounts.filter(a => !sections.some(s => s.id === a.parent_id));

  const save = async () => {
    try {
      await financeApi.createExpense(form);
      setShowForm(false);
      setForm({ ...blankForm(), account_id: accounts[0]?.id || '' });
      load();
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  const remove = async (id) => {
    if (!confirm('Supprimer cette dépense ?')) return;
    try { await financeApi.deleteExpense(id); load(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const byAccount = {};
  expenses.forEach(e => {
    const key = e.account_id || `cat:${e.category}`;
    byAccount[key] = (byAccount[key] || 0) + Number(e.amount);
  });
  const repartition = Object.entries(byAccount).map(([key, amt]) => {
    const name = key.startsWith('cat:') ? (EXPENSE_CATEGORIES[key.slice(4)] || key.slice(4)) : (accById[key]?.name || '—');
    return { name, amt };
  }).sort((a, b) => b.amt - a.amt);

  const AccountSelect = ({ value, onChange }) => (
    <select value={value} onChange={onChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
      {groupedOptions.map(g => (
        <optgroup key={g.section.id} label={g.section.name}>
          {g.lines.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </optgroup>
      ))}
      {orphanLines.length > 0 && (
        <optgroup label="Autres">
          {orphanLines.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </optgroup>
      )}
    </select>
  );

  const columns = [
    { key: 'date', header: 'Date', render: (e) => <span className="text-gray-600">{formatDate(e.expense_date)}</span> },
    { key: 'account', header: 'Poste', render: (e) => <Badge tone="red">{labelFor(e)}</Badge> },
    { key: 'description', header: 'Description', render: (e) => <span className="text-gray-800">{e.description}</span> },
    { key: 'paid_to', header: 'Bénéficiaire', render: (e) => <span className="text-gray-600">{e.paid_to || '—'}</span> },
    { key: 'method', header: 'Mode', render: (e) => <span className="text-gray-600">{e.payment_method || '—'}</span> },
    { key: 'amount', header: 'Montant', align: 'right', render: (e) => <Money value={e.amount} tone="red" /> },
    { key: 'actions', header: '', align: 'right', render: (e) => (
      <button onClick={() => remove(e.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
    ) },
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={TrendingDown} title="Dépenses" color="red"
        subtitle={`${expenses.length} dépense(s) · ${formatMAD(total)}`}
        onRefresh={load} loading={loading}
        actions={<Button color="red" icon={Plus} onClick={() => setShowForm(true)}>Nouvelle dépense</Button>} />

      {repartition.length > 0 && (
        <KpiGrid cols={4}>
          {repartition.slice(0, 4).map((r, i) => (
            <KpiCard key={i} label={r.name} value={formatMAD(r.amt)} tone="red" />
          ))}
        </KpiGrid>
      )}

      <FilterBar>
        <AccountSelect value={filters.account_id} onChange={e => setFilters({ ...filters, account_id: e.target.value })} />
        <input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg" />
        <input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg" />
      </FilterBar>

      <DataTable columns={columns} rows={expenses} empty="Aucune dépense" />

      <Drawer open={showForm} onClose={() => setShowForm(false)} title="Nouvelle dépense"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button color="red" onClick={save} disabled={!form.description || !form.amount || !form.account_id}>Enregistrer</Button>
          </>
        }>
        <Field label="Poste" required>
          <AccountSelect value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant" required>
            <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
          <Field label="Date">
            <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
        </div>
        <Field label="Mode de paiement">
          <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg">
            <option value="cash">Espèces</option>
            <option value="check">Chèque</option>
            <option value="transfer">Virement</option>
            <option value="card">Carte</option>
            <option value="other">Autre</option>
          </select>
        </Field>
        <Field label="Description" required>
          <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </Field>
        <Field label="Bénéficiaire">
          <input type="text" value={form.paid_to} onChange={e => setForm({ ...form, paid_to: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </Field>
        <Field label="Référence">
          <input type="text" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
        </Field>
      </Drawer>
    </div>
  );
}
