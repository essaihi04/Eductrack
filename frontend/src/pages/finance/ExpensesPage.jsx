import { useState, useEffect } from 'react';
import { TrendingDown, Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { financeApi, formatMAD, formatDate, EXPENSE_CATEGORIES } from '../../lib/financeApi';

const blankForm = () => ({
  account_id: '', description: '', amount: 0,
  expense_date: new Date().toISOString().split('T')[0],
  paid_to: '', payment_method: 'transfer', reference: '', notes: ''
});

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [accounts, setAccounts] = useState([]);     // lignes de dépense du plan comptable
  const [sections, setSections] = useState([]);     // sections de dépense
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ from: '', to: '', account_id: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm());

  useEffect(() => { loadChart(); }, []);
  useEffect(() => { load(); }, [filters.from, filters.to, filters.account_id]);

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
      const data = await financeApi.listExpenses(filters);
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <TrendingDown className="w-6 h-6 text-red-600" /> Dépenses
          </h1>
          <p className="text-sm text-gray-500">{expenses.length} dépense(s) · {formatMAD(total)}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
          <Plus className="w-4 h-4" /> Nouvelle dépense
        </button>
      </div>

      {/* Repartition par poste */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {repartition.slice(0, 6).map((r, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs text-gray-500 truncate" title={r.name}>{r.name}</p>
            <p className="text-lg font-bold text-gray-800">{formatMAD(r.amt)}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3">
        <select value={filters.account_id} onChange={e => setFilters({ ...filters, account_id: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg">
          <option value="">Tous les postes</option>
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
        <input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg" />
        <input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg" />
        <button onClick={load} className="p-2 border border-gray-300 rounded-lg">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Poste</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-left">Bénéficiaire</th>
              <th className="px-4 py-3 text-left">Mode</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {expenses.length === 0 && <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400">Aucune dépense</td></tr>}
            {expenses.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{formatDate(e.expense_date)}</td>
                <td className="px-4 py-3">
                  <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-700">{labelFor(e)}</span>
                </td>
                <td className="px-4 py-3 text-gray-800">{e.description}</td>
                <td className="px-4 py-3 text-gray-600">{e.paid_to || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{e.payment_method || '—'}</td>
                <td className="px-4 py-3 text-right font-bold text-red-600">{formatMAD(e.amount)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => remove(e.id)} className="p-1.5 hover:bg-red-50 rounded">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nouvelle dépense</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Poste *</label>
                <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg">
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
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Montant *</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Mode paiement</label>
                <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                  <option value="cash">Espèces</option>
                  <option value="check">Chèque</option>
                  <option value="transfer">Virement</option>
                  <option value="card">Carte</option>
                  <option value="other">Autre</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Bénéficiaire</label>
              <input type="text" value={form.paid_to} onChange={e => setForm({ ...form, paid_to: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Référence</label>
              <input type="text" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg">Annuler</button>
              <button onClick={save} disabled={!form.description || !form.amount || !form.account_id}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
