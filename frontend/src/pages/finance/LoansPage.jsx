import { useState, useEffect } from 'react';
import { Landmark, Plus, Trash2, ArrowLeft, Check, RotateCcw } from 'lucide-react';
import { financeApi, formatMAD, formatDate } from '../../lib/financeApi';
import { PageHeader, DataTable, Money, Badge, Drawer, Button, Field } from '../../components/finance/ui';

function ExpenseAccountSelect({ accounts, value, onChange }) {
  const sections = accounts.filter(a => a.kind === 'expense' && a.node_type === 'section');
  const lines = accounts.filter(a => a.kind === 'expense' && a.node_type === 'line' && a.is_active);
  const groups = sections.map(s => ({ s, l: lines.filter(x => x.parent_id === s.id) })).filter(g => g.l.length);
  const orphan = lines.filter(l => !sections.some(s => s.id === l.parent_id));
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value || null)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
      <option value="">— Poste —</option>
      {groups.map(g => <optgroup key={g.s.id} label={g.s.name}>{g.l.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
      {orphan.length > 0 && <optgroup label="Autres">{orphan.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
    </select>
  );
}

export default function LoansPage() {
  const [loans, setLoans] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [sel, setSel] = useState(null);
  const blank = { name: '', loan_type: 'loan', account_id: '', principal: 0, annual_rate: 0, start_date: new Date().toISOString().split('T')[0], term_months: 12 };
  const [form, setForm] = useState(blank);

  useEffect(() => { load(); financeApi.getChart().then(d => setAccounts(d.accounts || [])).catch(() => {}); }, []);
  const load = async () => { try { const d = await financeApi.listLoans(); setLoans(d.loans || []); } catch (e) { console.error(e); } };
  const open = async (id) => { try { setSel(await financeApi.getLoan(id)); } catch (e) { alert(e.message); } };

  const save = async () => {
    try { await financeApi.createLoan(form); setShowForm(false); setForm(blank); load(); }
    catch (e) { alert('Erreur: ' + e.message); }
  };
  const remove = async (id) => { if (!confirm('Supprimer ce prêt et son échéancier ?')) return; try { await financeApi.deleteLoan(id); setSel(null); load(); } catch (e) { alert(e.message); } };
  const pay = async (sid) => { try { await financeApi.payLoanSchedule(sel.loan.id, sid); open(sel.loan.id); } catch (e) { alert(e.message); } };
  const unpay = async (sid) => { try { await financeApi.unpayLoanSchedule(sel.loan.id, sid); open(sel.loan.id); } catch (e) { alert(e.message); } };

  const accName = (id) => accounts.find(a => a.id === id)?.name || '—';

  if (sel) {
    const { loan, schedule } = sel;
    const paid = schedule.filter(s => s.status === 'paid').reduce((a, s) => a + Number(s.total), 0);
    const totalDue = schedule.reduce((a, s) => a + Number(s.total), 0);
    return (
      <div className="p-6 space-y-4">
        <button onClick={() => { setSel(null); load(); }} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Retour</button>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{loan.name}</h1>
            <p className="text-sm text-gray-500">{loan.loan_type === 'leasing' ? 'Leasing' : 'Prêt'} · Poste : {accName(loan.account_id)} · {formatMAD(paid)} / {formatMAD(totalDue)} réglé</p>
          </div>
          <button onClick={() => remove(loan.id)} className="flex items-center gap-1 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50"><Trash2 className="w-4 h-4" /> Supprimer</button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr><th className="px-4 py-2 text-left">#</th><th className="px-4 py-2 text-left">Échéance</th><th className="px-4 py-2 text-right">Capital</th><th className="px-4 py-2 text-right">Intérêts</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-center">Statut</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schedule.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{s.seq}</td>
                  <td className="px-4 py-2">{formatDate(s.due_date)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatMAD(s.principal_part)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatMAD(s.interest_part)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{formatMAD(s.total)}</td>
                  <td className="px-4 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{s.status === 'paid' ? 'Payée' : 'À payer'}</span></td>
                  <td className="px-4 py-2 text-right">
                    {s.status === 'paid'
                      ? <button onClick={() => unpay(s.id)} className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800"><RotateCcw className="w-3 h-3" /> Annuler</button>
                      : <button onClick={() => pay(s.id)} className="text-xs flex items-center gap-1 text-green-600 hover:text-green-800"><Check className="w-3 h-3" /> Payer</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400">Payer une échéance crée une écriture sur le poste du prêt dans le Prévisionnel/Réel.</p>
      </div>
    );
  }

  const columns = [
    { key: 'name', header: 'Nom', render: (l) => <span className="font-medium text-gray-800">{l.name}</span> },
    { key: 'type', header: 'Type', render: (l) => <Badge tone={l.loan_type === 'leasing' ? 'amber' : 'blue'}>{l.loan_type === 'leasing' ? 'Leasing' : 'Prêt'}</Badge> },
    { key: 'account', header: 'Poste', render: (l) => <span className="text-gray-600">{accName(l.account_id)}</span> },
    { key: 'principal', header: 'Capital', align: 'right', render: (l) => <Money value={l.principal} /> },
    { key: 'rate', header: 'Taux', align: 'right', render: (l) => <span className="text-gray-600 tabular-nums">{Number(l.annual_rate)}%</span> },
    { key: 'term', header: 'Durée', align: 'right', render: (l) => <span className="text-gray-600">{l.term_months} mois</span> },
    { key: 'actions', header: '', align: 'right', render: (l) => (
      <button onClick={(e) => { e.stopPropagation(); remove(l.id); }} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-500" /></button>
    ) },
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={Landmark} title="Prêts & leasing" color="purple"
        subtitle="Échéanciers amortis ; le paiement alimente la matrice."
        actions={<Button color="purple" icon={Plus} onClick={() => setShowForm(true)}>Nouveau</Button>} />

      <DataTable columns={columns} rows={loans} empty="Aucun prêt" onRowClick={(l) => open(l.id)} />

      <Drawer open={showForm} onClose={() => setShowForm(false)} title="Nouveau prêt / leasing"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button color="purple" onClick={save} disabled={!form.name}>Créer + échéancier</Button>
          </>
        }>
        <Field label="Nom" required>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="ex. Prêt Daman Oxygen" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={form.loan_type} onChange={e => setForm({ ...form, loan_type: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg"><option value="loan">Prêt</option><option value="leasing">Leasing</option></select>
          </Field>
          <Field label="Poste comptable">
            <ExpenseAccountSelect accounts={accounts} value={form.account_id} onChange={v => setForm({ ...form, account_id: v })} />
          </Field>
          <Field label="Capital">
            <input type="number" step="0.01" value={form.principal} onChange={e => setForm({ ...form, principal: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
          <Field label="Taux annuel %">
            <input type="number" step="0.01" value={form.annual_rate} onChange={e => setForm({ ...form, annual_rate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
          <Field label="1re échéance">
            <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
          <Field label="Durée (mois)">
            <input type="number" value={form.term_months} onChange={e => setForm({ ...form, term_months: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
